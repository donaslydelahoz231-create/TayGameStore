import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Preparación común de las pruebas e2e: servidor real (e2e/support/server.ts), sin red
 * externa y con fuentes reales.
 * Google Fonts se sirve desde e2e/fixtures/google-fonts (regenerar con
 * e2e/fixtures/fetch-google-fonts.sh).
 */
const FONTS_DIR = 'e2e/fixtures/google-fonts';
const GOOGLE_FONTS_URL = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const fontsManifest = JSON.parse(readFileSync(`${FONTS_DIR}/manifest.json`, 'utf8')) as Record<
  string,
  { file: string; contentType: string }
>;

export interface PrepareOptions {
  /** Fija Date y Math.random para capturas deterministas. */
  deterministic?: boolean;
}

/** Devuelve la lista (viva) de errores de consola y de página. */
export async function preparePage(page: Page, options: PrepareOptions = {}): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  if (options.deterministic) {
    await page.clock.setFixedTime(new Date('2026-01-15T10:30:00-05:00'));
    await page.addInitScript(() => {
      let seed = 42;
      Math.random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    });
  }
  await page.route(GOOGLE_FONTS_URL, (route) => {
    const entry = fontsManifest[route.request().url()];
    if (!entry) return route.abort();
    return route.fulfill({
      path: `${FONTS_DIR}/${entry.file}`,
      contentType: entry.contentType,
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  return consoleErrors;
}

/**
 * Errores de consola inesperados. Las respuestas 4xx de la API son parte del contrato (la UI
 * las muestra); Chromium las registra como "Failed to load resource".
 */
export function unexpectedErrors(consoleErrors: string[]): string[] {
  return consoleErrors.filter(
    (text) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(text),
  );
}

export async function expectReducedMotion(page: Page): Promise<void> {
  const reduced = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(reduced, 'la emulación de movimiento reducido debe estar activa').toBe(true);
}

/** Pasa de la pantalla de entrada a la tienda como invitado. */
export async function enterAsGuest(page: Page): Promise<void> {
  await page.locator('#enterStoreBtn').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  await page.locator('#guestBtn').click();
  await expect(page.locator('#loginModal')).toBeHidden();
  await expect(page.locator('#products .product').first()).toBeVisible();
}
