import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, orders, paymentAttempts, payments } from '../../src/server/db/schema.js';
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

// Pedidos con recarga manual: estados de pago y de recarga separados, panel (filtros, páginas,
// notas e historial), cambio de medio de pago y reembolso parcial. Todo con el doble de
// Mercado Pago de `tests/support`: ningún pago real.

let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-1' }))
    .cookie;
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
});

const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });

let uidCounter = 300000000;
const nextUid = () => String((uidCounter += 1));

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

interface OrderJson {
  reference: string;
  status: string;
  totalCop: number;
  states: { payment: string; recharge: string };
}

async function createGuestOrder() {
  const res = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: nextUid(),
      customerName: 'Cliente Prueba',
      customerEmail: `m${uidCounter}-${randomUUID().slice(0, 6)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(res.statusCode).toBe(201);
  const json = res.json<{ order: OrderJson; accessToken: string }>();
  return { order: json.order, token: json.accessToken, cookies: guestCookie(res) };
}

async function orderIdOf(ref: string): Promise<string> {
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, ref));
  if (!row) throw new Error('orden no encontrada');
  return row.id;
}

const adminPost = (url: string, payload: object, cookies = admin) =>
  inject({ method: 'POST', url, headers: CSRF, cookies, payload });
const adminGet = (url: string, cookies = admin) => inject({ method: 'GET', url, cookies });

async function readyToPay() {
  const created = await createGuestOrder();
  const id = await orderIdOf(created.order.reference);
  expect(
    (
      await adminPost(`/api/admin/orders/${id}/verification`, {
        result: 'VERIFIED',
        nickname: 'JugadorPro',
        region: 'Colombia',
      })
    ).statusCode,
  ).toBe(200);
  const confirmed = await inject({
    method: 'POST',
    url: `/api/orders/${created.order.reference}/confirm-player`,
    headers: CSRF,
    cookies: created.cookies,
    payload: { confirm: true, nickname: 'JugadorPro' },
  });
  expect(confirmed.statusCode).toBe(200);
  return { ...created, id };
}

const payWith = (ref: string, cookies: Record<string, string>, payMeans?: string) =>
  inject({
    method: 'POST',
    url: `/api/orders/${ref}/pay`,
    headers: CSRF,
    cookies,
    payload: payMeans ? { payMeans } : {},
  });

const webhook = (paymentId: string) =>
  inject({
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
    payload: { type: 'payment', action: 'payment.updated', data: { id: paymentId } },
  });

async function paidOrder(extra: { paymentMethodId?: string; paymentTypeId?: string } = {}) {
  const ready = await readyToPay();
  expect((await payWith(ready.order.reference, ready.cookies, 'nequi')).statusCode).toBe(200);
  const paymentId = String(Math.floor(Math.random() * 1e12));
  h.gateway.setPayment({
    id: paymentId,
    externalReference: ready.order.reference,
    amount: ready.order.totalCop,
    ...extra,
  });
  expect((await webhook(paymentId)).statusCode).toBe(200);
  return { ...ready, paymentId };
}

async function customerView(ref: string, cookies: Record<string, string>) {
  const res = await inject({ method: 'GET', url: `/api/orders/${ref}`, cookies });
  expect(res.statusCode).toBe(200);
  return res.json<{ order: OrderJson }>().order;
}

const fulfil = (id: string, body: object) => adminPost(`/api/admin/orders/${id}/fulfillment`, body);

// ─────────────────────────────────────────────────────────────────────────────

describe('estado del pago y de la recarga, separados y calculados por el servidor', () => {
  it('recorre pendiente → pago confirmado → en proceso → completado (con evidencia)', async () => {
    const created = await createGuestOrder();
    expect(created.order.states).toEqual({ payment: 'PENDING', recharge: 'PENDING' });

    const paid = await paidOrder();
    expect((await customerView(paid.order.reference, paid.cookies)).states).toEqual({
      payment: 'CONFIRMED',
      recharge: 'PENDING',
    });

    expect((await fulfil(paid.id, { action: 'claim' })).statusCode).toBe(200);
    expect((await fulfil(paid.id, { action: 'start' })).statusCode).toBe(200);
    expect((await customerView(paid.order.reference, paid.cookies)).states).toEqual({
      payment: 'CONFIRMED',
      recharge: 'IN_PROGRESS',
    });

    // Sin evidencia no se puede marcar entregado.
    expect((await fulfil(paid.id, { action: 'deliver' })).statusCode).toBe(400);
    expect(
      (await fulfil(paid.id, { action: 'deliver', evidence: 'ID transacción 12345 (prueba)' }))
        .statusCode,
    ).toBe(200);
    const done = await customerView(paid.order.reference, paid.cookies);
    expect(done.status).toBe('DELIVERED');
    expect(done.states).toEqual({ payment: 'CONFIRMED', recharge: 'COMPLETED' });
  });

  it('un pedido sin pago confirmado no se puede entregar desde el panel', async () => {
    const ready = await readyToPay();
    for (const action of ['claim', 'start']) {
      const res = await fulfil(ready.id, { action });
      expect([404, 409]).toContain(res.statusCode);
    }
    const res = await fulfil(ready.id, { action: 'deliver', evidence: 'no debería valer' });
    expect([404, 409]).toContain(res.statusCode);
    expect((await customerView(ready.order.reference, ready.cookies)).states.recharge).toBe(
      'PENDING',
    );
  });

  it('una entrega fallida deja el pago confirmado y la recarga «requiere revisión»', async () => {
    const paid = await paidOrder();
    await fulfil(paid.id, { action: 'claim' });
    await fulfil(paid.id, { action: 'start' });
    expect(
      (await fulfil(paid.id, { action: 'fail', reason: 'El canal de recarga no respondió' }))
        .statusCode,
    ).toBe(200);
    expect((await customerView(paid.order.reference, paid.cookies)).states).toEqual({
      payment: 'CONFIRMED',
      recharge: 'NEEDS_REVIEW',
    });
  });
});

describe('cambio de medio de pago', () => {
  it('elegir otro medio crea otra preferencia; repetir el mismo la reutiliza', async () => {
    const ready = await readyToPay();
    const before = h.gateway.preferences.size;
    const first = await payWith(ready.order.reference, ready.cookies, 'tarjeta');
    expect(first.statusCode).toBe(200);
    const again = await payWith(ready.order.reference, ready.cookies, 'tarjeta');
    expect(again.json()).toEqual(first.json());
    expect(h.gateway.preferences.size).toBe(before + 1);

    const nequi = await payWith(ready.order.reference, ready.cookies, 'nequi');
    expect(nequi.statusCode).toBe(200);
    expect(nequi.json<{ checkoutUrl: string }>().checkoutUrl).not.toBe(
      first.json<{ checkoutUrl: string }>().checkoutUrl,
    );
    expect(h.gateway.preferences.size).toBe(before + 2);
    const newest = [...h.gateway.preferences.values()].at(-1);
    expect(newest?.input.payMeans).toBe('nequi');

    const attempts = await h.database.db
      .select({ status: paymentAttempts.status, payMeans: paymentAttempts.payMeans })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, ready.id));
    expect(attempts).toHaveLength(2);
    expect(attempts).toEqual(
      expect.arrayContaining([
        { status: 'CLOSED', payMeans: 'tarjeta' },
        { status: 'OPEN', payMeans: 'nequi' },
      ]),
    );
    const closed = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'payment_attempt.closed'));
    expect(closed.some((event) => (event.data as { reason?: string }).reason)).toBe(true);
  });

  it('un pago hecho en la preferencia anterior se aplica igual (por la referencia del pedido)', async () => {
    const ready = await readyToPay();
    await payWith(ready.order.reference, ready.cookies, 'tarjeta');
    await payWith(ready.order.reference, ready.cookies, 'pse');
    const paymentId = String(Math.floor(Math.random() * 1e12));
    h.gateway.setPayment({
      id: paymentId,
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
    });
    expect((await webhook(paymentId)).statusCode).toBe(200);
    const view = await customerView(ready.order.reference, ready.cookies);
    expect(view.status).toBe('PAID');
    expect(view.states.payment).toBe('CONFIRMED');
  });
});

describe('reembolso parcial informado por Mercado Pago', () => {
  it('lleva el pedido a revisión y el pago a «en revisión»; repetir el aviso no duplica nada', async () => {
    const paid = await paidOrder();
    h.gateway.setPayment({
      id: paid.paymentId,
      externalReference: paid.order.reference,
      amount: paid.order.totalCop,
      statusDetail: 'partially_refunded',
    });
    expect((await webhook(paid.paymentId)).statusCode).toBe(200);
    expect((await webhook(paid.paymentId)).statusCode).toBe(200);
    const view = await customerView(paid.order.reference, paid.cookies);
    expect(view.status).toBe('NEEDS_REVIEW');
    expect(view.states.payment).toBe('IN_REVIEW');
    const reviews = await h.database.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, paid.id),
          eq(auditEvents.toStatus, 'NEEDS_REVIEW'),
          eq(auditEvents.entityType, 'order'),
        ),
      );
    expect(reviews).toHaveLength(1);
    expect((reviews[0]?.data as { reason?: string }).reason).toBe('payment_partially_refunded');
  });
});

describe('panel: pedidos, filtros y páginas', () => {
  it('lista con estados separados, paquete, medio elegido y transacción', async () => {
    const paid = await paidOrder({ paymentMethodId: 'pse', paymentTypeId: 'bank_transfer' });
    const res = await adminGet(`/api/admin/orders?q=${paid.order.reference}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      orders: {
        reference: string;
        states: { payment: string; recharge: string };
        items: { name: string; quantity: number }[];
        payMeans: string | null;
        providerPaymentId: string | null;
        paymentMethodId: string | null;
        game: string;
        updatedAt: string;
      }[];
      page: number;
      hasMore: boolean;
    }>();
    expect(body.page).toBe(1);
    const [row] = body.orders;
    expect(row).toMatchObject({
      reference: paid.order.reference,
      states: { payment: 'CONFIRMED', recharge: 'PENDING' },
      items: [{ name: '100 + 10 Diamantes', quantity: 1 }],
      payMeans: 'nequi',
      providerPaymentId: paid.paymentId,
      paymentMethodId: 'pse',
      game: 'freefire',
    });
    const detail = (await adminGet(`/api/admin/orders/${paid.id}`)).json<{
      payments: { paymentMethodId: string | null; paymentTypeId: string | null }[];
      attempts: { payMeans: string | null }[];
    }>();
    expect(detail.payments[0]).toMatchObject({
      paymentMethodId: 'pse',
      paymentTypeId: 'bank_transfer',
    });
    expect(detail.attempts[0]?.payMeans).toBe('nequi');
  });

  it('filtra por fecha (hora de Colombia), juego y estado', async () => {
    const created = await createGuestOrder();
    const colombiaToday = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() - 5 * 3_600_000 + 24 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    const refs = async (query: string) =>
      (await adminGet(`/api/admin/orders?${query}`))
        .json<{ orders: { reference: string }[] }>()
        .orders.map((o) => o.reference);

    expect(await refs(`from=${colombiaToday}&to=${colombiaToday}`)).toContain(
      created.order.reference,
    );
    expect(await refs(`from=${tomorrow}`)).not.toContain(created.order.reference);
    expect(await refs(`game=freefire&status=AWAITING_VERIFICATION`)).toContain(
      created.order.reference,
    );
    expect(await refs(`status=DELIVERED`)).not.toContain(created.order.reference);
    for (const bad of ['from=2026-13-40', 'from=ayer', 'game=otro', 'page=0', 'status=PAGADO']) {
      expect((await adminGet(`/api/admin/orders?${bad}`)).statusCode).toBe(400);
    }
  });

  it('pagina de 50 en 50 sin repetir pedidos', async () => {
    const total = (await adminGet('/api/admin/orders?page=1')).json<{ orders: unknown[] }>().orders
      .length;
    for (let i = total; i < 52; i += 1) await createGuestOrder();
    const first = (await adminGet('/api/admin/orders?page=1')).json<{
      orders: { id: string }[];
      hasMore: boolean;
    }>();
    const second = (await adminGet('/api/admin/orders?page=2')).json<{
      orders: { id: string }[];
      hasMore: boolean;
    }>();
    expect(first.orders).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.orders.length).toBeGreaterThan(0);
    const ids = new Set(first.orders.map((o) => o.id));
    expect(second.orders.some((o) => ids.has(o.id))).toBe(false);
  });
});

