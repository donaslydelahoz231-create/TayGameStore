import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, orders, reviews } from '../../src/server/db/schema.js';
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
 * Reseñas de compras verificadas:
 * - solo quien hizo el pedido, y solo cuando está entregado, una vez por pedido;
 * - la tienda muestra únicamente las que el dueño publicó, con nombre de pila e inicial;
 * - el contenido no se puede editar ni borrar (lo impide la base de datos).
 */
let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PLAYER_VERIFICATION: 'customer' });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-r' }))
    .cookie;
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
let uid = 870000000;

interface Bought {
  reference: string;
  id: string;
  cookies: Record<string, string>;
}

/** Pedido pagado por un invitado (el cliente confirma su ID, como en producción). */
async function paidOrder(customerName = 'Laura Martínez Gómez'): Promise<Bought> {
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
      customerName,
      customerEmail: `resena-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 2 }],
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
  expect(pay.statusCode, pay.body).toBe(200);
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
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, order.reference));
  return { reference: order.reference, id: row?.id ?? '', cookies };
}

async function deliver(order: Bought) {
  for (const body of [
    { action: 'claim' },
    { action: 'start' },
    { action: 'deliver', evidence: 'Recarga hecha por el dueño' },
  ]) {
    const res = await inject({
      method: 'POST',
      url: `/api/admin/orders/${order.id}/fulfillment`,
      headers: CSRF,
      cookies: admin,
      payload: body,
    });
    expect(res.statusCode, JSON.stringify(body)).toBe(200);
  }
}

const review = (order: Bought, payload: unknown, cookies = order.cookies) =>
  inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/review`,
    headers: CSRF,
    cookies,
    payload: payload as Record<string, unknown>,
  });

const moderate = (id: string, action: 'publish' | 'hide') =>
  inject({
    method: 'POST',
    url: `/api/admin/reviews/${id}`,
    headers: CSRF,
    cookies: admin,
    payload: { action },
  });

const publicList = async () =>
  (await inject({ method: 'GET', url: '/api/reviews?game=freefire' })).json<{
    summary: { count: number; average: number | null };
    reviews: {
      author: string;
      rating: number;
      comment: string | null;
      purchase: string;
      createdAt: string;
    }[];
  }>();

