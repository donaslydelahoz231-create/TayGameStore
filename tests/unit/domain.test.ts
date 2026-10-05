import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeTotals, effectivePrice } from '../../src/server/domain/pricing.js';
import {
  canTransitionFulfillment,
  canTransitionOrder,
  FULFILLMENT_TRANSITIONS,
  ORDER_TRANSITIONS,
} from '../../src/server/domain/state-machines.js';
import { FULFILLMENT_STATUSES, ORDER_STATUSES } from '../../src/server/db/schema.js';
import { mapMercadoPagoStatus } from '../../src/server/integrations/payments/gateway.js';
import { MercadoPagoPaymentGateway } from '../../src/server/integrations/payments/mercadopago.js';
import {
  OidcError,
  pkceChallenge,
  validateIdTokenClaims,
} from '../../src/server/integrations/google/oidc.js';
import {
  decrypt,
  encrypt,
  keyedHash,
  publicOrderRef,
  verifyKeyedHash,
} from '../../src/server/lib/crypto.js';
import { base32Encode, hotp, totp, verifyTotp } from '../../src/server/lib/totp.js';
import type { Keyring } from '../../src/server/config/env.js';

const keyring = (entries: [number, number][]): Keyring => ({
  activeVersion: entries[0]?.[0] ?? 1,
  keys: new Map(entries.map(([version, fill]) => [version, Buffer.alloc(32, fill)])),
});

describe('precios', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('usa la promoción solo si está vigente y es menor', () => {
    expect(effectivePrice({ priceCop: 4000, promoPriceCop: 3800, promoEndsAt: null }, now)).toBe(
      3800,
    );
    expect(
      effectivePrice(
        { priceCop: 4000, promoPriceCop: 3800, promoEndsAt: new Date('2026-10-01') },
        now,
      ),
    ).toBe(4000);
    expect(effectivePrice({ priceCop: 4000, promoPriceCop: null, promoEndsAt: null }, now)).toBe(
      4000,
    );
  });

  it('calcula totales en enteros y rechaza importes no enteros', () => {
    expect(
      computeTotals([
        { listPriceCop: 4000, unitPriceCop: 3800, quantity: 2 },
        { listPriceCop: 11000, unitPriceCop: 11000, quantity: 1 },
      ]),
    ).toEqual({ subtotalCop: 19000, discountCop: 400, totalCop: 18600 });
    expect(() => computeTotals([{ listPriceCop: 10, unitPriceCop: 9.5, quantity: 1 }])).toThrow();
  });
});

describe('máquinas de estado', () => {
  it('cubren todos los estados y solo apuntan a estados conocidos', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
    expect(Object.keys(FULFILLMENT_TRANSITIONS).sort()).toEqual([...FULFILLMENT_STATUSES].sort());
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const target of targets) expect(ORDER_STATUSES).toContain(target);
    }
  });

  it('impide transiciones peligrosas', () => {
    expect(canTransitionOrder('AWAITING_VERIFICATION', 'PAID')).toBe(false);
    expect(canTransitionOrder('REFUNDED', 'PAID')).toBe(false);
    expect(canTransitionOrder('DELIVERED', 'DELIVERING')).toBe(false);
    expect(canTransitionOrder('AWAITING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransitionFulfillment('READY_FOR_FULFILLMENT', 'DELIVERED')).toBe(false);
    expect(canTransitionFulfillment('DELIVERING', 'READY_FOR_FULFILLMENT')).toBe(false);
    expect(canTransitionFulfillment('DELIVERED', 'FAILED')).toBe(false);
  });
});

describe('estados de Mercado Pago', () => {
  it('mapea la lista oficial y trata lo desconocido como UNKNOWN', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('APPROVED');
    for (const s of ['pending', 'in_process', 'authorized'])
      expect(mapMercadoPagoStatus(s)).toBe('PENDING');
    for (const s of ['rejected', 'cancelled']) expect(mapMercadoPagoStatus(s)).toBe('DECLINED');
    expect(mapMercadoPagoStatus('refunded')).toBe('REFUNDED');
    for (const s of ['in_mediation', 'charged_back'])
      expect(mapMercadoPagoStatus(s)).toBe('DISPUTED');
    expect(mapMercadoPagoStatus('estado_nuevo')).toBe('UNKNOWN');
  });

  it('valida la firma x-signature con el validador oficial del SDK', () => {
    const secret = 'secreto-de-webhook';
    const gateway = new MercadoPagoPaymentGateway({
      accessToken: 'TEST-sin-uso',
      webhookSecret: secret,
      statementDescriptor: undefined,
      timeoutMs: 1000,
    });
    const ts = '1704908010';
    // Manifest documentado: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
    const v1 = createHmac('sha256', secret)
      .update(`id:123456;request-id:req-1;ts:${ts};`)
      .digest('hex');
    const signature = `ts=${ts},v1=${v1}`;
    expect(gateway.verifyWebhook({ signature, requestId: 'req-1', dataId: '123456' })).toBe(true);
    expect(gateway.verifyWebhook({ signature, requestId: 'req-1', dataId: '999999' })).toBe(false);
    expect(
      gateway.verifyWebhook({ signature: undefined, requestId: 'req-1', dataId: '123456' }),
    ).toBe(false);
    expect(
      gateway.verifyWebhook({
        signature: `ts=${ts},v1=${'0'.repeat(64)}`,
        requestId: 'req-1',
        dataId: '123456',
      }),
    ).toBe(false);
  });
});

