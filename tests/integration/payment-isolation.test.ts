import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditEvents,
  fulfillments,
  nequiTransfers,
  notifications,
  orders,
  paymentAttempts,
  payments,
} from '../../src/server/db/schema.js';
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
 * Aislamiento de proveedores (requisito del dueño, 2026-10-19): Mercado Pago y Nequi son métodos
 * de pago independientes. Solo comparten el pedido; ninguno usa la configuración, el estado ni
 * las confirmaciones del otro, y si uno falta o falla, el otro sigue funcionando.
 * Todos los datos son ficticios (celular 3001234567, referencias inventadas).
 */

const NEQUI_ENV = {
  PLAYER_VERIFICATION: 'customer',
  NEQUI_MANUAL_ENABLED: 'true',
  NEQUI_MANUAL_PHONE: '300 123 4567',
  NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
};

let h: Harness;
let admin: Record<string, string>;
let seq = 0;
let uid = 810000000;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness(NEQUI_ENV);
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-iso' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});

const inject = (harness: Harness, options: InjectOptions) =>
  harness.app.inject({
    remoteAddress: `10.77.${Math.floor(++seq / 200)}.${(seq % 200) + 1}`,
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
  cookies: Record<string, string>;
}

/** Pedido listo para pagar (el cliente confirmó su ID escribiéndolo dos veces). */
async function order(harness = h): Promise<Order> {
  const playerUid = String((uid += 1));
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
      customerName: 'Cliente Ficticio',
      customerEmail: `iso-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json<{ order: { reference: string; totalCop: number; status: string } }>();
  expect(body.order.status).toBe('AWAITING_PAYMENT');
  const [row] = await harness.database.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, body.order.reference));
  return {
    id: row?.id ?? '',
    ref: body.order.reference,
    total: body.order.totalCop,
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
const ownerAction = (harness: Harness, o: Order, path: string, payload: object) =>
  inject(harness, {
    method: 'POST',
    url: `/api/admin/orders/${o.id}/${path}`,
    headers: CSRF,
    cookies: admin,
    payload,
  });
const view = async (harness: Harness, o: Order) =>
  (await inject(harness, { method: 'GET', url: `/api/orders/${o.ref}`, cookies: o.cookies })).json<{
    order: {
      status: string;
      payment: {
        method: string | null;
        canPay: boolean;
        canChangeMethod: boolean;
        methods: Record<string, boolean>;
        nequi: {
          account: { phone: string; holder: string | null } | null;
          amountCop: number;
          reference: string;
          transfer: { status: string; rejectionReason: string | null } | null;
        } | null;
      };
      states: { payment: string; recharge: string };
      receipt: { number: number } | null;
    };
  }>().order;

/** Mercado Pago aprueba un pago (webhook firmado + consulta a su API, simulados). */
async function mercadoPagoApproves(harness: Harness, o: Order, amount = o.total) {
  const paymentId = String(Math.floor(Math.random() * 1e12));
  harness.gateway.setPayment({ id: paymentId, externalReference: o.ref, amount });
  const hook = await inject(harness, {
    method: 'POST',
    url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
    headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
    payload: { type: 'payment', data: { id: paymentId } },
  });
  expect(hook.statusCode).toBe(200);
  await harness.settle();
  return paymentId;
}

/** Pedido Nequi pagado de punta a punta: elegir, avisar y confirmar el dueño. */
async function nequiPaid(harness: Harness, nequiReference = `M${randomUUID().slice(0, 8)}`) {
  const o = await order(harness);
  expect((await customer(harness, o, '/nequi')).statusCode).toBe(200);
  expect((await customer(harness, o, '/nequi/report', { senderLast4: '9876' })).statusCode).toBe(
    200,
  );
  const confirmed = await ownerAction(harness, o, 'nequi/confirm', {
    nequiReference,
    amountCop: o.total,
  });
  expect(confirmed.statusCode, confirmed.body).toBe(200);
  await harness.settle();
  return { o, nequiReference };
}

const paymentsOf = (harness: Harness, orderId: string) =>
  harness.database.db
    .select({
      provider: payments.provider,
      status: payments.status,
      isOrderPayment: payments.isOrderPayment,
      providerPaymentId: payments.providerPaymentId,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId));

describe('1. un pago Nequi no crea ninguna transacción en Mercado Pago', () => {
  it('de elegir Nequi a entregar, Mercado Pago no recibe ni una llamada', async () => {
    const calls = h.gateway.totalCalls;
    const preferences = h.gateway.preferences.size;
    const { o, nequiReference } = await nequiPaid(h);
    for (const action of [
      { action: 'claim' },
      { action: 'start' },
      { action: 'deliver', evidence: 'Recarga ficticia hecha en el canal oficial' },
    ]) {
      expect((await ownerAction(h, o, 'fulfillment', action)).statusCode).toBe(200);
    }
    // El cliente consulta el estado: tampoco se pregunta a Mercado Pago.
    expect((await customer(h, o, '/sync')).statusCode).toBe(200);
    await runJob(h.deps, 'reconcilePayments');
    await runJob(h.deps, 'expireOrders');

    expect(h.gateway.totalCalls).toBe(calls);
    expect(h.gateway.searchedRefs).not.toContain(o.ref);
    expect(h.gateway.createdRefs).not.toContain(o.ref);
    expect(h.gateway.preferences.size).toBe(preferences);
    const attempts = await h.database.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, o.id));
    expect(attempts).toHaveLength(0);
    expect(await paymentsOf(h, o.id)).toEqual([
      {
        provider: 'nequi_manual',
        status: 'APPROVED',
        isOrderPayment: true,
        providerPaymentId: nequiReference,
      },
    ]);
    const shown = await view(h, o);
    expect(shown.status).toBe('DELIVERED');
    expect(shown.payment.method).toBe('nequi_manual');
    expect(shown.receipt?.number).toBeGreaterThan(0);
    // El comprobante del cliente dice Nequi, no Mercado Pago.
    const receipt = h.mailer.sent.find(
      (m) => m.subject === `Comprobante de pago · Pedido ${o.ref}`,
    );
    expect(receipt?.text).toContain('Medio: Nequi (transferencia)');
    expect(receipt?.text).toContain(`Referencia de Nequi: ${nequiReference}`);
    expect(receipt?.text).not.toContain('Mercado Pago');
  });
});

describe('2. un pago de Mercado Pago no genera ninguna solicitud a Nequi', () => {
  it('pagar con Mercado Pago nunca toca transferencias ni avisos de Nequi', async () => {
    const o = await order();
    expect((await customer(h, o, '/pay', { payMeans: 'tarjeta' })).statusCode).toBe(200);
    await mercadoPagoApproves(h, o);
    const shown = await view(h, o);
    expect(shown.status).toBe('PAID');
    expect(shown.payment.method).toBe('mercadopago');
    expect(shown.payment.nequi).toBeNull();
    const transfers = await h.database.db
      .select()
      .from(nequiTransfers)
      .where(eq(nequiTransfers.orderId, o.id));
    expect(transfers).toHaveLength(0);
    const nequiNotices = await h.database.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orderId, o.id), eq(notifications.kind, 'nequi_reported_owner')));
    expect(nequiNotices).toHaveLength(0);
    expect((await paymentsOf(h, o.id)).map((p) => p.provider)).toEqual(['mercadopago']);
  });
});

describe('3. un webhook de Mercado Pago no puede confirmar un pedido Nequi', () => {
  it('el pago queda para reembolso, el pedido sigue esperando su transferencia y no hay entrega', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    const paymentId = await mercadoPagoApproves(h, o);
    const shown = await view(h, o);
    expect(shown.status).toBe('AWAITING_PAYMENT');
    expect(shown.payment.method).toBe('nequi_manual');
    expect(shown.receipt).toBeNull();
    expect(await paymentsOf(h, o.id)).toEqual([
      {
        provider: 'mercadopago',
        status: 'NEEDS_REFUND',
        isOrderPayment: false,
        providerPaymentId: paymentId,
      },
    ]);
    const [flagged] = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'payment.foreign_method_needs_refund'));
    expect(flagged).toBeDefined();
    const [delivery] = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, o.id));
    expect(delivery).toBeUndefined();
    // Repetir el aviso (o la conciliación) no cambia nada.
    await inject(h, {
      method: 'POST',
      url: `/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
      headers: { 'x-signature': 'firma-valida', 'x-request-id': randomUUID() },
      payload: { type: 'payment', data: { id: paymentId } },
    });
    expect((await view(h, o)).status).toBe('AWAITING_PAYMENT');
  });

  it('ni con SQL directo: la base de datos impide que ese pago pague el pedido Nequi', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    await mercadoPagoApproves(h, o);
    await expect(
      h.database.db
        .update(payments)
        .set({ isOrderPayment: true })
        .where(eq(payments.orderId, o.id)),
    ).rejects.toThrow();
  });
});

