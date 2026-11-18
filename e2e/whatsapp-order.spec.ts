import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Envío del pedido desde la tienda (ORDER_CHANNEL `whatsapp` o `ambos`; pedido del dueño,
 * 2026-11-18) contra el servidor real de pruebas: el cliente nunca abre WhatsApp. Con Nequi,
 * «Revisar, pagar y enviar» crea el pedido real, muestra la cuenta que da el servidor, exige los
 * 4 dígitos y «Ya hice la transferencia», informa el pago y muestra la pestaña «Compra exitosa»
 * con la espera de 30 minutos; el WhatsApp del dueño (CallMeBot simulado en el servidor de
 * pruebas) recibe el pedido con datos mínimos. Con tarjeta, PSE, Efecty o saldo se paga en línea
 * como con «Pagar». El canal se simula parcheando /api/config; wa.me se responde en local y se
 * cuenta: ninguna prueba debe abrirlo. Catálogo de pruebas con la promo siempre activa:
 * 110 💎 a $ 3.800 (lista $ 4.000) y 572 💎 a $ 17.000 (lista $ 18.000). Datos ficticios.
 */

let consoleErrors: string[] = [];
/** Veces que la página intentó abrir WhatsApp (debe quedar en 0). */
let whatsappOpened = 0;

const operator = (page: Page, path: string, data: object) =>
  page.request.post(`/__e2e__/${path}`, { data, headers: { 'x-tgs-csrf': '1' } });

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'envío del pedido: un solo proyecto');
  consoleErrors = await preparePage(page);
  whatsappOpened = 0;
  await page.context().route('https://wa.me/**', (route) => {
    whatsappOpened += 1;
    return route.fulfill({ contentType: 'text/html', body: '<title>WhatsApp (simulado)</title>' });
  });
});

test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
  expect(whatsappOpened).toBe(0);
});

async function withChannel(
  page: Page,
  options: { orderChannel?: string | null; demo?: boolean; mercadoPago?: boolean } = {},
) {
  const { orderChannel = 'whatsapp', demo = true, mercadoPago = true } = options;
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown> & {
      paymentMethods?: Record<string, unknown>;
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        ...(orderChannel ? { orderChannel, demo } : {}),
        // MERCADOPAGO_NEW_PAYMENTS=false en el servidor: la tienda no ofrece Mercado Pago.
        ...(mercadoPago ? {} : { paymentMethods: { ...body.paymentMethods, mercadopago: false } }),
      },
    });
  });
}

const product = (page: Page, name: string) =>
  page.locator('#products .product').filter({ hasText: name });
const toast = (page: Page) => page.locator('#toastStack .toast');

/** Modo del servidor de pruebas (operador): «Verificar» acepta el ID. */
async function verifyUid(page: Page, uid: string) {
  await page.locator('#playerUid').fill(uid);
  await page.locator('#verifyBtn').click();
  await expect(page.locator('#playerResult')).toContainText(`UID ${uid} listo`);
}

/** Como producción (PLAYER_VERIFICATION=customer): el cliente escribe su ID dos veces. */
async function confirmOwnUid(page: Page, uid: string) {
  await page.locator('#playerUid').fill(uid);
  await page.locator('#verifyBtn').click();
  await page.locator('#playerUidConfirm').fill(uid);
  await page.locator('#confirmUid').click();
  await expect(page.locator('#playerResult')).toContainText(`ID ${uid} confirmado ✓`);
}

/**
 * Datos del cliente. Cada prueba usa su propio correo ficticio: la tienda limita los pedidos
 * abiertos por correo (regla antifraude) y estos pedidos Nequi quedan abiertos.
 */
async function customerData(page: Page, means: 'card' | 'nequi', name = 'Cliente Ficticio') {
  const uid = await page.locator('#playerUid').inputValue();
  await page.locator('#customerName').fill(name);
  await page.locator('#customerEmail').fill(`cliente-${uid || 'x'}@example.com`);
  await page.locator(means === 'card' ? '#payMeansCard' : '#payMeansNequi').check();
  await page.locator('#acceptTerms').check();
}

/** Nequi por transferencia y el cliente confirmando su ID, como la tienda publicada. */
async function nequiLikeProduction(page: Page) {
  expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
  expect((await operator(page, 'nequi', { enabled: true })).ok()).toBe(true);
}

