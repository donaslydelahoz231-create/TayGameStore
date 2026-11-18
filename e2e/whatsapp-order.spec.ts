import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Pedido por WhatsApp (ORDER_CHANNEL `whatsapp` o `ambos`) contra el servidor real de pruebas:
 * datos → revisar → pagar (Nequi: transferir e informar; tarjeta/PSE/Efecty/saldo: pedir el enlace)
 * → enviar por WhatsApp. El canal, el número y la cuenta Nequi se simulan parcheando /api/config,
 * como la prueba de las burbujas: todo es ficticio (57 + diez ceros no existe; llave «@tay-demo») y
 * wa.me se responde en local, así que no se contacta a nadie. Catálogo de pruebas con la promo
 * siempre activa: 110 💎 a $ 3.800 (lista $ 4.000) y 572 💎 a $ 17.000 (lista $ 18.000).
 */

const FAKE_NUMBER = '570000000000';
const FAKE_NEQUI = { brebKey: '@tay-demo', phone: null, holder: 'Titular de ejemplo' };
let consoleErrors: string[] = [];
/** Peticiones que crearían o pagarían un pedido: el canal WhatsApp no debe hacer ninguna. */
let orderRequests: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'pedido por WhatsApp: un solo proyecto');
  consoleErrors = await preparePage(page);
  orderRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/(checkout|orders|payments)/.test(path) || /\/pay$/.test(path)) {
      orderRequests.push(`${request.method()} ${path}`);
    }
  });
  // WhatsApp responde en local: nunca sale nada hacia wa.me.
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (simulado)</title>' }),
    );
});

test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

interface ChannelOptions {
  orderChannel?: string | null;
  whatsapp?: string | null;
  demo?: boolean;
  /** Publica la cuenta Nequi ficticia y activa Nequi como medio. */
  nequi?: boolean;
  /** El cliente confirma su propio ID (PLAYER_VERIFICATION=customer, como producción). */
  customer?: boolean;
}

async function withChannel(page: Page, options: ChannelOptions = {}) {
  const {
    orderChannel = 'whatsapp',
    whatsapp = FAKE_NUMBER,
    demo = true,
    nequi = false,
    customer = false,
  } = options;
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      support?: Record<string, unknown>;
      paymentMethods?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        ...(orderChannel ? { orderChannel, demo } : {}),
        // Como producción y la demo: sin consulta del proveedor, el cliente confirma su ID.
        ...(customer ? { playerLookup: false, playerVerification: 'customer' } : {}),
        ...(nequi
          ? {
              paymentMethods: { ...body.paymentMethods, nequiManual: true },
              orderPayment: { nequi: FAKE_NEQUI },
            }
          : {}),
        support: { ...body.support, whatsapp },
      },
    });
  });
}

const product = (page: Page, name: string) =>
  page.locator('#products .product').filter({ hasText: name });

async function addPackages(page: Page) {
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await product(page, '100 + 10 Diamantes').locator('[data-op="plus"]').click();
  await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
  await expect(product(page, '100 + 10 Diamantes').locator('.qty span')).toHaveText('2');
  await expect(product(page, '520 + 52 Diamantes').locator('.qty span')).toHaveText('1');
}

/** Modo del servidor de pruebas (operador): «Verificar» acepta el ID. */
async function verifyUid(page: Page, uid: string) {
  await page.locator('#playerUid').fill(uid);
  await page.locator('#verifyBtn').click();
  await expect(page.locator('#playerResult')).toContainText(`UID ${uid} listo`);
}

async function fillCustomer(page: Page, uid: string, means: 'card' | 'nequi' = 'card') {
  await verifyUid(page, uid);
  await page.locator('#customerName').fill('Cliente Ficticio');
  await page.locator('#customerEmail').fill('cliente@example.com');
  await page.locator(means === 'card' ? '#payMeansCard' : '#payMeansNequi').check();
  await page.locator('#acceptTerms').check();
}

const toast = (page: Page) => page.locator('#toastStack .toast');

test('por defecto la tienda no cambia: pago en línea y sin botón de WhatsApp', async ({ page }) => {
  await withChannel(page, { orderChannel: null });
  await page.goto('/');
  await enterAsGuest(page);
  await expect(page.locator('#payBtn')).toBeVisible();
  await expect(page.locator('#waOrderBox')).toBeHidden();
  await expect(page.locator('#waOrderModal')).toBeHidden();
});

