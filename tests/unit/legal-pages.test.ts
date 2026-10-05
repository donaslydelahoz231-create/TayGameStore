import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertLegalPagesReady, LEGAL_PAGES } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config/env.js';

const KEY = Buffer.alloc(32, 3).toString('base64');
const production = (checkout: boolean) =>
  loadConfig({
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://tienda.example',
    DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
    ORDER_TOKEN_KEYS: `1:${KEY}`,
    IP_HASH_PEPPER: 'p'.repeat(40),
    CHECKOUT_ENABLED: String(checkout),
    PAYMENTS_ENABLED: String(checkout),
    MP_ACCESS_TOKEN: 'APP_USR-relleno',
    MP_WEBHOOK_SECRET: 'secreto-relleno',
    MP_MODE: 'production',
  });

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tgs-legal-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('textos legales antes de vender', () => {
  it('en producción con ventas activas exige páginas completas', async () => {
    expect(() => assertLegalPagesReady(production(true), dir)).toThrow(/terminos\.html/);
    for (const page of LEGAL_PAGES) await writeFile(join(dir, page), '<p>[COMPLETAR: NIT]</p>');
    expect(() => assertLegalPagesReady(production(true), dir)).toThrow(/\[COMPLETAR/);
    for (const page of LEGAL_PAGES) await writeFile(join(dir, page), '<p>NIT 900.000.000-0</p>');
    expect(() => assertLegalPagesReady(production(true), dir)).not.toThrow();
  });

  it('no bloquea con las ventas apagadas ni fuera de producción', () => {
    expect(() => assertLegalPagesReady(production(false), dir)).not.toThrow();
    expect(() => assertLegalPagesReady(loadConfig({ NODE_ENV: 'test' }), dir)).not.toThrow();
  });

  it('los borradores del repositorio siguen marcados como pendientes', async () => {
    for (const page of LEGAL_PAGES) {
      const html = await readFile(new URL(`../../src/web/${page}`, import.meta.url), 'utf8');
      expect(html, page).toContain('[COMPLETAR');
    }
  });
});
