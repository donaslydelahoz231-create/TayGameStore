import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { totp } from '../src/server/lib/totp.js';
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
  await page.locator('#payMeansCard').check();
  await page.locator('#acceptTerms').check();
}

async function createOrder(page: Page, uid: string): Promise<string> {
  await fillCheckout(page, uid);
  // Un solo botón con el total, como en las tiendas de recargas.
  await expect(page.locator('#payBtn')).toHaveText('Pagar $ 3.800 COP');
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
    // El servidor de pruebas no cobra dinero real: la tienda lo anuncia sin tecnicismos.
    await expect(page.locator('#serverState')).toContainText('Modo prueba · sin cobros reales');
    await expect(page.locator('body')).not.toContainText(/sandbox/i);
    // Cada paquete dice cómo llega y cuánto cuestan 100 diamantes con el precio vigente.
    await expect(page.locator('#products .product').first().locator('.product-meta')).toContainText(
      /Directo a tu ID.*c\/100/,
    );
    // Ayuda para encontrar el ID en el perfil del juego, sin datos inventados.
    await page.locator('.id-help summary').click();
    await expect(page.locator('.id-help ol')).toContainText('Toca tu avatar');
  });

  test('el acceso solo ofrece métodos reales: sin formulario de contraseña ni redes sin soporte', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#loginModal input[type="password"]')).toHaveCount(0);
    await expect(page.locator('#loginModal .oauth-btn')).toHaveCount(2);
    await expect(page.locator('[data-provider="vk"]')).toHaveCount(0);
    // Discord se retiró a pedido del dueño.
    await expect(page.locator('[data-provider="discord"]')).toHaveCount(0);
    // El servidor de pruebas configura Facebook (doble), no Google.
    await expect(page.locator('#facebookState')).toHaveText('Disponible');
    await expect(page.locator('#googleState')).toHaveText('No configurado');
    // Un acceso no configurado está deshabilitado y, aun forzando el clic, no navega: ni
    // siquiera sale la petición (la URL sola no basta: el servidor redirige de vuelta a "/").
    const intentos: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/auth/')) intentos.push(r.url());
    });
    await expect(page.locator('[data-provider="google"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-provider="google"]').click({ force: true });
    await expect(page.locator('#toastStack')).toContainText('no está disponible');
    await expect(page).toHaveURL(/\/$/);
    expect(intentos).toEqual([]);
  });

  test('mientras se comprueba el acceso, un clic en Google o Facebook no navega', async ({
    page,
  }) => {
    // Configuración lenta (servidor recién despertado): los botones arrancan deshabilitados.
    let liberar = () => {};
    const configLista = new Promise<void>((resolve) => (liberar = resolve));
    await page.route('**/api/config', async (route) => {
      await configLista;
      await route.continue();
    });
    const intentos: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/auth/')) intentos.push(r.url());
    });
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#facebookState')).toHaveText('Comprobando…');
    for (const proveedor of ['google', 'facebook']) {
      await expect(page.locator(`[data-provider="${proveedor}"]`)).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.locator(`[data-provider="${proveedor}"]`).click({ force: true });
    }
    await expect(page.locator('#toastStack')).toContainText('Comprobando el acceso');
    expect(intentos).toEqual([]);
    // Cuando llega la configuración, el proveedor configurado se habilita.
    liberar();
    await expect(page.locator('#facebookState')).toHaveText('Disponible');
    await expect(page.locator('[data-provider="facebook"]')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  test('entrar con Facebook y ver la red vinculada en Mi cuenta', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await page.locator('[data-provider="facebook"]').click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('#accountName')).toHaveText('Gamer Facebook');
    await page.locator('#accountBtn').click();
    await expect(page.locator('#menuLinksList')).toContainText('Facebook ✓');
    await expect(page.locator('#menuLinksList')).not.toContainText('Discord');
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

  test('radar promo: horario del fin de semana en hora de Colombia, del visitante y UTC', async ({
    page,
  }) => {
    for (const active of [false, true]) {
      await page.unroute('**/api/config');
      await page.route('**/api/config', async (route) => {
        const response = await route.fetch();
        const json = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: {
            ...json,
            promo: {
              schedule: 'weekends',
              timeZone: 'America/Bogota',
              active,
              startsAt: '2026-10-10T05:00:00.000Z',
              endsAt: '2026-10-12T05:00:00.000Z',
            },
          },
        });
      });
      await page.goto('/');
      await enterAsGuest(page);
      // La franja anuncia el mayor ahorro real (normal − promo) y abre la tabla de tarifas.
      await expect(page.locator('#promoStrip')).toContainText(
        active ? 'Promo activa hoy' : 'Promo sáb. y dom.',
      );
      await page.locator('#promoStrip').click();
      await expect(page.locator('#promoModal')).toBeVisible();
      const rows = page.locator('#tariffBoard tbody tr');
      await expect(rows).toHaveCount(6);
      // Ahorro real: $4.000 − $3.800 = $200 (nunca un «antes» inflado).
      await expect(rows.first()).toContainText('100 + 10');
      await expect(rows.first().locator('td')).toHaveText(['$4.000', '$3.800', '$200']);
      await expect(page.locator('#promoBadge')).toHaveText(active ? 'LIVE' : 'PRÓXIMA');
      await expect(page.locator('#promoStatus')).toContainText(
        active ? 'Termina el dom' : 'Empieza el sáb',
      );
      await expect(page.locator('#promoStatus')).toContainText('(hora de Colombia)');
      await expect(page.locator('#promoTimes')).toContainText('Colombia (UTC−5): sáb');
      await expect(page.locator('#promoTimes')).toContainText('Hora general (UTC): sáb');
      await page.locator('#activatePromo').click();
      await expect(page.locator('#promoModal')).toBeHidden();
    }
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
    // En la pantalla de bienvenida no hay burbujas: solo dentro de la tienda.
    await expect(page.locator('body')).toHaveClass(/entry-locked/);
    await expect(page.locator('#supportFloat')).toBeHidden();
    await enterAsGuest(page);
    await expect(page.locator('#supportFloat')).toBeVisible();
    // El servidor de pruebas solo define SUPPORT_EMAIL.
    const email = page.locator('#floatEmail');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('href', /^mailto:soporte@example\.com\?subject=/);
    // Antes de comprar, el mensaje es una consulta (nunca «pedido BORRADOR»).
    await expect(email).toHaveAttribute(
      'href',
      /subject=Consulta%20TayGameStore&body=Hola%20TayGameStore/,
    );
    await expect(page.locator('#floatWhatsApp')).toBeHidden();
    await expect(page.locator('#supportWhatsappState')).toHaveText('No disponible por ahora');
    const box = await email.boundingBox();
    expect(box?.width).toBe(box?.height);
  });

  test('"Mis favoritos" en el menú de cuenta abre los favoritos guardados', async ({ page }) => {
    await page.goto('/');
    // El menú de cuenta es para clientes con sesión (al invitado el botón le abre el acceso).
    await page.locator('#enterStoreBtn').click();
    await page.locator('[data-provider="facebook"]').click();
    await expect(page.locator('#accountName')).toHaveText('Gamer Facebook');
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
  test('una consulta vieja del pedido nunca deshace la confirmación del cliente', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const ref = await createOrder(page, '765432555');
    expect(
      (
        await operator(page, 'verify', { ref, nickname: 'JugadorCarrera', region: 'Colombia' })
      ).ok(),
    ).toBe(true);
    await page.locator('#refreshOrderBtn').click();
    await expect(page.locator('#playerResult')).toContainText('Vas a recargar a: JugadorCarrera');

    // El sondeo automático (cada 5 s) lee el pedido ANTES de que el cliente confirme, pero su
    // respuesta llega DESPUÉS (red lenta): no debe volver a mostrar "Confirma tu cuenta".
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = () => {};
    const pollHeld = new Promise<void>((resolve) => (held = resolve));
    await page.route(
      `**/api/orders/${ref}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const stale = await route.fetch();
        held();
        await gate;
        await route.fulfill({ response: stale });
      },
      { times: 1 },
    );
    await pollHeld;
    await page.locator('#confirmPlayer').click();
    await expect(page.locator('#invoiceState')).toHaveText('Pago pendiente');
    const staleDelivered = page.waitForResponse(
      (r) => r.url().endsWith(`/api/orders/${ref}`) && r.request().method() === 'GET',
    );
    release();
    await staleDelivered;
    // Sin reintentos: justo después de llegar la respuesta vieja el estado sigue siendo el nuevo.
    await page.waitForTimeout(300);
    expect(await page.locator('#invoiceState').textContent()).toBe('Pago pendiente');
    expect(await page.locator('#confirmPlayer').count()).toBe(0);
  });

  test('UID → pedido → verificación → "Sí, es mi cuenta" → Pagar → Mercado Pago → entrega', async ({
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

    // Confirmado el jugador, "Pagar" lleva directo al cobro (sin ventanas intermedias).
    await expect(page.locator('#payBtn')).toHaveText('Pagar con Mercado Pago');
    await expect(page.locator('#serverState')).toContainText('Modo prueba');
    await page.locator('#payBtn').click();

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

  test('Nequi: transferencia directa sin pasar por Mercado Pago; el dueño la confirma', async ({
    page,
  }) => {
    expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
    expect((await operator(page, 'nequi', { enabled: true })).ok()).toBe(true);
    try {
      await page.goto('/');
      await enterAsGuest(page);
      // Dos grupos separados: Mercado Pago y Nequi (cada uno con su propio flujo).
      await expect(page.locator('#payProviderMp')).toBeVisible();
      await expect(page.locator('#payProviderNequi')).toBeVisible();
      await expect(page.locator('#faqNequi')).not.toHaveAttribute('hidden', '');
      await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
      await page.locator('#playerUid').fill('734567855');
      await page.locator('#verifyBtn').click();
      await page.locator('#playerUidConfirm').fill('734567855');
      await page.locator('#confirmUid').click();
      await expect(page.locator('#playerResult')).toContainText('ID 734567855 confirmado ✓');
      await page.locator('#customerName').fill('Cliente Nequi');
      await page.locator('#customerEmail').fill('nequi-e2e@example.com');
      await page.locator('#payMeansNequi').check();
      await expect(page.locator('#invoiceMethod')).toHaveText('Nequi');
      await expect(page.locator('#payMeansHint')).toContainText('Sin Mercado Pago');
      await page.locator('#acceptTerms').check();
      await page.locator('#payBtn').click();
      // Nunca se abre Mercado Pago: quedan las instrucciones de la transferencia.
      await expect(page.locator('#nequiBox')).toBeVisible();
      expect(page.url()).not.toContain('mercadopago');
      const ref = (await page.locator('#invoiceRef').textContent()) ?? '';
      expect(ref).toMatch(/^TGS-[0-9A-Z]{10}$/);
      await expect(page.locator('#nequiPhone')).toHaveText('3001234567');
      await expect(page.locator('#nequiAmount')).toHaveText('$ 3.800 COP');
      await expect(page.locator('#nequiRef')).toHaveText(ref);
      // El aviso del cliente no es un pago: el pedido sigue esperando la verificación.
      await page.locator('#nequiLast4').fill('4321');
      await page.locator('#nequiReportBtn').click();
      await expect(page.locator('#nequiStatus')).toContainText('Recibimos tu aviso');
      await expect(page.locator('#invoiceState')).toHaveText('Transferencia Nequi por verificar');
      expect((await operator(page, 'confirm-nequi', { ref })).ok()).toBe(true);
      await page.locator('#refreshOrderBtn').click();
      await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');
      await expect(page.locator('#nequiBox')).toBeHidden();
      await expect(page.locator('#invoiceMethod')).toHaveText('Nequi · Pago confirmado');
    } finally {
      await operator(page, 'nequi', { enabled: false });
      await operator(page, 'player-verification', { mode: 'operator' });
    }
  });

  test('estilo LootBar: ID → lo repito y confirmo → pedido listo → pago → entrega, sin esperar al equipo', async ({
    page,
  }) => {
    expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
    try {
      await page.goto('/');
      await enterAsGuest(page);
      await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
      await page.locator('#playerUid').fill('734567812');
      await page.locator('#verifyBtn').click();
      await expect(page.locator('#playerResult')).toContainText('Vas a recargar al ID 734567812');
      await expect(page.locator('#nickState')).toHaveText('Pendiente');

      // Repetirlo mal no lo acepta; bien, sí.
      await page.locator('#playerUidConfirm').fill('734567813');
      await page.locator('#confirmUid').click();
      await expect(page.locator('#playerResult')).toContainText('Vas a recargar al ID');
      await page.locator('#playerUidConfirm').fill('734567812');
      await page.locator('#confirmUid').click();
      await expect(page.locator('#playerResult')).toContainText('ID 734567812 confirmado ✓');
      await expect(page.locator('#nickState')).toHaveText('Listo');

      // El servidor de la cuenta viaja con el pedido (la recarga se entrega allí).
      await expect(page.locator('#playerServer')).toHaveValue('latam');
      await page.locator('#playerServer').selectOption('brasil');
      await expect(page.locator('#invoiceRegion')).toHaveText('Brasil');

      await page.locator('#customerName').fill('Cliente Directo');
      await page.locator('#customerEmail').fill('directo-e2e@example.com');
      // El medio de pago se elige a la vista (como en otras tiendas de recargas).
      await expect(page.locator('#payBtn')).toBeEnabled();
      // Nequi es un método aparte (sin Mercado Pago): sin activarlo, la tienda no lo ofrece.
      await expect(page.locator('#payProviderNequi')).toBeHidden();
      await expect(page.locator('#faqNequi')).toBeHidden();
      await page.getByRole('radio', { name: /PSE/ }).check();
      await expect(page.locator('#invoiceMethod')).toHaveText('PSE');
      await expect(page.locator('#payMeansHint')).toContainText('eliges tu banco');
      await page.locator('#acceptTerms').check();
      // Un solo paso: "Pagar" crea el pedido y lleva directo a Mercado Pago, sin esperar al equipo.
      await expect(page.locator('#payBtn')).toHaveText('Pagar $ 3.800 COP');
      await page.locator('#payBtn').click();
      await page.waitForURL(/\/#seguimiento$/);
      await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-[0-9A-Z]{10}$/);
      const ref = (await page.locator('#invoiceRef').textContent()) ?? '';
      await expect(page.locator('#invoiceRegion')).toHaveText('Brasil');
      await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');

      // Cualquiera comprueba que el comprobante es real (pegando la línea completa del código);
      // uno alterado en un solo carácter no pasa.
      const code = (await page.locator('#invoiceCode').textContent()) ?? '';
      expect(code).toMatch(/V1-/);
      await page.locator('#verifyRef').fill(ref.toLowerCase());
      await page.locator('#verifyCode').fill(code);
      await page.locator('#verifyReceiptBtn').click();
      await expect(page.locator('#verifyReceiptResult')).toContainText('Comprobante auténtico');
      await expect(page.locator('#verifyReceiptResult')).toContainText(
        'Pago confirmado · recarga por entregar',
      );
      await expect(page.locator('#verifyReceiptResult')).toContainText('$ 3.800 COP');
      const forged = code.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
      await page.locator('#verifyCode').fill(forged);
      await page.locator('#verifyReceiptBtn').click();
      await expect(page.locator('#verifyReceiptResult')).toContainText('No es auténtico');

      // Antes de entregar no hay formulario de reseña, y la tienda no muestra reseñas inventadas.
      await expect(page.locator('#reviewBox')).toBeHidden();
      await expect(page.locator('#reviewsCount')).toHaveText('Aún no hay reseñas publicadas');
      await expect(page.locator('#reviewsList .review-card')).toHaveCount(0);

      expect((await operator(page, 'deliver', { ref })).ok()).toBe(true);
      await page.locator('#refreshOrderBtn').click();
      await expect(page.locator('#invoiceState')).toHaveText('Recarga completada');

      // Entregado: el comprador califica su compra (estrellas + comentario opcional).
      await expect(page.locator('#reviewForm')).toBeVisible();
      await page.locator('#reviewSubmit').click();
      await expect(page.locator('#reviewMsg')).toHaveText('Elige de 1 a 5 estrellas.');
      await page.locator('label[for="rate5"]').click();
      await page.locator('#reviewComment').fill('Me llegaron los diamantes rápido. Recomendada.');
      await page.locator('#reviewSubmit').click();
      await expect(page.locator('#reviewDone')).toContainText(
        'Publicaremos tu reseña cuando la revisemos',
      );
      await expect(page.locator('#reviewForm')).toBeHidden();

      // El dueño la publica y aparece en la tienda con nombre de pila e inicial.
      expect((await operator(page, 'moderate-reviews', { action: 'publish' })).ok()).toBe(true);
      await page.reload();
      await expect(page.locator('#reviewsCount')).toHaveText('1 reseña verificada');
      await expect(page.locator('#reviewsAverage')).toHaveText('5,0');
      const card = page.locator('#reviewsList .review-card');
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('Me llegaron los diamantes rápido. Recomendada.');
      await expect(card).toContainText('Cliente D.');
      await expect(card).toContainText('Compra verificada · 100 + 10 Diamantes');
      await expect(card).not.toContainText('directo-e2e@example.com');
      await expect(card).not.toContainText('734567812');
    } finally {
      await operator(page, 'moderate-reviews', { action: 'hide' });
      await operator(page, 'player-verification', { mode: 'operator' });
    }
  });

  test('entrega automática: pago aprobado → «Ver mi PIN» con instrucciones de canje', async ({
    page,
  }) => {
    expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
    expect(
      (
        await operator(page, 'pin-auto', {
          on: true,
          sku: 'ff-110',
          codes: ['E2E-PIN-ABCD-0001'],
        })
      ).ok(),
    ).toBe(true);
    try {
      await page.goto('/');
      await enterAsGuest(page);
      await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
      await page.locator('#playerUid').fill('745612398');
      await page.locator('#verifyBtn').click();
      await page.locator('#playerUidConfirm').fill('745612398');
      await page.locator('#confirmUid').click();
      await page.locator('#customerName').fill('Cliente PIN');
      await page.locator('#customerEmail').fill('pin-e2e@example.com');
      await page.locator('#payMeansCard').check();
      await page.locator('#acceptTerms').check();
      await expect(page.locator('#pinBox')).toBeHidden();
      await page.locator('#payBtn').click();
      await page.waitForURL(/\/#seguimiento$/);
      // Sin que el dueño haga nada: entregado con el PIN del inventario.
      await expect(page.locator('#trackDelivery')).toContainText('PIN entregado');
      await expect(page.locator('#pinBox')).toBeVisible();
      await expect(page.locator('#pinBox')).toContainText('pagostore.com');
      await expect(page.locator('#pinList')).toBeEmpty();
      await page.locator('#showPins').click();
      await expect(page.locator('#pinList')).toContainText('E2EPINABCD0001');
      await expect(page.locator('#showPins')).toBeHidden();
    } finally {
      await operator(page, 'pin-auto', { on: false });
      await operator(page, 'player-verification', { mode: 'operator' });
    }
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

  test('"Nuevo pedido" empieza un pedido nuevo sin borrar el anterior del servidor', async ({
    page,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    await createOrder(page, '765432200');
    await page.locator('#newInvoiceBtn').click();
    // Sin pedido no hay factura: solo el resumen de la compra.
    await expect(page.locator('#invoiceRef')).toHaveText('RESUMEN');
    await expect(page.locator('#jpgBtn')).toBeDisabled();
    await expect(page.locator('#playerUid')).toHaveValue('');
    await expect(page.locator('#payBtn')).toHaveText('Pagar');
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
    await page.locator('#payMeansCard').check();
    await page.locator('#acceptTerms').check();
    await page.locator('#payBtn').click();
    await expect(page.locator('.toast').last()).toContainText('Sí, es mi cuenta');
    await expect(page.locator('#invoiceRef')).not.toHaveText(/^TGS-/);
    await page.locator('#confirmLookup').click();
    await expect(page.locator('#playerResult')).toContainText('Jugador5678 ✓');
    await expect(page.locator('#nickState')).toHaveText('Listo');
    await expect(page.locator('#invoiceNick')).toHaveText('Jugador5678');
    // Sin esperar al operador: "Pagar" crea el pedido y lleva directo a Mercado Pago.
    await page.locator('#payBtn').click();
    await page.waitForURL(/\/#seguimiento$/);
    await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-[0-9A-Z]{10}$/);
    await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');
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

test.describe('seguimiento privado (sin cuenta, desde otro dispositivo)', () => {
  test('el enlace privado abre el pedido en otro navegador y la consulta pide referencia + código', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    await enterAsGuest(page);
    const ref = await createOrder(page, '765432301');
    await expect(page.locator('#trackAccess')).toBeVisible();
    const code = await page.evaluate((r) => sessionStorage.getItem('tgs_ot_' + r), ref);
    expect(code).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const origin = new URL(page.url()).origin;

    // Otro dispositivo: el enlace con el código en el fragmento abre el pedido y se limpia.
    const other = await browser.newContext();
    const second = await other.newPage();
    const secondErrors = await preparePage(second);
    await second.goto(`${origin}/#pedido=${ref}&codigo=${code}`);
    await expect(second.locator('#trackingRef')).toHaveText(ref);
    await expect(second.locator('#trackPayment small')).toHaveText('Esperando requisitos');
    expect(second.url()).not.toContain('codigo=');
    expect(unexpectedErrors(secondErrors)).toEqual([]);
    await other.close();

    // Un tercer navegador sin enlace: la referencia sola no muestra nada; con el código, sí.
    const third = await browser.newContext();
    const lookup = await third.newPage();
    const lookupErrors = await preparePage(lookup);
    await lookup.goto(`${origin}/`);
    await enterAsGuest(lookup);
    await lookup.locator('#lookupRef').fill(ref);
    await lookup.locator('#lookupCode').fill('x'.repeat(43));
    await lookup.locator('#lookupBtn').click();
    await expect(lookup.locator('#lookupResult')).toContainText('No encontramos un pedido');
    await expect(lookup.locator('#trackingRef')).not.toHaveText(ref);
    await lookup.locator('#lookupRef').fill(`${origin}/#pedido=${ref}&codigo=${code}`);
    await lookup.locator('#lookupCode').fill('');
    await lookup.locator('#lookupBtn').click();
    await expect(lookup.locator('#lookupResult')).toContainText('Pedido encontrado');
    await expect(lookup.locator('#trackingRef')).toHaveText(ref);
    // 404 del intento con código falso: esperado en la consola del navegador.
    expect(unexpectedErrors(lookupErrors).filter((e) => !e.includes('404'))).toEqual([]);
    await third.close();
  });
});

