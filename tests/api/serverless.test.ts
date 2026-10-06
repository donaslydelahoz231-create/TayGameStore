import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Entrada de Vercel (src/server/serverless.ts): la misma app atiende peticiones sin `listen`, y
 * /api/internal/jobs solo responde con el CRON_SECRET correcto.
 */
let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('CRON_SECRET', 'secreto-de-prueba-cron');
  vi.stubEnv('DATABASE_URL', '');
  const { default: handler } = await import('../../src/server/serverless.js');
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server?.close(resolve));
});

describe('función de Vercel', () => {
  it('atiende la API como el servidor normal', async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paymentMethod: 'mercadopago' });
  });

  it('sin base de datos, /api/ready responde 503 (no se cae)', async () => {
    const res = await fetch(`${base}/api/ready`);
    expect(res.status).toBe(503);
  });

  it('las tareas programadas no existen para quien no trae el secreto', async () => {
    for (const authorization of ['', 'Bearer otro', 'secreto-de-prueba-cron']) {
      const res = await fetch(`${base}/api/internal/jobs`, {
        headers: authorization ? { authorization } : {},
      });
      expect(res.status).toBe(404);
    }
  });

  it('con el secreto correcto y sin base de datos lo dice sin ejecutar nada', async () => {
    const res = await fetch(`${base}/api/internal/jobs`, {
      headers: { authorization: 'Bearer secreto-de-prueba-cron' },
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'NO_DATABASE' } });
  });
});
