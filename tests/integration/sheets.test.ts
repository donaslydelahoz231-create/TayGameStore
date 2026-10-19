import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifications, orders } from '../../src/server/db/schema.js';
import type {
  OrderSheetLog,
  SheetTab,
} from '../../src/server/integrations/sheets/google-sheets.js';
import { deliverNotifications, enqueueSheetSync } from '../../src/server/services/notifications.js';
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
  /** Pestaña «Entregas» (con los datos del jugador): una fila por referencia (columna A). */
  deliveries: (string | number)[][] = [];
  /** Estado (columna B) de cada escritura en «Entregas», en orden. */
  statuses: string[] = [];
  failing = false;
  /** Si existe, cada escritura en «Entregas» espera a que se abra (simula a Google lento). */
  gate: Promise<void> | undefined;
  /** Se llama cuando una escritura en «Entregas» llegó a la hoja (antes de esperar `gate`). */
  onUpsert: (() => void) | undefined;
  async appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    (tab === 'orders' ? this.rows : this.deliveries).push([...values]);
  }
  async upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    this.onUpsert?.();
    await this.gate;
    const target = tab === 'orders' ? this.rows : this.deliveries;
    const index = target.findIndex((row) => row[0] === values[0]);
    if (index < 0) target.push([...values]);
    else target[index] = [...values];
    if (tab === 'deliveries') this.statuses.push(String(values[1]));
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
  sheet.statuses = [];
  sheet.gate = undefined;
  sheet.onUpsert = undefined;
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
  return { id, reference: order.reference, email, uid: String(uid), cookies, paymentId };
}

async function fulfillment(orderId: string, payload: Record<string, string>) {
  const res = await inject({
    method: 'POST',
    url: `/api/admin/orders/${orderId}/fulfillment`,
    headers: CSRF,
    cookies: admin,
    payload,
  });
  expect(res.statusCode).toBe(200);
}

async function sheetNotification(
  orderId: string,
  kind: 'order_paid_event' | 'order_sheet_sync' = 'order_paid_event',
  channel: 'sheets' | 'sheets_delivery' = 'sheets',
) {
  const [row] = await h.database.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orderId, orderId),
        eq(notifications.channel, channel),
        eq(notifications.kind, kind),
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
    expect((await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery'))?.status).toBe(
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

  it('«Pedidos» suma una fila por evento; «Entregas» actualiza la misma fila del pedido', async () => {
    const paid = await paidOrder();
    expect(sheet.statuses).toEqual(['⏳ Por entregar']);
    await fulfillment(paid.id, { action: 'claim' });
    await fulfillment(paid.id, { action: 'start' });
    expect(sheet.deliveries[0]?.[1]).toBe('🔄 En proceso');
    await fulfillment(paid.id, {
      action: 'deliver',
      evidence: 'Recarga hecha en el canal oficial (prueba)',
    });
    expect(sheet.rows.map((row) => row[2])).toEqual(['Pago confirmado', 'Recarga entregada']);
    expect(sheet.rows[1]?.[7]).toBe('Completado');
    // Una sola fila por pedido, con el estado al día en cada paso.
    expect(sheet.deliveries).toHaveLength(1);
    expect(sheet.statuses).toEqual([
      '⏳ Por entregar',
      '⏳ Por entregar',
      '🔄 En proceso',
      '✅ Entregado con éxito',
    ]);
    const [row] = sheet.deliveries;
    expect(row?.[0]).toBe(paid.reference);
    expect(row?.[2]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/); // pagado
    expect(row?.[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/); // entregado
    expect(typeof row?.[4]).toBe('number'); // minutos hasta la entrega
    expect(row?.slice(12, 14)).toEqual(['Confirmado', 'Completado']);
    expect(row?.[14]).toMatch(/^\d{6}$/); // comprobante N.º
    expect(String(row?.[15])).not.toBe(''); // código de verificación
    expect(row?.[16]).toBe(`Mercado Pago · ${paid.paymentId}`); // medio y operación de pago
    expect(row?.[17]).toBe('Recarga hecha en el canal oficial (prueba)');
    expect(await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery')).toMatchObject({
      status: 'SENT',
      attempts: 1,
    });
  });

  it('una entrega fallida queda «Requiere revisión» con el motivo', async () => {
    const paid = await paidOrder();
    await fulfillment(paid.id, { action: 'claim' });
    await fulfillment(paid.id, { action: 'start' });
    await fulfillment(paid.id, { action: 'fail', reason: 'El juego no acepta el ID (prueba)' });
    expect(sheet.deliveries).toHaveLength(1);
    const [row] = sheet.deliveries;
    expect(row?.[1]).toBe('⚠️ Requiere revisión');
    expect(row?.[3]).toBe('');
    expect(row?.[13]).toBe('Requiere revisión');
    expect(row?.[17]).toBe('El juego no acepta el ID (prueba)');
  });

  it('un cambio de estado mientras se escribe la fila nunca deja el estado viejo', async () => {
    const paid = await paidOrder();
    let open = () => {};
    sheet.gate = new Promise<void>((resolve) => (open = resolve));
    const entered = new Promise<void>((resolve) => (sheet.onUpsert = resolve));
    await h.database.db.transaction((tx) => enqueueSheetSync(h.deps, tx, paid.id));
    // Este envío lleva «Por entregar» y se queda esperando a Google…
    const slow = deliverNotifications(h.deps, { orderId: paid.id });
    await entered;
    sheet.onUpsert = undefined;
    // …mientras el dueño toma y empieza la entrega: no se envía otra copia a la vez.
    await fulfillment(paid.id, { action: 'claim' });
    await fulfillment(paid.id, { action: 'start' });
    expect(await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery')).toMatchObject({
      status: 'PENDING',
      attempts: 0,
    });
    open();
    await slow;
    // El envío lento terminó con el estado viejo y la fila se reenvió enseguida con el nuevo.
    expect(sheet.statuses.slice(-2)).toEqual(['⏳ Por entregar', '🔄 En proceso']);
    expect(sheet.deliveries).toHaveLength(1);
    expect(sheet.deliveries[0]?.[1]).toBe('🔄 En proceso');
    expect(await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery')).toMatchObject({
      status: 'SENT',
      attempts: 1,
    });
  });

  it('«Entregas» lleva ID, nickname, confirmación, servidor y región, nunca correo ni nombre', async () => {
    const paid = await paidOrder();
    expect(sheet.deliveries).toHaveLength(1);
    const [row] = sheet.deliveries;
    expect(row?.[0]).toBe(paid.reference);
    expect(row?.[1]).toBe('⏳ Por entregar');
    expect(row?.slice(5, 10)).toEqual([
      paid.uid,
      'NickPrivado',
      'Verificado por el dueño y aceptado por el cliente',
      'Latinoamérica',
      'Colombia',
    ]);
    const text = JSON.stringify(row);
    for (const secret of [paid.email, 'Nombre Privado']) expect(text).not.toContain(secret);
    expect((await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery'))?.status).toBe(
      'SENT',
    );
  });

  it('un pedido sin pagar nunca aparece en «Entregas»', async () => {
    uid += 1;
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
        customerEmail: `hoja-${uid}@example.com`,
        acceptTerms: true,
        termsVersion: '2026-10-05',
        items: [{ sku: 'ff-110', quantity: 1 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const { order } = created.json<{ order: { reference: string } }>();
    const [row] = await h.database.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    await h.database.db.transaction((tx) => enqueueSheetSync(h.deps, tx, row?.id ?? ''));
    await deliverNotifications(h.deps, { orderId: row?.id ?? '' });
    expect(sheet.deliveries).toHaveLength(0);
  });
});
