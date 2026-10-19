import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, fulfillments, orders, topups } from '../../src/server/db/schema.js';
import type {
  OrderSheetLog,
  SheetTab,
} from '../../src/server/integrations/sheets/google-sheets.js';
import { runJob } from '../../src/server/services/jobs.js';
import { MAX_CHECKS, processTopups } from '../../src/server/services/topups.js';
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
 * Recarga directa al ID con UniPin (simulado): pago aprobado → recarga → entregado, sin PIN ni
 * operador. Y lo que nunca debe pasar: entregar sin confirmación, recargar dos veces, o dejar
 * un pago sin aviso cuando algo falla.
 */
let h: Harness;
let admin: Record<string, string>;

/** Hoja de Google simulada: solo guarda el estado (columna B) de cada fila de «Entregas». */
class StatusSheet implements OrderSheetLog {
  statuses = new Map<string, string[]>();
  async appendRow(): Promise<void> {}
  async upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    if (tab !== 'deliveries') return;
    const key = String(values[0]);
    this.statuses.set(key, [...(this.statuses.get(key) ?? []), String(values[1])]);
  }
}
const sheet = new StatusSheet();

const CATALOG = {
  latam: { game: 'FF_LATAM', skus: { 'ff-110': 'D110', 'ff-341': 'D341' } },
};

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(
    {
      PLAYER_VERIFICATION: 'customer',
      SELL_ONLY_WITH_STOCK: 'true',
      TOPUP_PROVIDER: 'unipin',
      UNIPIN_PARTNER_ID: 'socio-ficticio-0001',
      UNIPIN_SECRET_KEY: 'llave-ficticia-de-prueba',
      UNIPIN_CATALOG: JSON.stringify(CATALOG),
    },
    { sheets: sheet },
  );
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-topup' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});
beforeEach(() => {
  h.topup.reset();
  h.mailer.sent.length = 0;
});

let ip = 0;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.88.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};
let uid = 730000000;

async function checkout(items: { sku: string; quantity: number }[], server = 'latam') {
  const playerUid = String((uid += 1));
  return inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      playerServer: server,
      customerName: 'Cliente Recarga',
      customerEmail: `recarga-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items,
    },
  });
}

/** El cliente paga y Mercado Pago aprueba (webhook); espera la recarga que arranca el pago. */
async function buyAndPay(items: { sku: string; quantity: number }[], server = 'latam') {
  const created = await checkout(items, server);
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json<{ order: { reference: string; totalCop: number } }>().order;
  const cookies = guestCookie(created);
  const pay = await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/pay`,
    headers: CSRF,
    cookies,
  });
  expect(pay.statusCode).toBe(200);
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
  await h.settle();
  return { ref: order.reference, cookies, ...(await state(order.reference)) };
}

async function state(ref: string) {
  const [order] = await h.database.db.select().from(orders).where(eq(orders.publicRef, ref));
  if (!order) throw new Error('sin pedido');
  const [fulfillment] = await h.database.db
    .select()
    .from(fulfillments)
    .where(eq(fulfillments.orderId, order.id));
  const units = await h.database.db
    .select()
    .from(topups)
    .where(eq(topups.orderId, order.id))
    .orderBy(asc(topups.referenceNo));
  return { order, fulfillment, units };
}

const advance = (minutes: number) => {
  h.clock.now = new Date(h.clock.now.getTime() + minutes * 60_000);
};

