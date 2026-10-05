import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config/env.js';

const PRODUCTION_BASE = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://tienda.example',
  DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
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
    expect(config.flags).toEqual({
      maintenanceMode: false,
      checkoutEnabled: false,
      paymentsEnabled: false,
    });
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

  it('rechaza PAYMENTS_ENABLED=true porque los pagos no están implementados', () => {
    expect(configError({ PAYMENTS_ENABLED: 'true' }).issues.join()).toContain('PAYMENTS_ENABLED');
  });

  describe('producción', () => {
    it('acepta una configuración mínima válida', () => {
      const config = loadConfig(PRODUCTION_BASE);
      expect(config.host).toBe('0.0.0.0');
      expect(config.serveWeb).toBe(true);
      expect(config.logPretty).toBe(false);
    });

    it('exige PUBLIC_BASE_URL con https y DATABASE_URL', () => {
      const missing = configError({ NODE_ENV: 'production' }).issues.join();
      expect(missing).toContain('PUBLIC_BASE_URL');
      expect(missing).toContain('DATABASE_URL');
      const http = configError({ ...PRODUCTION_BASE, PUBLIC_BASE_URL: 'http://tienda.example' });
      expect(http.issues.join()).toContain('https');
    });

    it('bloquea CHECKOUT_ENABLED mientras las ventas reales estén bloqueadas', () => {
      const error = configError({ ...PRODUCTION_BASE, CHECKOUT_ENABLED: 'true' });
      expect(error.issues.join()).toContain('CHECKOUT_ENABLED');
    });

    it('no incluye valores de variables en los mensajes de error', () => {
      const error = configError({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:supersecret@db.example/app',
        PORT: 'no-numerico-secreto',
      });
      expect(error.message).not.toContain('supersecret');
      expect(error.message).not.toContain('no-numerico-secreto');
    });
  });
});