describe('4. una notificación de Nequi no puede confirmar un pedido de Mercado Pago', () => {
  it('ni el aviso del cliente ni la confirmación del dueño valen en un pedido de Mercado Pago', async () => {
    const o = await order();
    expect((await customer(h, o, '/pay', { payMeans: 'pse' })).statusCode).toBe(200);
    const report = await customer(h, o, '/nequi/report', { senderLast4: '1111' });
    expect(report.statusCode).toBe(409);
    const confirm = await ownerAction(h, o, 'nequi/confirm', {
      nequiReference: 'MFALSO123',
      amountCop: o.total,
    });
    expect(confirm.statusCode).toBe(409);
    expect((await view(h, o)).status).toBe('AWAITING_PAYMENT');
    expect(await paymentsOf(h, o.id)).toEqual([]);
  });

  it('ni con SQL directo: un pago Nequi no puede ser el pago de un pedido de Mercado Pago', async () => {
    const o = await order();
    expect((await customer(h, o, '/pay', { payMeans: 'pse' })).statusCode).toBe(200);
    await expect(
      h.database.db.insert(payments).values({
        orderId: o.id,
        provider: 'nequi_manual',
        providerPaymentId: 'MSQL-DIRECTO',
        status: 'APPROVED',
        providerStatus: 'verified_by_owner',
        amountCop: o.total,
        currency: 'COP',
        amountMatches: true,
        isOrderPayment: true,
      }),
    ).rejects.toThrow();
  });
});

