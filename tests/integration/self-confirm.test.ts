import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, orders } from '../../src/server/db/schema.js';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Compra estilo LootBar sin proveedor de consulta (PLAYER_VERIFICATION=customer, valor por
 * defecto): el cliente escribe su ID dos veces, lo confirma y el pedido nace listo para pagar,
 * sin esperar a que el equipo verifique el nickname.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PLAYER_VERIFICATION: 'customer' }, { playerVerifier: false });
  await seedProducts(h);
});
afterAll(async () => {
  await h?.close();
});

let ip = 0;
async function checkout(
  extra: Record<string, unknown>,
  playerUid = '512345678',
  cookies?: Record<string, string>,
) {
  ip += 1;
  return h.app.inject({
    method: 'POST',
    url: '/api/checkout',
    remoteAddress: `10.20.30.${ip}`,
    headers: CSRF,
    ...(cookies ? { cookies } : {}),
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      customerName: 'Cliente Directo',
      customerEmail: `directo-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
      ...extra,
    },
  });
}

describe('el cliente confirma su ID y paga sin esperar al equipo', () => {
  it('la tienda anuncia el modo de confirmación del cliente', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json<{ playerVerification: string }>().playerVerification).toBe('customer');
  });

  it('sin repetir el ID (o con otro ID) no se crea el pedido', async () => {
    const missing = await checkout({});
    expect(missing.statusCode).toBe(400);
    expect(missing.json<ApiErrorBody>().error.code).toBe('PLAYER_CONFIRMATION_REQUIRED');

    const other = await checkout({ confirmedPlayerUid: '512345679' });
    expect(other.statusCode).toBe(400);
    expect(other.json<ApiErrorBody>().error.code).toBe('PLAYER_CONFIRMATION_REQUIRED');
    expect(await h.database.db.select().from(orders)).toHaveLength(0);
  });

  it('con el ID confirmado el pedido nace listo para pagar y se puede pagar al instante', async () => {
    const res = await checkout({ confirmedPlayerUid: '512345678' });
    expect(res.statusCode).toBe(201);
    const { order } = res.json<{
      order: {
        reference: string;
        status: string;
        verification: { status: string; nickname: string | null };
        payment: { canPay: boolean };
      };
    }>();
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.verification).toMatchObject({ status: 'CONFIRMED', nickname: null });
    expect(order.payment.canPay).toBe(true);

    // Queda constancia de quién confirmó el ID (para resolver reclamos).
    const [row] = await h.database.db
      .select()
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    expect(row).toMatchObject({ verificationNote: 'cliente', playerUid: '512345678' });
    expect(row?.confirmedAt).toBeInstanceOf(Date);
    const [created] = await h.database.db
      .select({ data: auditEvents.data })
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, row?.id ?? ''), eq(auditEvents.action, 'order.created')));
    expect(created?.data).toMatchObject({ verification: 'cliente' });

    const cookies = Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
    const pay = await h.app.inject({
      method: 'POST',
      url: `/api/orders/${order.reference}/pay`,
      headers: CSRF,
      cookies,
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json<{ checkoutUrl: string }>().checkoutUrl).toMatch(/^https?:\/\//);
  });

  it('guarda el servidor de Free Fire elegido y lo devuelve en el pedido', async () => {
    const res = await checkout(
      { confirmedPlayerUid: '523456789', playerServer: 'brasil' },
      '523456789',
    );
    expect(res.statusCode).toBe(201);
    const { order } = res.json<{ order: { reference: string; playerServer: string | null } }>();
    expect(order.playerServer).toBe('brasil');
    const [row] = await h.database.db
      .select({ playerServer: orders.playerServer })
      .from(orders)
      .where(eq(orders.publicRef, order.reference));
    expect(row?.playerServer).toBe('brasil');

    // Sin servidor (clientes con la página anterior en caché) el pedido se crea igual.
    const legacy = await checkout({ confirmedPlayerUid: '523456780' }, '523456780');
    expect(legacy.statusCode).toBe(201);
    expect(legacy.json<{ order: { playerServer: string | null } }>().order.playerServer).toBeNull();
  });

  it('rechaza un servidor que no existe', async () => {
    const res = await checkout(
      { confirmedPlayerUid: '534567890', playerServer: 'marte' },
      '534567890',
    );
    expect(res.statusCode).toBe(400);
  });

  it('la misma clave de compra con otro servidor no reutiliza el pedido', async () => {
    const same = {
      checkoutKey: randomUUID(),
      customerEmail: 'servidor@example.com',
      confirmedPlayerUid: '545678901',
    };
    const first = await checkout({ ...same, playerServer: 'asia' }, '545678901');
    expect(first.statusCode).toBe(201);
    // El mismo navegador (sus cookies) repite la compra: recibe el mismo pedido.
    const cookies = Object.fromEntries(first.cookies.map((c) => [c.name, c.value]));
    const again = await checkout({ ...same, playerServer: 'asia' }, '545678901', cookies);
    expect(again.statusCode).toBeLessThan(300);
    expect(again.json<{ order: { reference: string } }>().order.reference).toBe(
      first.json<{ order: { reference: string } }>().order.reference,
    );
    const changed = await checkout({ ...same, playerServer: 'europa' }, '545678901', cookies);
    expect(changed.statusCode).toBe(409);
    expect(changed.json<ApiErrorBody>().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('en modo `operator` la confirmación del cliente no salta la verificación del equipo', async () => {
    h.deps.config.orders.playerVerification = 'operator';
    try {
      const res = await checkout({ confirmedPlayerUid: '598765432' }, '598765432');
      expect(res.statusCode).toBe(201);
      expect(res.json<{ order: { status: string } }>().order.status).toBe('AWAITING_VERIFICATION');
    } finally {
      h.deps.config.orders.playerVerification = 'customer';
    }
  });
});