test.describe('comprobante', () => {
  test('sin pago no hay comprobante; pagado, se descarga en JPG y PDF con su referencia real', async ({
    page,
  }) => {
    expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
    try {
      await page.goto('/');
      await enterAsGuest(page);
      await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
      // Antes del pedido: un resumen, nunca un «borrador» descargable.
      await expect(page.locator('#invoiceRef')).toHaveText('RESUMEN');
      await expect(page.locator('#exportMsg')).toContainText('no una factura');
      for (const id of ['#jpgBtn', '#pdfBtn']) await expect(page.locator(id)).toBeDisabled();

      await page.locator('#playerUid').fill('734567890');
      await page.locator('#verifyBtn').click();
      await page.locator('#playerUidConfirm').fill('734567890');
      await page.locator('#confirmUid').click();
      await expect(page.locator('#playerResult')).toContainText('ID 734567890 confirmado ✓');
      await page.locator('#customerName').fill('Cliente Comprobante');
      await page.locator('#customerEmail').fill('comprobante-e2e@example.com');
      await page.locator('#payMeansCard').check();
      await page.locator('#acceptTerms').check();
      await page.locator('#payBtn').click();
      await page.waitForURL(/\/#seguimiento$/);
      await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');
      const ref = (await page.locator('#invoiceRef').textContent()) ?? '';
      expect(ref).toMatch(/^TGS-[0-9A-Z]{10}$/);
      await expect(page.locator('#invoiceCode')).toContainText(/N\.º \d{6} · V1-/);
      await expect(page.locator('#exportMsg')).toContainText('listo para descargar');

      const [jpg] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#jpgBtn').click(),
      ]);
      expect(jpg.suggestedFilename()).toBe(`Comprobante-${ref}.jpg`);
      const [pdf] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#pdfBtn').click(),
      ]);
      const bytes = await readFile(await pdf.path());
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await operator(page, 'player-verification', { mode: 'operator' });
    }
  });
});

