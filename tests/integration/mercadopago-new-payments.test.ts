import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orders } from '../../src/server/db/schema.js';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Solo Nequi por ahora (pedido del dueño, 2026-11-18: «Mercado Pago por ahora inhabilitado; el que
 * está habilitado es Nequi»). Con MERCADOPAGO_NEW_PAYMENTS=false la tienda no ofrece Mercado Pago
 * ni abre cobros nuevos, pero un pago ya iniciado (PSE o Efecty pueden tardar días) se sigue
 * confirmando por el webhook: nadie que ya pagó queda sin su recarga. Datos ficticios.
 */

const NEQUI_ENV = {
  PLAYER_VERIFICATION: 'customer',
  NEQUI_MANUAL_ENABLED: 'true',
  NEQUI_MANUAL_PHONE: '300 123 4567',
  NEQUI_MANUAL_BREB_KEY: '@tiendaprueba',
  NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
};

let h: Harness;
let seq = 0;
let uid = 830000000;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(NEQUI_ENV);
  await seedProducts(h);
});
afterAll(async () => {
  await h?.close();
});

const inject = (options: InjectOptions) =>
  h.app.inject({
    remoteAddress: `10.79.${Math.floor(++seq / 200)}.${(seq % 200) + 1}`,
    ...options,
  });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

async function order() {
  const playerUid = String((uid += 1));
  const res = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      playerServer: 'latam',
      customerName: 'Cliente Ficticio',
      customerEmail: `mp-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json<{ order: { reference: string; totalCop: number } }>();
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, body.order.reference));
  return {
    id: row?.id ?? '',
    ref: body.order.reference,
    total: body.order.totalCop,
    cookies: guestCookie(res),
  };
}

const pay = (o: { ref: string; cookies: Record<string, string> }) =>
  inject({
    method: 'POST',
    url: `/api/orders/${o.ref}/pay`,
    headers: CSRF,
    cookies: o.cookies,
    payload: { payMeans: 'pse' },
  });

const status = async (o: { ref: string; cookies: Record<string, string> }) =>
  (await inject({ method: 'GET', url: `/api/orders/${o.ref}`, cookies: o.cookies })).json<{
    order: { status: string; payment: { canPay: boolean } };
  }>().order;

describe('MERCADOPAGO_NEW_PAYMENTS=false: solo Nequi para pagos nuevos', () => {
  it('no ofrece Mercado Pago, no abre cobros nuevos y Nequi sigue', async () => {
    h.deps.config.flags.mercadoPagoNewPayments = false;
    try {
      const config = (await inject({ method: 'GET', url: '/api/config' })).json<{
        paymentMethods: { mercadopago: boolean; nequiManual: boolean };
      }>();
      expect(config.paymentMethods).toMatchObject({ mercadopago: false, nequiManual: true });
      const o = await order();
      expect((await status(o)).payment.canPay).toBe(false);
      const res = await pay(o);
      expect(res.statusCode).toBe(503);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      // Nequi, el método habilitado, funciona igual.
      expect(
        (
          await inject({
            method: 'POST',
            url: `/api/orders/${o.ref}/nequi`,
            headers: CSRF,
            cookies: o.cookies,
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      h.deps.config.flags.mercadoPagoNewPayments = true;
    }
  });

  it('un pago de Mercado Pago ya iniciado se sigue confirmando por el webhook', async () => {
    const o = await order();
    // El cliente abrió el cobro (PSE) antes de que el dueño apagara los pagos nuevos.
    expect((await pay(o)).statusCode).toBe(200);
    h.deps.config.flags.mercadoPagoNewPayments = false;
    try {
      const paymentId = String(Math.floor(Math.random() * 1e12));
      h.gateway.setPayment({ id: paymentId, externalReference: o.ref, amount: o.total });
      const hook = await inject({
        method: 'POST',
        url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
        headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
        payload: { type: 'payment', data: { id: paymentId } },
      });
      expect(hook.statusCode).toBe(200);
      await h.settle();
      expect((await status(o)).status).toBe('PAID');
    } finally {
      h.deps.config.flags.mercadoPagoNewPayments = true;
    }
  });
});