describe('reseñas de compras verificadas', () => {
  it('sin reseñas publicadas, la tienda no inventa ninguna', async () => {
    expect(await publicList()).toEqual({ summary: { count: 0, average: null }, reviews: [] });
  });

  it('un pedido pagado pero sin entregar todavía no se puede reseñar', async () => {
    const order = await paidOrder();
    const status = await inject({
      method: 'GET',
      url: `/api/orders/${order.reference}/review`,
      cookies: order.cookies,
    });
    expect(status.json()).toEqual({ eligible: false, review: null });
    const res = await review(order, { rating: 5, comment: 'Rápido' });
    expect(res.statusCode).toBe(409);
  });

  it('nadie más que el comprador puede reseñar su pedido (responde igual que inexistente)', async () => {
    const order = await paidOrder();
    await deliver(order);
    const stranger = await review(order, { rating: 1, comment: 'Falsa' }, {});
    expect(stranger.statusCode).toBe(404);
    const other = await paidOrder('Otra Persona');
    const foreign = await review(order, { rating: 1 }, other.cookies);
    expect(foreign.statusCode).toBe(404);
  });

  it('entregado: el comprador opina una sola vez; queda pendiente hasta que el dueño la publique', async () => {
    const order = await paidOrder('Laura Martínez Gómez');
    await deliver(order);
    const before = await inject({
      method: 'GET',
      url: `/api/orders/${order.reference}/review`,
      cookies: order.cookies,
    });
    expect(before.json()).toEqual({ eligible: true, review: null });

    const first = await review(order, {
      rating: 5,
      comment: '  Llegó   en minutos,\nexcelente.  ',
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json<{ review: { status: string; comment: string } }>().review).toMatchObject({
      status: 'PENDING',
      comment: 'Llegó en minutos, excelente.',
    });
    const again = await review(order, { rating: 1, comment: 'Cambio de opinión' });
    expect(again.statusCode).toBe(409);

    // Pendiente: no aparece en la tienda, pero sí en las alertas del panel.
    expect((await publicList()).summary.count).toBe(0);
    const alerts = await inject({ method: 'GET', url: '/api/admin/alerts', cookies: admin });
    expect(alerts.json<{ reviewsPending: number }>().reviewsPending).toBeGreaterThanOrEqual(1);

    const [row] = await h.database.db.select().from(reviews).where(eq(reviews.orderId, order.id));
    expect(row?.authorName).toBe('Laura M.');
    expect((await moderate(row!.id, 'publish')).statusCode).toBe(200);
    const list = await publicList();
    expect(list.summary).toEqual({ count: 1, average: 5 });
    const { createdAt, ...published } = list.reviews[0]!;
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
    expect(published).toEqual({
      author: 'Laura M.',
      rating: 5,
      comment: 'Llegó en minutos, excelente.',
      purchase: '100 + 10 Diamantes ×2',
    });
    // Nunca se publican el correo, el ID del jugador ni la referencia del pedido.
    const body = JSON.stringify(list);
    expect(body).not.toContain('@');
    expect(body).not.toContain(order.reference);

    // Ocultar la retira de la tienda; el registro queda.
    expect((await moderate(row!.id, 'hide')).statusCode).toBe(200);
    expect((await publicList()).summary.count).toBe(0);
    const audit = await h.database.db
      .select({ action: auditEvents.action, to: auditEvents.toStatus })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, row!.id))
      .orderBy(auditEvents.id);
    expect(audit).toEqual([
      { action: 'review.created', to: 'PENDING' },
      { action: 'review.moderated', to: 'PUBLISHED' },
      { action: 'review.moderated', to: 'HIDDEN' },
    ]);
  });

  it('valida las estrellas y rechaza enlaces en el comentario', async () => {
    const order = await paidOrder();
    await deliver(order);
    expect((await review(order, { rating: 0 })).statusCode).toBe(400);
    expect((await review(order, { rating: 6 })).statusCode).toBe(400);
    expect((await review(order, { rating: 4.5 })).statusCode).toBe(400);
    expect((await review(order, { rating: 5, comment: 'x'.repeat(401) })).statusCode).toBe(400);
    expect(
      (await review(order, { rating: 5, comment: 'Mejor compra en www.otra-tienda.com' }))
        .statusCode,
    ).toBe(400);
    expect((await review(order, { rating: 5, extra: true })).statusCode).toBe(400);
    const onlyStars = await review(order, { rating: 4, comment: '   ' });
    expect(onlyStars.statusCode, onlyStars.body).toBe(201);
    expect(onlyStars.json<{ review: { comment: string | null } }>().review.comment).toBeNull();
  });

  it('nadie puede editar ni borrar una reseña, ni siquiera el dueño de la base de datos', async () => {
    const order = await paidOrder();
    await deliver(order);
    expect((await review(order, { rating: 2, comment: 'Tardó' })).statusCode).toBe(201);
    // La aplicación: puede cambiar el estado, nunca las estrellas ni el texto.
    const failure: unknown = await h.database.db
      .execute(sql`update reviews set rating = 5 where order_id = ${order.id}`)
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain('no se puede cambiar');
    // El dueño de las tablas (con SQL directo): tampoco puede borrarla ni editarla.
    const owner = new pg.Client({ connectionString: testDatabaseUrl() });
    await owner.connect();
    try {
      await expect(
        owner.query('delete from reviews where order_id = $1', [order.id]),
      ).rejects.toThrow(/registro protegido/);
      await expect(
        owner.query("update reviews set comment = 'Excelente' where order_id = $1", [order.id]),
      ).rejects.toThrow(/no se puede cambiar/);
    } finally {
      await owner.end();
    }
    const [row] = await h.database.db.select().from(reviews).where(eq(reviews.orderId, order.id));
    expect(row).toMatchObject({ rating: 2, comment: 'Tardó' });
  });

  it('el panel lista las reseñas solo para el administrador', async () => {
    // Sin sesión de administrador el panel ni siquiera existe (404).
    const anonymous = await inject({ method: 'GET', url: '/api/admin/reviews' });
    expect([401, 403, 404]).toContain(anonymous.statusCode);
    const res = await inject({
      method: 'GET',
      url: '/api/admin/reviews?status=PENDING',
      cookies: admin,
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json<{ reviews: { status: string; purchase: string }[] }>().reviews;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === 'PENDING' && row.purchase)).toBe(true);
  });
});
