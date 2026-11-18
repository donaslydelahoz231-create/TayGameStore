import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { notifications, orders } from '../../src/server/db/schema.js';
import { deliverNotifications } from '../../src/server/services/notifications.js';
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
 * El pedido le llega al WhatsApp del dueño sin que el cliente abra WhatsApp (pedido del dueño,
 * 2026-11-18): al informar el cliente su transferencia Nequi en la tienda, y al confirmar Mercado
 * Pago un pago. CallMeBot está simulado (nada sale a la red). Datos mínimos autorizados por el
 * dueño: nunca el nombre ni el correo del cliente. Todos los datos son ficticios.
 */

const NEQUI_ENV = {
  PLAYER_VERIFICATION: 'customer',
  NEQUI_MANUAL_ENABLED: 'true',
  NEQUI_MANUAL_PHONE: '300 123 4567',
  NEQUI_MANUAL_BREB_KEY: '@tiendaprueba',
  NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
};
const CUSTOMER_NAME = 'Cliente Ficticio Wa';

let h: Harness;
let plain: Harness;
let admin: Record<string, string>;
let seq = 0;
let uid = 820000000;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(NEQUI_ENV, { ownerWhatsApp: true });
  plain = await createHarness(NEQUI_ENV);
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-wa' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
  await plain?.close();
});

const inject = (harness: Harness, options: InjectOptions) =>
  harness.app.inject({
    remoteAddress: `10.78.${Math.floor(++seq / 200)}.${(seq % 200) + 1}`,
    ...options,
  });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

interface Order {
  id: string;
  ref: string;
  total: number;
  email: string;
  cookies: Record<string, string>;
}

async function order(harness = h): Promise<Order> {
  const playerUid = String((uid += 1));
  const email = `wa-${randomUUID().slice(0, 8)}@example.com`;
  const res = await inject(harness, {
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      playerServer: 'latam',
      customerName: CUSTOMER_NAME,
      customerEmail: email,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 2 }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json<{ order: { reference: string; totalCop: number } }>();
  const [row] = await harness.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, body.order.reference));
  return {
    id: row?.id ?? '',
    ref: body.order.reference,
    total: body.order.totalCop,
    email,
    cookies: guestCookie(res),
  };
}

const customer = (harness: Harness, o: Order, path: string, payload?: object) =>
  inject(harness, {
    method: 'POST',
    url: `/api/orders/${o.ref}${path}`,
    headers: CSRF,
    cookies: o.cookies,
    ...(payload ? { payload } : {}),
  });

const whatsappRows = (harness: Harness, o: Order) =>
  harness.database.db
    .select({
      kind: notifications.kind,
      status: notifications.status,
      attempts: notifications.attempts,
      lastError: notifications.lastError,
    })
    .from(notifications)
    .where(and(eq(notifications.orderId, o.id), eq(notifications.channel, 'whatsapp')));

async function report(harness: Harness, o: Order, payload: object) {
  expect((await customer(harness, o, '/nequi')).statusCode).toBe(200);
  const res = await customer(harness, o, '/nequi/report', payload);
  expect(res.statusCode, res.body).toBe(200);
  await harness.settle();
}

