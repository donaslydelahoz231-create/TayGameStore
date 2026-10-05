import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Pruebas de caracterización: fijan el comportamiento ACTUAL del frontend original para
 * detectar regresiones al modularizarlo. Describen lo que hace hoy, no lo que debería hacer
 * en producción (p. ej. el modo demo y los precios de respaldo se retiran en la Fase 2).
 * Se ejecutan sin backend: /api/* responde 503.
 */

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'comportamiento: un solo viewport');
  consoleErrors = await preparePage(page);
});

test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

const product = (page: Page, name: string) =>
  page.locator('#products .product').filter({ hasText: name });

async function storedState(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('tgs_ui_v5') ?? '{}') as Record<string, unknown>,
  );
}

test.describe('entrada y acceso', () => {
  test('la tienda arranca bloqueada y se abre como invitado', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/entry-locked/);
    await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');
    await enterAsGuest(page);
    await expect(page.locator('body')).not.toHaveClass(/entry-locked/);
    await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#accountName')).toHaveText('Invitado');
    await expect(page.locator('#toastStack')).toContainText('Compra como invitado habilitada.');
  });

  test('Escape en el acceso vuelve a la pantalla de entrada', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#loginModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#loginModal')).toBeHidden();
    await expect(page.locator('#entryExperience')).not.toHaveClass(/\bout\b/);
    await expect(page.locator('body')).toHaveClass(/entry-locked/);
  });

  test('el formulario valida datos y alterna entre acceso y registro', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await page.locator('#switchAuthMode').click();
    await expect(page.locator('#authTitle')).toHaveText('Crear cuenta');
    await expect(page.locator('#registerNameWrap')).toBeVisible();
    await expect(page.locator('#loginSubmit')).toHaveText('Crear cuenta');

    // Correo y contraseña los valida el navegador (type=email, minlength=8, required); el
    // nombre (sin `required`) lo valida el código.
    await page.locator('#registerName').fill('A');
    await page.locator('#loginEmail').fill('cliente@example.com');
    await page.locator('#loginPassword').fill('contrasena-larga');
    await page.locator('#loginSubmit').click();
    await expect(page.locator('#loginError')).toHaveClass(/show/);
    await expect(page.locator('#loginError')).toContainText('Completa nombre');

    await page.locator('#switchAuthMode').click();
    await expect(page.locator('#authTitle')).toHaveText('Acceso cliente');
  });

  test('sin backend, los proveedores OAuth aparecen como no configurados', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#googleState')).toHaveText('No configurado');
    await expect(page.locator('[data-provider="google"]')).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('catálogo y carrito', () => {
  test('muestra el catálogo de respaldo con estado honesto', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await expect(page.locator('#products .product')).toHaveCount(6);
    await expect(page.locator('#catalogStatus')).toHaveText(
      'Catálogo configurado · proveedor pendiente',
    );
    await expect(product(page, '100 + 10 Diamantes')).toContainText('$ 4.000 COP');
    await expect(product(page, '100 + 10 Diamantes')).toContainText('Proveedor pendiente');
  });

  test('agregar, sumar, restar y vaciar actualiza carrito, totales y almacenamiento', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const card = product(page, '100 + 10 Diamantes');

    await card.locator('.add-btn').click();
    await expect(page.locator('#smartCount')).toHaveText('1 ítem');
    await expect(page.locator('#smartTotal')).toHaveText('$ 4.000 COP');
    await expect(page.locator('#cartBadge')).toHaveText('1');
    await expect(card).toHaveClass(/selected/);

    await card.locator('[data-op="plus"]').click();
    await expect(page.locator('#smartCount')).toHaveText('2 ítems');
    await expect(page.locator('#smartTotal')).toHaveText('$ 8.000 COP');
    await expect(page.locator('#invoiceTotal')).toHaveText('$ 8.000 COP');
    expect((await storedState(page)).qty).toEqual({ 'demo-110': 2 });

    await product(page, '310 + 31 Diamantes').locator('.add-btn').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 19.000 COP');

    await card.locator('[data-op="minus"]').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 15.000 COP');

    await page.locator('#smartClear').click();
    await expect(page.locator('#smartCount')).toHaveText('0 ítems');
    await expect(page.locator('#smartList')).toContainText('Tu compra empieza aquí.');
    expect((await storedState(page)).qty).toEqual({});
  });

  test('la tarifa promo cambia precios y totales', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.locator('.tariff-toggle button[data-tariff="promo"]').click();
    const card = product(page, '100 + 10 Diamantes');
    await expect(card.locator('.product-price strong')).toHaveText('$ 3.800 COP');
    await expect(card.locator('.product-price s')).toHaveText('$ 4.000 COP');
    await expect(card).toContainText('Ahorra $ 200 COP');
    await expect(page.locator('#smartTotal')).toHaveText('$ 3.800 COP');
    await page.locator('.tariff-toggle button[data-tariff="normal"]').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 4.000 COP');
  });

  test('el cajón lateral lista y elimina productos', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
    await page.locator('#cartBtn').click();
    await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
    await expect(page.locator('#drawerItems')).toContainText('520 + 52 Diamantes');
    await expect(page.locator('#drawerTotal')).toHaveText('$ 18.000 COP');
    await page.locator('#drawerItems [data-drawer-op="remove"]').click();
    await expect(page.locator('#drawerItems')).toContainText('No hay recargas en el carrito.');
    await page.locator('#drawerClose').click();
    await expect(page.locator('#cartDrawer')).not.toHaveClass(/open/);
  });

  test('favoritos: marcar, listar y agregar desde el modal', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '1.060 + 106 Diamantes').locator('.fav-btn').click();
    await expect(page.locator('#favCount')).toHaveText('1');
    await expect(product(page, '1.060 + 106 Diamantes').locator('.fav-btn')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('#favoritesBtn').click();
    await expect(page.locator('#favoritesModal')).toBeVisible();
    await page.locator('#favoritesList .favorite-entry button').click();
    await expect(page.locator('#favoritesModal')).toBeHidden();
    await expect(page.locator('#smartTotal')).toHaveText('$ 33.000 COP');
    expect(await page.evaluate(() => localStorage.getItem('tgs_favorites_v3'))).toBe(
      '["demo-1166"]',
    );
  });

  test('los juegos "próximamente" no cambian el catálogo', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    // aria-disabled no bloquea el clic real del usuario (Playwright sí lo trata como deshabilitado).
    await page.locator('.game-tab[data-game="roblox"]').click({ force: true });
    await expect(page.locator('#toastStack')).toContainText('Este juego llegará próximamente.');
    await expect(page.locator('#catalogTitle')).toHaveText('Free Fire');
  });

  test('el carrito persiste al recargar la página', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.reload();
    await expect(page.locator('#entryExperience')).toBeVisible();
    await enterAsGuest(page);
    await expect(page.locator('#smartTotal')).toHaveText('$ 4.000 COP');
  });
});

