import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auditEvents,
  blocklist,
  fulfillments,
  orders,
  paymentAttempts,
  payments,
} from '../../src/server/db/schema.js';
import { expireOrders, runJob } from '../../src/server/services/jobs.js';
import type { ApiErrorBody } from '../../src/shared/errors.js';
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

let h: Harness;
let admin: Record<string, string>;
let admin2: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-1' }))
    .cookie;
  const second = await sessionFor(h, {
    email: 'admin2@example.com',
    admin: true,
    mfa: true,
    sub: 'admin-2',
  });
  admin2 = second.cookie;
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
  h.gateway.failNextCreates = 0;
  h.gateway.failQueries = false;
});

/** Cada petición desde una IP distinta: el rate limiting por IP se prueba aparte. */
const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });

let uidCounter = 100000000;
const nextUid = () => String((uidCounter += 1));
const nextEmail = () => `c${uidCounter}-${randomUUID().slice(0, 6)}@example.com`;

interface CheckoutBody {
  checkoutKey: string;
  game: 'freefire';
  playerUid: string;
  customerName: string;
  customerEmail: string;
  acceptTerms: true;
  termsVersion: string;
  items: { sku: string; quantity: number }[];
  expectedTotalCop?: number;
}

function body(overrides: Partial<CheckoutBody> = {}): CheckoutBody {
  return {
    checkoutKey: randomUUID(),
    game: 'freefire',
    playerUid: nextUid(),
    customerName: 'Cliente Prueba',
    customerEmail: nextEmail(),
    acceptTerms: true,
    termsVersion: '2026-10-05',
    items: [{ sku: 'ff-110', quantity: 2 }],
    ...overrides,
  };
}

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

async function checkout(payload: unknown, cookies: Record<string, string> = {}) {
  return inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    cookies,
    payload: payload as object,
  });
}

interface OrderJson {
  reference: string;
  status: string;
  totalCop: number;
  verification: { status: string; nickname: string | null };
  payment: { status: string | null; canPay: boolean };
  fulfillment: { status: string | null };
}

async function createGuestOrder(overrides: Partial<CheckoutBody> = {}) {
  const res = await checkout(body(overrides));
  expect(res.statusCode).toBe(201);
  const json = res.json<{ order: OrderJson; accessToken: string }>();
  return { order: json.order, token: json.accessToken, cookies: guestCookie(res) };
}

async function orderId(ref: string): Promise<string> {
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, ref));
  if (!row) throw new Error('orden no encontrada');
  return row.id;
}

async function getOrder(ref: string, cookies: Record<string, string>, token?: string) {
  return inject({
    method: 'GET',
    url: `/api/orders/${ref}`,
    cookies,
    headers: token ? { 'x-order-token': token } : {},
  });
}

async function adminPost(url: string, payload: object, cookies = admin) {
  return inject({ method: 'POST', url, headers: CSRF, cookies, payload });
}

