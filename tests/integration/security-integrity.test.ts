import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, orders, products } from '../../src/server/db/schema.js';
import { runJob } from '../../src/server/services/jobs.js';
import { sealAudit, verifyChain } from '../../src/server/services/integrity.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  sessionFor,
  testAppDatabaseUrl,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Protección de la tienda contra borrarla, alterar precios o montos y falsificar comprobantes:
 * - comprobantes con número consecutivo y código de verificación que el dueño comprueba;
 * - la base de datos no deja borrar ni cambiar montos (ni con SQL directo);
 * - todo cambio de precio queda en el historial, también si se hace por SQL;
 * - catálogo bloqueable;
 * - sellos de integridad: si alguien con acceso total cambia o borra el historial, se detecta.
 */
let h: Harness;
let admin: Record<string, string>;
const SECRET = 'c'.repeat(40);

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PLAYER_VERIFICATION: 'customer', CRON_SECRET: SECRET });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-sec' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});

/** Ejecuta SQL como el rol dueño de las tablas (el «acceso total» de un atacante). */
async function asTableOwner(run: (client: pg.Client) => Promise<unknown>): Promise<void> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

let ip = 0;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.99.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const guestCookie = (res: LightMyRequestResponse): Record<string, string> => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_guest');
  return cookie ? { tgs_guest: cookie.value } : {};
};
let uid = 840000000;