describe('panel: notas internas e historial', () => {
  it('guarda la nota con su autor; el historial reúne pedido, pago y entrega', async () => {
    const paid = await paidOrder();
    await fulfil(paid.id, { action: 'claim' });
    const res = await adminPost(`/api/admin/orders/${paid.id}/note`, {
      note: 'Cliente escribió por WhatsApp; recargar después de las 6 p. m.',
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json<{
      history: {
        action: string;
        actorType: string;
        actorEmail: string | null;
        note: string | null;
        entityType: string;
      }[];
    }>();
    const note = detail.history.find((event) => event.action === 'order.note');
    expect(note).toMatchObject({
      actorType: 'admin',
      actorEmail: ADMIN_EMAIL,
      note: 'Cliente escribió por WhatsApp; recargar después de las 6 p. m.',
    });
    const types = new Set(detail.history.map((event) => event.entityType));
    expect(types).toEqual(new Set(['order', 'payment', 'payment_attempt', 'fulfillment']));
    expect(detail.history.find((event) => event.action === 'fulfillment.claim')?.actorEmail).toBe(
      ADMIN_EMAIL,
    );
  });

  it('rechaza notas vacías o demasiado largas, y pedidos inexistentes', async () => {
    const paid = await paidOrder();
    expect((await adminPost(`/api/admin/orders/${paid.id}/note`, { note: ' a ' })).statusCode).toBe(
      400,
    );
    expect(
      (await adminPost(`/api/admin/orders/${paid.id}/note`, { note: 'x'.repeat(501) })).statusCode,
    ).toBe(400);
    expect(
      (await adminPost(`/api/admin/orders/${randomUUID()}/note`, { note: 'Nota de prueba' }))
        .statusCode,
    ).toBe(404);
  });

  it('ni un cliente ni un admin sin doble factor pueden escribir notas o cambiar estados', async () => {
    const paid = await paidOrder();
    const customer = await sessionFor(h, { email: 'cliente-notas@example.com' });
    const noMfa = await sessionFor(h, {
      email: 'admin2@example.com',
      admin: true,
      mfa: false,
      sub: 'admin-2-sin-mfa',
    });
    for (const cookies of [{}, paid.cookies, customer.cookie, noMfa.cookie]) {
      const note = await adminPost(
        `/api/admin/orders/${paid.id}/note`,
        { note: 'intento' },
        cookies,
      );
      expect([401, 403, 404]).toContain(note.statusCode);
      const claim = await adminPost(
        `/api/admin/orders/${paid.id}/fulfillment`,
        { action: 'claim' },
        cookies,
      );
      expect([401, 403, 404]).toContain(claim.statusCode);
    }
    const notes = await h.database.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, paid.id), eq(auditEvents.action, 'order.note')));
    expect(notes).toHaveLength(0);
  });

  it('la aplicación no puede editar ni borrar el historial', async () => {
    const paid = await paidOrder();
    await adminPost(`/api/admin/orders/${paid.id}/note`, { note: 'Nota original' });
    await expect(
      h.database.db
        .update(auditEvents)
        .set({ action: 'order.note.editada' })
        .where(eq(auditEvents.entityId, paid.id)),
    ).rejects.toThrow();
    await expect(
      h.database.db.delete(auditEvents).where(eq(auditEvents.entityId, paid.id)),
    ).rejects.toThrow();
  });
});

