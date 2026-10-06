import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHarness,
  resetDatabase,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * /api/internal/jobs en el servidor de larga duración (Render u otro): el flujo de GitHub
 * `tareas.yml` lo llama cada 10 minutos para conciliar pagos y reintentar avisos.
 */
const SECRET = 'llave-de-tareas-de-prueba-0123456789abcdef';
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ CRON_SECRET: SECRET });
});
afterAll(async () => {
  await h?.close();
});

describe('tareas programadas por HTTP', () => {
  it('sin la llave correcta la ruta no existe (404 como cualquier otra)', async () => {
    for (const authorization of [undefined, 'Bearer otra-llave', SECRET, `bearer ${SECRET}`]) {
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/internal/jobs',
        headers: authorization ? { authorization } : {},
      });
      expect(res.statusCode, String(authorization)).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });

  it('con la llave ejecuta todas las tareas y lo informa', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/internal/jobs',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json<{ ok: boolean; results: Record<string, unknown> }>();
    expect(body.ok).toBe(true);
    expect(Object.keys(body.results).sort()).toEqual(
      [
        'cleanup',
        'expireOrders',
        'reconcilePayments',
        'releaseClaims',
        'retryEvents',
        'sendNotifications',
      ].sort(),
    );
    expect(Object.values(body.results)).not.toContain('error');
  });

  it('si una tarea falla responde 500 (el flujo de GitHub queda en rojo y se ve)', async () => {
    const broken = await createHarness({ CRON_SECRET: SECRET });
    await broken.database.close(); // base de datos caída
    const res = await broken.app.inject({
      method: 'GET',
      url: '/api/internal/jobs',
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json<{ ok: boolean; results: Record<string, unknown> }>();
    expect(body.ok).toBe(false);
    expect(Object.values(body.results)).toContain('error');
    await broken.app.close();
  });

  it('sin CRON_SECRET configurado la ruta no existe aunque se intente adivinar', async () => {
    const plain = await createHarness();
    try {
      const res = await plain.app.inject({
        method: 'GET',
        url: '/api/internal/jobs',
        headers: { authorization: 'Bearer ' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
