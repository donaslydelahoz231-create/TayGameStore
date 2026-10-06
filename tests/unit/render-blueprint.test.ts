import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENV_VARIABLES, loadConfig } from '../../src/server/config/env.js';

/**
 * El Blueprint de Render debe coincidir con la configuración real del servidor: sin nombres
 * mal escritos (se ignorarían en silencio) y arrancando en producción con los secretos que el
 * propietario escribe en el panel (aquí, valores de relleno con el formato correcto).
 */
const blueprint = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8');

interface EnvEntry {
  key: string;
  value?: string;
  sync?: false;
  fromDatabase?: true;
}

function envEntries(): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const line of blueprint.split('\n')) {
    const key = /^\s+- key: (\S+)\s*$/.exec(line);
    if (key?.[1]) {
      entries.push({ key: key[1] });
      continue;
    }
    const current = entries.at(-1);
    if (!current) continue;
    const value = /^\s+value: '?([^'#]*?)'?\s*$/.exec(line);
    if (value) current.value = value[1];
    if (/^\s+sync: false\s*$/.test(line)) current.sync = false;
    if (/^\s+fromDatabase:\s*$/.test(line)) current.fromDatabase = true;
  }
  return entries;
}

const RENDER_ONLY = new Set(['NODE_VERSION']);
const key32 = `1:${Buffer.alloc(32, 7).toString('base64')}`;
const SECRET_PLACEHOLDERS: Record<string, string> = {
  PUBLIC_BASE_URL: 'https://tienda.example.com',
  ORDER_TOKEN_KEYS: key32,
  MFA_ENCRYPTION_KEYS: key32,
  IP_HASH_PEPPER: 'p'.repeat(40),
  GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secreto-google-relleno',
  ADMIN_EMAILS: 'admin@example.com',
  ADMIN_PATH: '/gestion-relleno-0000',
  MP_ACCESS_TOKEN: 'APP_USR-relleno-de-prueba',
  MP_WEBHOOK_SECRET: 'secreto-webhook-relleno',
  SUPPORT_EMAIL: 'soporte@example.com',
  SUPPORT_WHATSAPP: '+573000000000',
  TELEGRAM_BOT_TOKEN: `123456789:${'r'.repeat(35)}`,
  TELEGRAM_CHAT_ID: '123456789',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'tienda@example.com',
  SMTP_PASS: 'clave-de-aplicacion-relleno',
  MAIL_FROM: 'tienda@example.com',
};

describe('render.yaml', () => {
  const entries = envEntries();

  it('declara variables y solo las que el servidor conoce', () => {
    expect(entries.length).toBeGreaterThan(10);
    const unknown = entries
      .map((e) => e.key)
      .filter((key) => !RENDER_ONLY.has(key) && !ENV_VARIABLES.includes(key));
    expect(unknown).toEqual([]);
  });

  it('los secretos nunca llevan valor en el archivo', () => {
    for (const key of Object.keys(SECRET_PLACEHOLDERS)) {
      const entry = entries.find((e) => e.key === key);
      expect(entry, key).toMatchObject({ sync: false });
      expect(entry?.value, key).toBeUndefined();
    }
  });

  it('arranca en producción con ventas y pagos apagados y MP en sandbox', () => {
    const env: Record<string, string> = { DATABASE_URL: 'postgres://u:p@db:5432/taygamestore' };
    for (const entry of entries) {
      if (entry.value !== undefined) env[entry.key] = entry.value;
      else if (entry.sync === false) env[entry.key] = SECRET_PLACEHOLDERS[entry.key] ?? '';
    }
    const config = loadConfig(env);
    expect(config.env).toBe('production');
    expect(config.flags.checkoutEnabled).toBe(false);
    expect(config.flags.paymentsEnabled).toBe(false);
    expect(config.mercadoPago?.mode).toBe('sandbox');
    expect(config.serveWeb).toBe(true);
    expect(config.trustProxy).toBe(1);
  });

  it('una sola instancia (rate limiting en memoria) y migraciones antes de publicar', () => {
    expect(blueprint).toMatch(/^\s+numInstances: 1\s*$/m);
    expect(blueprint).toMatch(/^\s+preDeployCommand: npm run db:migrate:prod\s*$/m);
    expect(blueprint).toMatch(/^\s+healthCheckPath: \/api\/ready\s*$/m);
    expect(blueprint).toMatch(/^\s+buildCommand: npm ci --include=dev && npm run build\s*$/m);
  });
});