test('pedido por WhatsApp con tarjeta: valida, resume y pide el enlace de pago sin crear pedidos', async ({
  page,
}) => {
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);

  // Solo WhatsApp: el botón de pago se oculta (no se borra) y aparece el pedido por WhatsApp.
  await expect(page.locator('#payBtn')).toBeHidden();
  await expect(page.locator('#waOrderBox')).toBeVisible();
  await expect(page.locator('#waOrderBtn')).toContainText('Revisar, pagar y enviar');
  await expect(page.locator('#waOrderDemo')).toContainText('DEMO');
  await expect(page.locator('#waOrderHint')).toContainText('agrega una recarga');

  // 1-2. Productos, opciones y cantidades.
  await addPackages(page);
  await page.locator('#playerServer').selectOption('brasil');

  // 3. Validación: cada dato que pide la tienda, en orden (el medio de pago es obligatorio).
  const next = page.locator('#waOrderBtn');
  await next.click();
  await expect(toast(page)).toContainText('UID');
  await expect(page.locator('#waOrderModal')).toBeHidden();
  await verifyUid(page, '123456789');
  await next.click();
  await expect(toast(page)).toContainText('nombre');
  await page.locator('#customerName').fill('Cliente Ficticio');
  await page.locator('#customerEmail').fill('no-es-un-correo');
  await next.click();
  await expect(toast(page)).toContainText('correo válido');
  await page.locator('#customerEmail').fill('cliente@example.com');
  await next.click();
  await expect(toast(page)).toContainText('Elige cómo pagar');
  // El servidor de pruebas solo tiene Mercado Pago: con tarjeta se pide el enlace por WhatsApp.
  await page.locator('#payMeansCard').check();
  await expect(page.locator('#payMeansHint')).toContainText('enlace de pago seguro');
  await next.click();
  await expect(toast(page)).toContainText('términos');
  await page.locator('#acceptTerms').check();
  await expect(page.locator('#waOrderHint')).toContainText('Todo listo');

  // 4-5. Resumen: cliente, productos, cantidades, precio de cada uno, descuentos y total.
  await next.click();
  await expect(page.locator('#waOrderModal')).toBeVisible();
  await expect(page.locator('#waDemoBadge')).toBeVisible();
  await expect(page.locator('#waDemoNote')).toContainText('No se cobra dinero');
  await expect(page.locator('#waNoNumber')).toBeHidden();
  const summary = page.locator('#waOrderSummary');
  await expect(summary.locator('.wa-ref b')).toHaveText(/^DEMO-[A-HJKMNP-Z2-9]{6}$/);
  for (const text of [
    'Cliente Ficticio',
    'cliente@example.com',
    '123456789',
    'Brasil',
    'Tarjeta (crédito o débito)',
    '100 + 10 Diamantes',
    '2 × $ 3.800 COP',
    '520 + 52 Diamantes',
    '1 × $ 17.000 COP',
    'Descuento promo −$ 400 COP',
    'Descuento promo −$ 1.000 COP',
  ]) {
    await expect(summary).toContainText(text);
  }
  await expect(summary.locator('.wa-totals')).toContainText('Subtotal$ 26.000 COP');
  await expect(summary.locator('.wa-totals')).toContainText('Descuentos−$ 1.400 COP');
  await expect(summary.locator('.wa-total')).toContainText('$ 24.600 COP');

  // Pago con tarjeta: no hay datos de transferencia; se pide el enlace.
  await expect(page.locator('#waPayInfo')).toContainText('enlace de pago seguro');
  await expect(page.locator('#waPayFields')).toBeHidden();

  // 6. Mensaje: organizado, con la referencia DEMO, el total y la solicitud del enlace.
  const message = (await page.locator('#waOrderMessage').textContent()) ?? '';
  const reference = (await summary.locator('.wa-ref b').textContent()) ?? '';
  for (const text of [
    '*Pedido DEMO · TayGameStore*',
    `Referencia: ${reference}`,
    'Nombre: Cliente Ficticio',
    'ID: 123456789',
    'Servidor: Brasil',
    '2 × $ 3.800 = $ 7.600',
    'Descuentos: −$ 1.400',
    '*Total: $ 24.600 COP*',
    'Medio: Tarjeta (crédito o débito)',
    'Solicitud: envíenme el enlace o los datos de pago por este chat.',
  ]) {
    expect(message).toContain(text);
  }

  // 7. Destino: el número configurado, con el mensaje completo; el cliente lo envía él mismo.
  const link = page.locator('#waOrderSend');
  await expect(link).toContainText('Enviar pedido por WhatsApp');
  await expect(link).toHaveAttribute('aria-disabled', 'false');
  const href = (await link.getAttribute('href')) ?? '';
  expect(href.startsWith(`https://wa.me/${FAKE_NUMBER}?text=`)).toBe(true);
  expect(new URL(href).searchParams.get('text')).toBe(message);
  await expect(link).toHaveAttribute('target', '_blank');
  const [chat] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await chat.waitForLoadState();
  expect(chat.url().startsWith(`https://wa.me/${FAKE_NUMBER}?text=`)).toBe(true);
  await expect(page.locator('#waOrderStatus')).toContainText('Se abrió WhatsApp');
  await chat.close();

  // Reabrir el resumen sin cambios conserva la referencia.
  await page.locator('#waOrderModal [data-close="waOrderModal"]').first().click();
  await next.click();
  await expect(summary.locator('.wa-ref b')).toHaveText(reference);

  // 9. Aislamiento: ningún pedido creado ni pago iniciado.
  expect(orderRequests).toEqual([]);
});

