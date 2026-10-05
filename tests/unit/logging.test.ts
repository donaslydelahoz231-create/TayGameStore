import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { generateRequestId, sanitizeLoggedUrl } from '../../src/server/plugins/logging.js';

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
