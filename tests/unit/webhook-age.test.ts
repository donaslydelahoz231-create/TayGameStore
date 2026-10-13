import { describe, expect, it } from 'vitest';
import { webhookSignatureAge } from '../../src/server/services/payments.js';

// H-04: se registra la antigüedad del `ts` firmado antes de activar una tolerancia.
describe('webhookSignatureAge', () => {
  const now = new Date('2024-01-10T17:50:10Z'); // 1704909010 s

  it('interpreta un ts de 10 cifras como segundos (ejemplo de la documentación)', () => {
    expect(webhookSignatureAge('ts=1704908010,v1=abc123', now)).toEqual({
      seconds: 1000,
      unit: 'seconds',
    });
  });

  it('detecta milisegundos si el ts tiene 13 cifras', () => {
    expect(webhookSignatureAge('ts=1704909005000,v1=abc', now)).toEqual({
      seconds: 5,
      unit: 'milliseconds',
    });
  });

  it('acepta espacios y otro orden de las partes', () => {
    expect(webhookSignatureAge('v1=abc, ts=1704909010', now)).toEqual({
      seconds: 0,
      unit: 'seconds',
    });
  });

  it('sin ts válido no inventa una antigüedad', () => {
    for (const header of [undefined, '', 'v1=abc', 'ts=abc,v1=x', 'xts=1704908010,v1=x']) {
      expect(webhookSignatureAge(header, now)).toBeUndefined();
    }
  });
});
