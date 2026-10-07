import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditEvents,
  fulfillments,
  inventoryCodes,
  orders,
  products,
} from '../../src/server/db/schema.js';
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
 * Entrega automática con inventario (PIN_AUTO_DELIVERY=true): cuando Mercado Pago aprueba el
 * pago y hay PIN para todas las unidades, el pedido queda entregado sin intervención, el
 * comprador ve sus PIN (y los recibe por correo con las instrucciones de canje) y nadie más.
 */
let h: Harness;
let admin: Record<string, string>;
let productId = '';

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(
    { PLAYER_VERIFICATION: 'customer', PIN_AUTO_DELIVERY: 'true' },
    { playerVerifier: false },
  );
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-pin' }))
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
  h.app.inject({ remoteAddress: `10.77.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};
let uid = 620000000;

async function addCodes(codes: string[]) {
  const res = await inject({
    method: 'POST',
    url: '/api/admin/inventory',
    headers: CSRF,
    cookies: admin,
    payload: { productId, codes },
  });
  expect(res.statusCode, res.body).toBe(201);
}

/** El cliente confirma su ID, paga y Mercado Pago aprueba el pago (webhook). */
async function buyAndPay(quantity: number) {
  const playerUid = String((uid += 1));
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      customerName: 'Cliente PIN',
      customerEmail: `pin-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity }],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json<{ order: { reference: string; totalCop: number } }>().order;
  const cookies = guestCookie(created);
  const pay = await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/pay`,
    headers: CSRF,
    cookies,
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
    .select()
    .from(orders)
    .where(eq(orders.publicRef, order.reference));
  if (!row) throw new Error('sin pedido');
  return { ref: order.reference, cookies, row, playerUid };
}

type PublicOrder = { status: string; fulfillment: { status: string; pins: number } };

describe('entrega automática con PIN del inventario', () => {
  it('pago aprobado → pedido entregado con PIN, sin que el dueño haga nada', async () => {
    await addCodes(['AUTO-PIN-0001', 'AUTO-PIN-0002']);
    const { ref, cookies, row, playerUid } = await buyAndPay(2);

    expect(row.status).toBe('DELIVERED');
    const [fulfillment] = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, row.id));
    expect(fulfillment).toMatchObject({ status: 'DELIVERED' });
    expect(fulfillment?.evidence).toContain('pagostore.com');
    const codes = await h.database.db
      .select({ status: inventoryCodes.status })
      .from(inventoryCodes)
      .where(eq(inventoryCodes.orderId, row.id));
    expect(codes.map((c) => c.status)).toEqual(['USED', 'USED']);

    // El comprador ve el pedido entregado y sus PIN.
    const view = await inject({ method: 'GET', url: `/api/orders/${ref}`, cookies });
    expect(view.json<{ order: PublicOrder }>().order).toMatchObject({
      status: 'DELIVERED',
      fulfillment: { status: 'DELIVERED', pins: 2 },
    });
    const pins = await inject({ method: 'GET', url: `/api/orders/${ref}/pins`, cookies });
    expect(pins.statusCode).toBe(200);
    expect(pins.headers['cache-control']).toBe('no-store');
    expect(
      pins
        .json<{ pins: { code: string }[] }>()
        .pins.map((p) => p.code)
        .sort(),
    ).toEqual(['AUTOPIN0001', 'AUTOPIN0002']);

    // Nadie más: otro navegador recibe lo mismo que si el pedido no existiera.
    const stranger = await inject({ method: 'GET', url: `/api/orders/${ref}/pins` });
    expect(stranger.statusCode).toBe(404);

    // La auditoría registra cuántos PIN se entregaron y se vieron, nunca los PIN.
    const audit = await h.database.db
      .select({ action: auditEvents.action, data: auditEvents.data })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'fulfillment.auto_pin'));
    expect(audit.at(-1)?.data).toMatchObject({ orderId: row.id, pins: 2 });
    const viewed = await h.database.db
      .select({ data: auditEvents.data })
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, row.id), eq(auditEvents.action, 'order.pins_viewed')));
    expect(viewed).toHaveLength(1);
    expect(JSON.stringify(await h.database.db.select().from(auditEvents))).not.toContain('AUTOPIN');

    // Correos: comprobante + PIN con instrucciones al cliente; al dueño, «entregado con PIN».
    const toCustomer = h.mailer.sent.filter(
      (m) => m.subject.includes(ref) && m.text.includes('PIN'),
    );
    const pinMail = toCustomer.find((m) => m.subject.startsWith('Tu PIN de diamantes'));
    expect(pinMail?.text).toContain('AUTOPIN0001');
    expect(pinMail?.text).toContain('https://www.pagostore.com');
    expect(pinMail?.text).toContain(playerUid);
    const ownerMail = h.mailer.sent.find(
      (m) => m.subject === `Pedido pagado y entregado con PIN · ${ref}`,
    );
    expect(ownerMail?.to).toEqual([ADMIN_EMAIL, 'admin2@example.com']);
    expect(ownerMail?.text).not.toContain('AUTOPIN');
  });

  it('sin PIN para todas las unidades no toca el inventario: queda pagado para entregar a mano', async () => {
    await addCodes(['AUTO-PIN-0003']);
    const { ref, cookies, row } = await buyAndPay(2);
    expect(row.status).toBe('PAID');
    const available = await h.database.db
      .select({ id: inventoryCodes.id })
      .from(inventoryCodes)
      .where(eq(inventoryCodes.status, 'AVAILABLE'));
    expect(available).toHaveLength(1);
    const pins = await inject({ method: 'GET', url: `/api/orders/${ref}/pins`, cookies });
    expect(pins.json<{ pins: unknown[] }>().pins).toEqual([]);
    const ownerMail = h.mailer.sent.find(
      (m) => m.subject === `Pedido pagado por entregar · ${ref}`,
    );
    expect(ownerMail).toBeDefined();
  });

  it('con las entregas pausadas no se entrega solo', async () => {
    h.deps.config.flags.fulfillmentEnabled = false;
    try {
      const { row } = await buyAndPay(1);
      expect(row.status).toBe('PAID');
    } finally {
      h.deps.config.flags.fulfillmentEnabled = true;
    }
  });
});
