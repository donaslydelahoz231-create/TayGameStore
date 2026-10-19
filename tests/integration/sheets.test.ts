import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifications, orders } from '../../src/server/db/schema.js';
import type {
  OrderSheetLog,
  SheetTab,
} from '../../src/server/integrations/sheets/google-sheets.js';
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

/** Hoja de Google simulada: guarda las filas de cada pestaña o falla a pedido (sin red). */
class RecordingSheet implements OrderSheetLog {
  /** Pestaña «Pedidos» (sin datos personales). */
  rows: (string | number)[][] = [];
  /** Pestaña «Entregas» (con los datos del jugador). */
  deliveries: (string | number)[][] = [];
  failing = false;
  async appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    (tab === 'orders' ? this.rows : this.deliveries).push([...values]);
  }
}

const sheet = new RecordingSheet();
let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({}, { sheets: sheet });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-1' }))
    .cookie;
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
  sheet.failing = false;
  sheet.rows = [];
  sheet.deliveries = [];
});

const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const inject = (options: InjectOptions) => h.app.inject({ remoteAddress: randomIp(), ...options });
let uid = 400000000;

const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

async function paidOrder() {
  uid += 1;
  const email = `hoja-${uid}@example.com`;
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String(uid),
      playerServer: 'latam',
      customerName: 'Nombre Privado',
      customerEmail: email,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(created.statusCode).toBe(201);
  const { order } = created.json<{ order: { reference: string; totalCop: number } }>();
  const cookies = guestCookie(created);
  const [row] = await h.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, order.reference));
  const id = row?.id ?? '';
  await inject({
    method: 'POST',
    url: `/api/admin/orders/${id}/verification`,
    headers: CSRF,
    cookies: admin,
    payload: { result: 'VERIFIED', nickname: 'NickPrivado', region: 'Colombia' },
  });
  await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/confirm-player`,
    headers: CSRF,
    cookies,
    payload: { confirm: true, nickname: 'NickPrivado' },
  });
  expect(
    (
      await inject({
        method: 'POST',
        url: `/api/orders/${order.reference}/pay`,
        headers: CSRF,
        cookies,
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
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
    payload: { type: 'payment', action: 'payment.updated', data: { id: paymentId } },
  });
  expect(hook.statusCode).toBe(200);
  return { id, reference: order.reference, email, uid: String(uid), cookies };
}

async function sheetNotification(
  orderId: string,
  kind = 'order_paid_event',
  channel: 'sheets' | 'sheets_delivery' = 'sheets',
) {
  const [row] = await h.database.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orderId, orderId),
        eq(notifications.channel, channel),
        eq(notifications.kind, kind as 'order_paid_event'),
      ),
    );
  return row;
}

describe('registro auxiliar en Google Sheets', () => {
  it('un pago confirmado agrega una fila sin datos personales', async () => {
    const paid = await paidOrder();
    expect(sheet.rows).toHaveLength(1);
    const [row] = sheet.rows;
    expect(row?.[1]).toBe(paid.reference);
    expect(row?.[2]).toBe('Pago confirmado');
    expect(row?.[6]).toBe('Confirmado');
    const text = JSON.stringify(row);
    for (const secret of [paid.email, paid.uid, 'Nombre Privado', 'NickPrivado']) {
      expect(text).not.toContain(secret);
    }
    expect((await sheetNotification(paid.id))?.status).toBe('SENT');
  });

  it('si Google falla, el pago y el pedido siguen bien y la fila se reintenta después', async () => {
    sheet.failing = true;
    const paid = await paidOrder();
    const view = await inject({
      method: 'GET',
      url: `/api/orders/${paid.reference}`,
      cookies: paid.cookies,
    });
    expect(view.json<{ order: { status: string } }>().order.status).toBe('PAID');
    const pending = await sheetNotification(paid.id);
    expect(pending).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(pending?.lastError).toBeTruthy();
    expect(sheet.rows).toHaveLength(0);
    expect(sheet.deliveries).toHaveLength(0);

    sheet.failing = false;
    h.clock.now = new Date(Date.now() + 2 * 60_000);
    await deliverNotifications(h.deps, { orderId: paid.id });
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.deliveries).toHaveLength(1);
    expect((await sheetNotification(paid.id))?.status).toBe('SENT');
    expect((await sheetNotification(paid.id, 'order_paid_event', 'sheets_delivery'))?.status).toBe(
      'SENT',
    );
    // Volver a pasar la cola no duplica las filas.
    await deliverNotifications(h.deps, { orderId: paid.id });
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.deliveries).toHaveLength(1);
  });

  it('tras varios fallos queda como aviso fallido y el panel lo muestra', async () => {
    sheet.failing = true;
    const paid = await paidOrder();
    for (let i = 0; i < 6; i += 1) {
      h.clock.now = new Date(h.clock.now.getTime() + 2 * 3_600_000);
      await deliverNotifications(h.deps, { orderId: paid.id });
    }
    expect((await sheetNotification(paid.id))?.status).toBe('FAILED');
    const alerts = await inject({ method: 'GET', url: '/api/admin/alerts', cookies: admin });
    expect(alerts.json<{ notificationsFailed: number }>().notificationsFailed).toBeGreaterThan(0);
  });

  it('la entrega con evidencia agrega su propia fila', async () => {
    const paid = await paidOrder();
    for (const body of [
      { action: 'claim' },
      { action: 'start' },
      { action: 'deliver', evidence: 'Recarga hecha en el canal oficial (prueba)' },
    ]) {
      const res = await inject({
        method: 'POST',
        url: `/api/admin/orders/${paid.id}/fulfillment`,
        headers: CSRF,
        cookies: admin,
        payload: body,
      });
      expect(res.statusCode).toBe(200);
    }
    expect(sheet.rows.map((row) => row[2])).toEqual(['Pago confirmado', 'Recarga entregada']);
    expect(sheet.rows[1]?.[7]).toBe('Completado');
    expect(sheet.deliveries.map((row) => row[2])).toEqual(['Pago confirmado', 'Recarga entregada']);
    expect(sheet.deliveries[1]?.[11]).toBe('Completado');
  });

  it('«Entregas» lleva ID, nickname, confirmación, servidor y región, nunca correo ni nombre', async () => {
    const paid = await paidOrder();
    expect(sheet.deliveries).toHaveLength(1);
    const [row] = sheet.deliveries;
    expect(row?.slice(1, 8)).toEqual([
      paid.reference,
      'Pago confirmado',
      paid.uid,
      'NickPrivado',
      'Verificado por el dueño y aceptado por el cliente',
      'Latinoamérica',
      'Colombia',
    ]);
    const text = JSON.stringify(row);
    for (const secret of [paid.email, 'Nombre Privado']) expect(text).not.toContain(secret);
    expect((await sheetNotification(paid.id, 'order_paid_event', 'sheets_delivery'))?.status).toBe(
      'SENT',
    );
  });
});
