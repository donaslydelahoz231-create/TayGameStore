import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

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
  /** Primeros dos octetos de la IP del cliente simulado (por defecto 198.18, rango de pruebas). */
  ipPrefix?: string;
}

/**
 * Cada contexto (cada prueba) entra con su propia IP de cliente (`x-forwarded-for`, el servidor
 * e2e confía en un proxy). Antes todas compartían 127.0.0.1 y la suite llegaba a 9 de los 10
 * pedidos permitidos cada 10 minutos por IP: un intento de más daba 429 y la prueba del panel
 * fallaba sin causa aparente. Así ninguna prueba gasta el límite de otra, como clientes reales.
 * La IP combina el proceso de Playwright (workerIndex, único en la corrida; --repeat-each usa uno
 * por repetición) y un contador dentro del proceso.
 */
let clientCounter = 0;
const contextsWithIp = new WeakSet<BrowserContext>();

async function isolateClientIp(context: BrowserContext, prefix: string): Promise<void> {
  if (contextsWithIp.has(context)) return;
  contextsWithIp.add(context);
  clientCounter += 1;
  const worker = test.info().workerIndex % 256;
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `${prefix}.${worker}.${(clientCounter % 254) + 1}`,
  });
}

/** Devuelve la lista (viva) de errores de consola y de página. */
export async function preparePage(page: Page, options: PrepareOptions = {}): Promise<string[]> {
  await isolateClientIp(page.context(), options.ipPrefix ?? '198.18');
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
  // Con movimiento activo (motion.spec), el diálogo entra con una animación de 0,65 s. En WebKit
  // el clic podía agotar su espera de «elemento estable»: se espera a que la entrada termine.
  // Si una animación del diálogo no terminara nunca, esto falla con un mensaje claro.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const dialog = document.getElementById('loginModal');
          return document
            .getAnimations()
            .filter((a) => a.playState === 'running')
            .filter((a) => {
              const target = (a.effect as KeyframeEffect | null)?.target;
              return target instanceof Node && dialog?.contains(target);
            }).length;
        }),
      { message: 'animaciones del diálogo de acceso en curso', timeout: 10_000 },
    )
    .toBe(0);
  await page.locator('#guestBtn').click();
  await expect(page.locator('#loginModal')).toBeHidden();
  await expect(page.locator('#products .product').first()).toBeVisible();
}
