import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config/env.js';
import { nequiSettings } from '../../src/server/config/nequi.js';

/** Configuración de Nequi, separada de la de Mercado Pago. Valores ficticios. */

const KEY = Buffer.alloc(32, 7).toString('base64');
const PRODUCTION_BASE = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://tienda.example',
  DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
  ORDER_TOKEN_KEYS: `1:${KEY}`,
  IP_HASH_PEPPER: 'p'.repeat(40),
};

describe('Nequi por transferencia: configuración propia', () => {
  it('está apagado por defecto (sin variables)', () => {
    expect(nequiSettings({})).toEqual({ manual: undefined, problem: undefined });
    expect(nequiSettings({ NEQUI_MANUAL_ENABLED: 'false' }).manual).toBeUndefined();
    expect(loadConfig({}).nequi.manual).toBeUndefined();
  });

  it('activo con un celular válido (espacios y guiones se quitan); 24 h por defecto', () => {
    expect(
      nequiSettings({
        NEQUI_MANUAL_ENABLED: 'true',
        NEQUI_MANUAL_PHONE: '300-123 4567',
        NEQUI_MANUAL_HOLDER: '  Tienda   de Prueba ',
      }),
    ).toEqual({
      manual: {
        phone: '3001234567',
        brebKey: undefined,
        holder: 'Tienda de Prueba',
        reviewHours: 24,
      },
      problem: undefined,
    });
  });

  it('activo solo con la llave Bre-B (sin celular): el celular es opcional', () => {
    expect(
      nequiSettings({
        NEQUI_MANUAL_ENABLED: 'true',
        NEQUI_MANUAL_BREB_KEY: ' @tienda.prueba_1 ',
        NEQUI_MANUAL_HOLDER: 'Tienda de Prueba',
      }),
    ).toEqual({
      manual: {
        phone: undefined,
        brebKey: '@tienda.prueba_1',
        holder: 'Tienda de Prueba',
        reviewHours: 24,
      },
      problem: undefined,
    });
  });

  it('un valor mal escrito apaga Nequi y lo explica sin repetir el valor', () => {
    const cases = [
      { NEQUI_MANUAL_ENABLED: 'quizas' },
      { NEQUI_MANUAL_ENABLED: 'true' },
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_PHONE: '6011234567' },
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_PHONE: '30012345678' },
      // Llaves Bre-B: solo alfanuméricas con @. Una llave solo de números podría ser un documento.
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_BREB_KEY: 'tiendaprueba' },
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_BREB_KEY: '@1234567890' },
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_BREB_KEY: '@tienda prueba' },
      { NEQUI_MANUAL_ENABLED: 'true', NEQUI_MANUAL_BREB_KEY: '@<script>' },
      {
        NEQUI_MANUAL_ENABLED: 'true',
        NEQUI_MANUAL_BREB_KEY: '@tiendaprueba',
        NEQUI_MANUAL_PHONE: '6011234567',
      },
      {
        NEQUI_MANUAL_ENABLED: 'true',
        NEQUI_MANUAL_PHONE: '3001234567',
        NEQUI_MANUAL_HOLDER: '<b>',
      },
      {
        NEQUI_MANUAL_ENABLED: 'true',
        NEQUI_MANUAL_PHONE: '3001234567',
        NEQUI_MANUAL_REVIEW_HOURS: '500',
      },
    ];
    for (const env of cases) {
      const result = nequiSettings(env);
      expect(result.manual, JSON.stringify(env)).toBeUndefined();
      expect(result.problem).toBeTruthy();
      for (const value of Object.values(env)) {
        if (value !== 'true') expect(result.problem).not.toContain(value);
      }
    }
  });

  it('una configuración de Nequi inválida nunca impide arrancar (Mercado Pago sigue)', () => {
    const config = loadConfig({
      PAYMENTS_ENABLED: 'true',
      MP_ACCESS_TOKEN: 'TEST-token-de-prueba',
      MP_WEBHOOK_SECRET: 'secreto-de-prueba',
      MP_MODE: 'sandbox',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      NEQUI_MANUAL_ENABLED: 'true',
      NEQUI_MANUAL_PHONE: 'mal',
    });
    expect(config.flags.paymentsEnabled).toBe(true);
    expect(config.mercadoPago).toBeDefined();
    expect(config.nequi.manual).toBeUndefined();
  });

  it('en producción se puede vender solo con Nequi: el checkout no depende de Mercado Pago', () => {
    const config = loadConfig({
      ...PRODUCTION_BASE,
      CHECKOUT_ENABLED: 'true',
      NEQUI_MANUAL_ENABLED: 'true',
      NEQUI_MANUAL_PHONE: '3001234567',
    });
    expect(config.flags.checkoutEnabled).toBe(true);
    expect(config.flags.paymentsEnabled).toBe(false);
    expect(config.mercadoPago).toBeUndefined();
    expect(config.nequi.manual?.phone).toBe('3001234567');
  });

  it('las variables de Nequi no activan nada de Mercado Pago, ni al revés', () => {
    const nequiOnly = loadConfig({
      NEQUI_MANUAL_ENABLED: 'true',
      NEQUI_MANUAL_PHONE: '3001234567',
    });
    expect(nequiOnly.mercadoPago).toBeUndefined();
    expect(nequiOnly.flags.paymentsEnabled).toBe(false);
    const mpOnly = loadConfig({
      MP_ACCESS_TOKEN: 'TEST-token-de-prueba',
      MP_WEBHOOK_SECRET: 'secreto-de-prueba',
    });
    expect(mpOnly.nequi.manual).toBeUndefined();
  });
});