test.describe('búsqueda y navegación', () => {
  test('la búsqueda encuentra paquetes y ofrece buscar un UID', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#searchBtn').click();
    await expect(page.locator('#searchPanel')).toBeVisible();
    await page.locator('#searchInput').fill('310');
    await expect(page.locator('#searchResults')).toContainText('310 + 31 Diamantes');
    await page.locator('#searchInput').fill('123456789');
    await expect(page.locator('#searchResults')).toContainText('Buscar jugador 123456789');
    await page.keyboard.press('Escape');
    await expect(page.locator('#searchPanel')).toBeHidden();
  });

  test('el panel de búsqueda se ve y se puede cerrar con el ratón', async ({ page }) => {
    // DEFECTO del original: `.header{contain:paint}` recorta el panel bajo la cabecera.
    test.fail(true, 'defecto conocido: el panel de búsqueda queda recortado');
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#searchBtn').click();
    await page.locator('#closeSearch').click({ timeout: 3_000 });
    await expect(page.locator('#searchPanel')).toBeHidden();
  });

  test('el menú de cuenta se ve con sesión iniciada (demo)', async ({ page }) => {
    // DEFECTO del original: mismo recorte de `.header{contain:paint}`.
    test.fail(true, 'defecto conocido: el menú de cuenta queda recortado');
    await page.goto('/?demo=1');
    await page.locator('#enterStoreBtn').click();
    await page.locator('#loginEmail').fill('cliente@example.com');
    await page.locator('#loginPassword').fill('contrasena-demo');
    await page.locator('#loginSubmit').click();
    await expect(page.locator('#accountName')).toHaveText('cliente');
    await page.locator('#accountBtn').click();
    await expect(page.locator('#accountMenu')).toBeVisible();
    await page.locator('#menuInvoice').click({ timeout: 3_000 });
    await expect(page.locator('#accountMenu')).toBeHidden();
  });

  test('la tecla "/" abre la búsqueda', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(page.locator('#searchPanel')).toBeVisible();
    await expect(page.locator('#searchInput')).toBeFocused();
  });

  test('el botón de cuenta de un invitado abre el acceso', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#accountBtn').click();
    await expect(page.locator('#loginModal')).toBeVisible();
  });
});

