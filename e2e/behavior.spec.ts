import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';
import { ADMIN_PATH } from './support/admin-path.js';

/**
 * Comportamiento de la tienda contra el servidor real (PostgreSQL + API) con Mercado Pago
 * sustituido por un doble de pruebas. El "operador" se simula con rutas /__e2e__/.
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
    () => JSON.parse(localStorage.getItem('tgs_ui_v6') ?? '{}') as Record<string, unknown>,
  );
}

async function fillCheckout(page: Page, uid: string) {
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await page.locator('#playerUid').fill(uid);
  await page.locator('#verifyBtn').click();
  await expect(page.locator('#playerResult')).toContainText(`UID ${uid} listo`);
  await page.locator('#customerName').fill('Cliente E2E');
  await page.locator('#customerEmail').fill(`e2e-${uid}@example.com`);
  await page.locator('#paymentMethod').selectOption('mercadopago');
  await page.locator('#acceptTerms').check();
}

async function createOrder(page: Page, uid: string): Promise<string> {
  await fillCheckout(page, uid);
  await expect(page.locator('#payBtn')).toHaveText('Crear pedido');
  await page.locator('#payBtn').click();
  await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-[0-9A-Z]{10}$/);
  return (await page.locator('#invoiceRef').textContent()) ?? '';
}

const operator = (page: Page, path: string, data: object) =>
  page.request.post(`/__e2e__/${path}`, { data, headers: { 'x-tgs-csrf': '1' } });

test.describe('entrada y acceso', () => {
  test('la tienda arranca bloqueada y se abre como invitado con el catálogo del servidor', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/entry-locked/);
    await enterAsGuest(page);
    await expect(page.locator('#products .product')).toHaveCount(6);
    await expect(page.locator('#catalogStatus')).toHaveText('Catálogo disponible');
    // El servidor de pruebas usa MP_MODE=sandbox: la tienda lo anuncia.
    await expect(page.locator('#serverState')).toContainText('Modo prueba · Mercado Pago sandbox');
  });

  test('el acceso solo ofrece métodos reales: sin formulario de contraseña ni redes sin soporte', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#loginModal input[type="password"]')).toHaveCount(0);
    await expect(page.locator('[data-provider="vk"]')).toHaveCount(0);
    // El servidor de pruebas configura Discord y Facebook (dobles), no Google: el cliente
    // solo ve los accesos que funcionan.
    await expect(page.locator('#loginModal .oauth-btn:visible')).toHaveCount(2);
    await expect(page.locator('#discordState')).toHaveText('Disponible');
    await expect(page.locator('#facebookState')).toHaveText('Disponible');
    await expect(page.locator('[data-provider="google"]')).toBeHidden();
    await expect(page.locator('#authSubtitle')).toHaveText(
      'Entra con Facebook o Discord para conservar tu historial de pedidos.',
    );
    // Un acceso no configurado sigue deshabilitado y, aun forzando el clic, no navega.
    await expect(page.locator('[data-provider="google"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-provider="google"]').dispatchEvent('click');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#guestBtn')).toBeVisible();
  });

  test('sin accesos configurados, comprar como invitado es la opción principal', async ({
    page,
  }) => {
    await page.route('**/api/config', async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: { ...json, auth: { google: false, discord: false, facebook: false } },
      });
    });
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#loginModal .oauth-btn:visible')).toHaveCount(0);
    await expect(page.locator('#oauthGrid')).toBeHidden();
    await expect(page.locator('#authSubtitle')).toContainText('Compra sin crear cuenta');
    await expect(page.locator('#guestBtn')).toHaveClass(/btn primary/);
    await page.locator('#guestBtn').click();
    await expect(page.locator('#loginModal')).toBeHidden();
    await expect(page.locator('#products .product')).toHaveCount(6);
  });

  test('entrar con Discord y vincular Facebook desde Mi cuenta', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await page.locator('[data-provider="discord"]').click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('#accountName')).toHaveText('Gamer Discord');
    await page.locator('#accountBtn').click();
    await expect(page.locator('#menuLinksList')).toContainText('Discord ✓');
    await page.locator('#menuLinksList a', { hasText: 'Vincular Facebook' }).click();
    await page.waitForURL(/\/$/);
    await page.locator('#accountBtn').click();
    await expect(page.locator('#menuLinksList')).toContainText('Facebook ✓');
    await expect(page.locator('#menuLinksList')).toContainText('Discord ✓');
  });
});

