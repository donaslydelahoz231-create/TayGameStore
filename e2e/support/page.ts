import { readFileSync } from 'node:fs';
import { expect, type Page, type Request } from '@playwright/test';

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
    if (message.type() !== 'error') return;
    // 503 de la consulta de jugador = proveedor caído: la UI pasa al flujo manual (contrato).
    const fromLookup = message.location().url.endsWith('/api/player/lookup');
    if (fromLookup && message.text().includes('status of 503')) return;
    consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // Diagnóstico (Firefox en CI 39/40/43: navegaciones que nunca llegan a "load"): al cerrar la
  // página se registran las peticiones que llevaban más de 5 s sin respuesta.
  const inFlight = new Map<Request, number>();
  page.on('request', (request) => inFlight.set(request, Date.now()));
  page.on('requestfinished', (request) => inFlight.delete(request));
  page.on('requestfailed', (request) => inFlight.delete(request));
  page.on('close', () => {
    const now = Date.now();
    const stuck = [...inFlight].filter(([, started]) => now - started > 5_000);
    if (stuck.length) {
      console.warn(
        `[e2e] peticiones sin respuesta al cerrar ${page.url()}: ` +
          stuck
            .map(([r, t]) => `${r.method()} ${r.url()} (${Math.round((now - t) / 1000)} s)`)
            .join(', '),
      );
    }
  });

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
  // En todo el contexto: las pestañas que abra la prueba (context.newPage) también usan las
  // fuentes locales. Sin esto, una segunda pestaña iba a Google Fonts y, si la red de la CI
  // tardaba, el evento "load" no llegaba y la prueba caducaba (Firefox, CI 35).
  await page.context().route(GOOGLE_FONTS_URL, (route) => {
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