test.describe('jugador y comprobante (sin backend)', () => {
  test('valida el UID y muestra el error del backend ausente', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#playerUid').fill('12a3');
    await expect(page.locator('#playerUid')).toHaveValue('123');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText(
      'El UID debe contener entre 6 y 12 dígitos.',
    );
    await page.locator('#playerUid').fill('123456789');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('SERVER_UNAVAILABLE');
    await expect(page.locator('#verifyBtn')).toBeEnabled();
  });

  test('exporta el comprobante como JPG y PDF', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();

    const jpg = page.waitForEvent('download');
    await page.locator('#jpgBtn').click();
    const jpgDownload = await jpg;
    expect(jpgDownload.suggestedFilename()).toMatch(/^TGS-\d+\.jpg$/);
    const jpgBytes = await readFile(await jpgDownload.path());
    expect([...jpgBytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    const pdf = page.waitForEvent('download');
    await page.locator('#pdfBtn').click();
    const pdfDownload = await pdf;
    expect(pdfDownload.suggestedFilename()).toMatch(/^TGS-\d+\.pdf$/);
    const pdfBytes = await readFile(await pdfDownload.path());
    expect(pdfBytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(pdfBytes.subarray(-5).toString('latin1')).toBe('%%EOF');
  });

  test('"Nueva factura" reinicia carrito, jugador y datos del cliente', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.locator('#customerName').fill('Cliente Prueba');
    await expect(page.locator('#invoiceClient')).toHaveText('Cliente Prueba');
    await page.locator('#newInvoiceBtn').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 0 COP');
    await expect(page.locator('#customerName')).toHaveValue('');
    await expect(page.locator('#invoiceClient')).toHaveText('—');
    await page.locator('#newInvoiceBtn').click();
    await expect(page.locator('#invoiceRef')).toHaveText('TGS-0002');
  });

  test('"Nueva factura" genera una referencia distinta la primera vez', async ({ page }) => {
    // DEFECTO del original: la secuencia local arranca en 0 aunque la factura inicial ya es
    // la 1, así que la primera "nueva factura" repite TGS-0001. La numeración pasa al
    // servidor en fases posteriores; aquí solo se documenta.
    test.fail(true, 'defecto conocido: la primera nueva factura repite TGS-0001');
    await page.goto('/');
    await enterAsGuest(page);
    await expect(page.locator('#invoiceRef')).toHaveText('TGS-0001');
    await page.locator('#newInvoiceBtn').click();
    await expect(page.locator('#invoiceRef')).not.toHaveText('TGS-0001', { timeout: 2_000 });
  });
});

test.describe('modo demo local (?demo=1)', () => {
  test('flujo completo: jugador → datos → pago simulado → entrega simulada', async ({ page }) => {
    await page.goto('/?demo=1');
    await enterAsGuest(page);
    await expect(page.locator('#serviceText')).toHaveText('Modo demo local · interfaz interactiva');
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();

    await page.locator('#playerUid').fill('123456789');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('Jugador TGS · Demo');
    await page.locator('#confirmPlayer').click();
    await expect(page.locator('#invoiceNick')).toHaveText('Jugador TGS · Demo');
    await expect(page.locator('#nickState')).toHaveText('Listo');

    await page.locator('#customerName').fill('Cliente Demo');
    await page.locator('#customerEmail').fill('cliente@example.com');
    await page.locator('#paymentMethod').selectOption('wompi');
    await page.locator('#acceptTerms').check();
    await expect(page.locator('#payBtn')).toBeEnabled();
    await expect(page.locator('#payBtn')).toHaveText('Simular pago demo');

    await page.locator('#payBtn').click();
    await expect(page.locator('#paymentModal')).toBeVisible();
    await expect(page.locator('#paymentPrep')).toContainText('Modo demostración');
    await page.locator('#startPayment').click();
    await expect(page.locator('#paymentModal')).toBeHidden({ timeout: 5_000 });
    await expect(page.locator('#trackDelivery')).toHaveClass(/done/, { timeout: 6_000 });
    await expect(page.locator('#trackingMessage')).toHaveText(
      'Operación completada. Recarga entregada.',
    );
    await expect(page.locator('#invoiceState')).toHaveText('Recarga completada');

    await page.locator('#accountBtn').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('menuHistory')?.click());
    await expect(page.locator('#historyModal')).toBeVisible();
    await expect(page.locator('#historyList')).toContainText('TGS-DEMO-');
    await expect(page.locator('#historyList')).toContainText('Recarga completada');
  });
});