test.describe('catálogo y carrito', () => {
  test('agregar, sumar, restar y vaciar actualiza carrito y totales con precios del servidor', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const card = product(page, '100 + 10 Diamantes');
    await card.locator('.add-btn').click();
    await card.locator('[data-op="plus"]').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 7.600 COP');
    await expect(page.locator('#cartBadge')).toHaveText('2');
    expect((await storedState(page)).qty).toEqual({ 'ff-110': 2 });
    await card.locator('[data-op="minus"]').click();
    await expect(page.locator('#smartTotal')).toHaveText('$ 3.800 COP');
    await page.locator('#smartClear').click();
    await expect(page.locator('#cartBadge')).toHaveText('0');
  });

  test('no permite más de 5 unidades por paquete', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const card = product(page, '310 + 31 Diamantes');
    await card.locator('.add-btn').click();
    for (let i = 0; i < 6; i += 1) await card.locator('[data-op="plus"]').click();
    await expect(card.locator('.qty span')).toHaveText('5');
    await expect(page.locator('#toastStack')).toContainText('Máximo 5 unidades');
  });

  test('la tarifa promo muestra el ahorro sin cambiar lo que cobra el servidor', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('.tariff-toggle button[data-tariff="promo"]').click();
    await expect(product(page, '100 + 10 Diamantes').locator('s')).toHaveText('$ 4.000 COP');
    await expect(product(page, '100 + 10 Diamantes').locator('.product-price strong')).toHaveText(
      '$ 3.800 COP',
    );
  });

  test('el cajón lateral lista y elimina productos', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
    await page.locator('#cartBtn').click();
    await expect(page.locator('#drawerItems')).toContainText('520 + 52 Diamantes');
    await page.locator('#drawerItems [data-drawer-op="remove"]').click();
    await expect(page.locator('#drawerItems')).toContainText('No hay recargas');
  });

  test('favoritos: marcar, listar y agregar desde el modal', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '1.060 + 106 Diamantes').locator('.fav-btn').click();
    await page.locator('#favoritesBtn').click();
    await expect(page.locator('#favoritesList')).toContainText('1.060 + 106 Diamantes');
    await page.locator('#favoritesList [data-fav-op="add"]').click();
    await expect(page.locator('#cartBadge')).toHaveText('1');
  });

  test('los juegos "próximamente" no cambian el catálogo', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    // aria-disabled no bloquea el clic real del usuario (Playwright sí lo trata como deshabilitado).
    await page.locator('.game-tab[data-game="roblox"]').click({ force: true });
    await expect(page.locator('#toastStack')).toContainText('próximamente');
    await expect(page.locator('#products .product')).toHaveCount(6);
  });

  test('el carrito persiste al recargar (solo preferencias, sin datos personales)', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '2.180 + 218 Diamantes').locator('.add-btn').click();
    await page.locator('#customerName').fill('Nombre Privado');
    await page.reload();
    await enterAsGuest(page);
    await expect(page.locator('#cartBadge')).toHaveText('1');
    const all = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(all).not.toContain('Nombre Privado');
  });
});

