import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Línea base visual del HTML original (legacy/index-cinematic-v4.html).
 * Fija lo no determinista: reloj, Math.random, movimiento reducido, fuentes y backend
 * ausente. Con movimiento reducido el CSS original desactiva partículas y deja visibles
 * las secciones cinematográficas.
 */

const FIXED_TIME = new Date('2026-01-15T10:30:00-05:00');

/**
 * Google Fonts se sirve desde e2e/fixtures/google-fonts para que las capturas no dependan
 * de la red. Para regenerarlo: e2e/fixtures/fetch-google-fonts.sh
 */
const FONTS_DIR = 'e2e/fixtures/google-fonts';
const GOOGLE_FONTS_URL = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const fontsManifest = JSON.parse(readFileSync(`${FONTS_DIR}/manifest.json`, 'utf8')) as Record<
  string,
  { file: string; contentType: string }
>;

async function preparePage(page: Page): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(() => {
    let seed = 42;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.route(GOOGLE_FONTS_URL, (route) => {
    const entry = fontsManifest[route.request().url()];
    if (!entry) return route.abort();
    return route.fulfill({
      path: `${FONTS_DIR}/${entry.file}`,
      contentType: entry.contentType,
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  // Sin backend: todas las llamadas a la API fallan de forma determinista.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'SERVER_UNAVAILABLE' }),
    }),
  );
  return consoleErrors;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // La línea base solo vale con las tipografías reales; si no cargan, se falla en vez de
  // guardar capturas con fuentes de respaldo.
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('800 16px Oxanium'),
      document.fonts.load('500 16px "Plus Jakarta Sans"'),
    ]);
    return (
      document.fonts.check('800 16px Oxanium') &&
      document.fonts.check('500 16px "Plus Jakarta Sans"')
    );
  });
  expect(fontsLoaded, 'Oxanium y Plus Jakarta Sans deben estar cargadas').toBe(true);
}

test('captura las vistas principales del frontend original', async ({ page }) => {
  const consoleErrors = await preparePage(page);

  await page.goto('/');
  // Sin movimiento reducido las partículas y los reveals cinematográficos hacen las
  // capturas no deterministas: se verifica que la emulación esté activa.
  const reducedMotion = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  expect(reducedMotion, 'la emulación de movimiento reducido debe estar activa').toBe(true);

  await settle(page);
  await expect(page.locator('#entryExperience')).toBeVisible();
  await expect(page).toHaveScreenshot('01-entrada.png');

  await page.locator('#enterStoreBtn').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('02-acceso.png');

  await page.locator('#guestBtn').click();
  await expect(page.locator('#loginModal')).toBeHidden();
  await expect(page.locator('#products .product').first()).toBeVisible();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 6_000 });
  await page.locator('#bootScreen').waitFor({ state: 'hidden' });
  // El último clic deja el puntero sobre el contenido (estado :hover); se aparta.
  await page.mouse.move(0, 0);
  // El CSS original usa `content-visibility: auto`: Chromium no pinta las secciones fuera de
  // pantalla y la captura de página completa las dejaría vacías. Solo en la prueba se fuerza
  // el pintado, equivalente a lo que ve el usuario al hacer scroll. El frontend no cambia.
  await page.addStyleTag({
    content:
      '.section,.trust,.smart-band,.tracking-card,.support-section,.faq{content-visibility:visible!important}',
  });
  await settle(page);
  await expect(page).toHaveScreenshot('03-tienda-pagina-completa.png', { fullPage: true });

  // Las únicas fallas esperadas son las llamadas a la API ausente (503 simulado).
  const unexpected = consoleErrors.filter((text) => !text.includes('503'));
  expect(unexpected).toEqual([]);
});
