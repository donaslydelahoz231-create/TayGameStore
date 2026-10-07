import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config/env.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const PRODUCTION_BASE = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://tienda.example',
  DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
  ORDER_TOKEN_KEYS: `1:${KEY}`,
  IP_HASH_PEPPER: 'p'.repeat(40),
};
const MP = {
  MP_ACCESS_TOKEN: 'TEST-token-de-prueba',
  MP_WEBHOOK_SECRET: 'secreto-de-prueba',
  MP_MODE: 'sandbox',
};

function configError(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('se esperaba ConfigError');
}

describe('loadConfig', () => {
  it('usa valores seguros por defecto en desarrollo', () => {
    const config = loadConfig({});
    expect(config.env).toBe('development');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.trustProxy).toBe(false);
    expect(config.serveWeb).toBe(false);
    expect(config.secureCookies).toBe(false);
    expect(config.flags).toEqual({
      maintenanceMode: false,
      checkoutEnabled: false,
      paymentsEnabled: false,
      fulfillmentEnabled: true,
    });
    expect(config.secrets.ephemeral).toBe(true);
    expect(config.mercadoPago).toBeUndefined();
    expect(config.google).toBeUndefined();
  });

  it('trata las variables vacías como no definidas', () => {
    const config = loadConfig({ PORT: '', DATABASE_URL: '   ', MAINTENANCE_MODE: '' });
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBeUndefined();
    expect(config.flags.maintenanceMode).toBe(false);
  });

  it('interpreta los interruptores booleanos', () => {
    const config = loadConfig({ MAINTENANCE_MODE: 'true', CHECKOUT_ENABLED: '1' });
    expect(config.flags.maintenanceMode).toBe(true);
    expect(config.flags.checkoutEnabled).toBe(true);
  });

  it('rechaza booleanos inválidos', () => {
    expect(configError({ MAINTENANCE_MODE: 'quizas' }).issues.join()).toContain('MAINTENANCE_MODE');
  });

  it('interpreta TRUST_PROXY como booleano o número de saltos', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(configError({ TRUST_PROXY: '10.0.0.0/8' }).issues.join()).toContain('TRUST_PROXY');
  });

  it('rechaza un puerto inválido', () => {
    expect(configError({ PORT: '70000' }).issues.join()).toContain('PORT');
  });

  it('PAYMENTS_ENABLED exige las credenciales de Mercado Pago y PUBLIC_BASE_URL', () => {
    const issues = configError({ PAYMENTS_ENABLED: 'true' }).issues.join();
    expect(issues).toContain('MP_ACCESS_TOKEN');
    expect(issues).toContain('MP_WEBHOOK_SECRET');
    expect(issues).toContain('PUBLIC_BASE_URL');
    const ok = loadConfig({
      PAYMENTS_ENABLED: 'true',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      ...MP,
    });
    expect(ok.mercadoPago?.timeoutMs).toBe(10000);
    expect(ok.mercadoPago?.mode).toBe('sandbox');
  });

  it('PAYMENTS_ENABLED exige declarar MP_MODE (sandbox o production)', () => {
    const base = { PAYMENTS_ENABLED: 'true', PUBLIC_BASE_URL: 'http://localhost:3000' };
    const withoutMode = { ...base, ...MP } as Record<string, string>;
    delete withoutMode.MP_MODE;
    expect(configError(withoutMode).issues.join()).toContain('MP_MODE');
    expect(configError({ ...base, ...MP, MP_MODE: 'live' }).issues.join()).toContain('MP_MODE');
    expect(loadConfig({ ...base, ...MP, MP_MODE: 'production' }).mercadoPago?.mode).toBe(
      'production',
    );
  });

  it('no permite límites antifraude por encima de los fijados por el propietario', () => {
    expect(configError({ LIMIT_MAX_UNITS_PER_PRODUCT: '6' }).issues.join()).toContain(
      'LIMIT_MAX_UNITS_PER_PRODUCT',
    );
    expect(configError({ LIMIT_MAX_ORDER_TOTAL_COP: '1000001' }).issues.join()).toContain(
      'LIMIT_MAX_ORDER_TOTAL_COP',
    );
  });

  it('valida el llavero versionado (versión:claveBase64, mínimo 32 bytes)', () => {
    const config = loadConfig({ ORDER_TOKEN_KEYS: `2:${KEY},1:${KEY}` });
    expect(config.secrets.orderTokenKeys.activeVersion).toBe(2);
    expect(config.secrets.orderTokenKeys.keys.size).toBe(2);
    expect(configError({ ORDER_TOKEN_KEYS: '1:corta' }).issues.join()).toContain(
      'ORDER_TOKEN_KEYS',
    );
    expect(configError({ ORDER_TOKEN_KEYS: `1:${KEY},1:${KEY}` }).issues.join()).toContain(
      'ORDER_TOKEN_KEYS',
    );
  });

  it('llaves de acceso: dominio de PUBLIC_BASE_URL; nunca una IP ni un origen ajeno', () => {
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://taygamestore.onrender.com/' }).passkey).toEqual({
      rpId: 'taygamestore.onrender.com',
      origin: 'https://taygamestore.onrender.com',
    });
    expect(loadConfig({}).passkey).toBeUndefined();
    expect(loadConfig({ PUBLIC_BASE_URL: 'http://127.0.0.1:4173' }).passkey).toBeUndefined();
    expect(
      loadConfig({ PASSKEY_RP_ID: 'localhost', PASSKEY_ORIGIN: 'http://localhost:4173' }).passkey,
    ).toEqual({ rpId: 'localhost', origin: 'http://localhost:4173' });
    // El origen tiene que ser el dominio o un subdominio suyo.
    expect(
      loadConfig({ PASSKEY_RP_ID: 'tienda.example', PASSKEY_ORIGIN: 'https://evil.example' })
        .passkey,
    ).toBeUndefined();
    expect(
      loadConfig({ PASSKEY_RP_ID: 'tienda.example', PASSKEY_ORIGIN: 'https://www.tienda.example' })
        .passkey,
    ).toEqual({ rpId: 'tienda.example', origin: 'https://www.tienda.example' });
  });

  it('Google OAuth: id y secreto juntos; ADMIN_EMAILS requiere Google o huella/contraseña', () => {
    expect(configError({ GOOGLE_CLIENT_ID: 'id-de-cliente-google' }).issues.join()).toContain(
      'GOOGLE_CLIENT_SECRET',
    );
    expect(configError({ ADMIN_EMAILS: 'admin@example.com' }).issues.join()).toContain(
      'ADMIN_EMAILS',
    );
    // Sin Google, el dueño entra con contraseña + código o con su huella (dirección pública).
    expect(
      loadConfig({
        ADMIN_EMAILS: 'taygamerstore@gmail.com',
        PUBLIC_BASE_URL: 'https://taygamestore.onrender.com',
        ADMIN_SETUP_CODE: 'frase-larga-de-activacion-del-dueno',
      }).adminSetupCode,
    ).toBe('frase-larga-de-activacion-del-dueno');
    expect(configError({ ADMIN_SETUP_CODE: 'corta' }).issues.join()).toContain('ADMIN_SETUP_CODE');
    const config = loadConfig({
      GOOGLE_CLIENT_ID: 'id-de-cliente-google',
      GOOGLE_CLIENT_SECRET: 'secreto-de-google',
      ADMIN_EMAILS: ' Admin@Example.com ,otro@example.com',
    });
    expect(config.adminEmails).toEqual(['admin@example.com', 'otro@example.com']);
  });

  describe('producción', () => {
    it('acepta una configuración mínima válida', () => {
      const config = loadConfig(PRODUCTION_BASE);
      expect(config.host).toBe('0.0.0.0');
      expect(config.serveWeb).toBe(true);
      expect(config.logPretty).toBe(false);
      expect(config.secureCookies).toBe(true);
      expect(config.jobsEnabled).toBe(true);
    });

    it('exige PUBLIC_BASE_URL con https, DATABASE_URL y las claves', () => {
      const missing = configError({ NODE_ENV: 'production' }).issues.join();
      expect(missing).toContain('PUBLIC_BASE_URL');
      expect(missing).toContain('DATABASE_URL');
      expect(missing).toContain('ORDER_TOKEN_KEYS');
      expect(missing).toContain('IP_HASH_PEPPER');
      const http = configError({ ...PRODUCTION_BASE, PUBLIC_BASE_URL: 'http://tienda.example' });
      expect(http.issues.join()).toContain('https');
    });

    it('no acepta órdenes que no se puedan pagar (CHECKOUT_ENABLED sin PAYMENTS_ENABLED)', () => {
      const error = configError({ ...PRODUCTION_BASE, CHECKOUT_ENABLED: 'true' });
      expect(error.issues.join()).toContain('CHECKOUT_ENABLED');
      const ok = loadConfig({
        ...PRODUCTION_BASE,
        ...MP,
        CHECKOUT_ENABLED: 'true',
        PAYMENTS_ENABLED: 'true',
      });
      expect(ok.flags.checkoutEnabled).toBe(true);
    });

    it('exige MFA_ENCRYPTION_KEYS cuando hay acceso con Google', () => {
      const error = configError({
        ...PRODUCTION_BASE,
        GOOGLE_CLIENT_ID: 'id-de-cliente-google',
        GOOGLE_CLIENT_SECRET: 'secreto-de-google',
      });
      expect(error.issues.join()).toContain('MFA_ENCRYPTION_KEYS');
    });

    it('no incluye valores de variables en los mensajes de error', () => {
      const error = configError({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:supersecret@db.example/app',
        PORT: 'no-numerico-secreto',
        ORDER_TOKEN_KEYS: '1:secreto-corto-visible',
      });
      expect(error.message).not.toContain('supersecret');
      expect(error.message).not.toContain('no-numerico-secreto');
      expect(error.message).not.toContain('secreto-corto-visible');
    });
  });
});
