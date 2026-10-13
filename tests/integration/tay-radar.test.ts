import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, orders } from '../../src/server/db/schema.js';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * TAY RADAR (promo de fin de semana, hora de Colombia) a lo largo del pedido completo:
 * - el precio lo fija el servidor al crear el pedido y queda sellado con su regla;
 * - un pedido creado en promo y pagado después conserva el precio promocional;
 * - fuera de la promo, un precio enviado por el cliente no cambia nada.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PROMO_SCHEDULE: 'weekends', PLAYER_VERIFICATION: 'customer' });
  await seedProducts(h);
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
let uid = 860000000;

function checkout(extra: Record<string, unknown> = {}) {
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
      customerName: 'Cliente Radar',
      customerEmail: `radar-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
      ...extra,
    },
  });
}

async function createdEvent(reference: string) {
  const [order] = await h.database.db.select().from(orders).where(eq(orders.publicRef, reference));
  const [event] = await h.database.db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, order!.id), eq(auditEvents.action, 'order.created')));
  return { order: order!, data: event?.data as Record<string, unknown> };
}

describe('TAY RADAR: precio fijado al crear el pedido', () => {
  it('domingo 23:59 (Colombia): se cobra $3.800 y la regla queda sellada en el historial', async () => {
    h.clock.now = new Date('2026-10-12T04:59:00Z'); // domingo 11 de octubre, 11:59 p. m.
    const res = await checkout();
    expect(res.statusCode, res.body).toBe(201);
    const order = res.json<{ order: { reference: string; totalCop: number } }>().order;
    expect(order.totalCop).toBe(3800);
    const { data } = await createdEvent(order.reference);
    expect(data).toMatchObject({
      priceRule: 'tay-radar',
      subtotalCop: 4000,
      discountCop: 200,
      totalCop: 3800,
      promoEndsAt: '2026-10-12T05:00:00.000Z',
    });
  });

  it('creado en promo y pagado el lunes: conserva $3.800 y el pago de $3.800 lo deja pagado', async () => {
    h.clock.now = new Date('2026-10-12T04:59:30Z'); // domingo 11:59:30 p. m.
    const res = await checkout();
    expect(res.statusCode, res.body).toBe(201);
    const order = res.json<{ order: { reference: string; totalCop: number } }>().order;
    const cookies = guestCookie(res);
    expect(order.totalCop).toBe(3800);

    h.clock.now = new Date('2026-10-12T05:20:00Z'); // lunes 12:20 a. m.: la promo terminó
    const catalog = await inject({ method: 'GET', url: '/api/catalog?game=freefire' });
    expect(
      catalog
        .json<{ products: { sku: string; priceCop: number }[] }>()
        .products.find((p) => p.sku === 'ff-110')?.priceCop,
    ).toBe(4000);

    const pay = await inject({
      method: 'POST',
      url: `/api/orders/${order.reference}/pay`,
      headers: CSRF,
      cookies,
    });
    expect(pay.statusCode, pay.body).toBe(200);
    const paymentId = String(Math.floor(Math.random() * 1e12));
    h.gateway.setPayment({ id: paymentId, externalReference: order.reference, amount: 3800 });
    const hook = await inject({
      method: 'POST',
      url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
      headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
      payload: { type: 'payment', data: { id: paymentId } },
    });
    expect(hook.statusCode).toBe(200);
    const { order: row } = await createdEvent(order.reference);
    expect(row).toMatchObject({ status: 'PAID', totalCop: 3800, subtotalCop: 4000 });
  });

  it('fuera de la promo: el total enviado por el cliente no baja el precio', async () => {
    h.clock.now = new Date('2026-10-12T05:00:00Z'); // lunes 00:00:00: ya terminó
    // El navegador quedó con el precio del domingo: el servidor no lo acepta.
    const stale = await checkout({ expectedTotalCop: 3800 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('PRICE_CHANGED');
    // Un precio por línea inventado ni siquiera es un campo válido.
    const forged = await checkout({ items: [{ sku: 'ff-110', quantity: 1, priceCop: 1 }] });
    expect(forged.statusCode).toBe(400);
    const fair = await checkout();
    expect(fair.statusCode).toBe(201);
    const order = fair.json<{ order: { reference: string; totalCop: number } }>().order;
    expect(order.totalCop).toBe(4000);
    expect((await createdEvent(order.reference)).data).toMatchObject({
      priceRule: 'normal',
      discountCop: 0,
      promoEndsAt: null,
    });
  });

  it('cambio de mes: sábado 31 de octubre y domingo 1 de noviembre son promo', async () => {
    for (const iso of ['2026-10-31T05:00:00Z', '2026-11-02T04:59:59Z']) {
      h.clock.now = new Date(iso);
      const res = await checkout();
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json<{ order: { totalCop: number } }>().order.totalCop).toBe(3800);
    }
  });
});
