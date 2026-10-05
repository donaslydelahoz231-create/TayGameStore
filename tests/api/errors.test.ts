import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import { AppError } from '../../src/server/plugins/errors.js';
import { buildTestApp } from '../helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
  app.get('/test/boom', () => {
    throw new Error('detalle interno secreto');
  });
  app.get('/test/app-error', () => {
    throw new AppError(
      'CHECKOUT_DISABLED',
      503,
      'Las compras no están habilitadas en este momento.',
    );
  });
  app.post('/test/zod', (request) =>
    z.object({ uid: z.string().regex(/^\d+$/) }).parse(request.body),
  );
  app.post('/test/echo', (request) => request.body);
});

afterEach(async () => {
  await app.close();
});

describe('manejo de errores', () => {
  it('devuelve 404 JSON con código estable y requestId', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-existe' });
    expect(res.statusCode).toBe(404);
    const body = res.json<ApiErrorBody>();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('oculta los detalles de errores inesperados', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json<ApiErrorBody>().error.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('secreto');
    expect(res.body).not.toContain('stack');
  });

  it('respeta el código y el estado de AppError', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/app-error' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ApiErrorBody>().error.code).toBe('CHECKOUT_DISABLED');
  });

  it('convierte errores de Zod en 400 VALIDATION_ERROR sin devolver la entrada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/zod',
      payload: { uid: 'abc<script>' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiErrorBody>().error.code).toBe('VALIDATION_ERROR');
    expect(res.body).not.toContain('<script>');
  });

  it('responde 400 BAD_REQUEST ante JSON mal formado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"roto":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ApiErrorBody>().error.code).toBe('BAD_REQUEST');
  });

  it('responde 413 PAYLOAD_TOO_LARGE si el cuerpo supera el límite', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ relleno: 'x'.repeat(70 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ApiErrorBody>().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