test.describe('panel de administración', () => {
  test('sin sesión muestra el acceso: correo y contraseña, huella y Google si está activo', async ({
    page,
  }) => {
    await page.goto(ADMIN_PATH);
    await expect(page.locator('#admLogin')).toBeVisible();
    await expect(page.locator('#admApp')).toBeHidden();
    await expect(page.locator('#admEmail')).toBeVisible();
    await expect(page.locator('#admPassword')).toHaveAttribute('type', 'password');
    await expect(page.locator('#admPasskeyLogin')).toBeVisible();
    // El servidor de pruebas no tiene cliente de Google: su botón no se ofrece.
    await expect(page.locator('#admGoogleLogin')).toBeHidden();
  });

  test('el dueño crea su contraseña con la frase de activación y el panel pide el código', async ({
    page,
  }) => {
    await page.goto(ADMIN_PATH);
    await page.locator('#admFirstTime summary').click();
    await page.locator('#admSetupCode').fill('frase-equivocada-de-veinte-caracteres');
    await page.locator('#admNewPassword').fill('Contraseña-del-dueño-e2e-1');
    await page.locator('#admNewPassword2').fill('Contraseña-del-dueño-e2e-1');
    await page.locator('#admPasswordSetupBtn').click();
    await expect(page.locator('#admMessage')).toContainText('Frase de activación incorrecta');
    await page.locator('#admSetupCode').fill('frase-de-activacion-e2e-del-dueno');
    await page.locator('#admPasswordSetupBtn').click();
    // Contraseña creada: el segundo paso (app autenticadora) es obligatorio antes del panel.
    await expect(page.locator('#admMfaSetup')).toBeVisible();
    await expect(page.locator('#admApp')).toBeHidden();

    await page.locator('#admLogout').click();
    await page.locator('#admEmail').fill('operador@example.com');
    await page.locator('#admPassword').fill('contraseña-incorrecta');
    await page.locator('#admPasswordForm button[type="submit"]').click();
    await expect(page.locator('#admMessage')).toHaveText('Correo o contraseña incorrectos.');
    await page.locator('#admPassword').fill('Contraseña-del-dueño-e2e-1');
    await page.locator('#admPasswordForm button[type="submit"]').click();
    await expect(page.locator('#admMfaSetup')).toBeVisible();

    // Segundo paso: se configura la app autenticadora con la clave que muestra el panel.
    await page.locator('#admMfaStart').click();
    await expect(page.locator('#admMfaSecret')).toHaveText(/^[A-Z2-7]{16,}$/);
    const secret = (await page.locator('#admMfaSecret').textContent()) ?? '';
    // QR para escanear (generado en el navegador) y enlace directo para la app del celular.
    await expect(page.locator('#admMfaQr')).toHaveAttribute('src', /^data:image\//);
    await expect(page.locator('#admMfaOpen')).toHaveAttribute(
      'href',
      new RegExp(`^otpauth://totp/.*secret=${secret}`),
    );
    // Pedir la clave otra vez no la cambia (lo ya añadido en la app sigue sirviendo).
    await page.locator('#admMfaStart').click();
    await expect(page.locator('#admMfaSecret')).toHaveText(secret);
    await page.locator('#admMfaEnableCode').fill('000000');
    await page.locator('#admMfaEnable').click();
    await expect(page.locator('#admMessage')).toContainText('Código incorrecto');
    // Escrito tal como lo muestra la app, con espacio.
    await page
      .locator('#admMfaEnableCode')
      .fill(totp(secret, Date.now()).replace(/^(\d{3})/, '$1 '));
    await page.locator('#admMfaEnable').click();
    // Códigos de recuperación (un solo uso) antes de entrar.
    await expect(page.locator('#admRecoveryCodes')).toContainText(/[A-Z2-7]{5}-[A-Z2-7]{5}/);
    await page.locator('#admRecoveryDone').click();
    await expect(page.locator('#admApp')).toBeVisible();

    // Siguiente acceso: contraseña y luego el código de la app; sin él no hay panel.
    await page.locator('#admLogout').click();
    await page.locator('#admEmail').fill('operador@example.com');
    await page.locator('#admPassword').fill('Contraseña-del-dueño-e2e-1');
    await page.locator('#admPasswordForm button[type="submit"]').click();
    await expect(page.locator('#admMfaVerify')).toBeVisible();
    await expect(page.locator('#admApp')).toBeHidden();
    expect((await page.request.get('/api/admin/orders')).status()).toBe(403);
    await page.locator('#admMfaCode').fill('123456');
    await page.locator('#admMfaVerifyBtn').click();
    await expect(page.locator('#admMessage')).toContainText('inválido');
    await page.locator('#admMfaCode').fill(totp(secret, Date.now()));
    await page.locator('#admMfaVerifyBtn').click();
    await expect(page.locator('#admApp')).toBeVisible();
    expect((await page.request.get('/api/admin/orders')).status()).toBe(200);
  });

  test('el dueño activa su huella y entra al panel con ella', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'el autenticador virtual es de Chrome DevTools (CDP)');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    // WebAuthn exige un dominio: esta prueba usa localhost (el resto de la suite, 127.0.0.1).
    await page.goto(`http://localhost:4173${ADMIN_PATH}`);
    await page.locator('#admFirstTime summary').click();
    await page.locator('#admSetupCode').fill('frase-de-activacion-e2e-del-dueno');
    await page.locator('#admPasskeySetupBtn').click();
    await expect(page.locator('#admApp')).toBeVisible();
    await page.locator('#admLogout').click();
    await expect(page.locator('#admLogin')).toBeVisible();
    await page.locator('#admPasskeyLogin').click();
    await expect(page.locator('#admApp')).toBeVisible();
    await expect(page.locator('#admPasskeyAdd')).toBeVisible();
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

  test('el dueño descarga el Excel de inventario y facturas desde el panel', async ({
    page,
    context,
  }) => {
    const { token } = (await (await operator(page, 'admin-session', {})).json()) as {
      token: string;
    };
    await context.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
    await page.goto(ADMIN_PATH);
    await expect(page.locator('#admApp')).toBeVisible();
    await page.locator('.adm-tabs button[data-tab="inventory"]').click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#admExportExcel').click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^TayGameStore-inventario-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const bytes = await readFile(await file.path());
    // Un .xlsx es un ZIP («PK»).
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    await expect(page.locator('#admMessage')).toContainText('Excel descargado');
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
    await page.waitForURL(/\/#seguimiento$/);
    await expect(page.locator('#invoiceState')).toHaveText('Pago confirmado');

    // El panel avisa del pago nuevo: notificación del sistema y contador en el título.
    await admin.locator('#admReload').click();
    // Se espera al aviso, no al título: pedidos pagados de pruebas anteriores ya ponen el
    // contador en el título, y leer los avisos en ese momento llegaba antes que la respuesta
    // del botón «Actualizar» (CI, 13-oct).
    await expect
      .poll(
        () =>
          admin.evaluate(() =>
            (window as unknown as { __notices: { title: string }[] }).__notices.map((n) => n.title),
          ),
        { message: 'aviso del sistema del pago nuevo' },
      )
      .toContain('Pedido pagado por entregar');
    await expect(admin).toHaveTitle(/^\(\d+\) Pagados por entregar · /);
    // Aunque la notificación falle, la alerta del panel muestra la misma cifra que el título.
    const pending = Number(/^\((\d+)\)/.exec(await admin.title())?.[1]);
    await expect(
      admin.locator('.adm-alert', { hasText: 'Pagados por entregar' }).locator('b'),
    ).toHaveText(String(pending));

    // Inventario: el dueño carga un PIN del paquete; al empezar la entrega se reserva para
    // este pedido y al entregarlo queda usado.
    await admin.locator('[data-tab="inventory"]').click();
    await admin.locator('#iProduct').selectOption({ label: '100 + 10 Diamantes (ff-110)' });
    // PIN único por corrida: la prueba se puede repetir (--repeat-each) sin chocar con el anterior.
    const pin = `PINE2E${Date.now().toString(36).toUpperCase()}`;
    await admin.locator('#iCodes').fill(pin);
    await admin.locator('#admInventoryForm button[type="submit"]').click();
    await expect(admin.locator('#admMessage')).toHaveText('1 PIN cargados.');
    await expect(admin.locator('#admInventory tr', { hasText: 'ff-110' })).toContainText('1');
    await admin.locator('[data-tab="orders"]').click();
    await admin.locator('#admOrders tr', { hasText: ref }).click();

    await admin.locator('[data-f="claim"]').click();
    await admin.locator('[data-f="start"]').click();
    await expect(admin.locator('#admDetail')).toContainText('PIN reservados del inventario');
    await expect(admin.locator('#admDetail code')).toHaveText(pin);
    await admin.locator('#fEvidence').fill('PIN canjeado al UID del pedido');
    await admin.locator('[data-f="deliver"]').click();
    await expect(admin.locator('#admDetail h2')).toContainText('Entregado');
    await expect(admin.locator('#admDetail')).toContainText('USED');
    await page.locator('#refreshOrderBtn').click();
    await expect(page.locator('#invoiceState')).toHaveText('Recarga completada');
  });
});