/** Orden lista para pagar: verificada por el operador y confirmada por el cliente. */
async function readyToPay(overrides: Partial<CheckoutBody> = {}) {
  const created = await createGuestOrder(overrides);
  const id = await orderId(created.order.reference);
  const verified = await adminPost(`/api/admin/orders/${id}/verification`, {
    result: 'VERIFIED',
    nickname: 'JugadorPro',
    region: 'Colombia',
  });
  expect(verified.statusCode).toBe(200);
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

async function pay(ref: string, cookies: Record<string, string>) {
  return inject({ method: 'POST', url: `/api/orders/${ref}/pay`, headers: CSRF, cookies });
}

async function webhook(paymentId: string, requestId = randomUUID(), signature = 'firma-valida') {
  return inject({
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': signature, 'x-request-id': requestId },
    payload: { type: 'payment', action: 'payment.updated', data: { id: paymentId } },
  });
}

async function paidOrder() {
  const ready = await readyToPay();
  const res = await pay(ready.order.reference, ready.cookies);
  expect(res.statusCode).toBe(200);
  const paymentId = String(Math.floor(Math.random() * 1e12));
  h.gateway.setPayment({
    id: paymentId,
    externalReference: ready.order.reference,
    amount: ready.order.totalCop,
  });
  expect((await webhook(paymentId)).statusCode).toBe(200);
  return { ...ready, paymentId };
}

async function dbOrder(id: string) {
  const [row] = await h.database.db.select().from(orders).where(eq(orders.id, id));
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('catálogo', () => {
  it('lista solo productos activos con el precio que decide el servidor', async () => {
    const res = await inject({ method: 'GET', url: '/api/catalog?game=freefire' });
    expect(res.statusCode).toBe(200);
    const { products } = res.json<{
      products: { sku: string; priceCop: number; listPriceCop: number }[];
    }>();
    expect(products.map((p) => p.sku)).toEqual(['ff-110', 'ff-341', 'ff-6160', 'ff-big']);
    expect(products[0]).toMatchObject({ priceCop: 3800, listPriceCop: 4000 });
  });
});

describe('checkout', () => {
  it('crea la orden con totales del servidor, token y cookie de invitado', async () => {
    const res = await checkout(
      body({
        items: [
          { sku: 'ff-110', quantity: 2 },
          { sku: 'ff-341', quantity: 1 },
        ],
      }),
    );
    expect(res.statusCode).toBe(201);
    const json = res.json<{
      order: OrderJson & { subtotalCop: number; discountCop: number };
      accessToken: string;
    }>();
    expect(json.order).toMatchObject({
      status: 'AWAITING_VERIFICATION',
      subtotalCop: 19000,
      discountCop: 400,
      totalCop: 18600,
    });
    expect(json.order.reference).toMatch(/^TGS-[0-9A-Z]{10}$/);
    expect(json.accessToken.length).toBeGreaterThan(40);
    expect(Object.keys(guestCookie(res))).toEqual(['tgs_guest']);
  });

  it('es idempotente: la misma clave devuelve la misma orden y sin nuevo token', async () => {
    const payload = body();
    const first = await checkout(payload);
    const cookies = guestCookie(first);
    const again = await checkout(payload, cookies);
    expect(again.statusCode).toBe(200);
    expect(again.json<{ order: OrderJson }>().order.reference).toBe(
      first.json<{ order: OrderJson }>().order.reference,
    );
    expect(again.json<{ accessToken?: string }>().accessToken).toBeUndefined();
    const conflict = await checkout(
      { ...payload, items: [{ sku: 'ff-341', quantity: 1 }] },
      cookies,
    );
    expect(conflict.statusCode).toBe(409);
    // Otro navegador no puede recuperar la orden reutilizando la clave.
    const stranger = await checkout(payload);
    expect(stranger.statusCode).toBe(409);
  });

  it('doble clic / pestañas simultáneas con la misma clave crean una sola orden', async () => {
    const first = await checkout(body());
    const cookies = guestCookie(first);
    const payload = body();
    const results = await Promise.all(Array.from({ length: 5 }, () => checkout(payload, cookies)));
    expect(results.every((r) => r.statusCode === 201 || r.statusCode === 200)).toBe(true);
    const refs = new Set(results.map((r) => r.json<{ order: OrderJson }>().order.reference));
    expect(refs.size).toBe(1);
    const [count] = await h.database.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.checkoutKey, payload.checkoutKey));
    expect(count?.n).toBe(1);
  });

  it('rechaza manipulación: campos extra, cantidades, totales y productos inactivos', async () => {
    expect((await checkout({ ...body(), totalCop: 1 })).statusCode).toBe(400);
    expect((await checkout(body({ items: [{ sku: 'ff-110', quantity: 6 }] }))).statusCode).toBe(
      400,
    );
    expect((await checkout(body({ playerUid: '12ab' }))).statusCode).toBe(400);
    const changed = await checkout(body({ expectedTotalCop: 1 }));
    expect(changed.statusCode).toBe(409);
    expect(changed.json<ApiErrorBody>().error.code).toBe('PRICE_CHANGED');
    const inactive = await checkout(body({ items: [{ sku: 'ff-off', quantity: 1 }] }));
    expect(inactive.json<ApiErrorBody>().error.code).toBe('PRODUCT_UNAVAILABLE');
    const unknown = await checkout(body({ items: [{ sku: 'no-existe', quantity: 1 }] }));
    expect(unknown.json<ApiErrorBody>().error.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('aplica el máximo de 1.000.000 COP por orden', async () => {
    // 4 × 300.000 = 1.200.000 COP > 1.000.000 COP.
    const res = await checkout(body({ items: [{ sku: 'ff-big', quantity: 4 }] }));
    expect(res.statusCode).toBe(422);
    expect(res.json<ApiErrorBody>().error.code).toBe('LIMIT_EXCEEDED');
  });

  it('limita órdenes abiertas por email, también con peticiones simultáneas', async () => {
    const email = nextEmail();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => checkout(body({ customerEmail: email }))),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 429)).toHaveLength(3);
  });

  it('respeta la lista de bloqueo con un mensaje genérico', async () => {
    const email = nextEmail();
    await h.database.db.insert(blocklist).values({ kind: 'email', value: email, reason: 'fraude' });
    const res = await checkout(body({ customerEmail: email }));
    expect(res.statusCode).toBe(403);
    expect(res.json<ApiErrorBody>().error.message).not.toContain(email);
  });

  it('exige la versión vigente de los términos', async () => {
    const res = await checkout(body({ termsVersion: 'vieja' }));
    expect(res.statusCode).toBe(409);
  });
});