describe('recarga directa con UniPin', () => {
  it('pago aprobado → recarga al ID → pedido entregado, sin PIN ni operador', async () => {
    const { ref, cookies, order, fulfillment, units } = await buyAndPay([
      { sku: 'ff-110', quantity: 1 },
    ]);
    expect(order.status).toBe('DELIVERED');
    expect(fulfillment).toMatchObject({ mode: 'provider', status: 'DELIVERED' });
    expect(fulfillment?.evidence).toContain(`UP-${ref}-11-1`);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      status: 'SUCCESS',
      referenceNo: `${ref}-11-1`,
      gameCode: 'FF_LATAM',
      denominationId: 'D110',
    });
    // UniPin recibió el ID del jugador en el campo de su catálogo y la denominación del paquete.
    expect(h.topup.validateCalls).toEqual([
      { game: 'FF_LATAM', uidField: 'userid', playerUid: order.playerUid },
    ]);
    expect(h.topup.createCalls).toMatchObject([
      { referenceNo: `${ref}-11-1`, denominationId: 'D110', validationToken: 'tok-1' },
    ]);

    const view = await inject({ method: 'GET', url: `/api/orders/${ref}`, cookies });
    expect(view.json<{ order: { status: string } }>().order.status).toBe('DELIVERED');
    // El cliente recibe «recarga completada»; el dueño sabe que no tiene que hacer nada.
    expect(h.mailer.sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining([
        `Recarga completada · Pedido ${ref}`,
        `Pedido pagado, recarga automática en curso · ${ref}`,
      ]),
    );

    // Otra pasada del job no vuelve a recargar.
    await runJob(h.deps, 'topups');
    expect(h.topup.createCalls).toHaveLength(1);
    // La fila del pedido en «Entregas» siguió la recarga hasta «entregado con éxito».
    expect(sheet.statuses.get(ref)).toEqual(
      expect.arrayContaining(['⏳ Por entregar', '🔄 En proceso']),
    );
    expect(sheet.statuses.get(ref)?.at(-1)).toBe('✅ Entregado con éxito');
  });

  it('varias unidades: una recarga por unidad, cada una con su referencia', async () => {
    const { ref, order, units } = await buyAndPay([
      { sku: 'ff-110', quantity: 2 },
      { sku: 'ff-341', quantity: 1 },
    ]);
    expect(order.status).toBe('DELIVERED');
    expect(units.map((u) => [u.referenceNo, u.denominationId, u.status])).toEqual([
      [`${ref}-11-1`, 'D110', 'SUCCESS'],
      [`${ref}-12-1`, 'D110', 'SUCCESS'],
      [`${ref}-21-1`, 'D341', 'SUCCESS'],
    ]);
  });

  it('tiempo agotado: no cuenta como entregado; la consulta lo confirma sin recargar otra vez', async () => {
    h.topup.nextCreate.push({ kind: 'uncertain', reason: 'timeout' });
    const { ref, order, units } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    expect(order.status).toBe('DELIVERING');
    expect(units[0]).toMatchObject({ status: 'UNCERTAIN', errorCode: 'timeout' });

    // Antes de su hora no se consulta.
    await processTopups(h.deps);
    expect(h.topup.inquiryCalls).toHaveLength(0);

    advance(2);
    h.topup.nextInquiry.push({ kind: 'success', transaction: 'UP-CONSULTA-1' });
    await processTopups(h.deps);
    const after = await state(ref);
    expect(after.order.status).toBe('DELIVERED');
    expect(after.units[0]).toMatchObject({
      status: 'SUCCESS',
      providerTransaction: 'UP-CONSULTA-1',
    });
    expect(h.topup.createCalls).toHaveLength(1);
    expect(h.topup.inquiryCalls).toEqual([`${ref}-11-1`]);
  });

  it('referencia repetida (708): se consulta en el acto y nunca se crea otra', async () => {
    h.topup.nextCreate.push({ kind: 'duplicate' });
    h.topup.nextInquiry.push({ kind: 'success', transaction: 'UP-YA-EXISTIA' });
    const { order, units } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    expect(order.status).toBe('DELIVERED');
    expect(units[0]).toMatchObject({ status: 'SUCCESS', providerTransaction: 'UP-YA-EXISTIA' });
    expect(h.topup.createCalls).toHaveLength(1);
  });

  it('token caducado (726): valida otra vez y repite la MISMA referencia', async () => {
    h.topup.nextCreate.push({ kind: 'token_expired' });
    const { ref, order } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    expect(order.status).toBe('DELIVERED');
    expect(h.topup.validateCalls).toHaveLength(2);
    expect(h.topup.createCalls.map((c) => c.referenceNo)).toEqual([`${ref}-11-1`, `${ref}-11-1`]);
  });

  it('error explícito: revisión con aviso al dueño; al reanudar solo se reintenta lo que falló', async () => {
    // Dos unidades: la primera sale bien, la segunda la rechaza UniPin (p. ej. sin saldo).
    h.topup.nextCreate.push(
      { kind: 'success', transaction: 'UP-OK-1' },
      { kind: 'failed', code: '7xx' },
    );
    const { ref, order, fulfillment, units } = await buyAndPay([{ sku: 'ff-110', quantity: 2 }]);
    expect(order.status).toBe('NEEDS_REVIEW');
    expect(fulfillment?.status).toBe('FAILED');
    expect(fulfillment?.failureReason).toContain('UniPin rechazó la recarga (7xx)');
    expect(fulfillment?.failureReason).toContain('recargadas 1 de 2');
    expect(units.map((u) => u.status)).toEqual(['SUCCESS', 'FAILED']);
    const alert = h.mailer.sent.find((m) => m.subject === `Recarga por revisar · ${ref}`);
    expect(alert?.to).toEqual([ADMIN_EMAIL, 'admin2@example.com']);
    expect(alert?.text).toContain('7xx');
    // Al cliente no se le dice que está entregado.
    expect(h.mailer.sent.some((m) => m.subject.startsWith('Recarga completada'))).toBe(false);
    expect(sheet.statuses.get(ref)?.at(-1)).toBe('⚠️ Requiere revisión');

    // El dueño reanuda la entrega desde el panel: solo la unidad fallida, con un intento nuevo.
    const resume = await inject({
      method: 'POST',
      url: `/api/admin/orders/${order.id}/review`,
      headers: CSRF,
      cookies: admin,
      payload: { resolution: 'resume_fulfillment', note: 'Recargué saldo en UniPin' },
    });
    expect(resume.statusCode, resume.body).toBe(200);
    await processTopups(h.deps);
    const after = await state(ref);
    expect(after.order.status).toBe('DELIVERED');
    expect(sheet.statuses.get(ref)?.at(-1)).toBe('✅ Entregado con éxito');
    expect(after.units.map((u) => [u.referenceNo, u.status])).toEqual([
      [`${ref}-11-1`, 'SUCCESS'],
      [`${ref}-12-1`, 'FAILED'],
      [`${ref}-12-2`, 'SUCCESS'],
    ]);
    expect(h.topup.createCalls.map((c) => c.referenceNo)).toEqual([
      `${ref}-11-1`,
      `${ref}-12-1`,
      `${ref}-12-2`,
    ]);
  });

  it('el panel del dueño muestra cada recarga con su transacción', async () => {
    const { ref, order } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    const res = await inject({
      method: 'GET',
      url: `/api/admin/orders/${order.id}`,
      cookies: admin,
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json<{
      fulfillment: { mode: string };
      topups: { referenceNo: string; status: string; providerTransaction: string }[];
    }>();
    expect(detail.fulfillment.mode).toBe('provider');
    expect(detail.topups).toMatchObject([
      { referenceNo: `${ref}-11-1`, status: 'SUCCESS', providerTransaction: `UP-${ref}-11-1` },
    ]);
  });

  it('ID que UniPin no reconoce (727): no se crea la recarga y el dueño revisa', async () => {
    h.topup.nextValidate.push({ kind: 'failed', code: '727' });
    const { order, units } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    expect(order.status).toBe('NEEDS_REVIEW');
    expect(units[0]).toMatchObject({ status: 'FAILED', errorCode: 'validacion_727' });
    expect(h.topup.createCalls).toHaveLength(0);
  });

  it('sin confirmación tras todas las consultas: revisión, nunca «entregado»', async () => {
    h.topup.nextCreate.push({ kind: 'uncertain', reason: 'http_502' });
    const { ref } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
    for (let i = 0; i < MAX_CHECKS; i += 1) {
      advance(61);
      await processTopups(h.deps);
    }
    const after = await state(ref);
    expect(after.order.status).toBe('NEEDS_REVIEW');
    expect(after.units[0]).toMatchObject({ status: 'UNCERTAIN', errorCode: 'sin_confirmar' });
    expect(after.fulfillment?.failureReason).toContain('UniPin no confirmó la recarga');
    expect(h.topup.inquiryCalls).toHaveLength(MAX_CHECKS);
    expect(h.topup.createCalls).toHaveLength(1);
    // Ya no se consulta más por su cuenta.
    advance(120);
    await processTopups(h.deps);
    expect(h.topup.inquiryCalls).toHaveLength(MAX_CHECKS);
    const audit = await h.database.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, after.fulfillment?.id ?? ''));
    expect(audit.map((a) => a.action)).toContain('fulfillment.topup_unconfirmed');
  });

  it('con las entregas pausadas no se recarga', async () => {
    h.deps.config.flags.fulfillmentEnabled = false;
    try {
      const { order } = await buyAndPay([{ sku: 'ff-110', quantity: 1 }]);
      expect(order.status).toBe('PAID');
      expect(h.topup.createCalls).toHaveLength(0);
    } finally {
      h.deps.config.flags.fulfillmentEnabled = true;
    }
  });
});

describe('qué se puede vender con recarga directa', () => {
  it('el catálogo muestra disponibles los paquetes del catálogo de UniPin, aun sin PIN', async () => {
    const res = await inject({ method: 'GET', url: '/api/catalog' });
    const bySku = new Map(
      res.json<{ products: { sku: string; soldOut: boolean }[] }>().products.map((p) => [p.sku, p]),
    );
    expect(bySku.get('ff-110')?.soldOut).toBe(false);
    expect(bySku.get('ff-341')?.soldOut).toBe(false);
    expect(bySku.get('ff-6160')?.soldOut).toBe(true);
  });

  it('servidor fuera del catálogo de UniPin: no se vende (sin PIN) y el mensaje lo explica', async () => {
    const res = await checkout([{ sku: 'ff-110', quantity: 1 }], 'brasil');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { message: string } }>().error.message).toContain(
      'no tiene recarga automática para el servidor que elegiste',
    );
  });

  it('paquete fuera del catálogo de UniPin y sin PIN: agotado', async () => {
    const res = await checkout([{ sku: 'ff-6160', quantity: 1 }]);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { message: string } }>().error.message).toContain('agotado');
  });
});
