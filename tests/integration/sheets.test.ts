import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, fulfillments, notifications, orders } from '../../src/server/db/schema.js';
import {
  SheetsError,
  type OrderSheetLog,
  type SheetCommand,
  type SheetTab,
} from '../../src/server/integrations/sheets/google-sheets.js';
import { expireOrders } from '../../src/server/services/jobs.js';
import {
  catchUpSheet,
  deliverNotifications,
  enqueueSheetSync,
  PENDING_PAYMENT_COLUMNS,
} from '../../src/server/services/notifications.js';
import {
  applySheetCommand,
  processSheetCommands,
} from '../../src/server/services/sheet-commands.js';
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
  /** Pestaña «Pagos pendientes» (pedidos Nequi): una fila por referencia (columna A). */
  pending: (string | number)[][] = [];
  /** Estado (columna B) de cada escritura en «Pagos pendientes», en orden. */
  pendingStatuses: string[] = [];
  /** Pestaña «Usuarios»: una fila por cliente (código en la columna A). */
  users: (string | number)[][] = [];
  failing = false;
  /** Google responde 429: se pasó la cuota de escrituras por minuto. */
  rateLimited = false;
  /** Llamadas que llegaron a «Google» (escrituras y reescrituras). */
  calls = 0;
  /** Si existe, cada escritura en «Entregas» espera a que se abra (simula a Google lento). */
  gate: Promise<void> | undefined;
  /** Se llama cuando una escritura en «Entregas» llegó a la hoja (antes de esperar `gate`). */
  onUpsert: (() => void) | undefined;
  /** Órdenes del dueño en «Entregas» (columna T) y las respuestas de la tienda (columna V). */
  commands: SheetCommand[] = [];
  responses: { reference: string; response: string }[] = [];
  async readCommands(): Promise<SheetCommand[]> {
    return [...this.commands];
  }
  async finishCommand(command: SheetCommand, response: string): Promise<void> {
    this.responses.push({ reference: command.reference, response });
    this.commands = this.commands.filter((c) => c !== command);
  }
  async appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    this.calls += 1;
    if (this.rateLimited) throw new SheetsError('Google Sheets no aceptó la fila', 429);
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    this.tab(tab).push([...values]);
  }
  async upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    this.calls += 1;
    if (this.rateLimited) throw new SheetsError('Google Sheets no aceptó la fila', 429);
    if (this.failing) throw new Error('Google Sheets no disponible (simulado)');
    this.onUpsert?.();
    await this.gate;
    const target = this.tab(tab);
    const index = target.findIndex((row) => row[0] === values[0]);
    if (index < 0) target.push([...values]);
    else target[index] = [...values];
    if (tab === 'deliveries') this.statuses.push(String(values[1]));
    if (tab === 'pending') this.pendingStatuses.push(String(values[1]));
  }
  private tab(tab: SheetTab) {
    return {
      orders: this.rows,
      deliveries: this.deliveries,
      pending: this.pending,
      users: this.users,
    }[tab];
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
  sheet.rateLimited = false;
  sheet.calls = 0;
  sheet.rows = [];
  sheet.deliveries = [];
  sheet.statuses = [];
  sheet.gate = undefined;
  sheet.onUpsert = undefined;
  sheet.commands = [];
  sheet.responses = [];
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

  it('con la cuota de Google agotada (429) la fila espera sin gastar intentos y nunca se pierde', async () => {
    sheet.rateLimited = true;
    const paid = await paidOrder();
    // La primera fila de la hoja recibió el 429; la otra de la misma pasada ni siquiera llamó.
    expect(sheet.calls).toBe(1);
    const waiting = await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery');
    const event = await sheetNotification(paid.id);
    for (const row of [waiting, event]) {
      expect(row).toMatchObject({ status: 'PENDING', attempts: 0 });
      const wait = (row?.nextAttemptAt.getTime() ?? 0) - h.clock.now.getTime();
      expect(wait).toBeGreaterThanOrEqual(60_000);
      expect(wait).toBeLessThanOrEqual(180_000);
    }
    // Horas de cuota agotada: nunca llega a «aviso fallido».
    for (let i = 0; i < 10; i += 1) {
      h.clock.now = new Date(h.clock.now.getTime() + 4 * 60_000);
      await deliverNotifications(h.deps, { orderId: paid.id });
    }
    expect(await sheetNotification(paid.id)).toMatchObject({ status: 'PENDING', attempts: 0 });
    // Se renueva la cuota: las filas salen una vez y en orden.
    sheet.rateLimited = false;
    h.clock.now = new Date(h.clock.now.getTime() + 4 * 60_000);
    await deliverNotifications(h.deps, { orderId: paid.id });
    expect(sheet.rows.map((row) => row[2])).toEqual(['Pago confirmado']);
    expect(sheet.deliveries).toHaveLength(1);
    expect((await sheetNotification(paid.id))?.status).toBe('SENT');
  });

  it('una pasada larga de la hoja se corta a tiempo: lo que falta sale después, sin gastar intentos', async () => {
    sheet.failing = true;
    const paid = await paidOrder();
    sheet.failing = false;
    sheet.calls = 0;
    h.clock.now = new Date(Date.now() + 2 * 60_000);
    // Tras la primera escritura, «pasan» 41 s: la segunda fila de la hoja ya no cabe en la pasada.
    const realNow = Date.now.bind(Date);
    const clock = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => realNow() + (sheet.calls > 0 ? 41_000 : 0));
    try {
      await deliverNotifications(h.deps, { orderId: paid.id });
    } finally {
      clock.mockRestore();
    }
    expect(sheet.calls).toBe(1);
    const rows = [
      await sheetNotification(paid.id),
      await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery'),
    ];
    const waiting = rows.filter((row) => row?.status === 'PENDING');
    expect(waiting).toHaveLength(1);
    // Conserva el intento fallido anterior (1) y queda lista para la pasada siguiente.
    expect(waiting[0]).toMatchObject({ attempts: 1 });
    expect(waiting[0]?.nextAttemptAt.getTime()).toBeLessThanOrEqual(h.clock.now.getTime());
    await deliverNotifications(h.deps, { orderId: paid.id });
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.deliveries).toHaveLength(1);
  });

  it('una hoja lenta no frena la petición: responde y la fila llega después', async () => {
    const config = h.deps.config as { notifyInlineWaitMs: number };
    const previous = config.notifyInlineWaitMs;
    config.notifyInlineWaitMs = 50;
    let open: () => void = () => undefined;
    sheet.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    try {
      const started = Date.now();
      const paid = await paidOrder();
      // El pago quedó confirmado sin esperar a Google (que sigue «colgado»).
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(sheet.deliveries).toHaveLength(0);
      const view = await inject({
        method: 'GET',
        url: `/api/orders/${paid.reference}`,
        cookies: paid.cookies,
      });
      expect(view.json<{ order: { status: string } }>().order.status).toBe('PAID');
      open();
      await h.settle();
      expect(sheet.deliveries).toHaveLength(1);
      expect(
        (await sheetNotification(paid.id, 'order_sheet_sync', 'sheets_delivery'))?.status,
      ).toBe('SENT');
    } finally {
      open();
      config.notifyInlineWaitMs = previous;
    }
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
    // Reclamar no cambia nada visible en la fila: no se escribe (ahorra cuota de Google).
    expect(sheet.statuses).toEqual(['⏳ Por entregar']);
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
    expect(sheet.statuses).toEqual(['⏳ Por entregar', '🔄 En proceso', '✅ Entregado con éxito']);
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

/**
 * «Pagos pendientes» (pedido del dueño, 2026-10-20): una fila por pedido Nequi con lo que el
 * cliente le debe y lo que avisó al transferir, para buscarlo en su app Nequi. Datos ficticios.
 */
describe('cambios de estado desde la hoja («Entregas», columna «Cambiar estado (tú)»)', () => {
  const orderState = async (id: string) => {
    const [order] = await h.database.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, id));
    const [delivery] = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, id));
    return { order: order?.status, delivery };
  };
  const ask = async (reference: string, command: string, note = '') => {
    sheet.commands = [{ reference, command, note }];
    sheet.responses = [];
    expect(await processSheetCommands(h.deps)).toBe(1);
    expect(sheet.commands).toEqual([]);
    return sheet.responses[0]?.response ?? '';
  };

  it('«✅ Entregado» entrega el pedido como el panel: estado, historial, fila y vista del cliente', async () => {
    const paid = await paidOrder();
    const response = await ask(paid.reference, '✅ Entregado', 'Pedido LootBar 98765 (prueba)');
    expect(response).toMatch(/^✔️ Aplicado: Entregado · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    const { order, delivery } = await orderState(paid.id);
    expect(order).toBe('DELIVERED');
    expect(delivery).toMatchObject({
      status: 'DELIVERED',
      evidence: 'Pedido LootBar 98765 (prueba)',
    });
    expect(delivery?.deliveredAt).toBeInstanceOf(Date);

    // El historial dice quién (la cuenta del dueño) y por dónde (la hoja).
    const events = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, delivery?.id ?? ''));
    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining(['fulfillment.claim', 'fulfillment.start', 'fulfillment.deliver']),
    );
    for (const event of events.filter((e) => e.action.startsWith('fulfillment.'))) {
      expect(event.actorType).toBe('admin');
      expect(event.data).toMatchObject({ via: 'google_sheet' });
    }

    // La fila de «Entregas» y el pedido del cliente muestran la entrega enseguida.
    expect(sheet.deliveries.find((row) => row[0] === paid.reference)?.[1]).toBe(
      '✅ Entregado con éxito',
    );
    const view = await inject({
      method: 'GET',
      url: `/api/orders/${paid.reference}`,
      cookies: paid.cookies,
    });
    expect(view.json<{ order: { status: string } }>().order.status).toBe('DELIVERED');

    // Repetir la orden no hace nada más.
    expect(await ask(paid.reference, 'Entregado')).toMatch(/^✔️ Ya estaba: Entregado/);
    expect((await orderState(paid.id)).order).toBe('DELIVERED');
  });

  it('«🔄 En proceso» deja la entrega en curso y luego «Entregado» la termina', async () => {
    const paid = await paidOrder();
    expect(await ask(paid.reference, '🔄 En proceso')).toMatch(/^✔️ Aplicado: En proceso/);
    expect(await orderState(paid.id)).toMatchObject({
      order: 'DELIVERING',
      delivery: { status: 'DELIVERING' },
    });
    expect(sheet.deliveries.find((row) => row[0] === paid.reference)?.[1]).toBe('🔄 En proceso');
    expect(await ask(paid.reference, '✅ Entregado')).toMatch(/^✔️ Aplicado: Entregado/);
    expect(await orderState(paid.id)).toMatchObject({
      order: 'DELIVERED',
      delivery: { evidence: 'Entregado (marcado por el dueño en la hoja de Google)' },
    });
  });

  it('«⚠️ No se pudo entregar» deja el pedido en revisión con el motivo', async () => {
    const paid = await paidOrder();
    expect(await ask(paid.reference, '⚠️ No se pudo entregar', 'ID bloqueado (prueba)')).toMatch(
      /^✔️ Aplicado: No se pudo entregar/,
    );
    expect(await orderState(paid.id)).toMatchObject({
      order: 'NEEDS_REVIEW',
      delivery: { status: 'FAILED', failureReason: 'ID bloqueado (prueba)' },
    });
    expect(sheet.deliveries.find((row) => row[0] === paid.reference)?.[1]).toBe(
      '⚠️ Requiere revisión',
    );
    // Desde la hoja no se salta la revisión: eso se resuelve en el panel.
    expect(await ask(paid.reference, '✅ Entregado')).toMatch(/^✖️ No se aplicó: está en revisión/);
    expect((await orderState(paid.id)).order).toBe('NEEDS_REVIEW');
  });

  it('un pedido sin pago confirmado nunca se entrega desde la hoja', async () => {
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
        customerEmail: `sin-pago-${uid}@example.com`,
        acceptTerms: true,
        termsVersion: '2026-10-05',
        items: [{ sku: 'ff-110', quantity: 1 }],
      },
    });
    expect(created.statusCode).toBe(201);
    const { order } = created.json<{ order: { reference: string; status: string } }>();
    expect(await ask(order.reference, '✅ Entregado')).toMatch(
      /^✖️ No se aplicó: el pedido todavía no tiene un pago confirmado/,
    );
    const [row] = await h.database.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    expect(row?.status).toBe(order.status);
  });

  it('opciones desconocidas, referencias que no existen o sin cuenta de dueño: responde y no toca nada', async () => {
    const paid = await paidOrder();
    expect(await ask(paid.reference, 'Pago confirmado')).toMatch(/^✖️ No entendí la opción/);
    expect(await ask('TGS-NOEXISTE00', '✅ Entregado')).toMatch(/no hay un pedido/);
    expect(
      await applySheetCommand(
        h.deps,
        { reference: paid.reference, command: '✅ Entregado', note: '' },
        undefined,
      ),
    ).toMatch(/entra una vez al panel con tu cuenta de dueño/);
    expect((await orderState(paid.id)).order).toBe('PAID');
  });

  it('con la columna vacía no hace nada (ni toca la base de datos)', async () => {
    expect(await processSheetCommands(h.deps)).toBe(0);
    expect(sheet.responses).toEqual([]);
  });
});