async function createOrder() {
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
      customerName: 'Cliente Seguro',
      customerEmail: `seguro-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
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
  const res = await inject({
    method: 'POST',
    url: `/api/orders/${order.reference}/pay`,
    headers: CSRF,
    cookies: order.cookies,
  });
  expect(res.statusCode).toBe(200);
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
    receipt: view.json<{
      order: { receipt: { number: number; verificationCode: string } | null };
    }>().order.receipt,
  };
}

const verify = (reference: string, code: string) =>
  inject({
    method: 'POST',
    url: '/api/admin/receipts/verify',
    headers: CSRF,
    cookies: admin,
    payload: { reference, code },
  });

describe('comprobantes verificables', () => {
  it('número consecutivo y código de verificación al aprobarse el pago; el dueño lo comprueba', async () => {
    const first = await createOrder();
    // Sin pagar no hay comprobante.
    const unpaid = await inject({
      method: 'GET',
      url: `/api/orders/${first.reference}`,
      cookies: first.cookies,
    });
    expect(unpaid.json<{ order: { receipt: unknown } }>().order.receipt).toBeNull();

    const a = await pay(first);
    const second = await createOrder();
    const b = await pay(second);
    expect(a.receipt?.number).toBe(1);
    expect(b.receipt?.number).toBe(2);
    expect(a.receipt?.verificationCode).toMatch(
      /^V1-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
    );
    expect(a.receipt?.verificationCode).not.toBe(b.receipt?.verificationCode);

    const ok = await verify(first.reference, a.receipt?.verificationCode ?? '');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      valid: true,
      number: 1,
      reference: first.reference,
      totalCop: first.totalCop,
      paymentId: a.paymentId,
      lastIssued: 2,
    });
    // Escrito a mano, en minúsculas y con espacios, también vale.
    const typed = (a.receipt?.verificationCode ?? '').toLowerCase().replace(/-/g, ' - ');
    expect((await verify(first.reference.toLowerCase(), typed)).json()).toMatchObject({
      valid: true,
    });

    // El correo del cliente lleva el número y el código.
    const mail = h.mailer.sent.find(
      (m) => m.subject === `Comprobante de pago · Pedido ${first.reference}`,
    );
    expect(mail?.text).toContain('Comprobante N.º: 000001');
    expect(mail?.text).toContain(`Código de verificación: ${a.receipt?.verificationCode}`);
  });

  it('un comprobante falso, de otro pedido o sin pago no pasa', async () => {
    const order = await createOrder();
    const { receipt } = await pay(order);
    const other = await createOrder();
    const code = receipt?.verificationCode ?? '';
    const forged = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`;
    expect((await verify(order.reference, forged)).json()).toMatchObject({
      valid: false,
      reason: 'codigo_no_coincide',
    });
    // El código de un pedido no sirve para otro.
    expect((await verify(other.reference, code)).json()).toMatchObject({
      valid: false,
      reason: 'sin_comprobante',
    });
    expect((await verify('TGS-NOEXISTE00', code)).json()).toMatchObject({
      valid: false,
      reason: 'no_existe',
    });
    // Versión de llave inexistente.
    expect((await verify(order.reference, code.replace(/^V1/, 'V9'))).json()).toMatchObject({
      valid: false,
    });
  });

  it('verificación pública: el auténtico pasa con datos mínimos; el falso o inexistente responde igual', async () => {
    const order = await createOrder();
    const { receipt, paymentId } = await pay(order);
    const code = receipt?.verificationCode ?? '';
    const check = (reference: string, value: string, remoteAddress?: string) =>
      h.app.inject({
        method: 'POST',
        url: '/api/receipts/verify',
        headers: CSRF,
        payload: { reference, code: value },
        ...(remoteAddress ? { remoteAddress } : { remoteAddress: `10.98.0.${(ip % 200) + 1}` }),
      });

    const real = await check(order.reference.toLowerCase(), code.toLowerCase());
    expect(real.statusCode, real.body).toBe(200);
    const body = real.json<Record<string, unknown>>();
    expect(body).toEqual({
      authentic: true,
      number: receipt?.number,
      reference: order.reference,
      totalCop: order.totalCop,
      status: 'PAID',
      paidAt: expect.any(String) as string,
    });
    // Nunca el ID del pago, el correo, el nombre ni el UID.
    expect(real.body).not.toContain(paymentId);
    expect(real.body).not.toContain('@');
    expect(real.body).not.toContain('Cliente Seguro');

    const forged = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`;
    const responses = await Promise.all([
      check(order.reference, forged),
      check('TGS-NOEXISTE00', code),
      check((await createOrder()).reference, code),
    ]);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ authentic: false });
    }
    expect((await check('no-es-referencia', code)).statusCode).toBe(400);
  });

  it('verificación pública: máximo 10 intentos cada 10 minutos por IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/receipts/verify',
        headers: CSRF,
        remoteAddress: '10.97.0.1',
        payload: { reference: 'TGS-NOEXISTE00', code: `V1-AAAA-AAAA-AAAA-AAA${i % 10}` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('el verificador es solo del dueño', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/admin/receipts/verify',
      headers: CSRF,
      payload: { reference: 'TGS-XXXXXXXXXX', code: 'V1-AAAA-AAAA-AAAA-AAAA' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('la base de datos no deja borrar ni alterar montos', () => {
  it('borrar o vaciar pedidos, pagos, productos o historial: rechazado', async () => {
    for (const statement of [
      sql`delete from orders`,
      sql`delete from order_items`,
      sql`delete from payments`,
      sql`delete from products`,
      sql`delete from fulfillments`,
      sql`truncate payments cascade`,
      sql`truncate orders cascade`,
      sql`delete from audit_events`,
      sql`truncate audit_seals`,
      sql`truncate audit_events`,
    ]) {
      await expect(h.database.db.execute(statement)).rejects.toThrow();
    }
    const [count] = await h.database.db.select({ n: sql<number>`count(*)::int` }).from(orders);
    expect(count?.n).toBeGreaterThan(0);
  });

  it('cambiar el total, la referencia o el comprobante de un pedido: rechazado', async () => {
    const order = await createOrder();
    await pay(order);
    for (const statement of [
      sql`update orders set total_cop = 1, subtotal_cop = 1 where public_ref = ${order.reference}`,
      sql`update orders set public_ref = 'TGS-FALSO00000' where public_ref = ${order.reference}`,
      sql`update orders set receipt_number = 999 where public_ref = ${order.reference}`,
      sql`update order_items set unit_price_cop = 1, line_total_cop = 1`,
    ]) {
      await expect(h.database.db.execute(statement)).rejects.toThrow();
    }
  });

  it('un cambio de precio hecho con SQL directo queda en el historial (actor database)', async () => {
    await h.database.db.execute(sql`update products set price_cop = 4100 where sku = 'ff-110'`);
    const [event] = await h.database.db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.action, 'product.db_change'), eq(auditEvents.actorType, 'database')),
      )
      .orderBy(sql`id desc`)
      .limit(1);
    expect(event?.data).toMatchObject({ sku: 'ff-110', priceCop: 4100, oldPriceCop: 4000 });
    await h.database.db.execute(sql`update products set price_cop = 4000 where sku = 'ff-110'`);
  });
});

describe('catálogo bloqueado', () => {
  it('con CATALOG_LOCKED nadie cambia precios desde el panel, ni el dueño; el intento queda registrado', async () => {
    const [product] = await h.database.db.select().from(products).where(eq(products.sku, 'ff-110'));
    h.deps.config.catalogLocked = true;
    try {
      const res = await inject({
        method: 'PUT',
        url: `/api/admin/products/${product?.id}`,
        headers: CSRF,
        cookies: admin,
        payload: {
          sku: 'ff-110',
          game: 'freefire',
          name: '100 + 10 Diamantes',
          units: 110,
          priceCop: 1000,
        },
      });
      expect(res.statusCode).toBe(423);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CATALOG_LOCKED');
      const [after] = await h.database.db.select().from(products).where(eq(products.sku, 'ff-110'));
      expect(after?.priceCop).toBe(4000);
      const blocked = await h.database.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'product.change_blocked'));
      expect(blocked.at(-1)).toMatchObject({ actorType: 'admin', entityId: 'ff-110' });
    } finally {
      h.deps.config.catalogLocked = false;
    }
  });
});

describe('sellos de integridad', () => {
  it('sella el historial, lo verifica y lo muestra al dueño y al testigo diario', async () => {
    // Recién creados no se sellan (margen de 10 min para transacciones abiertas).
    expect(await sealAudit(h.deps)).toBe(0);
    h.clock.now = new Date(Date.now() + 11 * 60_000);
    expect(await runJob(h.deps, 'sealAudit')).toBeGreaterThan(0);
    expect(await sealAudit(h.deps)).toBe(0); // nada nuevo

    const chain = await verifyChain(h.deps);
    expect(chain).toMatchObject({ ok: true, seals: 1, brokenAt: null });
    expect(chain.head?.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);

    const panel = await inject({ method: 'GET', url: '/api/admin/integrity', cookies: admin });
    expect(panel.statusCode).toBe(200);
    expect(panel.json()).toMatchObject({
      chain: { ok: true, seals: 1 },
      // Cinco pedidos pagados en las pruebas anteriores de comprobantes de este archivo.
      lastReceipt: 5,
      catalog: { locked: false, products: expect.any(Number) as number },
    });

    // Testigo externo (GitHub Actions): solo con la llave, sin datos de pedidos.
    const noKey = await inject({ method: 'GET', url: '/api/internal/integrity' });
    expect(noKey.statusCode).toBe(404);
    const witness = await inject({
      method: 'GET',
      url: '/api/internal/integrity',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(witness.statusCode).toBe(200);
    expect(witness.body).not.toContain('@example.com');
    expect(witness.json()).toMatchObject({ chain: { ok: true, head: chain.head } });
  });

  it('si alguien con acceso total a la base cambia o borra un evento sellado, se detecta', async () => {
    // El atacante quita la protección (solo el dueño de la base puede), altera y la restaura.
    const [target] = await h.database.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .orderBy(auditEvents.id)
      .limit(1);
    await asTableOwner(async (owner) => {
      await owner.query('alter table audit_events disable trigger user');
      try {
        await owner.query('update audit_events set action = $1 where id = $2', [
          'order.nada',
          target?.id ?? 0,
        ]);
      } finally {
        await owner.query('alter table audit_events enable trigger user');
      }
    });
    expect(await verifyChain(h.deps)).toMatchObject({
      ok: false,
      brokenAt: 1,
      reason: 'un evento sellado fue modificado',
    });
    const witness = await inject({
      method: 'GET',
      url: '/api/internal/integrity',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(witness.statusCode).toBe(500); // el diagnóstico diario queda en rojo

    await asTableOwner(async (owner) => {
      await owner.query('alter table audit_events disable trigger user');
      try {
        await owner.query('delete from audit_events where id = $1', [target?.id ?? 0]);
      } finally {
        await owner.query('alter table audit_events enable trigger user');
      }
    });
    expect(await verifyChain(h.deps)).toMatchObject({
      ok: false,
      brokenAt: 1,
      reason: 'faltan o sobran eventos',
    });
  });
});

// H-01 (docs/seguridad/HALLAZGOS.md): con el rol de privilegios mínimos, la aplicación no puede
// quitar las protecciones de la base. Solo corre con TEST_APP_DATABASE_URL (así en la CI).
describe.skipIf(!testAppDatabaseUrl())('rol de la aplicación con privilegios mínimos', () => {
  it('no es dueño de las tablas ni puede desactivar triggers, vaciar o editar el historial', async () => {
    const [who] = (
      await h.database.pool.query<{ owner: boolean; bypass: boolean; superuser: boolean }>(
        `select pg_has_role(current_user, tableowner, 'MEMBER') as owner,
                r.rolbypassrls as bypass, r.rolsuper as superuser
           from pg_tables t, pg_roles r
          where t.schemaname = 'public' and t.tablename = 'orders' and r.rolname = current_user`,
      )
    ).rows;
    expect(who).toEqual({ owner: false, bypass: false, superuser: false });
    for (const statement of [
      'alter table orders disable trigger all',
      'alter table audit_events disable trigger user',
      "update audit_events set action = 'order.nada'",
      "update audit_seals set hash = repeat('0', 64)",
      'truncate sessions',
      'drop table blocklist',
      'create table intruso (id int)',
    ]) {
      const error = await h.database.db.execute(sql.raw(statement)).then(
        () => undefined,
        (e: unknown) => e as { cause?: { code?: string } },
      );
      // 42501 = insufficient_privilege (sin permiso o «must be owner»).
      expect(error?.cause?.code, statement).toBe('42501');
    }
  });

  it('sí puede depurar lo temporal (sesiones vencidas) y escribir pedidos', async () => {
    await expect(
      h.database.db.execute(sql`delete from sessions where expires_at < now() - interval '1 year'`),
    ).resolves.toBeDefined();
    await expect(h.database.db.execute(sql`select count(*) from orders`)).resolves.toBeDefined();
  });
});