describe('alertas de pedidos atascados', () => {
  it('cuenta recargas «en proceso» de más de 2 h', async () => {
    const paid = await paidOrder();
    await fulfil(paid.id, { action: 'claim' });
    await fulfil(paid.id, { action: 'start' });
    const now = (await adminGet('/api/admin/alerts')).json<{ deliveringTooLong: number }>();
    h.clock.now = new Date(Date.now() + 3 * 3_600_000);
    const later = (await adminGet('/api/admin/alerts')).json<{ deliveringTooLong: number }>();
    expect(later.deliveringTooLong).toBeGreaterThan(now.deliveringTooLong);
  });
});

describe('datos de otros clientes', () => {
  it('el pago guardado nunca se comparte entre pedidos: un mismo pago no aprueba dos pedidos', async () => {
    const first = await paidOrder();
    const other = await readyToPay();
    await payWith(other.order.reference, other.cookies);
    // Mercado Pago informa el mismo id de pago con la referencia de otro pedido (manipulado).
    h.gateway.setPayment({
      id: first.paymentId,
      externalReference: other.order.reference,
      amount: other.order.totalCop,
    });
    await webhook(first.paymentId);
    const rows = await h.database.db
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(eq(payments.providerPaymentId, first.paymentId));
    expect(rows).toEqual([{ orderId: first.id }]);
    expect((await customerView(other.order.reference, other.cookies)).status).toBe(
      'AWAITING_PAYMENT',
    );
  });
});