describe('pestaña «Pagos pendientes» (Nequi)', () => {
  const NEQUI_ENV = {
    PLAYER_VERIFICATION: 'customer',
    NEQUI_MANUAL_ENABLED: 'true',
    NEQUI_MANUAL_BREB_KEY: '@tiendaprueba',
    NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
  };
  let hn: Harness;
  const call = (options: InjectOptions) => hn.app.inject({ remoteAddress: randomIp(), ...options });

  beforeAll(async () => {
    hn = await createHarness(NEQUI_ENV, { sheets: sheet });
  });
  afterAll(async () => {
    await hn?.close();
  });
  beforeEach(() => {
    sheet.failing = false;
    sheet.rateLimited = false;
  });

  /** Pedido listo para pagar (el cliente confirmó su ID escribiéndolo dos veces). */
  async function readyOrder() {
    uid += 1;
    const created = await call({
      method: 'POST',
      url: '/api/checkout',
      headers: CSRF,
      payload: {
        checkoutKey: randomUUID(),
        game: 'freefire',
        playerUid: String(uid),
        confirmedPlayerUid: String(uid),
        playerServer: 'latam',
        customerName: 'Nombre Privado',
        customerEmail: `pendiente-${uid}@example.com`,
        acceptTerms: true,
        termsVersion: '2026-10-05',
        items: [{ sku: 'ff-110', quantity: 1 }],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { order } = created.json<{ order: { reference: string; totalCop: number } }>();
    const [row] = await hn.database.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    return {
      id: row?.id ?? '',
      ref: order.reference,
      total: order.totalCop,
      uid: String(uid),
      email: `pendiente-${uid}@example.com`,
      cookies: guestCookie(created),
    };
  }
  type Ready = Awaited<ReturnType<typeof readyOrder>>;
  const customer = (o: Ready, path: string, payload: object = {}) =>
    call({
      method: 'POST',
      url: `/api/orders/${o.ref}${path}`,
      headers: CSRF,
      cookies: o.cookies,
      payload,
    });
  const owner = (o: Ready, path: string, payload: object) =>
    call({
      method: 'POST',
      url: `/api/admin/orders/${o.id}/${path}`,
      headers: CSRF,
      cookies: admin,
      payload,
    });
  const pendingRow = (ref: string) => {
    const rows = sheet.pending.filter((row) => row[0] === ref);
    expect(rows.length, 'una sola fila por pedido').toBeLessThanOrEqual(1);
    return rows[0];
  };
  const column = (name: (typeof PENDING_PAYMENT_COLUMNS)[number]) =>
    PENDING_PAYMENT_COLUMNS.indexOf(name);

  it('cada paso del pago Nequi actualiza la misma fila: elegir, avisar, rechazar y confirmar', async () => {
    const o = await readyOrder();
    // Antes de elegir cómo pagar, el cliente no le debe nada al dueño por Nequi.
    expect(pendingRow(o.ref)).toBeUndefined();

    expect((await customer(o, '/nequi')).statusCode).toBe(200);
    let row = pendingRow(o.ref);
    expect(row).toHaveLength(PENDING_PAYMENT_COLUMNS.length);
    expect(row?.[column('Estado del pago')]).toBe('⏳ Esperando la transferencia');
    expect(row?.[column('Total a recibir')]).toBe(o.total);
    expect(row?.[column('Paquete')]).toMatch(/^1× /);
    expect(row?.[column('Vence (Colombia)')]).not.toBe('');
    expect(row?.[column('4 últimos dígitos de la cuenta que pagó')]).toBe('');

    const report = await customer(o, '/nequi/report', {
      senderLast4: '0421',
      reference: 'M00012345',
    });
    expect(report.statusCode, report.body).toBe(200);
    row = pendingRow(o.ref);
    expect(row?.[column('Estado del pago')]).toBe(
      '💰 El cliente avisó que pagó: verifícalo en tu Nequi',
    );
    expect(row?.[column('Cliente avisó el pago (Colombia)')]).not.toBe('');
    // Como texto: conserva el cero de la izquierda.
    expect(row?.[column('4 últimos dígitos de la cuenta que pagó')]).toBe('0421');
    expect(row?.[column('Referencia del comprobante (cliente)')]).toBe('M00012345');

    expect((await owner(o, 'nequi/reject', { reason: 'No llegó (prueba)' })).statusCode).toBe(200);
    row = pendingRow(o.ref);
    expect(row?.[column('Estado del pago')]).toBe(
      '✖️ Aviso rechazado: esperando otra transferencia',
    );
    expect(row?.[column('Motivo del rechazo')]).toBe('No llegó (prueba)');

    // El cliente vuelve a avisar (referencia que empieza por «-»: nunca se toma como fórmula).
    expect(
      (await customer(o, '/nequi/report', { senderLast4: '0421', reference: '-M0009999' }))
        .statusCode,
    ).toBe(200);
    row = pendingRow(o.ref);
    expect(row?.[column('Estado del pago')]).toMatch(/^💰/);
    expect(row?.[column('Referencia del comprobante (cliente)')]).toBe("'-M0009999");
    expect(row?.[column('Motivo del rechazo')]).toBe('');

    const confirmed = await owner(o, 'nequi/confirm', {
      nequiReference: 'NQ-PRUEBA-0001',
      amountCop: o.total,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    row = pendingRow(o.ref);
    expect(row?.[column('Estado del pago')]).toBe('✅ Pago confirmado');
    expect(row?.[column('Confirmado (Colombia)')]).not.toBe('');
    expect(row?.[column('Referencia Nequi confirmada')]).toBe('NQ-PRUEBA-0001');
    expect(row?.[column('Vence (Colombia)')]).toBe('');
    // Ya pagado: el pedido pasa a «Entregas» como cualquier otro.
    expect(sheet.deliveries.some((r) => r[0] === o.ref)).toBe(true);

    // A quién se recarga, como en «Entregas» (lo pidió el dueño): ID, cómo se confirmó y
    // servidor. Nunca el correo ni el nombre del cliente.
    expect(row?.[column('ID del jugador')]).toBe(o.uid);
    expect(row?.[column('Confirmación del jugador')]).toBe(
      'Confirmado por el cliente (escribió su ID dos veces)',
    );
    expect(row?.[column('Servidor elegido')]).not.toBe('');
    const text = JSON.stringify(row);
    expect(text).not.toContain(o.email);
    expect(text).not.toContain('Nombre Privado');
  });

  it('un pedido Nequi que vence sin pago queda «Venció sin pago»', async () => {
    const o = await readyOrder();
    expect((await customer(o, '/nequi')).statusCode).toBe(200);
    const before = hn.clock.now;
    hn.clock.now = new Date(before.getTime() + 3 * 3_600_000);
    try {
      expect(await expireOrders(hn.deps)).toBeGreaterThanOrEqual(1);
      await deliverNotifications(hn.deps, { orderId: o.id });
    } finally {
      hn.clock.now = before;
    }
    expect(pendingRow(o.ref)?.[column('Estado del pago')]).toBe('⌛ Venció sin pago');
    expect(pendingRow(o.ref)?.[column('Vence (Colombia)')]).toBe('');
  });

  it('los pedidos de Mercado Pago nunca aparecen en «Pagos pendientes»', async () => {
    const paid = await paidOrder();
    expect(sheet.deliveries.some((r) => r[0] === paid.reference)).toBe(true);
    expect(sheet.pending.some((r) => r[0] === paid.reference)).toBe(false);
  });

  it('si Google falla, el pago Nequi sigue y la fila se reintenta después', async () => {
    const o = await readyOrder();
    sheet.failing = true;
    expect((await customer(o, '/nequi')).statusCode).toBe(200);
    expect(pendingRow(o.ref)).toBeUndefined();
    const [queued] = await hn.database.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orderId, o.id), eq(notifications.channel, 'sheets_pending')));
    expect(queued?.status).toBe('PENDING');
    expect(queued?.attempts).toBe(1);
    sheet.failing = false;
    await hn.database.db
      .update(notifications)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(notifications.id, queued?.id ?? ''));
    await deliverNotifications(hn.deps, { orderId: o.id });
    expect(pendingRow(o.ref)?.[column('Estado del pago')]).toBe('⏳ Esperando la transferencia');
  });

  it('al conectar la hoja se pone al día: pedidos de cuando estaba apagada y filas fallidas', async () => {
    const nequi = await readyOrder();
    expect((await customer(nequi, '/nequi')).statusCode).toBe(200);
    const paid = await paidOrder();
    // Hoja apagada mientras pasaban estos pedidos: ninguna fila suya en la cola ni en la hoja.
    // La tienda no puede borrar de la cola (su rol no tiene DELETE): lo prepara el dueño.
    const owner = new pg.Client({ connectionString: testDatabaseUrl() });
    await owner.connect();
    try {
      await owner.query('delete from notifications where order_id = any($1::uuid[])', [
        [nequi.id, paid.id],
      ]);
    } finally {
      await owner.end();
    }
    sheet.deliveries = [];
    sheet.pending = [];
    sheet.rows = [];

    // Sin hoja configurada no hace nada.
    expect(await catchUpSheet({ ...hn.deps, sheets: undefined })).toBe(0);

    expect(await catchUpSheet(hn.deps)).toBeGreaterThanOrEqual(2);
    await deliverNotifications(hn.deps);
    await deliverNotifications(hn.deps);
    // «Entregas»: el pedido pagado, con su estado actual; «Pagos pendientes»: el pedido Nequi.
    const delivered = sheet.deliveries.filter((row) => row[0] === paid.reference);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.[1]).toBe('⏳ Por entregar');
    expect(pendingRow(nequi.ref)?.[column('Estado del pago')]).toBe(
      '⏳ Esperando la transferencia',
    );
    // El pedido de Mercado Pago no va a «Pagos pendientes» ni el Nequi sin pagar a «Entregas».
    expect(sheet.pending.some((row) => row[0] === paid.reference)).toBe(false);
    expect(sheet.deliveries.some((row) => row[0] === nequi.ref)).toBe(false);
    // «Pedidos» es un historial de eventos: no se inventan eventos pasados.
    expect(sheet.rows.some((row) => row[1] === paid.reference)).toBe(false);

    // Idempotente: lo que ya tiene su fila no se vuelve a encolar.
    expect(await catchUpSheet(hn.deps)).toBe(0);

    // Una fila que quedó fallida (p. ej. la llave no servía) se vuelve a intentar.
    await hn.database.db
      .update(notifications)
      .set({ status: 'FAILED', attempts: 5, lastError: 'Google rechazó la llave' })
      .where(and(eq(notifications.orderId, paid.id), eq(notifications.channel, 'sheets_delivery')));
    expect(await catchUpSheet(hn.deps)).toBe(1);
    const [retried] = await hn.database.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orderId, paid.id), eq(notifications.channel, 'sheets_delivery')));
    expect(retried).toMatchObject({ status: 'PENDING', attempts: 0, lastError: null });
  });
});