describe('acceso a órdenes (IDOR)', () => {
  it('permite al dueño (cookie o token) y responde 404 igual a cualquier otro', async () => {
    const { order, token, cookies } = await createGuestOrder();
    expect((await getOrder(order.reference, cookies)).statusCode).toBe(200);
    expect((await getOrder(order.reference, {}, token)).statusCode).toBe(200);
    expect((await getOrder(order.reference, { tgs_guest: 'otro-navegador' })).statusCode).toBe(404);
    expect((await getOrder(order.reference, {}, 'token-falso')).statusCode).toBe(404);
    expect((await getOrder('TGS-0000000000', cookies)).statusCode).toBe(404);
    const customer = await sessionFor(h, { email: 'curioso@example.com' });
    expect((await getOrder(order.reference, customer.cookie)).statusCode).toBe(404);
  });

  it('lista solo las órdenes del navegador o usuario', async () => {
    const mine = await createGuestOrder();
    await createGuestOrder();
    const res = await inject({ method: 'GET', url: '/api/orders', cookies: mine.cookies });
    const refs = res.json<{ orders: OrderJson[] }>().orders.map((o) => o.reference);
    expect(refs).toEqual([mine.order.reference]);
  });
});

describe('verificación manual del jugador', () => {
  it('operador verifica → cliente confirma → AWAITING_PAYMENT; nunca antes', async () => {
    const { order, cookies } = await createGuestOrder();
    const early = await pay(order.reference, cookies);
    expect(early.statusCode).toBe(409);
    const id = await orderId(order.reference);
    await adminPost(`/api/admin/orders/${id}/verification`, {
      result: 'VERIFIED',
      nickname: 'Nick',
      region: 'Colombia',
    });
    const seen = (await getOrder(order.reference, cookies)).json<{ order: OrderJson }>().order;
    expect(seen.verification).toMatchObject({ status: 'VERIFIED', nickname: 'Nick' });
    const stale = await inject({
      method: 'POST',
      url: `/api/orders/${order.reference}/confirm-player`,
      headers: CSRF,
      cookies,
      payload: { confirm: true, nickname: 'OtroNick' },
    });
    expect(stale.statusCode).toBe(409);
    const ok = await inject({
      method: 'POST',
      url: `/api/orders/${order.reference}/confirm-player`,
      headers: CSRF,
      cookies,
      payload: { confirm: true, nickname: 'Nick' },
    });
    expect(ok.json<{ order: OrderJson }>().order.status).toBe('AWAITING_PAYMENT');
  });

  it('un resultado negativo o "no es mi cuenta" rechaza la orden', async () => {
    const a = await createGuestOrder();
    await adminPost(`/api/admin/orders/${await orderId(a.order.reference)}/verification`, {
      result: 'NOT_FOUND',
    });
    expect((await dbOrder(await orderId(a.order.reference)))?.status).toBe('REJECTED');
    const b = await createGuestOrder();
    const id = await orderId(b.order.reference);
    await adminPost(`/api/admin/orders/${id}/verification`, {
      result: 'VERIFIED',
      nickname: 'N',
      region: 'R',
    });
    await inject({
      method: 'POST',
      url: `/api/orders/${b.order.reference}/confirm-player`,
      headers: CSRF,
      cookies: b.cookies,
      payload: { confirm: false, nickname: 'N' },
    });
    expect((await dbOrder(id))?.status).toBe('REJECTED');
  });
});

