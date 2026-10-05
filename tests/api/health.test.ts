import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers.js';

interface ReadyBody {
  status: string;
  checks: { database: string };
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/health', () => {
  it('responde ok sin depender de la base de datos', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('incluye x-request-id y reutiliza uno entrante válido', async () => {
    app = await buildTestApp();
    const generated = await app.inject({ method: 'GET', url: '/api/health' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'req-12345678' },
    });
    expect(echoed.headers['x-request-id']).toBe('req-12345678');
  });
});

describe('GET /api/ready', () => {
  it('responde 503 si la base de datos no está configurada', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyBody>()).toEqual({
      status: 'not_ready',
      checks: { database: 'not_configured' },
    });
  });

  it('responde 200 si la base de datos responde', async () => {
    app = await buildTestApp({ database: { ping: () => Promise.resolve() } });
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json<ReadyBody>()).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('responde 503 sin filtrar detalles si la base de datos falla', async () => {
    app = await buildTestApp({
      database: {
        ping: () => Promise.reject(new Error('password authentication failed for user x')),
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyBody>().checks.database).toBe('unavailable');
    expect(res.body).not.toContain('password');
  });

  it('responde 503 si la base de datos no contesta a tiempo', async () => {
    app = await buildTestApp({
      database: { ping: () => new Promise<void>(() => {}) },
      readinessTimeoutMs: 20,
    });
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ReadyBody>().checks.database).toBe('unavailable');
  });
});