test.describe('carrito y favoritos (mejoras)', () => {
  test('vaciar el carrito se puede deshacer', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '310 + 31 Diamantes').locator('.add-btn').click();
    await page.locator('#smartClear').click();
    await expect(page.locator('#cartBadge')).toHaveText('0');
    await page.locator('#toastStack .toast-action').click();
    await expect(page.locator('#cartBadge')).toHaveText('1');
  });

  test('el carrito lateral muestra el ahorro de la promoción', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.locator('#cartBtn').click();
    await expect(page.locator('#drawerSaving')).toHaveText(
      'Ahorras $ 200 COP con la promoción vigente',
    );
  });

  test('favoritos: quitar (con deshacer) desde el modal', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '520 + 52 Diamantes').locator('.fav-btn').click();
    await page.locator('#favoritesBtn').click();
    await page.locator('#favoritesList [data-fav-op="remove"]').click();
    await expect(page.locator('#favoritesList')).toContainText(
      'Todavía no tienes paquetes favoritos',
    );
    await page.locator('#toastStack .toast-action').click();
    await expect(page.locator('#favoritesList')).toContainText('520 + 52 Diamantes');
  });

  test('"Revisar factura" lleva al siguiente paso que falta', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.locator('#smartReview').click();
    await expect(page.locator('#playerUid')).toBeFocused();
  });

  test('el carrito se sincroniza entre pestañas', async ({ page, context }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const other = await context.newPage();
    await other.goto('/');
    await enterAsGuest(other);
    await product(page, '2.180 + 218 Diamantes').locator('.add-btn').click();
    await expect(other.locator('#cartBadge')).toHaveText('1');
  });
});

test.describe('estado de la tienda y soporte', () => {
  test('el panel del inicio muestra el estado real del servidor, sin cifras fijas', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    // Servidor de pruebas: catálogo cargado, consulta de jugador disponible y pagos sandbox.
    await expect(page.locator('#meterCatalog')).toHaveAttribute('data-state', 'ok');
    await expect(page.locator('#meterCatalog b')).toHaveText('Activo');
    await expect(page.locator('#meterPlayer b')).toHaveText('Al instante');
    await expect(page.locator('#meterPayment')).toHaveAttribute('data-state', 'partial');
    await expect(page.locator('#meterPayment b')).toHaveText('Prueba');
    await expect(page.locator('.meter-list')).not.toContainText('%');
  });

  test('las burbujas de soporte solo muestran los canales configurados', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    // El servidor de pruebas solo define SUPPORT_EMAIL.
    const email = page.locator('#floatEmail');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('href', /^mailto:soporte@example\.com\?subject=/);
    await expect(page.locator('#floatWhatsApp')).toBeHidden();
    await expect(page.locator('#supportWhatsappState')).toHaveText('No disponible por ahora');
    const box = await email.boundingBox();
    expect(box?.width).toBe(box?.height);
  });

  test('"Mis favoritos" en el menú de cuenta abre los favoritos guardados', async ({ page }) => {
    await page.goto('/');
    // El menú de cuenta es para clientes con sesión (al invitado el botón le abre el acceso).
    await page.locator('#enterStoreBtn').click();
    await page.locator('[data-provider="discord"]').click();
    await expect(page.locator('#accountName')).toHaveText('Gamer Discord');
    await product(page, '520 + 52 Diamantes').locator('.fav-btn').click();
    await page.locator('#accountBtn').click();
    await page.locator('#menuFavorites').click();
    await expect(page.locator('#favoritesModal')).toBeVisible();
    await expect(page.locator('#favoritesList')).toContainText('520 + 52 Diamantes');
    await expect(page.locator('#favoritesList [data-fav-op="remove"]')).toHaveCSS(
      'color',
      'rgb(255, 159, 176)',
    );
  });
});

test.describe('búsqueda y navegación', () => {
  test('la búsqueda encuentra paquetes y ofrece buscar un UID', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#searchBtn').click();
    await page.locator('#searchInput').fill('5.600');
    await expect(page.locator('#searchResults')).toContainText('5.600 + 560 Diamantes');
    await page.locator('#searchInput').fill('123456789');
    await page.locator('#searchResults .search-result').first().click();
    await expect(page.locator('#playerFinderModal')).toBeVisible();
    await expect(page.locator('#finderResult')).toContainText('UID 123456789');
  });

  test('la tecla "/" abre la búsqueda', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.keyboard.press('/');
    await expect(page.locator('#searchPanel')).toBeVisible();
  });

  test('el botón de cuenta de un invitado abre el acceso', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#accountBtn').click();
    await expect(page.locator('#loginModal')).toBeVisible();
  });
});

