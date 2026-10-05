import { expect, test, type Page } from '@playwright/test';
import { expectReducedMotion, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Línea base visual de la tienda conectada al servidor de pruebas (e2e/support/server.ts).
 * Fija lo no determinista: reloj, Math.random, movimiento reducido, fuentes y datos
 * sembrados. Con movimiento reducido el CSS original desactiva partículas y deja visibles
 * las secciones cinematográficas.
 */

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
  const consoleErrors = await preparePage(page, { deterministic: true });

  await page.goto('/');
  // Sin movimiento reducido las partículas y los reveals cinematográficos hacen las
  // capturas no deterministas.
  await expectReducedMotion(page);

  await settle(page);
  await expect(page.locator('#entryExperience')).toBeVisible();
  await expect.soft(page).toHaveScreenshot('01-entrada.png');

  await page.locator('#enterStoreBtn').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  await settle(page);
  await expect.soft(page).toHaveScreenshot('02-acceso.png');

  await page.locator('#guestBtn').click();
  await expect(page.locator('#loginModal')).toBeHidden();
  await expect(page.locator('#products .product').first()).toBeVisible();
  await expect(page.locator('#toastStack .toast')).toHaveCount(0, { timeout: 6_000 });
  await page.locator('#bootScreen').waitFor({ state: 'hidden' });
  // El último clic deja el puntero sobre el contenido (estado :hover); se aparta.
  await page.mouse.move(0, 0);
  // Ajuste SOLO de la prueba (el frontend no cambia): el carrito `.smart-cart` es
  // `position: sticky`; con scroll 0 se pinta igual que `static`, pero su capa compuesta
  // introduce ruido de antialiasing intermitente.
  await page.addStyleTag({ content: '.smart-cart{position:static!important}' });
  await settle(page);
  await expect.soft(page).toHaveScreenshot('03-tienda-pagina-completa.png', { fullPage: true });

  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});