async function ownerWhatsApp(page: Page): Promise<string[]> {
  const res = await page.request.get('/__e2e__/owner-whatsapp');
  return ((await res.json()) as { sent: string[] }).sent;
}

test('por defecto la tienda no cambia: solo «Pagar» y sin el envío desde la tienda', async ({
  page,
}) => {
  await withChannel(page, { orderChannel: null });
  await page.goto('/');
  await enterAsGuest(page);
  await expect(page.locator('#payBtn')).toBeVisible();
  await expect(page.locator('#waOrderBox')).toBeHidden();
  await expect(page.locator('#waOrderModal')).toBeHidden();
  await expect(page.locator('#orderSent')).toBeHidden();
});

test('Nequi: crea el pedido, muestra la cuenta, exige el pago informado y lo envía sin abrir WhatsApp', async ({
  page,
}) => {
  await nequiLikeProduction(page);
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);

  // Solo este botón: «Pagar» se oculta (no se borra).
  await expect(page.locator('#payBtn')).toBeHidden();
  await expect(page.locator('#waOrderBox')).toBeVisible();
  await expect(page.locator('#waOrderBtn')).toContainText('Revisar, pagar y enviar');
  await expect(page.locator('#waOrderDemo')).toContainText('DEMO');

  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await product(page, '100 + 10 Diamantes').locator('[data-op="plus"]').click();
  await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
  // Validación en orden: sin ID no se crea nada.
  const next = page.locator('#waOrderBtn');
  await next.click();
  await expect(toast(page)).toContainText('UID');
  await expect(page.locator('#waOrderModal')).toBeHidden();
  await confirmOwnUid(page, '734567871');
  await customerData(page, 'nequi');
  await expect(page.locator('#payMeansHint')).toContainText('cuenta Nequi');
  await expect(page.locator('#waOrderHint')).toContainText('paga por Nequi');

  // Revisar: el pedido ya existe en el servidor (referencia TGS-…) con sus precios reales.
  await next.click();
  await expect(page.locator('#waOrderModal')).toBeVisible();
  await expect(page.locator('#waDemoBadge')).toBeVisible();
  const summary = page.locator('#waOrderSummary');
  const reference = (await summary.locator('.wa-ref b').textContent())?.trim() ?? '';
  expect(reference).toMatch(/^TGS-[0-9A-Z]{10}$/);
  await expect(page.locator('#invoiceRef')).toHaveText(reference);
  for (const text of [
    'Cliente Ficticio',
    'cliente-734567871@example.com',
    '734567871',
    '100 + 10 Diamantes',
    '2 × $ 3.800 COP',
    '520 + 52 Diamantes',
    '1 × $ 17.000 COP',
  ]) {
    await expect(summary).toContainText(text);
  }
  await expect(summary.locator('.wa-totals')).toContainText('Descuentos−$ 1.400 COP');
  await expect(summary.locator('.wa-total')).toContainText('$ 24.600 COP');
  // La cuenta la da el servidor para ESTE pedido (datos ficticios del servidor de pruebas).
  const info = page.locator('#waPayInfo');
  await expect(info).toContainText('$ 24.600 COP');
  await expect(info).toContainText('@tiendapruebas');
  // Titular enmascarado: el nombre completo del dueño nunca llega al navegador.
  await expect(info).toContainText('Tie*** de Pru***');
  await expect(info).not.toContainText('Tienda de Pruebas');
  await expect(info).toContainText(reference);
  await expect(info).toContainText('No transfieras dinero real');

  // Sin el pago informado no se envía y se dice qué falta.
  const send = page.locator('#waOrderSend');
  await expect(send).toContainText('Confirmar pago y enviar');
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled: Playwright no lo pulsa por sí solo; una persona sí, y el clic le explica qué falta.
  await send.click({ force: true });
  await expect(toast(page)).toContainText('4 últimos dígitos');
  await expect(page.locator('#waPayLast4')).toBeFocused();
  await page.locator('#waPayLast4').pressSequentially('12ab34');
  await expect(page.locator('#waPayLast4')).toHaveValue('1234');
  await send.click({ force: true });
  await expect(toast(page)).toContainText('Ya hice la transferencia');
  await page.locator('#waPayRef').fill('M12345678');
  await page.locator('#waPayDone').check();
  await expect(send).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#waOrderStatus')).toContainText('nos llegan al instante');

  // Enviar: sin WhatsApp; el diálogo se cierra y aparece la pestaña flotante con la espera.
  const before = (await ownerWhatsApp(page)).length;
  let popups = 0;
  page.on('popup', () => (popups += 1));
  await send.click();
  await expect(page.locator('#waOrderModal')).toBeHidden();
  const sent = page.locator('#orderSent');
  await expect(sent).toBeVisible();
  await expect(page.locator('#orderSentTitle')).toHaveText('Compra exitosa');
  await expect(page.locator('#orderSentWait')).toHaveText(
    'Tu recarga llegará al ID 734567871 en un máximo de 30 minutos, apenas verifiquemos tu pago.',
  );
  expect(popups).toBe(0);
  // El pedido queda informado (no pagado): lo confirma el dueño al ver el dinero.
  await expect(page.locator('#nequiStatus')).toContainText('Recibimos tu aviso');
  await expect(page.locator('#invoiceState')).toHaveText('Transferencia Nequi por verificar');

  // Al dueño le llega solo a su WhatsApp, con datos mínimos (sin nombre ni correo).
  await expect.poll(async () => (await ownerWhatsApp(page)).length).toBe(before + 1);
  const text = (await ownerWhatsApp(page)).at(-1) ?? '';
  expect(text).toContain(`Pedido: ${reference}`);
  // El ID va solo en su renglón: WhatsApp deja copiarlo sin el resto del mensaje.
  expect(text).toContain('ID Free Fire:\n734567871\n');
  expect(text).toContain('Total: $ 24.600 COP');
  expect(text).toContain('Pago: Nequi, desde la cuenta terminada en 1234.');
  expect(text).not.toContain('Cliente Ficticio');
  expect(text).not.toContain('cliente-734567871@example.com');
  expect(text).not.toMatch(/[*_~`]/);

  // La pestaña se cierra con su ×; reabrir dice que ya se envió (y permite corregir).
  await page.locator('#orderSentClose').click();
  await expect(sent).toBeHidden();
  await next.click();
  await expect(page.locator('#waOrderTitle')).toHaveText('Ya enviaste este pedido');
  await expect(page.locator('#waOrderSendLabel')).toHaveText('Corregir y reenviar');
  await expect(summary.locator('.wa-ref b')).toHaveText(reference);
});

test('con tarjeta, el mismo botón lleva al pago en línea (como «Pagar»)', async ({ page }) => {
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await verifyUid(page, '123456789');
  await customerData(page, 'card');
  await expect(page.locator('#payMeansHint')).toContainText('Mercado Pago');
  await expect(page.locator('#waOrderHint')).toContainText('pagas en línea');
  await page.locator('#waOrderBtn').click();
  // Servidor de pruebas: verificación por el equipo; el pedido se crea y espera al operador.
  await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-[0-9A-Z]{10}$/);
  await expect(page.locator('#waOrderModal')).toBeHidden();
  await expect(page.locator('#orderSent')).toBeHidden();
});

test('el nombre del cliente se muestra como texto: nunca se ejecuta en el resumen', async ({
  page,
}) => {
  await nequiLikeProduction(page);
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await confirmOwnUid(page, '734567872');
  await customerData(page, 'nequi', '<img src=x onerror="window.__xss=1">');
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waOrderSummary')).toContainText('<img src=x onerror=');
  await expect(page.locator('#waOrderSummary img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('«ambos»: «Pagar» sigue y el envío se suma; fuera de la demo, sin DEMO', async ({ page }) => {
  await nequiLikeProduction(page);
  await withChannel(page, { orderChannel: 'ambos', demo: false });
  await page.goto('/');
  await enterAsGuest(page);
  await expect(page.locator('#payBtn')).toBeVisible();
  await expect(page.locator('#waOrderBox')).toBeVisible();
  await expect(page.locator('#waOrderDemo')).toBeHidden();
  await product(page, '520 + 52 Diamantes').locator('.add-btn').click();
  await confirmOwnUid(page, '734567873');
  await customerData(page, 'nequi');
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waOrderModal')).toBeVisible();
  await expect(page.locator('#waDemoBadge')).toBeHidden();
  await expect(page.locator('#waDemoNote')).toBeHidden();
  await expect(page.locator('#waPayInfo')).not.toContainText('DEMO');
});

test('en el celular: barra de compra, resumen y pago en pantalla, y la pestaña sobre la barra', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await nequiLikeProduction(page);
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  // «Revisar pedido» de la barra lleva al siguiente dato que falta (el ID).
  await page.locator('#buyBarGo').click();
  await expect(page.locator('#playerUid')).toBeFocused();
  await confirmOwnUid(page, '734567874');
  await customerData(page, 'nequi');
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#waPayLast4').fill('4321');
  await page.locator('#waPayDone').check();
  await page.locator('#waOrderSend').click();
  const sent = page.locator('#orderSent');
  await expect(sent).toBeVisible();
  const tab = await sent.boundingBox();
  expect(tab).not.toBeNull();
  // Dentro de la pantalla, a lo ancho y sin salirse por abajo.
  expect(tab?.x).toBeGreaterThanOrEqual(0);
  expect((tab?.x ?? 0) + (tab?.width ?? 0)).toBeLessThanOrEqual(390);
  expect((tab?.y ?? 0) + (tab?.height ?? 0)).toBeLessThanOrEqual(844);
});

test('como en producción, el cliente confirma su propio ID y la lista dice «ID confirmado»', async ({
  page,
}) => {
  expect((await operator(page, 'player-verification', { mode: 'customer' })).ok()).toBe(true);
  await withChannel(page);
  await page.goto('/');
  await enterAsGuest(page);
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await confirmOwnUid(page, '734567866');
  await expect(page.locator('#nickState')).toHaveText('Listo');
});

test('preguntas frecuentes: un solo clic en cualquier parte de la caja la abre', async ({
  page,
}) => {
  await page.goto('/');
  await enterAsGuest(page);
  const faq = page.locator('.faq-grid details');
  await faq.first().scrollIntoViewIfNeeded();
  // Abre la de la izquierda; su vecina cerrada no se estira a su altura.
  await faq.nth(0).locator('summary').click();
  await expect(faq.nth(0)).toHaveAttribute('open', '');
  const neighbor = faq.nth(1);
  const [boxH, titleH] = await neighbor.evaluate((el) => [
    el.getBoundingClientRect().height,
    el.querySelector('summary')?.getBoundingClientRect().height ?? 0,
  ]);
  expect(boxH - titleH).toBeLessThanOrEqual(4);
  // Un clic en la parte de abajo de la caja también la abre.
  const rect = await neighbor.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.click(
    (rect?.x ?? 0) + (rect?.width ?? 0) / 2,
    (rect?.y ?? 0) + (rect?.height ?? 0) - 6,
  );
  await expect(neighbor).toHaveAttribute('open', '');
  await expect(neighbor.locator('p')).toBeVisible();
});

test('solo Nequi (Mercado Pago apagado para pagos nuevos): sin opciones ni preguntas de Mercado Pago', async ({
  page,
}) => {
  await nequiLikeProduction(page);
  await withChannel(page, { mercadoPago: false });
  await page.goto('/');
  await enterAsGuest(page);
  await expect(page.locator('#payProviderMp')).toBeHidden();
  await expect(page.locator('#payProviderNequi')).toBeVisible();
  await expect(page.locator('#payMeansHint')).toContainText('Elige Nequi');
  await expect(page.locator('#payMeansHint')).not.toContainText('Mercado Pago');
  await expect(page.locator('#faqMpPay')).toBeHidden();
  await expect(page.locator('#faqMpPending')).toBeHidden();
  await expect(page.locator('#faqNequi')).toBeVisible();
  // El envío con Nequi funciona igual.
  await product(page, '100 + 10 Diamantes').locator('.add-btn').click();
  await confirmOwnUid(page, '734567875');
  await customerData(page, 'nequi');
  await page.locator('#waOrderBtn').click();
  await expect(page.locator('#waOrderModal')).toBeVisible();
  await expect(page.locator('#waPayInfo')).toContainText('@tiendapruebas');
});