describe('pago con Mercado Pago (doble de pruebas)', () => {
  it('crea una sola preferencia por orden aunque se pulse varias veces', async () => {
    const ready = await readyToPay();
    const before = h.gateway.preferences.size;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => pay(ready.order.reference, ready.cookies)),
    );
    const urls = new Set(
      results
        .filter((r) => r.statusCode === 200)
        .map((r) => r.json<{ checkoutUrl: string }>().checkoutUrl),
    );
    expect(urls.size).toBe(1);
    expect(h.gateway.preferences.size).toBe(before + 1);
    const [pref] = [...h.gateway.preferences.values()].slice(-1);
    expect(pref?.input).toMatchObject({
      orderRef: ready.order.reference,
      totalCop: ready.order.totalCop,
    });
    expect(pref?.input.notificationUrl).toBe('http://localhost:3000/api/webhooks/mercadopago');
  });

  it('timeout al crear la preferencia: 503 y el reintento usa la misma clave (sin duplicar)', async () => {
    const ready = await readyToPay();
    h.gateway.failNextCreates = 1;
    const failed = await pay(ready.order.reference, ready.cookies);
    expect(failed.statusCode).toBe(503);
    expect(failed.json<ApiErrorBody>().error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    const [attempt] = await h.database.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, ready.id));
    expect(attempt?.status).toBe('CREATING');
    const ok = await pay(ready.order.reference, ready.cookies);
    expect(ok.statusCode).toBe(200);
    const attempts = await h.database.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, ready.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.idempotencyKey).toBe(attempt?.idempotencyKey);
  });

  it('webhook con firma inválida: 401 y sin efectos', async () => {
    const res = await webhook('123', randomUUID(), 'firma-falsa');
    expect(res.statusCode).toBe(401);
  });

  it('pago aprobado → PAID + entrega lista; webhook duplicado sin efectos dobles', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    const paymentId = '900000000001';
    h.gateway.setPayment({
      id: paymentId,
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
    });
    const requestId = randomUUID();
    expect((await webhook(paymentId, requestId)).statusCode).toBe(200);
    expect((await dbOrder(ready.id))?.status).toBe('PAID');
    const auditCount = async () =>
      (
        await h.database.db
          .select({ n: sql<number>`count(*)::int` })
          .from(auditEvents)
          .where(eq(auditEvents.entityId, ready.id))
      )[0]?.n;
    const before = await auditCount();
    await Promise.all([webhook(paymentId, requestId), webhook(paymentId), webhook(paymentId)]);
    expect(await auditCount()).toBe(before);
    const [f] = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, ready.id));
    expect(f?.status).toBe('READY_FOR_FULFILLMENT');
    const view = (await getOrder(ready.order.reference, ready.cookies)).json<{ order: OrderJson }>()
      .order;
    expect(view).toMatchObject({ status: 'PAID', payment: { status: 'APPROVED', canPay: false } });
  });

  it('webhook + retorno del navegador simultáneos convergen', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    const paymentId = '900000000002';
    h.gateway.setPayment({
      id: paymentId,
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
    });
    await Promise.all([
      webhook(paymentId),
      inject({
        method: 'POST',
        url: `/api/orders/${ready.order.reference}/sync`,
        headers: CSRF,
        cookies: ready.cookies,
      }),
      webhook(paymentId),
    ]);
    expect((await dbOrder(ready.id))?.status).toBe('PAID');
    const rows = await h.database.db.select().from(payments).where(eq(payments.orderId, ready.id));
    expect(rows).toHaveLength(1);
  });

  it('el retorno del navegador no marca nada como pagado sin confirmación de Mercado Pago', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    const res = await inject({
      method: 'POST',
      url: `/api/orders/${ready.order.reference}/sync?status=approved`,
      headers: CSRF,
      cookies: ready.cookies,
    });
    expect(res.json<{ order: OrderJson }>().order.status).toBe('AWAITING_PAYMENT');
  });

  it('importe distinto → NEEDS_REVIEW, nunca PAID', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    h.gateway.setPayment({
      id: '900000000003',
      externalReference: ready.order.reference,
      amount: 1,
    });
    await webhook('900000000003');
    expect((await dbOrder(ready.id))?.status).toBe('NEEDS_REVIEW');
  });

  it('segundo pago aprobado de la misma orden → NEEDS_REFUND y una sola entrega', async () => {
    const paid = await paidOrder();
    h.gateway.setPayment({
      id: '900000000004',
      externalReference: paid.order.reference,
      amount: paid.order.totalCop,
    });
    await webhook('900000000004');
    const rows = await h.database.db.select().from(payments).where(eq(payments.orderId, paid.id));
    expect(rows.map((r) => r.status).sort()).toEqual(['APPROVED', 'NEEDS_REFUND']);
    expect(rows.filter((r) => r.isOrderPayment)).toHaveLength(1);
    expect((await dbOrder(paid.id))?.status).toBe('PAID');
  });

  it('pago rechazado: la orden sigue esperando pago y se puede reintentar', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    h.gateway.setPayment({
      id: '900000000005',
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
      status: 'rejected',
    });
    await webhook('900000000005');
    expect((await dbOrder(ready.id))?.status).toBe('AWAITING_PAYMENT');
    expect((await pay(ready.order.reference, ready.cookies)).statusCode).toBe(200);
  });

  it('Mercado Pago caído al procesar el webhook: se acepta y queda para reintento', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    h.gateway.setPayment({
      id: '900000000006',
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
    });
    h.gateway.failQueries = true;
    expect((await webhook('900000000006')).statusCode).toBe(200);
    expect((await dbOrder(ready.id))?.status).toBe('AWAITING_PAYMENT');
    h.gateway.failQueries = false;
    expect(await runJob(h.deps, 'retryEvents')).toBeGreaterThanOrEqual(1);
    expect((await dbOrder(ready.id))?.status).toBe('PAID');
  });

  it('reembolso confirmado por Mercado Pago → REFUNDED', async () => {
    const paid = await paidOrder();
    h.gateway.setPayment({
      id: paid.paymentId,
      externalReference: paid.order.reference,
      amount: paid.order.totalCop,
      status: 'refunded',
    });
    await webhook(paid.paymentId);
    expect((await dbOrder(paid.id))?.status).toBe('REFUNDED');
    const [f] = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, paid.id));
    expect(f?.status).toBe('CANCELLED');
  });
});