test('pedido por WhatsApp con Nequi: ve la cuenta, transfiere, informa el pago y lo envía', async ({
  page,
}) => {
  await withChannel(page, { nequi: true });
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
  await fillCustomer(page, '123456784', 'nequi');
  await expect(page.locator('#payMeansHint')).toContainText('verás la cuenta Nequi');
  await page.locator('#waOrderBtn').click();

  // Instrucciones: total exacto, llave ficticia, titular y la referencia del pedido.
  const info = page.locator('#waPayInfo');
  const reference =
    (await page.locator('#waOrderSummary .wa-ref b').textContent())?.trim() ?? 'sin-referencia';
  await expect(info).toContainText('$ 17.000 COP');
  await expect(info).toContainText('@tay-demo');
  await expect(info).toContainText('Titular de ejemplo');
  await expect(info).toContainText(reference);
  await expect(info).toContainText('No transfieras dinero real');
  await expect(page.locator('#waPayFields')).toBeVisible();

  // Sin el pago informado, el envío no abre WhatsApp y dice qué falta.
  const link = page.locator('#waOrderSend');
  await expect(link).toContainText('Enviar pedido y pago por WhatsApp');
  await expect(link).toHaveAttribute('aria-disabled', 'true');
  let opened = false;
  page.on('popup', () => (opened = true));
  // aria-disabled: Playwright no lo pulsa por sí solo; una persona sí, y el clic le explica qué falta.
  await link.click({ force: true });
  await expect(toast(page)).toContainText('4 últimos dígitos');
  await expect(page.locator('#waPayLast4')).toBeFocused();
  await page.locator('#waPayLast4').pressSequentially('12ab34');
  await expect(page.locator('#waPayLast4')).toHaveValue('1234');
  await link.click({ force: true });
  await expect(toast(page)).toContainText('Ya hice la transferencia');
  expect(opened).toBe(false);

  // Pago informado: el mensaje lo lleva y el envío se activa.
  await page.locator('#waPayRef').fill('M12345678');
  await page.locator('#waPayDone').check();
  await expect(link).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#waOrderStatus')).toContainText('se abre WhatsApp');
  const message = (await page.locator('#waOrderMessage').textContent()) ?? '';
  for (const text of [
    `Referencia: ${reference}`,
    '*Total: $ 17.000 COP*',
    'Medio: Nequi',
    'Estado: el cliente indica que ya transfirió el total ($ 17.000)',
    'Cuenta de origen: termina en 1234',
    'Referencia del comprobante: M12345678',
    'TayGameStore verifica el movimiento antes de entregar.',
  ]) {
    expect(message).toContain(text);
  }
  const href = (await link.getAttribute('href')) ?? '';
  expect(new URL(href).searchParams.get('text')).toBe(message);
  const [chat] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await chat.waitForLoadState();
  expect(chat.url().startsWith(`https://wa.me/${FAKE_NUMBER}?text=`)).toBe(true);
  await chat.close();
  // Informar el pago no cambia la referencia del pedido.
  await expect(page.locator('#waOrderSummary .wa-ref b')).toHaveText(reference);
  expect(orderRequests).toEqual([]);
});