test.describe('compra completa (invitado)', () => {
  test('UID → pedido → verificación → "Sí, es mi cuenta" → Confirmar y pagar → Mercado Pago → entrega', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const ref = await createOrder(page, '765432198');
    await expect(page.locator('#invoiceState')).toHaveText('Verificando jugador');
    await expect(page.locator('#payBtn')).toBeDisabled();

    // El operador verifica el jugador con una fuente legítima.
    expect(
      (await operator(page, 'verify', { ref, nickname: 'JugadorE2E', region: 'Colombia' })).ok(),
    ).toBe(true);
    await page.locator('#refreshOrderBtn').click();
    await expect(page.locator('#playerResult')).toContainText('Vas a recargar a: JugadorE2E');
    await page.locator('#confirmPlayer').click();
    await expect(page.locator('#invoiceState')).toHaveText('Pago pendiente');
    await expect(page.locator('#invoiceNick')).toHaveText('JugadorE2E');

    // Confirmación explícita con resumen completo antes de pagar.
    await page.locator('#payBtn').click();
    await expect(page.locator('#paymentModal')).toBeVisible();
    await expect(page.locator('#paymentPrep')).toContainText('1× 100 + 10 Diamantes');
    await expect(page.locator('#paymentPrep')).toContainText('Pago con Mercado Pago');
    // El servidor de pruebas declara MP_MODE=sandbox: se avisa de que no hay cobro real.
    await expect(page.locator('#paymentPrep')).toContainText('MODO PRUEBA (sin cobro real)');
    await expect(page.locator('#serverState')).toContainText('Modo prueba');
    await expect(page.locator('#payAmount')).toHaveText('$ 3.800 COP');
    await page.locator('#startPayment').click();

    // Vuelve de "Mercado Pago": el servidor confirma el pago (webhook + consulta).
    await page.waitForURL(/\/#seguimiento$/);
    await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');
    await expect(page.locator('#trackPayment')).toHaveClass(/done/);
    // Al volver se ve la ruta de seguimiento completa, justo bajo la cabecera.
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('seguimiento')?.getBoundingClientRect().top),
      )
      .toBeCloseTo(82, -1);

    expect((await operator(page, 'deliver', { ref })).ok()).toBe(true);
    await page.locator('#refreshOrderBtn').click();
    await expect(page.locator('#invoiceState')).toHaveText('Recarga completada');
    await expect(page.locator('#trackingMessage')).toHaveText(
      'Operación completada. Recarga entregada.',
    );

    await page.locator('#accountBtn').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('menuHistory')?.click());
    await expect(page.locator('#historyList')).toContainText(ref);
    await expect(page.locator('#historyList')).toContainText('Recarga completada');
  });

  test('el pedido se recupera tras recargar la página', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const ref = await createOrder(page, '765432199');
    await page.reload();
    await expect(page.locator('#invoiceRef')).toHaveText(ref);
    await expect(page.locator('#invoiceState')).toHaveText('Verificando jugador');
    const all = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(all).not.toContain('@example.com');
  });

  test('"Nueva factura" empieza un pedido nuevo sin borrar el anterior del servidor', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await createOrder(page, '765432200');
    await page.locator('#newInvoiceBtn').click();
    await expect(page.locator('#invoiceRef')).toHaveText('BORRADOR');
    await expect(page.locator('#playerUid')).toHaveValue('');
    await expect(page.locator('#payBtn')).toHaveText('Crear pedido');
    await page.evaluate(() => document.getElementById('menuHistory')?.click());
    await expect(page.locator('#historyList .history-entry')).not.toHaveCount(0);
  });

  test('consulta instantánea: ID → nickname y región → "Sí, es mi cuenta" → pedido listo para pagar', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    await page.locator('#playerUid').fill('912345678');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('Vas a recargar a: Jugador5678');
    await expect(page.locator('#playerResult')).toContainText('Región: Colombia');
    // El UID ya es válido y se encontró; lo que falta es confirmar el nickname.
    await expect(page.locator('#uidState')).toHaveText('Listo');
    await expect(page.locator('#nickState')).toHaveText('Pendiente');
    // Sin confirmar, no se crea el pedido aunque todo lo demás esté completo: el botón dice qué
    // falta y lleva al jugador.
    await page.locator('#customerName').fill('Cliente E2E');
    await page.locator('#customerEmail').fill('e2e-lookup@example.com');
    await page.locator('#paymentMethod').selectOption('mercadopago');
    await page.locator('#acceptTerms').check();
    await page.locator('#payBtn').click();
    await expect(page.locator('.toast').last()).toContainText('Sí, es mi cuenta');
    await expect(page.locator('#invoiceRef')).not.toHaveText(/^TGS-/);
    await page.locator('#confirmLookup').click();
    await expect(page.locator('#playerResult')).toContainText('Jugador5678 ✓');
    await expect(page.locator('#nickState')).toHaveText('Listo');
    await expect(page.locator('#invoiceNick')).toHaveText('Jugador5678');
    await page.locator('#payBtn').click();
    await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-[0-9A-Z]{10}$/);
    // Sin esperar al operador: directo a "Confirmar y pagar".
    await expect(page.locator('#invoiceState')).toHaveText('Pago pendiente');
    await expect(page.locator('#payBtn')).toHaveText(/Confirmar y pagar/);
  });

  test('consulta instantánea: ID inexistente se informa y editar el UID anula la consulta', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#playerUid').fill('812345678');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('No encontramos ese ID');
    await expect(page.locator('#uidState')).toHaveText('Pendiente');

    await page.locator('#playerUid').fill('912340000');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#confirmLookup')).toBeVisible();
    await page.locator('#playerUid').fill('91234000');
    await expect(page.locator('#playerResult')).toBeHidden();
  });

  test('si el proveedor no responde, pasa a verificación manual', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#playerUid').fill('712345678');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('UID 712345678 listo');
    await expect(page.locator('#uidState')).toHaveText('Listo');
  });

  test('el buscador por ID muestra el jugador y lo usa sin otra consulta', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    let lookups = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/player/lookup')) lookups += 1;
    });
    await page.locator('#playerFinderBtn').click();
    await page.locator('#finderUid').fill('923456789');
    await page.locator('#finderSearchBtn').click();
    await expect(page.locator('#finderResult')).toContainText('Jugador6789');
    await page.locator('#finderUseBtn').click();
    await expect(page.locator('#playerResult')).toContainText('Vas a recargar a: Jugador6789');
    expect(lookups).toBe(1);
  });

  test('valida el UID antes de continuar', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await page.locator('#playerUid').fill('12a3');
    await page.locator('#verifyBtn').click();
    await expect(page.locator('#playerResult')).toContainText('entre 6 y 12 dígitos');
  });
});