describe('pedido Nequi informado en la tienda → WhatsApp del dueño', () => {
  it('solo cuando el cliente paga: crear el pedido y elegir Nequi no le escribe al dueño', async () => {
    const before = h.ownerWhatsApp.sent.length;
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    await h.settle();
    expect(h.ownerWhatsApp.sent.length).toBe(before);
    expect(await whatsappRows(h, o)).toEqual([]);
    // Pagó y lo confirmó en la tienda: ahí sí, una vez y con el título «Pedido pagado».
    const res = await customer(h, o, '/nequi/report', { senderLast4: '5555' });
    expect(res.statusCode).toBe(200);
    await h.settle();
    expect(h.ownerWhatsApp.sent.length).toBe(before + 1);
    expect(h.ownerWhatsApp.sent.at(-1)?.startsWith('Pedido pagado en TayGameStore')).toBe(true);
  });

  it('le llega solo, con datos mínimos y en texto plano; corregir el aviso no lo repite', async () => {
    const before = h.ownerWhatsApp.sent.length;
    const o = await order();
    await report(h, o, { senderLast4: '4321', reference: 'M1234ABCD' });
    const sent = h.ownerWhatsApp.sent.slice(before);
    expect(sent).toHaveLength(1);
    const text = sent[0] ?? '';
    for (const part of [
      'Pedido pagado en TayGameStore',
      `Pedido: ${o.ref}`,
      'Recargas:',
      'x2',
      'Pago: Nequi, desde la cuenta terminada en 4321.',
      'Comprobante: M1234ABCD.',
      'Revisa tu app Nequi y marca «✓ Pago verificado» en la hoja, pestaña «Pagos pendientes».',
    ]) {
      expect(text).toContain(part);
    }
    // Datos mínimos: ni el nombre ni el correo del cliente; sin asteriscos ni otras marcas.
    expect(text).not.toContain(CUSTOMER_NAME);
    expect(text).not.toContain(o.email);
    expect(text).not.toMatch(/[*_~`]/);
    expect(await whatsappRows(h, o)).toEqual([
      { kind: 'nequi_reported_owner', status: 'SENT', attempts: 1, lastError: null },
    ]);
    // El correo al dueño sigue como antes.
    expect(h.mailer.sent.some((m) => m.text.includes(o.ref))).toBe(true);

    // El cliente corrige su aviso: no se vuelve a escribir al dueño.
    const res = await customer(h, o, '/nequi/report', { senderLast4: '4329' });
    expect(res.statusCode).toBe(200);
    await h.settle();
    expect(h.ownerWhatsApp.sent.length).toBe(before + 1);
  });

  it('si CallMeBot falla, el pedido igual queda informado y el aviso se reintenta', async () => {
    const before = h.ownerWhatsApp.sent.length;
    const o = await order();
    h.ownerWhatsApp.failNext = 1;
    await report(h, o, { senderLast4: '1111' });
    const [pending] = await whatsappRows(h, o);
    expect(pending).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'CallMeBot no confirmó el aviso',
    });
    // La cola lo reenvía cuando vence la espera (1 minuto tras el primer fallo).
    const later = new Date(h.clock.now.getTime() + 2 * 60_000);
    h.clock.now = later;
    await deliverNotifications(h.deps, { orderId: o.id });
    expect((await whatsappRows(h, o))[0]?.status).toBe('SENT');
    expect(h.ownerWhatsApp.sent.length).toBe(before + 1);
    expect(h.ownerWhatsApp.sent.at(-1)).toContain(`Pedido: ${o.ref}`);
  });

  it('al confirmar el dueño la transferencia no se le escribe de nuevo (ya lo sabe)', async () => {
    const o = await order();
    await report(h, o, { senderLast4: '2222' });
    const before = h.ownerWhatsApp.sent.length;
    const confirmed = await inject(h, {
      method: 'POST',
      url: `/api/admin/orders/${o.id}/nequi/confirm`,
      headers: CSRF,
      cookies: admin,
      payload: { nequiReference: `M${randomUUID().slice(0, 8)}`, amountCop: o.total },
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    await h.settle();
    expect(h.ownerWhatsApp.sent.length).toBe(before);
  });
});

describe('un solo mensaje: Mercado Pago no le escribe por WhatsApp', () => {
  it('un pago de Mercado Pago no envía WhatsApp (el único aviso es «Pedido pagado» de Nequi)', async () => {
    const before = h.ownerWhatsApp.sent.length;
    const o = await order();
    expect((await customer(h, o, '/pay', { payMeans: 'tarjeta' })).statusCode).toBe(200);
    const paymentId = String(Math.floor(Math.random() * 1e12));
    h.gateway.setPayment({ id: paymentId, externalReference: o.ref, amount: o.total });
    const hook = await inject(h, {
      method: 'POST',
      url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
      headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
      payload: { type: 'payment', data: { id: paymentId } },
    });
    expect(hook.statusCode).toBe(200);
    await h.settle();
    expect(h.ownerWhatsApp.sent.length).toBe(before);
    expect(await whatsappRows(h, o)).toEqual([]);
  });
});

describe('sin CallMeBot configurado', () => {
  it('no se encola ningún aviso por WhatsApp y el aviso Nequi sigue funcionando', async () => {
    const o = await order(plain);
    await report(plain, o, { senderLast4: '3333' });
    expect(await whatsappRows(plain, o)).toEqual([]);
    expect(plain.ownerWhatsApp.sent).toEqual([]);
  });
});