describe('5. sin credenciales de Nequi, Mercado Pago funciona igual', () => {
  it('sin variables de Nequi: Nequi no se ofrece y Mercado Pago cobra y confirma', async () => {
    const plain = await createHarness({ PLAYER_VERIFICATION: 'customer' });
    try {
      const config = (await inject(plain, { method: 'GET', url: '/api/config' })).json<{
        paymentMethods: Record<string, boolean>;
      }>();
      expect(config.paymentMethods).toEqual({
        mercadopago: true,
        nequiManual: false,
        nequiPush: false,
      });
      const o = await order(plain);
      expect((await customer(plain, o, '/nequi')).statusCode).toBe(503);
      const pay = await customer(plain, o, '/pay', { payMeans: 'tarjeta' });
      expect(pay.statusCode, pay.body).toBe(200);
      await mercadoPagoApproves(plain, o);
      expect((await view(plain, o)).status).toBe('PAID');
    } finally {
      await plain.close();
    }
  });

  it('con variables de Nequi mal escritas la tienda arranca, Nequi queda apagado y Mercado Pago sigue', async () => {
    const broken = await createHarness({
      PLAYER_VERIFICATION: 'customer',
      NEQUI_MANUAL_ENABLED: 'true',
      NEQUI_MANUAL_PHONE: 'no-es-un-celular',
    });
    try {
      expect(broken.deps.config.nequi.manual).toBeUndefined();
      expect(broken.deps.config.nequi.problem).toContain('NEQUI_MANUAL_PHONE');
      // El aviso nunca repite el valor mal escrito.
      expect(broken.deps.config.nequi.problem).not.toContain('no-es-un-celular');
      const o = await order(broken);
      expect((await customer(broken, o, '/pay', { payMeans: 'efecty' })).statusCode).toBe(200);
      await mercadoPagoApproves(broken, o);
      expect((await view(broken, o)).status).toBe('PAID');
    } finally {
      await broken.close();
    }
  });
});