describe('expiración y pagos tardíos', () => {
  it('expira órdenes vencidas sin pagos y respeta pagos pendientes', async () => {
    const idle = await readyToPay();
    const pending = await readyToPay();
    await pay(pending.order.reference, pending.cookies);
    h.gateway.setPayment({
      id: '900000000007',
      externalReference: pending.order.reference,
      amount: pending.order.totalCop,
      status: 'pending',
    });
    h.clock.now = new Date(Date.now() + 2 * 3_600_000);
    await expireOrders(h.deps);
    expect((await dbOrder(idle.id))?.status).toBe('EXPIRED');
    expect((await dbOrder(pending.id))?.status).toBe('AWAITING_PAYMENT');
  });

  it('pago aprobado para una orden expirada → revisión controlada (NEEDS_REVIEW)', async () => {
    const ready = await readyToPay();
    await pay(ready.order.reference, ready.cookies);
    h.clock.now = new Date(Date.now() + 2 * 3_600_000);
    await expireOrders(h.deps);
    expect((await dbOrder(ready.id))?.status).toBe('EXPIRED');
    h.gateway.setPayment({
      id: '900000000008',
      externalReference: ready.order.reference,
      amount: ready.order.totalCop,
    });
    await webhook('900000000008');
    expect((await dbOrder(ready.id))?.status).toBe('NEEDS_REVIEW');
    const resumed = await adminPost(`/api/admin/orders/${ready.id}/review`, {
      resolution: 'resume_fulfillment',
      note: 'Pago válido tardío',
    });
    expect(resumed.statusCode).toBe(200);
    expect((await dbOrder(ready.id))?.status).toBe('PAID');
  });

  it('las tareas programadas no se ejecutan dos veces a la vez (advisory lock)', async () => {
    const results = await Promise.all([runJob(h.deps, 'cleanup'), runJob(h.deps, 'cleanup')]);
    expect(results.filter((r) => r === null).length).toBeGreaterThanOrEqual(1);
  });
});

