import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertLegalPagesReady, LEGAL_PAGES } from '../../src/server/app.js';
import {
  LEGAL_ROBOTS,
  maskDocument,
  pendingLegalFields,
  renderLegalPage,
} from '../../src/server/legal.js';
import { loadConfig } from '../../src/server/config/env.js';

const KEY = Buffer.alloc(32, 3).toString('base64');
const production = (
  checkout: boolean,
  mode: 'production' | 'sandbox' = 'production',
  extra: Record<string, string> = {},
) =>
  loadConfig({
    ...extra,
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://tienda.example',
    DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
    ORDER_TOKEN_KEYS: `1:${KEY}`,
    IP_HASH_PEPPER: 'p'.repeat(40),
    CHECKOUT_ENABLED: String(checkout),
    PAYMENTS_ENABLED: String(checkout),
    MP_ACCESS_TOKEN: 'APP_USR-relleno',
    MP_WEBHOOK_SECRET: 'secreto-relleno',
    MP_MODE: mode,
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

  it('en sandbox de Mercado Pago (sin dinero real) deja probar la compra con borradores', async () => {
    for (const page of LEGAL_PAGES) await writeFile(join(dir, page), '<p>[COMPLETAR: NIT]</p>');
    expect(() => assertLegalPagesReady(production(true, 'sandbox'), dir)).not.toThrow();
    expect(() => assertLegalPagesReady(production(true, 'production'), dir)).toThrow(/\[COMPLETAR/);
  });

  it('los borradores del repositorio siguen marcados como pendientes', async () => {
    for (const page of LEGAL_PAGES) {
      const html = await readFile(new URL(`../../src/web/${page}`, import.meta.url), 'utf8');
      expect(html, page).toContain('[COMPLETAR');
    }
  });

  it('los datos del vendedor salen de la configuración del hosting, no del repositorio', async () => {
    const legal = {
      LEGAL_NAME: 'Tienda Ejemplo <S.A.S.>',
      LEGAL_ID: 'CC 1.023.456.789',
      LEGAL_ADDRESS: 'Calle 1 # 2-3, Bogotá',
      LEGAL_DELIVERY_TIME: '24 horas',
      LEGAL_REFUND_TIME: '5 días hábiles',
      LEGAL_RESPONSE_TIME: '3 días hábiles',
      LEGAL_TAX_NOTE: 'Los precios incluyen los impuestos aplicables',
      LEGAL_RETENTION: '10 años',
      SUPPORT_EMAIL: 'soporte@example.com',
      SUPPORT_WHATSAPP: '+573000000000',
    };
    const root = new URL('../../src/web/', import.meta.url).pathname;
    const complete = production(true, 'production', legal);
    expect(pendingLegalFields(complete, root).size).toBe(0);
    expect(() => assertLegalPagesReady(complete, root)).not.toThrow();
    const terms = renderLegalPage(await readFile(join(root, 'terminos.html'), 'utf8'), complete);
    expect(terms).not.toContain('[COMPLETAR');
    // El valor se escapa: nunca se inyecta HTML desde una variable.
    expect(terms).toContain('Tienda Ejemplo &lt;S.A.S.&gt;');
    expect(terms).toContain('correo soporte@example.com y WhatsApp +573000000000');
    expect(terms).toContain('2026-10-05');
    // El documento completo nunca se publica: solo sus 4 últimos dígitos.
    expect(terms).toContain('documento terminado en 6789');
    expect(terms.replace(/\D/g, '')).not.toContain('1023456789');
    const privacy = renderLegalPage(
      await readFile(join(root, 'privacidad.html'), 'utf8'),
      complete,
    );
    expect(privacy).toContain('documento terminado en 6789');
    expect(privacy).not.toContain('1.023.456.789');

    // Sin los datos del vendedor, el servidor dice exactamente qué variable falta.
    const partial = production(true, 'production', { SUPPORT_EMAIL: 'soporte@example.com' });
    const pending = pendingLegalFields(partial, root);
    expect(pending.get('terminos.html')).toContain('LEGAL_NAME');
    expect(pending.get('privacidad.html')).toEqual([
      'LEGAL_NAME',
      'LEGAL_ID',
      'LEGAL_ADDRESS',
      'LEGAL_RETENTION',
    ]);
    expect(() => assertLegalPagesReady(partial, root)).toThrow(/LEGAL_NAME/);
  });

  it('una variable legal no admite saltos de línea ni caracteres invisibles', () => {
    expect(() => production(true, 'production', { LEGAL_NAME: 'Ana\n<script>' })).toThrow();
    expect(() => production(true, 'production', { LEGAL_NAME: 'Ana\u202eX' })).toThrow();
  });

  it('el número de documento se muestra recortado', () => {
    expect(maskDocument('1023456789')).toBe('documento terminado en 6789');
    expect(maskDocument('CC 1.023.456.789')).toBe('documento terminado en 6789');
    expect(maskDocument('12')).toBe('documento reservado');
  });

  it('las páginas legales piden a los buscadores no indexarlas', async () => {
    for (const page of LEGAL_PAGES) {
      const html = await readFile(new URL(`../../src/web/${page}`, import.meta.url), 'utf8');
      expect(html, page).toContain(`<meta name="robots" content="${LEGAL_ROBOTS}" />`);
    }
  });
});
