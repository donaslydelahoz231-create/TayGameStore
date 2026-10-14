import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, products } from '../../src/server/db/schema.js';
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
import { unzip } from '../support/zip.js';

/**
 * Excel de inventario y facturas (panel → Inventario → «Descargar Excel»): sale de la base en el
 * momento, solo los pedidos pagados son facturas, y no lleva datos personales ni PIN.
 */
let h: Harness;
let admin: Record<string, string>;
let customer: Record<string, string>;
let productId = '';

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PLAYER_VERIFICATION: 'customer' });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-xlsx' }))
    .cookie;
  customer = (await sessionFor(h, { email: 'cliente-xlsx@example.com', sub: 'cli-xlsx' })).cookie;
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
  h.app.inject({ remoteAddress: `10.77.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};

const NAME = 'Cliente Excel Privado';
const EMAIL = 'privado-xlsx@example.com';
const UIDS = ['771234561', '771234562'];
const PIN = 'PINXLSXSECRETO01';

async function createOrder(playerUid: string) {
  const created = await inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      customerName: NAME,
      customerEmail: EMAIL,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 2 }],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json<{ order: { reference: string; totalCop: number } }>().order;
  return { ...order, cookies: guestCookie(created) };
}

async function pay(order: {
  reference: string;
  totalCop: number;
  cookies: Record<string, string>;
}) {
  expect(
    (
      await inject({
        method: 'POST',
        url: `/api/orders/${order.reference}/pay`,
        headers: CSRF,
        cookies: order.cookies,
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
    payload: { type: 'payment', data: { id: paymentId } },
  });
  expect(hook.statusCode).toBe(200);
  const view = await inject({
    method: 'GET',
    url: `/api/orders/${order.reference}`,
    cookies: order.cookies,
  });
  return {
    paymentId,
    receipt: view.json<{ order: { receipt: { number: number; verificationCode: string } } }>().order
      .receipt,
  };
}

const download = (cookies?: Record<string, string>) =>
  inject({ method: 'GET', url: '/api/admin/export/inventario.xlsx', cookies });

describe('Excel de inventario y facturas', () => {
  it('sale de la base: inventario, solo pedidos pagados como facturas y todos los pedidos', async () => {
    const loaded = await inject({
      method: 'POST',
      url: '/api/admin/inventory',
      headers: CSRF,
      cookies: admin,
      payload: { productId, codes: [PIN, 'PINXLSXSECRETO02', 'PINXLSXSECRETO03'], costCop: 3100 },
    });
    expect(loaded.statusCode, loaded.body).toBe(201);
    const paid = await createOrder(UIDS[0] ?? '');
    const { paymentId, receipt } = await pay(paid);
    const unpaid = await createOrder(UIDS[1] ?? '');

    const res = await download(admin);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="TayGameStore-inventario-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');

    const parts = unzip(res.rawPayload);
    const workbook = parts.get('xl/workbook.xml') ?? '';
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'Resumen',
      'Inventario',
      'Facturas',
      'Pedidos',
    ]);
    const summary = parts.get('xl/worksheets/sheet1.xml') ?? '';
    const inventory = parts.get('xl/worksheets/sheet2.xml') ?? '';
    const invoices = parts.get('xl/worksheets/sheet3.xml') ?? '';
    const ordersSheet = parts.get('xl/worksheets/sheet4.xml') ?? '';

    // Inventario: el paquete con sus PIN (3 cargados) y lo vendido (2 unidades pagadas).
    const ffRow = /<row r="\d+">(?:(?!<\/row>).)*>ff-110<(?:(?!<\/row>).)*<\/row>/.exec(
      inventory,
    )?.[0];
    expect(ffRow).toBeDefined();
    expect(ffRow).toContain('<v>3</v>'); // disponibles
    expect(ffRow).toContain('<v>3100</v>'); // costo promedio
    expect(ffRow).toContain(`<v>${paid.totalCop}</v>`); // vendido en COP

    // Facturas: solo el pedido pagado, con su número, operación y código de verificación.
    expect(invoices).toContain(paid.reference);
    expect(invoices).toContain('>000001<');
    expect(invoices).toContain(paymentId);
    expect(invoices).toContain(receipt.verificationCode);
    expect(invoices).not.toContain(unpaid.reference);

    // Pedidos: los dos; el que no se pagó dice que no es factura.
    expect(ordersSheet).toContain(paid.reference);
    expect(ordersSheet).toContain(unpaid.reference);
    expect(ordersSheet).toContain('Sin pago (no es factura)');
    expect(summary).toContain('Comprobantes emitidos (pedidos pagados)');

    // Sin datos personales ni PIN en ninguna parte del archivo.
    const everything = [...parts.values()].join('\n');
    for (const secret of [NAME, EMAIL, ...UIDS, PIN, 'PINXLSXSECRETO02']) {
      expect(everything).not.toContain(secret);
    }

    // Cada descarga queda en el historial (solo cantidades).
    const events = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'inventory.exported'));
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({ invoices: 1, orders: 2 });
  });

  it('para quien no es administrador el Excel no existe (404)', async () => {
    expect((await download()).statusCode).toBe(404);
    expect((await download(customer)).statusCode).toBe(404);
  });
});
