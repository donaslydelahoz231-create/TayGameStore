import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, inventoryCodes, orders, products } from '../../src/server/db/schema.js';
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
 * Inventario de recargas: el dueño carga PIN comprados a una red autorizada; al empezar la
 * entrega de un pedido pagado se reservan, al entregarlo quedan usados. Solo el administrador
 * los ve, cifrados en la base de datos y nunca en la auditoría.
 */
let h: Harness;
let admin: Record<string, string>;
let productId = '';

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-inv' }))
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
  h.app.inject({ remoteAddress: `10.66.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};
let uid = 510000000;

async function paidOrder(quantity: number) {
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String((uid += 1)),
      customerName: 'Cliente Inventario',
      customerEmail: `inv-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity }],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json<{ order: { reference: string; totalCop: number } }>().order;
  const cookies = guestCookie(created);
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, order.reference));
  const id = row?.id ?? '';
  for (const step of [
    {
      url: `/api/admin/orders/${id}/verification`,
      cookies: admin,
      payload: { result: 'VERIFIED', nickname: 'NickInv', region: 'Colombia' },
    },
    {
      url: `/api/orders/${order.reference}/confirm-player`,
      cookies,
      payload: { confirm: true, nickname: 'NickInv' },
    },
    { url: `/api/orders/${order.reference}/pay`, cookies, payload: undefined },
  ]) {
    const res = await inject({ method: 'POST', headers: CSRF, ...step });
    expect(res.statusCode, step.url).toBe(200);
  }
  const paymentId = String(Math.floor(Math.random() * 1e12));
  h.gateway.setPayment({
    id: paymentId,
    externalReference: order.reference,
    amount: order.totalCop,
    status: 'approved',
  });
  const hook = await inject({
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
    payload: { type: 'payment', data: { id: paymentId } },
  });
  expect(hook.statusCode).toBe(200);
  return id;
}

const fulfill = (orderId: string, payload: Record<string, string>) =>
  inject({
    method: 'POST',
    url: `/api/admin/orders/${orderId}/fulfillment`,
    headers: CSRF,
    cookies: admin,
    payload,
  });

const addCodes = (codes: string[], extra: Record<string, unknown> = {}) =>
  inject({
    method: 'POST',
    url: '/api/admin/inventory',
    headers: CSRF,
    cookies: admin,
    payload: { productId, codes, ...extra },
  });

const summary = async () =>
  (await inject({ method: 'GET', url: '/api/admin/inventory', cookies: admin }))
    .json<{
      lines: {
        sku: string;
        available: number;
        assigned: number;
        used: number;
        void: number;
        lowStock: boolean;
      }[];
    }>()
    .lines.find((l) => l.sku === 'ff-110');

const detail = async (orderId: string) =>
  (await inject({ method: 'GET', url: `/api/admin/orders/${orderId}`, cookies: admin })).json<{
    inventory: { id: string; code: string; status: string; sku: string }[];
  }>();

