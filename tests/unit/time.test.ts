import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from '../../src/server/lib/time.js';

describe('withTimeout', () => {
  it('devuelve el resultado si termina a tiempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rechaza con TimeoutError si excede el plazo', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('propaga el error original', async () => {
    await expect(withTimeout(Promise.reject(new Error('fallo')), 50)).rejects.toThrow('fallo');
  });
});