describe('6. un error de Nequi no bloquea el checkout ni la confirmación de Mercado Pago', () => {
  it('avisos inválidos, montos que no cuadran y rechazos de Nequi no afectan a otro pedido de Mercado Pago', async () => {
    const nequiOrder = await order();
    expect((await customer(h, nequiOrder, '/nequi')).statusCode).toBe(200);
    expect((await customer(h, nequiOrder, '/nequi/report', { senderLast4: '12' })).statusCode).toBe(
      400,
    );
    expect(
      (await customer(h, nequiOrder, '/nequi/report', { senderLast4: '1234' })).statusCode,
    ).toBe(200);
    expect(
      (
        await ownerAction(h, nequiOrder, 'nequi/confirm', {
          nequiReference: 'MMONTO-MAL',
          amountCop: nequiOrder.total - 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await ownerAction(h, nequiOrder, 'nequi/reject', { reason: 'No llegó (prueba)' }))
        .statusCode,
    ).toBe(200);

    const mpOrder = await order();
    expect((await customer(h, mpOrder, '/pay', { payMeans: 'tarjeta' })).statusCode).toBe(200);
    await mercadoPagoApproves(h, mpOrder);
    expect((await view(h, mpOrder)).status).toBe('PAID');
    const rejected = await view(h, nequiOrder);
    expect(rejected.status).toBe('AWAITING_PAYMENT');
    expect(rejected.payment.nequi?.transfer).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'No llegó (prueba)',
    });
  });

  it('y al revés: con Mercado Pago caído, un pedido Nequi se confirma y vence sin preguntarle', async () => {
    h.gateway.failQueries = true;
    h.gateway.failNextCreates = 5;
    try {
      const { o } = await nequiPaid(h);
      expect((await view(h, o)).status).toBe('PAID');
      const stale = await order();
      expect((await customer(h, stale, '/nequi')).statusCode).toBe(200);
      h.clock.now = new Date(Date.now() + 3 * 3_600_000);
      await runJob(h.deps, 'expireOrders');
      expect((await view(h, stale)).status).toBe('EXPIRED');
      // Pudo consultar otros pedidos de Mercado Pago, pero nunca los de Nequi.
      for (const ref of [o.ref, stale.ref]) {
        expect(h.gateway.searchedRefs).not.toContain(ref);
        expect(h.gateway.createdRefs).not.toContain(ref);
      }
    } finally {
      h.gateway.failQueries = false;
      h.gateway.failNextCreates = 0;
      h.clock.now = new Date();
    }
  });

  it('con Mercado Pago apagado (PAYMENTS_ENABLED=false) la tienda vende y confirma por Nequi', async () => {
    const nequiOnly = await createHarness({ ...NEQUI_ENV, PAYMENTS_ENABLED: 'false' });
    try {
      const config = (await inject(nequiOnly, { method: 'GET', url: '/api/config' })).json<{
        paymentMethods: Record<string, boolean>;
      }>();
      expect(config.paymentMethods).toEqual({
        mercadopago: false,
        nequiManual: true,
        nequiPush: false,
      });
      const o = await order(nequiOnly);
      expect((await customer(nequiOnly, o, '/pay')).statusCode).toBe(503);
      expect((await customer(nequiOnly, o, '/nequi')).statusCode).toBe(200);
      const confirmed = await ownerAction(nequiOnly, o, 'nequi/confirm', {
        nequiReference: `MSOLO${randomUUID().slice(0, 6)}`,
        amountCop: o.total,
      });
      expect(confirmed.statusCode).toBe(200);
      expect((await view(nequiOnly, o)).status).toBe('PAID');
    } finally {
      await nequiOnly.close();
    }
  });
});

