// Comprueba en la tienda publicada, con un navegador real, que las burbujas de soporte se ven
// dentro de la tienda (no en la bienvenida) y que WhatsApp abre wa.me. Solo lee: no crea pedidos.
// Nunca imprime el número ni el correo. Uso: node tools/smoke/burbujas.mjs https://tienda
import { chromium } from 'playwright';

const base = new URL(process.argv[2] || 'https://taygamestore.onrender.com');
if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1') throw new Error('Solo https');
const browser = await chromium.launch();
const failures = [];
try {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.locator('#enterStoreBtn').waitFor({ timeout: 60_000 });
    const onWelcome = await page.locator('#supportFloat').isVisible();
    await page.locator('#enterStoreBtn').click();
    await page.locator('#guestBtn').click();
    await page.locator('#products .product').first().waitFor({ timeout: 60_000 });
    const wa = page.locator('#floatWhatsApp');
    await wa.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    const waVisible = await wa.isVisible();
    const waLink = /^https:\/\/wa\.me\/\d{8,15}\?text=/.test((await wa.getAttribute('href')) || '');
    const mailVisible = await page.locator('#floatEmail').isVisible();
    const box = await wa.boundingBox();
    const right = box ? viewport.width - (box.x + box.width) <= 24 : false;
    console.log(
      `${viewport.width}px · bienvenida sin burbuja: ${!onWelcome ? 'sí' : 'NO'} · WhatsApp visible: ${waVisible ? 'sí' : 'NO'} · enlace wa.me: ${waLink ? 'sí' : 'NO'} · a la derecha: ${right ? 'sí' : 'NO'} · correo visible: ${mailVisible ? 'sí' : 'NO'}`,
    );
    if (onWelcome || !waVisible || !waLink || !right || !mailVisible)
      failures.push(`${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Burbujas de soporte con fallos en: ${failures.join(', ')}`);
  process.exit(1);
}