describe('criptografía', () => {
  it('hash con llavero versionado: verifica con la versión registrada tras rotar', () => {
    const v1 = keyring([[1, 1]]);
    const stored = keyedHash(v1, 'token');
    const rotated = keyring([
      [2, 2],
      [1, 1],
    ]);
    expect(verifyKeyedHash(rotated, 'token', stored.hash, stored.version)).toBe(true);
    expect(verifyKeyedHash(rotated, 'otro', stored.hash, stored.version)).toBe(false);
    expect(keyedHash(rotated, 'token').version).toBe(2);
    expect(verifyKeyedHash(keyring([[2, 2]]), 'token', stored.hash, stored.version)).toBe(false);
  });

  it('cifra con AES-256-GCM, detecta manipulación y descifra tras rotar', () => {
    const v1 = keyring([[1, 1]]);
    const payload = encrypt(v1, 'JBSWY3DPEHPK3PXP');
    expect(payload.startsWith('v1.')).toBe(true);
    const rotated = keyring([
      [2, 2],
      [1, 1],
    ]);
    expect(decrypt(rotated, payload)).toEqual({ plaintext: 'JBSWY3DPEHPK3PXP', version: 1 });
    const parts = payload.split('.');
    const tampered = [...parts.slice(0, 3), Buffer.from('xx').toString('base64url')].join('.');
    expect(() => decrypt(v1, tampered)).toThrow();
  });

  it('genera referencias públicas sin caracteres ambiguos', () => {
    for (let i = 0; i < 50; i += 1)
      expect(publicOrderRef()).toMatch(/^TGS-[0-9A-HJKMNP-TV-Z]{10}$/);
  });
});

describe('TOTP (RFC 6238)', () => {
  // Vectores del RFC 6238, apéndice B (SHA1, secreto "12345678901234567890"), 6 dígitos.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('coincide con los vectores oficiales', () => {
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000)).toBe('081804');
    expect(totp(secret, 1_234_567_890_000)).toBe('005924');
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224'); // RFC 4226
  });

  it('acepta ±1 paso de desfase y rechaza códigos inválidos', () => {
    const now = 1_234_567_890_000;
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, 'abc123', now)).toBe(false);
  });
});

describe('Google OIDC', () => {
  const clientId = 'cliente.apps.googleusercontent.com';
  const token = (claims: Record<string, unknown>) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  const valid = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    exp: 2_000_000_000,
    nonce: 'n1',
    sub: '1234',
    email: 'Cliente@Example.com',
    email_verified: true,
    name: 'Cliente',
  };

  it('acepta un ID token válido y normaliza el correo', () => {
    expect(
      validateIdTokenClaims(token(valid), { clientId, nonce: 'n1', nowSeconds: 1_900_000_000 }),
    ).toEqual({
      sub: '1234',
      email: 'cliente@example.com',
      emailVerified: true,
      name: 'Cliente',
    });
  });

  it('rechaza emisor, audiencia, expiración o nonce incorrectos', () => {
    const check = (claims: Record<string, unknown>) => () =>
      validateIdTokenClaims(token({ ...valid, ...claims }), {
        clientId,
        nonce: 'n1',
        nowSeconds: 1_900_000_000,
      });
    expect(check({ iss: 'https://evil.example' })).toThrow(OidcError);
    expect(check({ aud: 'otro' })).toThrow(OidcError);
    expect(check({ exp: 1 })).toThrow(OidcError);
    expect(check({ nonce: 'n2' })).toThrow(OidcError);
  });

  it('calcula el challenge PKCE S256 (RFC 7636, apéndice B)', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