describe('entrega manual', () => {
  it('dos operadores reclaman a la vez: solo uno gana; entrega exige evidencia y al reclamante', async () => {
    const paid = await paidOrder();
    const url = `/api/admin/orders/${paid.id}/fulfillment`;
    const [a, b] = await Promise.all([
      adminPost(url, { action: 'claim' }),
      adminPost(url, { action: 'claim' }, admin2),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? admin : admin2;
    const loser = a.statusCode === 200 ? admin2 : admin;
    expect((await adminPost(url, { action: 'start' }, loser)).statusCode).toBe(403);
    expect((await adminPost(url, { action: 'start' }, winner)).statusCode).toBe(200);
    expect((await dbOrder(paid.id))?.status).toBe('DELIVERING');
    expect((await adminPost(url, { action: 'deliver' }, winner)).statusCode).toBe(400);
    expect(
      (
        await adminPost(
          url,
          { action: 'deliver', evidence: 'Recarga ID 7788 en el panel del proveedor' },
          winner,
        )
      ).statusCode,
    ).toBe(200);
    expect((await dbOrder(paid.id))?.status).toBe('DELIVERED');
    expect(
      (await adminPost(url, { action: 'deliver', evidence: 'otra vez' }, winner)).statusCode,
    ).toBe(409);
  });

  it('no se puede reclamar una orden sin pago confirmado', async () => {
    const ready = await readyToPay();
    await h.database.db
      .insert(fulfillments)
      .values({ orderId: ready.id, status: 'READY_FOR_FULFILLMENT' });
    const res = await adminPost(`/api/admin/orders/${ready.id}/fulfillment`, { action: 'claim' });
    expect(res.statusCode).toBe(409);
  });

  it('una entrega fallida deja la orden en revisión', async () => {
    const paid = await paidOrder();
    const url = `/api/admin/orders/${paid.id}/fulfillment`;
    await adminPost(url, { action: 'claim' });
    await adminPost(url, { action: 'start' });
    await adminPost(url, { action: 'fail', reason: 'Proveedor caído' });
    expect((await dbOrder(paid.id))?.status).toBe('NEEDS_REVIEW');
  });
});

describe('autorización de administración', () => {
  it('sin sesión 401, cliente 403, admin sin MFA 403 MFA_REQUIRED', async () => {
    expect((await inject({ method: 'GET', url: '/api/admin/orders' })).statusCode).toBe(401);
    const customer = await sessionFor(h, { email: 'cliente2@example.com' });
    expect(
      (await inject({ method: 'GET', url: '/api/admin/orders', cookies: customer.cookie }))
        .statusCode,
    ).toBe(403);
    const noMfa = await sessionFor(h, {
      email: ADMIN_EMAIL,
      admin: true,
      mfa: false,
      sub: 'admin-1',
    });
    const res = await inject({ method: 'GET', url: '/api/admin/orders', cookies: noMfa.cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json<ApiErrorBody>().error.code).toBe('MFA_REQUIRED');
  });

  it('un admin fuera de la allowlist pierde el acceso aunque tenga sesión', async () => {
    const former = await sessionFor(h, {
      email: 'ex-admin@example.com',
      admin: true,
      mfa: true,
      sub: 'ex-admin',
    });
    const res = await inject({ method: 'GET', url: '/api/admin/orders', cookies: former.cookie });
    expect(res.statusCode).toBe(403);
  });
});

describe('rate limiting', () => {
  it('limita el checkout por IP (10 cada 10 minutos)', async () => {
    const ip = '192.0.2.77';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/checkout',
        headers: CSRF,
        remoteAddress: ip,
        payload: { invalido: true },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('integridad de la auditoría', () => {
  it('audit_events es append-only', async () => {
    await expect(
      h.database.db.execute(sql`update audit_events set action = 'x'`),
    ).rejects.toThrow();
    await expect(h.database.db.execute(sql`delete from audit_events`)).rejects.toThrow();
  });
});
