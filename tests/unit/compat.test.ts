import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasOwn, timeoutSignal, uuid } from '../../src/web/js/store/compat.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('compatibilidad con navegadores antiguos', () => {
  it('uuid() usa crypto.randomUUID o, si no existe, genera un UUID v4 válido', () => {
    expect(uuid()).toMatch(UUID_V4);
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => webcrypto.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('timeoutSignal() aborta a tiempo también sin AbortSignal.timeout', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AbortSignal', { ...AbortSignal, timeout: undefined });
    const signal = timeoutSignal(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  it('hasOwn() solo acepta claves propias', () => {
    expect(hasOwn({ freefire: 1 }, 'freefire')).toBe(true);
    expect(hasOwn({}, 'toString')).toBe(false);
    expect(hasOwn({}, '__proto__')).toBe(false);
  });
});