test('como en producción, el cliente confirma su propio ID y la lista dice «ID confirmado»', async ({
  page,
}) => {
  await withChannel(page, { customer: true });
  await page.goto('/');
  await enterAsGuest(page);
  const line = page.locator('.check-line').filter({ has: page.locator('#nickState') });
  await expect(line).toContainText('ID confirmado');
  await expect(line).toContainText('Lo escribiste dos veces');
  await expect(page.locator('#nickState')).toHaveText('Pendiente');
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await page.locator('#playerUid').fill('734567866');
  await page.locator('#verifyBtn').click();
  await page.locator('#playerUidConfirm').fill('734567866');
  await page.locator('#confirmUid').click();
  await expect(page.locator('#playerResult')).toContainText('ID 734567866 confirmado ✓');
  await expect(page.locator('#nickState')).toHaveText('Listo');
  expect(orderRequests).toEqual([]);
});

test('el nombre del cliente se muestra como texto: nunca se ejecuta en el resumen', async ({
  page,
}) => {
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await verifyUid(page, '123456780');
  await page.locator('#customerName').fill('<img src=x onerror="window.__xss=1">');
  await page.locator('#customerEmail').fill('cliente@example.com');
  await page.locator('#payMeansCard').check();
  await page.locator('#acceptTerms').check();
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waOrderSummary')).toContainText('<img src=x onerror=');
  await expect(page.locator('#waOrderSummary img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  expect(orderRequests).toEqual([]);
});

test('sin número de WhatsApp configurado se ve el resumen, pero no se inventa un destino', async ({
  page,
}) => {
  await withChannel(page, { whatsapp: null });
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await fillCustomer(page, '123456783');
  await expect(page.locator('#waOrderHint')).toContainText(
    'cuando la tienda configure su WhatsApp',
  );
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waOrderModal')).toBeVisible();
  await expect(page.locator('#waOrderSummary .wa-total')).toContainText('$ 3.800 COP');
  await expect(page.locator('#waNoNumber')).toBeVisible();
  await expect(page.locator('#waOrderSend')).toBeHidden();
  await expect(page.locator('#waOrderSend')).not.toHaveAttribute('href', /wa\.me/);
  expect(orderRequests).toEqual([]);
});

test('«ambos»: el pago en línea sigue y WhatsApp se suma; fuera de la demo, sin DEMO', async ({
  page,
}) => {
  await withChannel(page, { orderChannel: 'ambos', demo: false });
  await page.goto('/');
  await enterAsGuest(page);
  await expect(page.locator('#payBtn')).toBeVisible();
  await expect(page.locator('#waOrderBox')).toBeVisible();
  await expect(page.locator('#waOrderDemo')).toBeHidden();
  await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
  await fillCustomer(page, '123456781');
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waDemoBadge')).toBeHidden();
  await expect(page.locator('#waOrderSummary .wa-ref b')).toHaveText(/^WA-[A-HJKMNP-Z2-9]{6}$/);
  const message = (await page.locator('#waOrderMessage').textContent()) ?? '';
  expect(message).not.toContain('DEMO');
  expect(message).toContain('Medio: Tarjeta (crédito o débito)');
  expect(orderRequests).toEqual([]);
});

test('en el celular: barra de compra, resumen y pago dentro de la pantalla y envío a mano', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withChannel(page, { nequi: true });
  await page.goto('/');
  await enterAsGuest(page);
  await addPackages(page);
  // «Revisar pedido» de la barra lleva al siguiente dato que falta (el ID).
  await page.locator('#buyBarGo').click();
  await expect(page.locator('#playerUid')).toBeFocused();
  await fillCustomer(page, '123456782', 'nequi');
  // Con todo listo, la barra (visible desde el catálogo; se oculta dentro de «Tu pedido») lleva al
  // botón de WhatsApp, no al de pago, que está oculto.
  await page.locator('#catalogo').scrollIntoViewIfNeeded();
  await expect(page.locator('#buyBarGo')).toBeVisible();
  await page.locator('#buyBarGo').click();
  await expect(page.locator('#waOrderBtn')).toBeFocused();
  await page.locator('#waOrderBtn').click();
  const box = page.locator('#waOrderModal .modal-box');
  await expect(box).toBeVisible();
  const rect = await box.boundingBox();
  expect(rect).not.toBeNull();
  expect((rect?.x ?? -1) >= 0 && (rect?.x ?? 0) + (rect?.width ?? 0) <= 390).toBe(true);
  // Sin desplazamiento lateral de la página.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('#waPayLast4').scrollIntoViewIfNeeded();
  await page.locator('#waPayLast4').fill('4321');
  await page.locator('#waPayDone').check();
  const send = page.locator('#waOrderSend');
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  await expect(send).toHaveAttribute('aria-disabled', 'false');
  const sendBox = await send.boundingBox();
  expect(sendBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(orderRequests).toEqual([]);
});