describe('7. cada proveedor confirma solo sus propias transacciones', () => {
  it('una referencia de Nequi confirma un solo pedido', async () => {
    const { nequiReference } = await nequiPaid(h);
    const other = await order();
    expect((await customer(h, other, '/nequi')).statusCode).toBe(200);
    const reused = await ownerAction(h, other, 'nequi/confirm', {
      nequiReference,
      amountCop: other.total,
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json<{ error: { code: string } }>().error.code).toBe('NEQUI_REFERENCE_USED');
    expect((await view(h, other)).status).toBe('AWAITING_PAYMENT');
  });

  it('la base de datos solo acepta proveedores conocidos', async () => {
    const o = await order();
    await expect(
      h.database.db.insert(payments).values({
        orderId: o.id,
        provider: 'otro_proveedor',
        providerPaymentId: 'X-1',
        status: 'PENDING',
        providerStatus: 'pending',
        amountCop: o.total,
        currency: 'COP',
        amountMatches: true,
      }),
    ).rejects.toThrow();
  });

  it('Nequi Push está deshabilitado: no se puede elegir', async () => {
    const o = await order();
    const res = await customer(h, o, '/payment-method', { to: 'nequi_push', confirm: true });
    expect(res.statusCode).toBe(503);
    expect((await view(h, o)).payment.method).toBeNull();
  });
});

describe('8. la entrega sigue protegida contra pagos falsos, duplicados e inconsistentes', () => {
  it('el aviso del cliente no es un pago: sin la confirmación del dueño no hay entrega', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    expect((await customer(h, o, '/nequi/report', { senderLast4: '4321' })).statusCode).toBe(200);
    const shown = await view(h, o);
    expect(shown.status).toBe('AWAITING_PAYMENT');
    expect(shown.states.payment).toBe('PENDING');
    expect((await ownerAction(h, o, 'fulfillment', { action: 'claim' })).statusCode).not.toBe(200);
    // El dueño recibe un aviso para verificarlo en su app Nequi, sin que eso sea un pago.
    const alert = h.mailer.sent.find(
      (m) => m.subject === `Transferencia Nequi por verificar · ${o.ref}`,
    );
    expect(alert?.text).toContain('terminado en 4321');
    expect(alert?.text).toContain('NO es un pago');
  });

  it('corregir el aviso no reenvía el correo al dueño ni alarga el plazo del pedido', async () => {
    const o = await order();
    const subject = `Transferencia Nequi por verificar · ${o.ref}`;
    const alerts = () => h.mailer.sent.filter((m) => m.subject === subject).length;
    const expiresAt = async () =>
      (
        await h.database.db
          .select({ expiresAt: orders.expiresAt })
          .from(orders)
          .where(eq(orders.id, o.id))
      )[0]?.expiresAt.getTime();
    const start = h.clock.now;
    try {
      expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
      expect((await customer(h, o, '/nequi/report', { senderLast4: '1111' })).statusCode).toBe(200);
      await h.settle();
      expect(alerts()).toBe(1);
      const firstDeadline = await expiresAt();
      // Una hora después el cliente corrige sus dígitos varias veces.
      h.clock.now = new Date(start.getTime() + 3_600_000);
      for (const senderLast4 of ['2222', '3333', '4444']) {
        expect((await customer(h, o, '/nequi/report', { senderLast4 })).statusCode).toBe(200);
      }
      await h.settle();
      expect(alerts()).toBe(1);
      expect(await expiresAt()).toBe(firstDeadline);
      const [row] = await h.database.db
        .select({ senderLast4: nequiTransfers.senderLast4 })
        .from(nequiTransfers)
        .where(and(eq(nequiTransfers.orderId, o.id), eq(nequiTransfers.status, 'REPORTED')));
      expect(row?.senderLast4).toBe('4444');
      // Tras un rechazo del dueño, un aviso nuevo sí vuelve a avisarle y da plazo para verificar.
      expect(
        (await ownerAction(h, o, 'nequi/reject', { reason: 'No llegó a la cuenta' })).statusCode,
      ).toBe(200);
      expect((await customer(h, o, '/nequi/report', { senderLast4: '5555' })).statusCode).toBe(200);
      await h.settle();
      expect(alerts()).toBe(2);
      expect(await expiresAt()).toBeGreaterThan(firstDeadline ?? 0);
    } finally {
      h.clock.now = start;
    }
  });

  it('solo el dueño confirma: un cliente no puede usar las rutas del panel', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    const intruder = await sessionFor(h, { email: 'cliente-iso@example.com' });
    const res = await inject(h, {
      method: 'POST',
      url: `/api/admin/orders/${o.id}/nequi/confirm`,
      headers: CSRF,
      cookies: intruder.cookie,
      payload: { nequiReference: 'MINTRUSO1', amountCop: o.total },
    });
    expect(res.statusCode).toBe(404);
    expect((await view(h, o)).status).toBe('AWAITING_PAYMENT');
  });

  it('confirmar dos veces no crea dos pagos ni dos entregas', async () => {
    const { o } = await nequiPaid(h);
    const again = await ownerAction(h, o, 'nequi/confirm', {
      nequiReference: 'MOTRA-VEZ1',
      amountCop: o.total,
    });
    expect(again.statusCode).toBe(409);
    expect(await paymentsOf(h, o.id)).toHaveLength(1);
    const deliveries = await h.database.db
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, o.id));
    expect(deliveries).toHaveLength(1);
  });

  it('el método no se cambia en silencio: Mercado Pago no abre un pedido Nequi', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    const pay = await customer(h, o, '/pay', { payMeans: 'tarjeta' });
    expect(pay.statusCode).toBe(409);
    expect(pay.json<{ error: { code: string } }>().error.code).toBe('PAYMENT_METHOD_LOCKED');
    expect((await view(h, o)).payment.method).toBe('nequi_manual');
  });

  it('cambio explícito sin pagos: cierra la preferencia vieja y un pago tardío de ella no entrega', async () => {
    const o = await order();
    expect((await customer(h, o, '/pay', { payMeans: 'tarjeta' })).statusCode).toBe(200);
    expect((await view(h, o)).payment.canChangeMethod).toBe(true);
    const switched = await customer(h, o, '/payment-method', { to: 'nequi_manual', confirm: true });
    expect(switched.statusCode).toBe(200);
    const [attempt] = await h.database.db
      .select({ status: paymentAttempts.status, lastError: paymentAttempts.lastError })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, o.id));
    expect(attempt).toEqual({ status: 'CLOSED', lastError: 'payment_method_changed' });
    // El cliente igual paga en la página vieja de Mercado Pago: nunca paga el pedido Nequi.
    await mercadoPagoApproves(h, o);
    expect((await view(h, o)).status).toBe('AWAITING_PAYMENT');
    // Con un pago registrado ya no se puede cambiar de método (ni con SQL directo).
    expect((await view(h, o)).payment.canChangeMethod).toBe(false);
    const back = await customer(h, o, '/payment-method', { to: 'mercadopago', confirm: true });
    expect(back.statusCode).toBe(409);
    await expect(
      h.database.db.update(orders).set({ paymentMethod: 'mercadopago' }).where(eq(orders.id, o.id)),
    ).rejects.toThrow();
  });

  it('un pedido de Nequi nunca pasa a Mercado Pago (ni antes ni después de avisar)', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    expect((await view(h, o)).payment.canChangeMethod).toBe(false);
    const before = await customer(h, o, '/payment-method', { to: 'mercadopago', confirm: true });
    expect(before.statusCode).toBe(409);
    expect(before.json<{ error: { code: string } }>().error.code).toBe('PAYMENT_METHOD_LOCKED');
    expect((await customer(h, o, '/nequi/report', { senderLast4: '5555' })).statusCode).toBe(200);
    const after = await customer(h, o, '/payment-method', { to: 'mercadopago', confirm: true });
    expect(after.statusCode).toBe(409);
    expect((await view(h, o)).payment.method).toBe('nequi_manual');
    // Ni una preferencia ni una consulta a Mercado Pago para este pedido.
    expect(h.gateway.createdRefs).not.toContain(o.ref);
    expect((await customer(h, o, '/pay', { payMeans: 'tarjeta' })).statusCode).toBe(409);
    expect(h.gateway.createdRefs).not.toContain(o.ref);
  });

  it('una transferencia que llega tarde (pedido vencido) va a revisión, nunca directo a entrega', async () => {
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    h.clock.now = new Date(Date.now() + 3 * 3_600_000);
    try {
      await runJob(h.deps, 'expireOrders');
      expect((await view(h, o)).status).toBe('EXPIRED');
      const late = await ownerAction(h, o, 'nequi/confirm', {
        nequiReference: `MTARDE${randomUUID().slice(0, 6)}`,
        amountCop: o.total,
      });
      expect(late.statusCode).toBe(200);
      expect((await view(h, o)).status).toBe('NEEDS_REVIEW');
      const [delivery] = await h.database.db
        .select()
        .from(fulfillments)
        .where(eq(fulfillments.orderId, o.id));
      expect(delivery).toBeUndefined();
    } finally {
      h.clock.now = new Date();
    }
  });

  it('la devolución Nequi registrada cierra el pedido como reembolsado', async () => {
    const { o } = await nequiPaid(h);
    const refund = await ownerAction(h, o, 'nequi/refund', {
      refundReference: 'MDEVUELTO1',
      note: 'No se pudo entregar (prueba)',
    });
    expect(refund.statusCode).toBe(200);
    const shown = await view(h, o);
    expect(shown.status).toBe('REFUNDED');
    expect(shown.states.payment).toBe('REFUNDED');
    expect((await paymentsOf(h, o.id))[0]).toMatchObject({
      provider: 'nequi_manual',
      status: 'REFUNDED',
    });
  });

  it('el celular del dueño solo lo ve quien eligió Nequi en su propio pedido, y mientras espera pago', async () => {
    const config = await inject(h, { method: 'GET', url: '/api/config' });
    expect(config.body).not.toContain('3001234567');
    const mp = await order();
    expect(JSON.stringify(await view(h, mp))).not.toContain('3001234567');
    const o = await order();
    expect((await customer(h, o, '/nequi')).statusCode).toBe(200);
    expect((await view(h, o)).payment.nequi).toMatchObject({
      account: { phone: '3001234567', holder: 'Tienda de Prueba' },
      amountCop: o.total,
      reference: o.ref,
    });
    // Otra persona (sin acceso a ese pedido) no ve nada.
    const stranger = await inject(h, { method: 'GET', url: `/api/orders/${o.ref}` });
    expect(stranger.statusCode).toBe(404);
    // Ya pagado, el número deja de mostrarse.
    await ownerAction(h, o, 'nequi/confirm', {
      nequiReference: `MVISTA${randomUUID().slice(0, 6)}`,
      amountCop: o.total,
    });
    expect((await view(h, o)).payment.nequi?.account).toBeNull();
    const [count] = await h.database.db
      .select({ n: sql<number>`count(*)::int` })
      .from(nequiTransfers)
      .where(eq(nequiTransfers.orderId, o.id));
    expect(count?.n).toBe(1);
  });
});
