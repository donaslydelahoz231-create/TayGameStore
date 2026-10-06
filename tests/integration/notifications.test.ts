import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
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
 * Avisos por correo (cliente y dueño) y Telegram (dueño), con cola en la base de datos:
 * se crean en la misma transacción que el cambio de estado, se envían enseguida, se reintentan
 * si el servidor de correo falla y nunca se duplican.
 */
let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ SUPPORT_EMAIL: 'soporte@example.com' });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-n' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});
beforeEach(() => {
  h.clock.now = new Date();
  h.mailer.failNext = 0;
  h.notifier.failNext = false;
});

const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });
let uid = 300000000;

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

/** Pedido verificado y confirmado, listo para pagar. */
async function readyOrder(customerName = 'Cliente Avisos') {
  const email = `avisos-${randomUUID().slice(0, 8)}@example.com`;
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String((uid += 1)),
      customerName,
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
  const verified = await inject({
    method: 'POST',
    url: `/api/admin/orders/${id}/verification`,
    headers: CSRF,
    cookies: admin,
    payload: { result: 'VERIFIED', nickname: 'NickAvisos', region: 'Colombia' },
  });
  expect(verified.statusCode).toBe(200);
  const confirmed = await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/confirm-player`,
    headers: CSRF,
    cookies,
    payload: { confirm: true, nickname: 'NickAvisos' },
  });
  expect(confirmed.statusCode).toBe(200);
  const pay = await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/pay`,
    headers: CSRF,
    cookies,
  });
  expect(pay.statusCode).toBe(200);
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

const mailsTo = (email: string) => h.mailer.sent.filter((m) => m.to.includes(email));
const rowsOf = (orderId: string) =>
  h.database.db.select().from(notifications).where(eq(notifications.orderId, orderId));