describe('seguimiento privado sin cuenta (referencia + código secreto)', () => {
  const view = (ref: string, headers: Record<string, string> = {}) =>
    inject({ method: 'GET', url: `/api/orders/${ref}`, headers });

  it('el código del pedido abre el pedido desde otro dispositivo (sin cookies)', async () => {
    const created = await createGuestOrder();
    expect(created.token.length).toBeGreaterThanOrEqual(40);
    const res = await view(created.order.reference, { 'x-order-token': created.token });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ order: OrderJson }>().order.states).toEqual({
      payment: 'PENDING',
      recharge: 'PENDING',
    });
  });

  it('referencia sola, código equivocado, código de otro pedido o pedido inexistente: misma respuesta', async () => {
    const mine = await createGuestOrder();
    const other = await createGuestOrder();
    const missing = 'TGS-ZZZZZZZZZZ';
    const responses = [
      await view(mine.order.reference),
      await view(mine.order.reference, { 'x-order-token': 'A'.repeat(43) }),
      await view(mine.order.reference, { 'x-order-token': other.token }),
      await view(missing, { 'x-order-token': mine.token }),
    ];
    for (const res of responses) {
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain(mine.order.reference);
      expect(res.body).not.toContain('@example.com');
    }
    const bodies = new Set(
      responses.map((res) => res.json<{ error: { code: string } }>().error.code),
    );
    expect(bodies).toEqual(new Set(['NOT_FOUND']));
  });

  it('el código nunca se guarda en claro y no vuelve a entregarse', async () => {
    const created = await createGuestOrder();
    const [row] = await h.database.db
      .select({ hash: orders.accessTokenHash })
      .from(orders)
      .where(eq(orders.publicRef, created.order.reference));
    expect(row?.hash).toBeTruthy();
    expect(row?.hash).not.toBe(created.token);
    const again = await view(created.order.reference, { 'x-order-token': created.token });
    expect(again.body).not.toContain(created.token);
  });

  it('frena la consulta masiva desde una misma conexión (escudo antiabuso y límite por IP)', async () => {
    const created = await createGuestOrder();
    const statuses: number[] = [];
    for (let i = 0; i < 130; i += 1) {
      const res = await h.app.inject({
        method: 'GET',
        url: `/api/orders/${created.order.reference}`,
        remoteAddress: '10.250.250.250',
        headers: { 'x-order-token': `intento-${i}-`.padEnd(43, 'x') },
      });
      statuses.push(res.statusCode);
    }
    // Las primeras responden «no encontrado»; enseguida la IP queda bloqueada (403) o limitada (429).
    expect(statuses.slice(0, 5).every((status) => status === 404)).toBe(true);
    const firstBlocked = statuses.findIndex((status) => status === 403 || status === 429);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(firstBlocked).toBeLessThanOrEqual(120);
    expect(statuses.slice(firstBlocked).every((status) => status === 403 || status === 429)).toBe(
      true,
    );
    // Con la IP bloqueada ni siquiera el código correcto pasa desde esa conexión.
    const blocked = await h.app.inject({
      method: 'GET',
      url: `/api/orders/${created.order.reference}`,
      remoteAddress: '10.250.250.250',
      headers: { 'x-order-token': created.token },
    });
    expect([403, 429]).toContain(blocked.statusCode);
  });
});
