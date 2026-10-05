import { and, eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, blocklist } from '../../src/server/db/schema.js';
import { hashIp } from '../../src/server/lib/crypto.js';
import type { ApiErrorBody } from '../../src/shared/errors.js';
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

let h: Harness;
let admin: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'admin-sec' }))
    .cookie;
});

afterAll(async () => {
  await h?.close();
});

beforeEach(() => {
  h.clock.now = new Date();
});

let ipCounter = 10;
const freshIp = () => `198.51.100.${(ipCounter += 1)}`;
const from = (ip: string, options: InjectOptions) =>
  h.app.inject({ remoteAddress: ip, ...options });
const ipHashOf = (ip: string) => hashIp(h.deps.config.secrets.ipHashPepper, ip);

async function findBlock(ip: string) {
  const [row] = await h.database.db
    .select()
    .from(blocklist)
    .where(and(eq(blocklist.kind, 'ip_hash'), eq(blocklist.value, ipHashOf(ip))));
  return row;
}

/** El bloqueo se guarda en onResponse, después de enviar la respuesta: se espera a la fila. */
async function blockRow(ip: string) {
  return vi.waitFor(async () => {
    const row = await findBlock(ip);
    if (!row) throw new Error('bloqueo aún no guardado');
    return row;
  });
}

describe('escudo anti-abuso: escáneres', () => {
  it('un escáner queda bloqueado en todas las rutas; las demás IPs siguen igual', async () => {
    const attacker = freshIp();
    const normal = freshIp();
    expect((await from(attacker, { method: 'GET', url: '/.env' })).statusCode).toBe(404);
    expect((await from(attacker, { method: 'GET', url: '/wp-login.php' })).statusCode).toBe(404);

    const catalog = await from(attacker, { method: 'GET', url: '/api/catalog' });
    expect(catalog.statusCode).toBe(403);
    expect(catalog.json<ApiErrorBody>().error.code).toBe('BLOCKED');
    expect((await from(normal, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(200);

    // Persistido (sobrevive a reinicios), con caducidad y motivo; nunca la IP en claro.
    const row = await blockRow(attacker);
    expect(row?.reason).toMatch(/^auto: probe×2/);
    const minutes = ((row?.expiresAt?.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expect(row?.value).not.toContain(attacker);

    const event = await vi.waitFor(async () => {
      const [row] = await h.database.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'security.auto_block'));
      if (!row) throw new Error('auditoría aún no guardada');
      return row;
    });
    expect(event.data).toMatchObject({ alert: true, offense: 1 });
  });

  it('nunca bloquea los webhooks de Mercado Pago ni las sondas de salud', async () => {
    const attacker = freshIp();
    await from(attacker, { method: 'GET', url: '/.git/config' });
    await from(attacker, { method: 'GET', url: '/phpmyadmin/' });
    expect((await from(attacker, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(403);
    expect((await from(attacker, { method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const webhook = await from(attacker, {
      method: 'POST',
      url: '/api/webhooks/mercadopago?data.id=1&type=payment',
      headers: { 'x-signature': 'firma-invalida', 'x-request-id': 'r-1' },
      payload: { type: 'payment', data: { id: '1' } },
    });
    expect(webhook.statusCode).toBe(401); // llega a la ruta: la rechaza la firma, no el escudo
  });

  it('el bloqueo caduca solo', async () => {
    const attacker = freshIp();
    await from(attacker, { method: 'GET', url: '/xmlrpc.php' });
    await from(attacker, { method: 'GET', url: '/backup.sql' });
    expect((await from(attacker, { method: 'GET', url: '/api/config' })).statusCode).toBe(403);
    h.clock.now = new Date(Date.now() + 16 * 60_000);
    expect((await from(attacker, { method: 'GET', url: '/api/config' })).statusCode).toBe(200);
  });

  it('el operador lo quita desde el panel y el efecto es inmediato', async () => {
    const attacker = freshIp();
    await from(attacker, { method: 'GET', url: '/.aws/credentials' });
    await from(attacker, { method: 'GET', url: '/cgi-bin/test' });
    expect((await from(attacker, { method: 'GET', url: '/api/config' })).statusCode).toBe(403);
    const row = await blockRow(attacker);
    const removed = await from(freshIp(), {
      method: 'DELETE',
      url: `/api/admin/blocklist/${row?.id}`,
      headers: CSRF,
      cookies: admin,
    });
    expect(removed.statusCode).toBe(200);
    expect((await from(attacker, { method: 'GET', url: '/api/config' })).statusCode).toBe(200);
  });

  it('un administrador con MFA nunca queda fuera de su panel', async () => {
    const ip = freshIp();
    await from(ip, { method: 'GET', url: '/.env', cookies: admin });
    await from(ip, { method: 'GET', url: '/wp-admin/', cookies: admin });
    expect(
      (await from(ip, { method: 'GET', url: '/api/admin/blocklist', cookies: admin })).statusCode,
    ).toBe(200);
    expect(await findBlock(ip)).toBeUndefined();
  });
});

describe('escudo anti-abuso: otras señales', () => {
  it('CSRF repetido (peticiones forjadas) termina en bloqueo', async () => {
    const attacker = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await from(attacker, {
        method: 'POST',
        url: '/api/checkout',
        headers: { origin: 'https://sitio-malicioso.example', 'x-tgs-csrf': '1' },
        payload: {},
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([403, 403, 403, 403, 403]);
    expect((await from(attacker, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(403);
    expect((await blockRow(attacker))?.reason).toContain('csrf×5');
  });

  it('enumerar referencias de pedidos ajenas termina en bloqueo', async () => {
    const attacker = freshIp();
    for (let i = 0; i < 20; i += 1) {
      const ref = `TGS-${String(i).padStart(10, '0')}`;
      await from(attacker, { method: 'GET', url: `/api/orders/${ref}` });
    }
    expect((await from(attacker, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(403);
  });

  it('una ráfaga por encima del límite global por IP recibe 429 y luego bloqueo', async () => {
    const attacker = freshIp();
    const limit = h.deps.config.rateLimitGlobalPerMinute;
    let first429 = -1;
    for (let i = 0; i < limit + 12; i += 1) {
      const res = await from(attacker, { method: 'GET', url: '/api/config' });
      if (res.statusCode === 429 && first429 < 0) first429 = i;
      if (res.statusCode === 403) break;
    }
    expect(first429).toBe(limit);
    expect((await from(attacker, { method: 'GET', url: '/api/config' })).statusCode).toBe(403);
  });

  it('un bloqueo manual permanente no se acorta con uno automático', async () => {
    const attacker = freshIp();
    await h.database.db.insert(blocklist).values({
      kind: 'ip_hash',
      value: ipHashOf(attacker),
      reason: 'manual: fraude confirmado',
      expiresAt: null,
    });
    await h.shield.refresh(true);
    expect((await from(attacker, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(403);
    h.clock.now = new Date(Date.now() + 48 * 3_600_000);
    expect((await from(attacker, { method: 'GET', url: '/api/catalog' })).statusCode).toBe(403);
    expect((await blockRow(attacker))?.expiresAt).toBeNull();
  });

  it('el panel muestra las alertas de seguridad', async () => {
    const res = await from(freshIp(), { method: 'GET', url: '/api/admin/alerts', cookies: admin });
    expect(res.statusCode).toBe(200);
    const alerts = res.json<{ autoBlocks24h: number; activeIpBlocks: number }>();
    expect(alerts.autoBlocks24h).toBeGreaterThanOrEqual(5);
    expect(alerts.activeIpBlocks).toBeGreaterThanOrEqual(1);
  });
});
