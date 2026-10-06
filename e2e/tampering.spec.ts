import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Manipulación desde las herramientas de desarrollador (DevTools) del navegador.
 * Cualquiera puede editar el HTML o lanzar `fetch` desde la consola de SU navegador; estas
 * pruebas lo hacen igual que un atacante y comprueban que el servidor no acepta nada de eso:
 * precios, pagos y panel de administración solo los decide el servidor.
 */

// IP propia (rango de documentación 203.0.113.0/24): los límites por IP y el escudo anti-abuso
// cuentan estos ataques aparte de las demás pruebas, como ocurriría con un atacante real.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.7' } });

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'seguridad: un solo viewport');
  consoleErrors = await preparePage(page);
});

test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

interface Answer {
  status: number;
  body: { error?: { code?: string }; [key: string]: unknown } | null;
}

/** Petición escrita "a mano" en la consola, con la cabecera anti-CSRF salvo que se quite. */
function consoleFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; csrf?: boolean; headers?: Record<string, string> } = {},
): Promise<Answer> {
  return page.evaluate(
    async ({ path, init }) => {
      const headers: Record<string, string> = { ...init.headers };
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      if (init.csrf !== false && init.method && init.method !== 'GET') headers['x-tgs-csrf'] = '1';
      const res = await fetch(path, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await res.text();
      let body: Answer['body'] = null;
      try {
        body = JSON.parse(text) as Answer['body'];
      } catch {
        // Respuesta sin JSON (p. ej. 404 de una ruta inexistente): se compara solo el estado.
      }
      return { status: res.status, body };
    },
    { path, init },
  );
}

async function checkoutBody(page: Page, overrides: Record<string, unknown> = {}) {
  const config = await consoleFetch(page, '/api/config');
  return {
    checkoutKey: await page.evaluate(() => crypto.randomUUID()),
    game: 'freefire',
    playerUid: '765432100',
    customerName: 'Atacante Prueba',
    customerEmail: 'atacante@example.com',
    acceptTerms: true,
    termsVersion: (config.body as { termsVersion: string }).termsVersion,
    items: [{ sku: 'ff-110', quantity: 1 }],
    ...overrides,
  };
}

async function guestStore(page: Page) {
  await page.goto('/');
  await enterAsGuest(page);
}

test.describe('precios y pedidos', () => {
  test('cambiar el precio en el HTML no cambia lo que cobra el servidor', async ({ page }) => {
    await guestStore(page);
    const card = page.locator('#products .product').filter({ hasText: '100 + 10 Diamantes' });
    // El "atacante" edita el precio visible a $1 desde el inspector.
    await card.locator('.product-price strong').evaluate((el) => (el.textContent = '$1'));
    await expect(card.locator('.product-price strong')).toHaveText('$1');

    const created = await consoleFetch(page, '/api/checkout', {
      method: 'POST',
      body: await checkoutBody(page),
    });
    expect(created.status).toBe(201);
    const order = created.body?.order as { totalCop: number; items: { unitPriceCop: number }[] };
    // El servidor cobra el precio de su catálogo, no el del HTML.
    const catalog = await consoleFetch(page, '/api/catalog');
    const real = (catalog.body?.products as { sku: string; priceCop: number }[]).find(
      (product) => product.sku === 'ff-110',
    );
    expect(real?.priceCop).toBeGreaterThan(1000);
    expect(order.totalCop).toBe(real?.priceCop);
    expect(order.items[0]?.unitPriceCop).toBe(real?.priceCop);
  });

  test('inventar campos de precio o total en la petición se rechaza', async ({ page }) => {
    await guestStore(page);
    // Campos que el servidor no admite: el esquema es estricto.
    for (const extra of [
      { totalCop: 1 },
      { priceCop: 1 },
      { status: 'PAID' },
      { items: [{ sku: 'ff-110', quantity: 1, priceCop: 1 }] },
      { items: [{ sku: 'ff-110', quantity: 999 }] },
    ]) {
      const res = await consoleFetch(page, '/api/checkout', {
        method: 'POST',
        body: await checkoutBody(page, extra),
      });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    // Un total "esperado" falso no rebaja el precio: el servidor avisa de que no coincide.
    const cheap = await consoleFetch(page, '/api/checkout', {
      method: 'POST',
      body: await checkoutBody(page, { expectedTotalCop: 1 }),
    });
    expect(cheap.status).toBe(409);
    expect(cheap.body?.error?.code).toBe('PRICE_CHANGED');
  });

  test('un webhook de pago falsificado no marca el pedido como pagado', async ({ page }) => {
    await guestStore(page);
    const created = await consoleFetch(page, '/api/checkout', {
      method: 'POST',
      body: await checkoutBody(page, { playerUid: '765432101' }),
    });
    const ref = (created.body?.order as { reference: string }).reference;

    // "Mercado Pago dice que está pagado", enviado desde el navegador con una firma inventada.
    const forged = await consoleFetch(
      page,
      '/api/webhooks/mercadopago?data.id=999999&type=payment',
      {
        method: 'POST',
        body: { type: 'payment', action: 'payment.updated', data: { id: '999999' } },
        headers: { 'x-signature': 'ts=1,v1=firma-inventada', 'x-request-id': 'atacante' },
      },
    );
    expect(forged.status).toBe(401);
    expect(forged.body).toEqual({ received: false });

    // No hay ruta para cambiar el estado de un pedido desde el cliente.
    const patch = await consoleFetch(page, `/api/orders/${ref}`, {
      method: 'PATCH',
      body: { status: 'PAID' },
    });
    expect(patch.status).toBe(404);

    // El pedido sigue esperando verificación: solo un pago real confirmado por Mercado Pago
    // (consultado desde el servidor) lo pasa a pagado.
    const list = await consoleFetch(page, '/api/orders');
    const mine = (list.body?.orders as { reference: string; status: string }[]).find(
      (order) => order.reference === ref,
    );
    expect(mine?.status).toBe('AWAITING_VERIFICATION');
  });

  test('una escritura sin la cabecera anti-CSRF se rechaza', async ({ page }) => {
    await guestStore(page);
    const res = await consoleFetch(page, '/api/checkout', {
      method: 'POST',
      body: await checkoutBody(page),
      csrf: false,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('CSRF_REJECTED');
  });
});

test.describe('panel de administración', () => {
  test('mostrar el panel oculto desde el inspector no da acceso a ningún dato', async ({
    page,
  }) => {
    await page.goto('/admin.html');
    await page.locator('#admApp').evaluate((el) => el.removeAttribute('hidden'));
    await expect(page.locator('#admApp')).toBeVisible();
    // El HTML del panel es solo un cascarón: los datos vienen de la API, que exige sesión admin.
    await expect(page.locator('#admOrders tr', { hasText: 'TGS-' })).toHaveCount(0);

    for (const path of ['/api/admin/orders', '/api/admin/products', '/api/admin/audit']) {
      const res = await consoleFetch(page, path);
      expect(res.status, path).toBe(401);
    }
    const edit = await consoleFetch(page, '/api/admin/products', {
      method: 'POST',
      body: { sku: 'ff-gratis', name: 'Diamantes gratis', priceCop: 1 },
    });
    expect(edit.status).toBe(401);
  });

  test('una cookie de sesión inventada no abre el panel', async ({ page, context }) => {
    await page.goto('/admin.html');
    await context.addCookies([
      {
        name: 'tgs_session',
        value: 'a'.repeat(43),
        url: 'http://127.0.0.1:4173',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const res = await consoleFetch(page, '/api/admin/orders');
    expect(res.status).toBe(401);
  });

  test('un cliente con sesión (no administrador) recibe 403 en el panel', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await page.locator('[data-provider="discord"]').click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('#accountName')).toHaveText('Gamer Discord');

    // La cookie de sesión es HttpOnly: ni la consola ni un script inyectado pueden leerla.
    expect(await page.evaluate(() => document.cookie)).not.toContain('tgs_session');

    const orders = await consoleFetch(page, '/api/admin/orders');
    expect(orders.status).toBe(403);
    const price = await consoleFetch(page, '/api/admin/products', {
      method: 'POST',
      body: { sku: 'ff-gratis', name: 'Diamantes gratis', priceCop: 1 },
    });
    expect(price.status).toBe(403);
  });

  test('código malicioso en el nombre del cliente no se ejecuta al abrir el pedido en el panel', async ({
    page,
    context,
  }) => {
    // XSS almacenado: la vía real para "infiltrarse" en el panel sería que el administrador
    // ejecute, sin saberlo, código que un cliente dejó en su pedido.
    const payload = '<img src=x onerror="window.__tgsPwned=1">';
    await guestStore(page);
    const created = await consoleFetch(page, '/api/checkout', {
      method: 'POST',
      body: await checkoutBody(page, { playerUid: '765432102', customerName: payload }),
    });
    expect(created.status).toBe(201);
    const ref = (created.body?.order as { reference: string }).reference;

    const session = await page.request.post('/__e2e__/admin-session', {
      data: {},
      headers: { 'x-tgs-csrf': '1' },
    });
    const { token } = (await session.json()) as { token: string };
    await context.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
    const admin = await context.newPage();
    const adminErrors = await preparePage(admin);
    await admin.goto('/admin.html');
    await expect(admin.locator('#admApp')).toBeVisible();
    await admin.locator('#admSearch').fill(ref);
    await admin.locator('#admReload').click();
    await admin.locator('#admOrders tr', { hasText: ref }).click();

    // Se muestra como texto, no como HTML: no hay imagen inyectada ni código ejecutado.
    await expect(admin.locator('#admDetail')).toContainText(payload);
    await expect(admin.locator('#admApp img[src="x"]')).toHaveCount(0);
    expect(await admin.evaluate(() => 'tgsPwned' in window || '__tgsPwned' in window)).toBe(false);
    expect(unexpectedErrors(adminErrors)).toEqual([]);
  });
});
