import type { IncomingMessage } from 'node:http';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { hashIp } from '../../src/server/lib/crypto.js';
import {
  buildLoggerOptions,
  generateRequestId,
  sanitizeLoggedUrl,
} from '../../src/server/plugins/logging.js';
import { testConfig } from '../helpers.js';

function requestWith(header?: string): IncomingMessage {
  return { headers: header === undefined ? {} : { 'x-request-id': header } } as IncomingMessage;
}

describe('generateRequestId', () => {
  it('reutiliza un x-request-id con formato seguro', () => {
    expect(generateRequestId(requestWith('abc-123_XYZ.789'))).toBe('abc-123_XYZ.789');
  });

  it('genera uno nuevo si falta o tiene caracteres peligrosos', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(generateRequestId(requestWith())).toMatch(uuid);
    expect(generateRequestId(requestWith('id\nfalso=1 inyectado'))).toMatch(uuid);
    expect(generateRequestId(requestWith('corto'))).toMatch(uuid);
  });
});

describe('sanitizeLoggedUrl', () => {
  it('no registra code ni state del callback de OAuth', () => {
    expect(sanitizeLoggedUrl('/auth/google/callback?code=abc&state=xyz')).toBe(
      '/auth/google/callback?[REDACTED]',
    );
    expect(sanitizeLoggedUrl('/api/orders/TGS-1?x=1')).toBe('/api/orders/TGS-1?x=1');
  });
});

describe('registro de cada petición', () => {
  it('nunca guarda la IP en claro: solo su huella, la misma que usa la base', () => {
    const config = testConfig({ IP_HASH_PEPPER: 'pimienta-de-prueba-0123456789abcdef' });
    const options = buildLoggerOptions(config);
    const serialize = (options as { serializers: { req: (r: FastifyRequest) => object } })
      .serializers.req;
    const logged = serialize({
      method: 'GET',
      url: '/api/catalog',
      host: 'tienda.example',
      ip: '203.0.113.77',
    } as FastifyRequest);
    expect(JSON.stringify(logged)).not.toContain('203.0.113.77');
    expect(logged).toEqual({
      method: 'GET',
      url: '/api/catalog',
      host: 'tienda.example',
      ipHash: hashIp(config.secrets.ipHashPepper, '203.0.113.77'),
    });
  });
});