describe('aviso de pago confirmado', () => {
  it('la tienda solo promete correos al cliente cuando el servidor de correo está configurado', async () => {
    const config = await inject({ method: 'GET', url: '/api/config' });
    expect(config.json<{ emailUpdates: boolean }>().emailUpdates).toBe(true);
  });

  it('pedido sin pagar: ningún correo (nadie puede usar la tienda para escribir a terceros)', async () => {
    const order = await readyOrder();
    expect(mailsTo(order.email)).toEqual([]);
    expect(await rowsOf(order.id)).toEqual([]);
  });

  it('pago confirmado → correo al cliente, correo y Telegram al dueño, una sola vez', async () => {
    const order = await readyOrder();
    const ownerBefore = h.mailer.sent.filter((m) => m.to.includes(ADMIN_EMAIL)).length;
    const telegramBefore = h.notifier.sent.length;
    const paymentId = await payOrder(order);

    const [customer] = mailsTo(order.email);
    expect(customer?.subject).toBe(`Pago confirmado · Pedido ${order.reference}`);
    expect(customer?.text).toContain('Mercado Pago confirmó tu pago');
    expect(customer?.text).toContain('2 × ');
    expect(customer?.text).toContain('NickAvisos');
    expect(customer?.text).toContain('nunca te pedirá la contraseña');
    expect(customer?.replyTo).toBe('soporte@example.com');
    const owner = h.mailer.sent.filter((m) => m.to.includes(ADMIN_EMAIL));
    expect(owner.length).toBe(ownerBefore + 1);
    expect(owner.at(-1)?.subject).toBe(`Pedido pagado por entregar · ${order.reference}`);
    // El correo del dueño va a todo ADMIN_EMAILS y nunca al cliente.
    expect(owner.at(-1)?.to).toEqual([ADMIN_EMAIL, 'admin2@example.com']);
    expect(h.notifier.sent.length).toBe(telegramBefore + 1);

    // Reintentos de Mercado Pago y la tarea de reintento no duplican nada.
    await Promise.all([webhook(paymentId), webhook(paymentId)]);
    await runJob(h.deps, 'sendNotifications');
    expect(mailsTo(order.email)).toHaveLength(1);
    const rows = await rowsOf(order.id);
    expect(rows.map((r) => `${r.kind}/${r.channel}/${r.status}`).sort()).toEqual([
      'order_paid_customer/email/SENT',
      'order_paid_owner/email/SENT',
      'order_paid_owner/telegram/SENT',
    ]);
  });

  it('pago rechazado: ningún aviso', async () => {
    const order = await readyOrder();
    await payOrder(order, 'rejected');
    expect(mailsTo(order.email)).toEqual([]);
    expect(await rowsOf(order.id)).toEqual([]);
  });

  it('el nombre del cliente se escapa en el HTML del correo', async () => {
    const order = await readyOrder('<img src=x onerror=alert(1)>');
    await payOrder(order);
    const [mail] = mailsTo(order.email);
    expect(mail?.html).not.toContain('<img src=x');
    expect(mail?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('fallos del servidor de correo', () => {
  it('SMTP caído: el pago queda guardado y el correo se reintenta hasta enviarse', async () => {
    const order = await readyOrder();
    h.mailer.failNext = 2; // cliente y dueño fallan en el primer intento
    await payOrder(order);
    const [saved] = await h.database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(saved?.status).toBe('PAID');
    expect(mailsTo(order.email)).toEqual([]);
    const pending = (await rowsOf(order.id)).filter((r) => r.channel === 'email');
    expect(pending.every((r) => r.status === 'PENDING' && r.attempts === 1)).toBe(true);
    expect(pending[0]?.lastError).toContain('SMTP');

    // Antes de la espera no se reintenta; después, sí.
    await runJob(h.deps, 'sendNotifications');
    expect(mailsTo(order.email)).toEqual([]);
    h.clock.now = new Date(Date.now() + 2 * 60_000);
    await runJob(h.deps, 'sendNotifications');
    expect(mailsTo(order.email)).toHaveLength(1);
    const sent = await h.database.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.orderId, order.id), eq(notifications.kind, 'order_paid_customer')),
      );
    expect(sent[0]).toMatchObject({ status: 'SENT', attempts: 2, lastError: null });
  });

  it('tras 5 intentos fallidos queda FAILED y el panel lo muestra como alerta', async () => {
    const order = await readyOrder();
    h.mailer.failNext = 2;
    await payOrder(order);
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      h.mailer.failNext = 2;
      h.clock.now = new Date(h.clock.now.getTime() + 61 * 60_000);
      await runJob(h.deps, 'sendNotifications');
    }
    const email = (await rowsOf(order.id)).filter((r) => r.channel === 'email');
    expect(email.map((r) => [r.status, r.attempts])).toEqual([
      ['FAILED', 5],
      ['FAILED', 5],
    ]);
    const alerts = await inject({ method: 'GET', url: '/api/admin/alerts', cookies: admin });
    expect(
      alerts.json<{ notificationsFailed: number }>().notificationsFailed,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('entrega y reembolso', () => {
  it('al marcar el pedido como entregado, el cliente recibe "Recarga completada"', async () => {
    const order = await readyOrder();
    await payOrder(order);
    for (const body of [
      { action: 'claim' },
      { action: 'start' },
      { action: 'deliver', evidence: 'Recarga hecha en el canal del dueño' },
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
    const mails = mailsTo(order.email);
    expect(mails.map((m) => m.subject)).toEqual([
      `Pago confirmado · Pedido ${order.reference}`,
      `Recarga completada · Pedido ${order.reference}`,
    ]);
    expect(mails[1]?.text).toContain('NickAvisos');
  });

  it('reembolso confirmado por Mercado Pago → "Reembolso registrado"', async () => {
    const order = await readyOrder();
    const paymentId = await payOrder(order);
    h.gateway.setPayment({
      id: paymentId,
      externalReference: order.reference,
      amount: order.totalCop,
      status: 'refunded',
    });
    await webhook(paymentId);
    expect(mailsTo(order.email).map((m) => m.subject)).toEqual([
      `Pago confirmado · Pedido ${order.reference}`,
      `Reembolso registrado · Pedido ${order.reference}`,
    ]);
  });
});
