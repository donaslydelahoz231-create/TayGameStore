import { describe, expect, it } from 'vitest';
import type { Keyring } from '../../src/server/config/env.js';
import { catalogFingerprint } from '../../src/server/domain/catalog-fingerprint.js';
import { eventDigest, sealHash } from '../../src/server/services/integrity.js';
import {
  codeMatches,
  normalizeCode,
  receiptVerificationCode,
} from '../../src/server/services/receipts.js';

const keyring = (entries: [number, number][]): Keyring => ({
  activeVersion: entries[0]?.[0] ?? 1,
  keys: new Map(entries.map(([v, fill]) => [v, Buffer.alloc(32, fill)])),
});
const facts = { number: 42, reference: 'TGS-ABCDEFGHJK', totalCop: 33000, paymentId: '123456789' };

describe('código de verificación del comprobante', () => {
  const keys = keyring([[1, 7]]);
  const code = receiptVerificationCode(keys, facts);

  it('formato legible y estable', () => {
    expect(code).toMatch(/^V1-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(receiptVerificationCode(keys, facts)).toBe(code);
  });

  it('cambia si cambia cualquier dato del comprobante', () => {
    for (const altered of [
      { ...facts, number: 43 },
      { ...facts, reference: 'TGS-ABCDEFGHJM' },
      { ...facts, totalCop: 3300 },
      { ...facts, paymentId: '123456780' },
    ]) {
      expect(codeMatches(keys, altered, code)).toBe(false);
    }
    expect(codeMatches(keys, facts, code)).toBe(true);
  });

  it('sin la llave del servidor no se puede fabricar', () => {
    expect(receiptVerificationCode(keyring([[1, 8]]), facts)).not.toBe(code);
    expect(codeMatches(keyring([[1, 8]]), facts, code)).toBe(false);
  });

  it('rotar la llave no invalida los comprobantes ya emitidos', () => {
    const rotated = keyring([
      [2, 9],
      [1, 7],
    ]);
    expect(codeMatches(rotated, facts, code)).toBe(true);
    expect(receiptVerificationCode(rotated, facts)).toMatch(/^V2-/);
  });

  it('acepta lo que escribe una persona (minúsculas, espacios, O por 0)', () => {
    const typed = code.toLowerCase().replace(/0/g, 'o').replace(/-/g, ' - ');
    expect(normalizeCode(typed)).toBe(code);
    expect(codeMatches(keys, facts, typed)).toBe(true);
    expect(codeMatches(keys, facts, 'basura')).toBe(false);
  });
});

describe('huella del catálogo', () => {
  const items = [
    { sku: 'ff-110', units: 110, listPriceCop: 4000, promoPriceCop: 3800 },
    { sku: 'ff-341', units: 341, listPriceCop: 11000, promoPriceCop: null },
  ];

  it('no depende del orden; cambia con cualquier precio o paquete', () => {
    const base = catalogFingerprint(items);
    expect(base).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(catalogFingerprint([...items].reverse())).toBe(base);
    expect(catalogFingerprint([{ ...items[0]!, listPriceCop: 3999 }, items[1]!])).not.toBe(base);
    expect(catalogFingerprint([{ ...items[0]!, promoPriceCop: null }, items[1]!])).not.toBe(base);
    expect(catalogFingerprint([items[0]!])).not.toBe(base);
  });
});

describe('cadena de sellos', () => {
  const event = {
    id: 1,
    createdAt: new Date('2026-10-11T12:00:00.000Z'),
    entityType: 'order',
    entityId: 'x',
    action: 'order.transition',
    fromStatus: 'AWAITING_PAYMENT',
    toStatus: 'PAID',
    actorType: 'webhook',
    actorId: null,
    data: { paymentId: 'p1' },
    ipHash: null,
  };

  it('la huella de un evento cambia con cualquier campo', () => {
    const base = eventDigest(event);
    expect(eventDigest({ ...event, toStatus: 'DELIVERED' })).not.toBe(base);
    expect(eventDigest({ ...event, data: { paymentId: 'p2' } })).not.toBe(base);
    expect(eventDigest({ ...event, createdAt: new Date('2026-10-11T12:00:00.001Z') })).not.toBe(
      base,
    );
  });

  it('cada sello depende del anterior', () => {
    const digests = [eventDigest(event)];
    const a = sealHash('0'.repeat(64), 1, 1, digests);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sealHash('1'.repeat(64), 1, 1, digests)).not.toBe(a);
    expect(sealHash('0'.repeat(64), 2, 1, digests)).not.toBe(a);
  });
});