test.describe('comprobante', () => {
  test('exporta el comprobante como JPG y PDF', async ({ page }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
    const [jpg] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#jpgBtn').click(),
    ]);
    expect(jpg.suggestedFilename()).toBe('Comprobante-BORRADOR.jpg');
    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#pdfBtn').click(),
    ]);
    const bytes = await readFile(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

test.describe('panel de administración', () => {
  test('sin sesión muestra el acceso con Google', async ({ page }) => {
    await page.goto(ADMIN_PATH);
    await expect(page.locator('#admLogin')).toBeVisible();
    await expect(page.locator('#admApp')).toBeHidden();
  });

  test('el dueño pasa a ver la tienda como cliente y vuelve al panel autenticándose', async ({
    page,
    context,
  }) => {
    const { token } = (await (await operator(page, 'admin-session', {})).json()) as {
      token: string;
    };
    await context.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
    await page.goto(ADMIN_PATH);
    await expect(page.locator('#admApp')).toBeVisible();

    // "Ver tienda como cliente": misma cuenta, sesión de cliente, en la tienda.
    await page.locator('#admAsCustomer').click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('#accountName')).not.toHaveText('Invitado');
    const asCustomer = await page.request.get('/api/admin/orders');
    expect(asCustomer.status()).toBe(404);

    // Solo el dueño ve el acceso a su panel en el menú de cuenta.
    await page.locator('#accountBtn').click();
    await expect(page.locator('#menuAdmin')).toBeVisible();
    await page.locator('#menuAdmin').click();
    await page.waitForURL((url) => url.pathname === ADMIN_PATH);
    // Volver al panel exige autenticarse otra vez (Google + código).
    await expect(page.locator('#admLogin')).toBeVisible();
    await expect(page.locator('#admApp')).toBeHidden();
  });

  test('el operador verifica el jugador y entrega el pedido desde el panel', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const ref = await createOrder(page, '765432201');

    const { token } = (await (await operator(page, 'admin-session', {})).json()) as {
      token: string;
    };
    await context.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
    const admin = await context.newPage();
    // Notificaciones observables, con permiso concedido pero como en Chrome para Android:
    // `new Notification` lanza "Illegal constructor". El panel debe seguir al día igualmente.
    await admin.addInitScript(() => {
      const notices: { title: string; body: string | undefined }[] = [];
      Object.assign(window, { __notices: notices });
      class AndroidLikeNotification {
        static permission = 'granted';
        static requestPermission = () => Promise.resolve('granted');
        constructor(title: string, options?: { body?: string }) {
          notices.push({ title, body: options?.body });
          throw new TypeError('Illegal constructor');
        }
      }
      Object.defineProperty(window, 'Notification', { value: AndroidLikeNotification });
    });
    await admin.goto(ADMIN_PATH);
    await expect(admin.locator('#admApp')).toBeVisible();
    await expect(admin.locator('#admNotify')).toHaveText('Activar sonido de avisos');
    await admin.locator('#admNotify').click();
    await expect(admin.locator('#admNotify')).toBeDisabled();
    await admin.locator('#admSearch').fill(ref);
    await admin.locator('#admReload').click();
    await admin.locator('#admOrders tr', { hasText: ref }).click();
    await admin.locator('#vNick').fill('NickPanel');
    await admin.locator('#vRegion').fill('Colombia');
    await admin.locator('#vSave').click();
    await expect(admin.locator('#admMessage')).toHaveText('Verificación guardada.');

    await page.locator('#refreshOrderBtn').click();
    await page.locator('#confirmPlayer').click();
    // Lo que hace "Pagar" depende del estado: esperar a que el servidor confirme al jugador.
    await expect(page.locator('#invoiceState')).toHaveText('Pago pendiente');
    await page.locator('#payBtn').click();
    await page.locator('#startPayment').click();
    await page.waitForURL(/\/#seguimiento$/);
    await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');

    // El panel avisa del pago nuevo: notificación del sistema y contador en el título.
    await admin.locator('#admReload').click();
    await expect(admin).toHaveTitle(/^\(\d+\) Pagados por entregar · /);
    const notices = await admin.evaluate(
      () => (window as unknown as { __notices: { title: string }[] }).__notices,
    );
    expect(notices.map((n) => n.title)).toContain('Pedido pagado por entregar');
    // Aunque la notificación falle, la alerta del panel muestra la misma cifra que el título.
    const pending = Number(/^\((\d+)\)/.exec(await admin.title())?.[1]);
    await expect(
      admin.locator('.adm-alert', { hasText: 'Pagados por entregar' }).locator('b'),
    ).toHaveText(String(pending));
    await admin.locator('[data-f="claim"]').click();
    await admin.locator('[data-f="start"]').click();
    await admin.locator('#fEvidence').fill('Recarga hecha en el panel del proveedor');
    await admin.locator('[data-f="deliver"]').click();
    await expect(admin.locator('#admDetail h2')).toContainText('Entregado');
    await page.locator('#refreshOrderBtn').click();
    await expect(page.locator('#invoiceState')).toHaveText('Recarga completada');
  });
});