describe('inventario de PIN', () => {
  it('solo el dueño lo ve; los PIN quedan cifrados y nunca en la auditoría', async () => {
    const customer = (await sessionFor(h, { email: 'cliente-inv@example.com', sub: 'cli-inv' }))
      .cookie;
    expect(
      (await inject({ method: 'GET', url: '/api/admin/inventory', cookies: customer })).statusCode,
    ).toBe(404);
    expect((await inject({ method: 'GET', url: '/api/admin/inventory' })).statusCode).toBe(404);

    // Repetidos en el lote y con espacios/guiones: se normalizan y se cuentan una vez.
    const first = await addCodes(['AAAA-BBBB-1111', 'aaaa bbbb 1111', 'CCCC-DDDD-2222'], {
      costCop: 3200,
      source: 'Lote de prueba',
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toEqual({ added: 2, duplicates: 1 });
    // Volver a cargar un PIN ya cargado no lo duplica.
    expect((await addCodes(['CCCCDDDD2222', 'EEEEFFFF3333'])).json()).toEqual({
      added: 1,
      duplicates: 1,
    });
    expect(await summary()).toMatchObject({ available: 3, assigned: 0, used: 0, lowStock: false });

    const stored = await h.database.db.select().from(inventoryCodes);
    for (const row of stored) {
      expect(row.codeEnc).not.toContain('AAAABBBB1111');
      expect(row.codeHash).not.toContain('AAAABBBB1111');
    }
    const log = JSON.stringify(
      await h.database.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'inventory')),
    );
    expect(log).not.toContain('AAAABBBB1111');
    expect(log).toContain('"added":2');

    expect((await addCodes(['corto'])).statusCode).toBe(400);
    expect((await addCodes(['PIN<script>alert(1)</script>'])).statusCode).toBe(400);
  });

  it('empezar la entrega reserva el PIN más antiguo; entregar lo marca usado', async () => {
    const orderId = await paidOrder(1);
    for (const action of ['claim', 'start']) {
      expect((await fulfill(orderId, { action })).statusCode, action).toBe(200);
    }
    const reserved = (await detail(orderId)).inventory;
    expect(reserved).toEqual([
      expect.objectContaining({ code: 'AAAABBBB1111', status: 'ASSIGNED', sku: 'ff-110' }),
    ]);
    expect(await summary()).toMatchObject({ available: 2, assigned: 1 });
    expect(
      (await fulfill(orderId, { action: 'deliver', evidence: 'PIN canjeado al ID del cliente' }))
        .statusCode,
    ).toBe(200);
    expect((await detail(orderId)).inventory[0]?.status).toBe('USED');
    expect(await summary()).toMatchObject({ available: 2, assigned: 0, used: 1, lowStock: true });
    const alerts = (
      await inject({ method: 'GET', url: '/api/admin/alerts', cookies: admin })
    ).json<{
      lowStock: string[];
    }>();
    expect(alerts.lowStock).toContain('ff-110');
  });

  it('sin PIN suficientes se reservan los que hay y el resto se entrega a mano', async () => {
    const orderId = await paidOrder(3);
    await fulfill(orderId, { action: 'claim' });
    await fulfill(orderId, { action: 'start' });
    expect((await detail(orderId)).inventory).toHaveLength(2);
    const [event] = await h.database.db
      .select({ data: auditEvents.data })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'inventory.assigned'))
      .orderBy(auditEvents.id);
    expect(event).toBeDefined();
    expect(await summary()).toMatchObject({ available: 0, assigned: 2 });

    // Liberar un PIN no usado lo devuelve al inventario; anular otro lo retira.
    const [one, two] = (await detail(orderId)).inventory;
    const act = (id: string, action: string) =>
      inject({
        method: 'POST',
        url: `/api/admin/inventory/${id}`,
        headers: CSRF,
        cookies: admin,
        payload: { action },
      });
    expect((await act(one?.id ?? '', 'release')).statusCode).toBe(200);
    expect((await act(two?.id ?? '', 'void')).statusCode).toBe(200);
    expect((await act(two?.id ?? '', 'release')).statusCode).toBe(409);
    expect(await summary()).toMatchObject({ available: 1, assigned: 0, void: 1 });
  });

  it('dos entregas a la vez nunca reciben el mismo PIN', async () => {
    await addCodes(['ZZZZYYYY9999']);
    const before = (await summary())?.available ?? 0;
    const [a, b] = [await paidOrder(1), await paidOrder(1)];
    await Promise.all([fulfill(a, { action: 'claim' }), fulfill(b, { action: 'claim' })]);
    const results = await Promise.all([
      fulfill(a, { action: 'start' }),
      fulfill(b, { action: 'start' }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const codes = [...(await detail(a)).inventory, ...(await detail(b)).inventory].map(
      (c) => c.code,
    );
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(Math.min(2, before));
  });
});
