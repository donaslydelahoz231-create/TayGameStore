import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orders, products } from '../../src/server/db/schema.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Venta solo con stock (SELL_ONLY_WITH_STOCK) + entrega automática de PIN: un paquete sin PIN
 * libre se muestra agotado y no se puede comprar; el último PIN queda apartado mientras su
 * comprador paga; al aprobarse el pago el pedido queda entregado sin intervención del dueño.
 */
let h: Harness;
let admin: Record<string, string>;
let productId = '';

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(
    { PLAYER_VERIFICATION: 'customer', PIN_AUTO_DELIVERY: 'true', SELL_ONLY_WITH_STOCK: 'true' },
    { playerVerifier: false },
  );
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-stock' }))
    .cookie;
  const [row] = await h.database.db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, 'ff-110'));
  productId = row?.id ?? '';
});
afterAll(async () => {
  await h?.close();
});

let ip = 0;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.88.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};
let uid = 730000000;

const soldOut = async (sku: string) => {
  const res = await inject({ method: 'GET', url: '/api/catalog?game=freefire' });
  const list = res.json<{ products: { sku: string; soldOut: boolean }[] }>().products;
  return list.find((p) => p.sku === sku)?.soldOut;
};

function checkout() {
  const playerUid = String((uid += 1));
  return inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      customerName: 'Cliente Stock',
      customerEmail: `stock-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
}

describe('venta solo con stock', () => {
  it('sin PIN el paquete sale agotado y no se puede comprar', async () => {
    expect(await soldOut('ff-110')).toBe(true);
    const res = await checkout();
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('el último PIN queda apartado para quien está pagando y se entrega solo', async () => {
    const added = await inject({
      method: 'POST',
      url: '/api/admin/inventory',
      headers: CSRF,
      cookies: admin,
      payload: { productId, codes: ['STOCK-PIN-0001'] },
    });
    expect(added.statusCode, added.body).toBe(201);
    expect(await soldOut('ff-110')).toBe(false);

    const first = await checkout();
    expect(first.statusCode, first.body).toBe(201);
    // El único PIN está apartado: otro cliente ya no puede comprarlo.
    expect(await soldOut('ff-110')).toBe(true);
    expect((await checkout()).statusCode).toBe(409);

    const order = first.json<{ order: { reference: string; totalCop: number } }>().order;
    const pay = await inject({
      method: 'POST',
      url: `/api/orders/${order.reference}/pay`,
      headers: CSRF,
      cookies: guestCookie(first),
    });
    expect(pay.statusCode).toBe(200);
    const paymentId = String(Math.floor(Math.random() * 1e12));
    h.gateway.setPayment({
      id: paymentId,
      externalReference: order.reference,
      amount: order.totalCop,
    });
    const hook = await inject({
      method: 'POST',
      url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
      headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
      payload: { type: 'payment', data: { id: paymentId } },
    });
    expect(hook.statusCode).toBe(200);
    const [row] = await h.database.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    expect(row?.status).toBe('DELIVERED');
    expect(await soldOut('ff-110')).toBe(true);
  });
});
