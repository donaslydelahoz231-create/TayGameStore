// Recorre la compra como un cliente, con un navegador real, contra el servidor LOCAL de pruebas
// (e2e/support/server.ts, Mercado Pago simulado). Nunca contra producción: crearía pedidos reales.
// Uso, con la configuración de producción en el servidor local:
//   E2E_DATABASE_URL=…_e2e_test E2E_SELL_ONLY_WITH_STOCK=false E2E_PLAYER_VERIFICATION=customer \
//     E2E_PROMO_SCHEDULE=weekends node --import tsx e2e/support/server.ts &
//   node tools/smoke/compra-cliente.mjs [carpeta-de-capturas]
/* global document -- dentro de page.evaluate (navegador) */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173';
const shots = process.argv[2] || 'compra-cliente';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let step = 0;
/** Captura la sección donde está `selector`, ya quieta (la tienda anima el desplazamiento). */
const ok = async (label, selector) => {
  step += 1;
  if (selector) await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/${String(step).padStart(2, '0')}.png`, fullPage: false });
  console.log(`✓ ${step}. ${label}`);
};
const fail = async (label) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${shots}/fallo.png`, fullPage: false });
  console.log(`✗ ${label}`);
  process.exitCode = 1;
};

try {
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#enterStoreBtn').click();
  await page.locator('#guestBtn').click();
  await page.locator('#products .product').first().waitFor();
  await ok('Entra a la tienda como invitado y ve el catálogo', '#products');

  const cards = page.locator('#products .product');
  const total = await cards.count();
  const soldOut = await page.locator('#products .product .add-btn[disabled]').count();
  console.log(
    `  Catálogo: ${total} paquete(s) · a la venta: ${total - soldOut} · agotados: ${soldOut}`,
  );
  if (soldOut === total) {
    await fail('Todos los paquetes salen «Agotado»: el cliente no puede añadir nada al carrito');
  } else {
    const pack = page.locator('#products .product', { hasText: '100 + 10 Diamantes' });
    const price = (await pack.locator('.product-price strong').textContent())?.trim();
    await pack.locator('.add-btn').click();
    await ok(`Añade «100 + 10 Diamantes» (${price})`, '#products');

    await page.locator('#playerUid').fill('734567812');
    await page.locator('#verifyBtn').click();
    await page.locator('#playerUidConfirm').fill('734567812');
    await page.locator('#confirmUid').click();
    await page.locator('#playerResult', { hasText: 'confirmado' }).waitFor();
    await ok('Escribe su ID de Free Fire dos veces y lo confirma', '#playerResult');

    await page.locator('#customerName').fill('Cliente de Práctica');
    await page.locator('#customerEmail').fill('practica@example.com');
    await page.getByRole('radio', { name: /PSE/ }).check();
    await page.locator('#acceptTerms').check();
    const payLabel = (await page.locator('#payBtn').textContent())?.trim();
    await ok(`Llena nombre y correo, elige PSE y acepta los términos («${payLabel}»)`, '#payBtn');

    // «Pagar» crea el pedido y lleva a Mercado Pago (aquí, la página simulada que aprueba el pago).
    await page.locator('#payBtn').click();
    await page.waitForURL(/#seguimiento$/, { timeout: 30_000 });
    await page
      .locator('#invoiceState', { hasText: 'Pago confirmado' })
      .waitFor({ timeout: 30_000 });
    const ref = (await page.locator('#invoiceRef').textContent())?.trim();
    const state = (await page.locator('#invoiceState').textContent())?.trim();
    await ok(
      `Paga en Mercado Pago (simulado) y vuelve: pedido ${ref} · «${state}»`,
      '#invoiceState',
    );

    await page.locator('#accountBtn').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('menuHistory')?.click());
    await page.locator('#historyList', { hasText: ref ?? '' }).waitFor();
    await ok('El pedido aparece en «Mis pedidos»', '#historyList');
  }
} catch (error) {
  await fail(`Error en el paso ${step + 1}: ${error instanceof Error ? error.message : error}`);
} finally {
  await browser.close();
}
