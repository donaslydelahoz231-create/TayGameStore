import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifications, orders } from '../../src/server/db/schema.js';
import { runJob } from '../../src/server/services/jobs.js';
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
 * Eventos de pedidos hacia la automatización del dueño (webhook de n8n): salen por la misma
 * cola que los correos, con un id estable por evento, sin datos personales del cliente y
 * solo después de un pago confirmado.
 */
let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({}, { events: true });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-ev' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});
beforeEach(() => {
  h.clock.now = new Date();
  h.events.failNext = 0;
});

const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });
let uid = 400000000;

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

async function readyOrder() {
  const email = `eventos-${randomUUID().slice(0, 8)}@example.com`;
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String((uid += 1)),
      customerName: 'Cliente Privado',
      customerEmail: email,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 2 }],
    },
  });
  expect(created.statusCode).toBe(201);
  const order = created.json<{ order: { reference: string; totalCop: number } }>().order;
  const cookies = guestCookie(created);
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, order.reference));
  const id = row?.id ?? '';
  const steps: (InjectOptions & { url: string })[] = [
    {
      method: 'POST',
      url: `/api/admin/orders/${id}/verification`,
      headers: CSRF,
      cookies: admin,
      payload: { result: 'VERIFIED', nickname: 'NickEventos', region: 'Colombia' },
    },
    {
      method: 'POST',
      url: `/api/orders/${order.reference}/confirm-player`,
      headers: CSRF,
      cookies,
      payload: { confirm: true, nickname: 'NickEventos' },
    },
    { method: 'POST', url: `/api/orders/${order.reference}/pay`, headers: CSRF, cookies },
  ];
  for (const step of steps) expect((await inject(step)).statusCode, step.url).toBe(200);
  return { ...order, id, email };
}

async function webhook(paymentId: string) {
  return inject({
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
    payload: { type: 'payment', data: { id: paymentId } },
  });
}

async function payOrder(order: { reference: string; totalCop: number }, status = 'approved') {
  const paymentId = String(Math.floor(Math.random() * 1e12));
  h.gateway.setPayment({
    id: paymentId,
    externalReference: order.reference,
    amount: order.totalCop,
    status,
  });
  expect((await webhook(paymentId)).statusCode).toBe(200);
  return paymentId;
}

const allEventsOf = (reference: string) =>
  h.events.sent.filter((e) => e.order.reference === reference);
/** Eventos posteriores a la verificación (el aviso "por verificar" tiene su propia prueba). */
const eventsOf = (reference: string) =>
  allEventsOf(reference).filter((e) => e.event !== 'order.awaiting_verification');
const eventRows = (orderId: string) =>
  h.database.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orderId, orderId),
        eq(notifications.channel, 'webhook'),
        ne(notifications.kind, 'order_verification_event'),
      ),
    );

describe('eventos de pedidos hacia n8n', () => {
  it('pedido nuevo por verificar → aviso order.awaiting_verification al momento', async () => {
    const order = await readyOrder();
    const [sent] = allEventsOf(order.reference);
    expect(sent?.event).toBe('order.awaiting_verification');
    expect(sent?.order).toMatchObject({
      reference: order.reference,
      status: 'AWAITING_VERIFICATION',
      nickname: null,
      totalCop: order.totalCop,
    });
    // El plazo para verificar viaja en el evento para que el dueño sepa cuánto tiene.
    expect(Date.parse(sent?.order.expiresAt ?? '')).toBeGreaterThan(Date.now());
    expect(JSON.stringify(sent)).not.toContain(order.email);
    // Solo uno, aunque el pedido siga su camino.
    await payOrder(order);
    await runJob(h.deps, 'sendNotifications');
    expect(
      allEventsOf(order.reference).filter((e) => e.event === 'order.awaiting_verification'),
    ).toHaveLength(1);
  });

  it('sin pago confirmado no sale ningún evento', async () => {
    const order = await readyOrder();
    await payOrder(order, 'rejected');
    expect(eventsOf(order.reference)).toEqual([]);
    expect(await eventRows(order.id)).toEqual([]);
  });

  it('pago confirmado → un evento order.paid, con id estable y sin datos personales', async () => {
    const order = await readyOrder();
    const paymentId = await payOrder(order);
    await Promise.all([webhook(paymentId), webhook(paymentId)]);
    await runJob(h.deps, 'sendNotifications');

    const sent = eventsOf(order.reference);
    expect(sent).toHaveLength(1);
    const [row] = await eventRows(order.id);
    expect(row).toMatchObject({ kind: 'order_paid_event', status: 'SENT' });
    const [saved] = await h.database.db
      .select({ expiresAt: orders.expiresAt })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(sent[0]).toEqual({
      id: row?.id,
      event: 'order.paid',
      occurredAt: row?.createdAt.toISOString(),
      order: {
        reference: order.reference,
        status: 'PAID',
        totalCop: order.totalCop,
        currency: 'COP',
        expiresAt: saved?.expiresAt?.toISOString() ?? null,
        playerUid: expect.any(String) as string,
        nickname: 'NickEventos',
        items: [{ name: expect.any(String) as string, quantity: 2 }],
      },
    });
    const raw = JSON.stringify(sent[0]);
    expect(raw).not.toContain(order.email);
    expect(raw).not.toContain('Cliente Privado');
  });

  it('entrega y reembolso también se avisan', async () => {
    const delivered = await readyOrder();
    await payOrder(delivered);
    for (const payload of [
      { action: 'claim' },
      { action: 'start' },
      { action: 'deliver', evidence: 'Recarga hecha en el canal del dueño' },
    ]) {
      const res = await inject({
        method: 'POST',
        url: `/api/admin/orders/${delivered.id}/fulfillment`,
        headers: CSRF,
        cookies: admin,
        payload,
      });
      expect(res.statusCode, JSON.stringify(payload)).toBe(200);
    }
    expect(eventsOf(delivered.reference).map((e) => [e.event, e.order.status])).toEqual([
      ['order.paid', 'PAID'],
      ['order.delivered', 'DELIVERED'],
    ]);

    const refunded = await readyOrder();
    const paymentId = await payOrder(refunded);
    h.gateway.setPayment({
      id: paymentId,
      externalReference: refunded.reference,
      amount: refunded.totalCop,
      status: 'refunded',
    });
    await webhook(paymentId);
    expect(eventsOf(refunded.reference).map((e) => [e.event, e.order.status])).toEqual([
      ['order.paid', 'PAID'],
      ['order.refunded', 'REFUNDED'],
    ]);
  });

  it('n8n caído: el pago queda guardado y el evento se reintenta con el mismo id', async () => {
    const order = await readyOrder();
    h.events.failNext = 1;
    await payOrder(order);
    const [saved] = await h.database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(saved?.status).toBe('PAID');
    expect(eventsOf(order.reference)).toEqual([]);
    const [pending] = await eventRows(order.id);
    expect(pending).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(pending?.lastError).toBe('El webhook de eventos rechazó el evento (HTTP 503)');

    h.clock.now = new Date(Date.now() + 2 * 60_000);
    await runJob(h.deps, 'sendNotifications');
    const sent = eventsOf(order.reference);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.id).toBe(pending?.id);
    const [done] = await eventRows(order.id);
    expect(done).toMatchObject({ status: 'SENT', attempts: 2, lastError: null });
  });
});
