import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import { requireCheckoutEnabled } from '../../src/server/plugins/maintenance.js';
import { buildTestApp, CSRF, testConfig } from '../helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function appWithTestRoutes(env: Record<string, string>): Promise<FastifyInstance> {
  const instance = await buildTestApp({ env });
  const { flags } = testConfig(env);
  instance.post('/test/write', () => ({ ok: true }));
  instance.post('/api/webhooks/test', () => ({ received: true }));
  instance.post('/test/checkout', { preHandler: requireCheckoutEnabled(flags) }, () => ({
    ok: true,
  }));
  return instance;
}

describe('modo mantenimiento', () => {
  it('bloquea escrituras con 503 MAINTENANCE_MODE', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/test/write', headers: CSRF });
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiErrorBody>().error.code).toBe('MAINTENANCE_MODE');
  });

  it('permite lecturas y health', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('sigue aceptando webhooks (no se pierden notificaciones de pagos)', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/test' });
    expect(res.statusCode).toBe(200);
  });

  it('no permite eludir la exención con rutas manipuladas', async () => {
    app = await appWithTestRoutes({ MAINTENANCE_MODE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/api/webhooks/../../test/write' });
    expect(res.statusCode).toBe(503);
  });

  it('no interfiere cuando está desactivado', async () => {
    app = await appWithTestRoutes({});
    const res = await app.inject({ method: 'POST', url: '/test/write', headers: CSRF });
    expect(res.statusCode).toBe(200);
  });
});

describe('CHECKOUT_ENABLED', () => {
  it('rechaza compras con 503 CHECKOUT_DISABLED por defecto', async () => {
    app = await appWithTestRoutes({});
    const res = await app.inject({ method: 'POST', url: '/test/checkout', headers: CSRF });
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiErrorBody>().error.code).toBe('CHECKOUT_DISABLED');
  });

  it('permite la ruta cuando está habilitado (solo fuera de producción)', async () => {
    app = await appWithTestRoutes({ CHECKOUT_ENABLED: 'true' });
    const res = await app.inject({ method: 'POST', url: '/test/checkout', headers: CSRF });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/config', () => {
  it('expone los interruptores sin secretos', async () => {
    app = await buildTestApp({
      env: { MAINTENANCE_MODE: 'true', DATABASE_URL: 'postgres://u:secreto@h/db' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      maintenanceMode: true,
      checkoutEnabled: false,
      paymentsEnabled: false,
      paymentsMode: null,
      paymentMethod: 'mercadopago',
      auth: { google: false, discord: false, facebook: false },
      playerLookup: false,
      emailUpdates: false,
      support: { whatsapp: null, email: null },
      termsVersion: '2026-10-05',
      limits: { maxUnitsPerProduct: 5, maxOrderTotalCop: 1000000 },
    });
    expect(res.body).not.toContain('secreto');
  });
});
