// Comprueba en la tienda publicada, con un navegador real, que el diseño (hoja de estilos) carga,
// que las burbujas de soporte se ven dentro de la tienda (no en la bienvenida) y que WhatsApp abre
// wa.me; informa los métodos de acceso activos. Solo lee: no crea pedidos ni inicia sesión.
/* global document, getComputedStyle -- dentro de page.evaluate (navegador) */
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
    const failedCss = [];
    page.on('requestfailed', (req) => {
      if (req.resourceType() === 'stylesheet') failedCss.push(new URL(req.url()).pathname);
    });
    page.on('response', (res) => {
      if (res.request().resourceType() === 'stylesheet' && res.status() >= 400)
        failedCss.push(`${new URL(res.url()).pathname} → ${res.status()}`);
    });
    await page.goto(base.href, { waitUntil: 'load', timeout: 90_000 });
    await page.locator('#enterStoreBtn').waitFor({ timeout: 60_000 });
    // La hoja principal define --bg; sin ella la tienda se vería en blanco (o con el aviso).
    const styled = await page.evaluate(
      () =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() !== '' &&
        !document.getElementById('estilosCaidos'),
    );
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
      `${viewport.width}px · diseño cargado: ${styled ? 'sí' : `NO (${failedCss.join(', ') || 'sin detalle'})`} · bienvenida sin burbuja: ${!onWelcome ? 'sí' : 'NO'} · WhatsApp visible: ${waVisible ? 'sí' : 'NO'} · enlace wa.me: ${waLink ? 'sí' : 'NO'} · a la derecha: ${right ? 'sí' : 'NO'} · correo visible: ${mailVisible ? 'sí' : 'NO'}`,
    );
    if (!styled || onWelcome || !waVisible || !waLink || !right || !mailVisible)
      failures.push(`${viewport.width}px`);
    await page.close();
  }
  // Lo que ve un cliente en el catálogo: cuántos paquetes se pueden comprar y cuántos salen
  // «Agotado» (SELL_ONLY_WITH_STOCK sin PIN ni proveedor). Solo lee.
  const catalog = await (await fetch(new URL('/api/catalog?game=freefire', base))).json();
  const packages = Array.isArray(catalog.products) ? catalog.products : [];
  const soldOut = packages.filter((p) => p.soldOut).length;
  console.log(
    `Catálogo · ${packages.length} paquete(s) · a la venta: ${packages.length - soldOut} · agotados: ${soldOut}`,
  );
  if (packages.length && soldOut === packages.length)
    console.log(
      '::warning::Todos los paquetes salen «Agotado»: los clientes no pueden comprar (SELL_ONLY_WITH_STOCK=true sin PIN ni proveedor).',
    );
  // Reseñas verificadas publicadas y plazo de entrega que ve el cliente. Solo lee.
  const reviews = await (await fetch(new URL('/api/reviews?game=freefire', base))).json();
  const config = await (await fetch(new URL('/api/config', base))).json();
  console.log(
    `Reseñas publicadas: ${reviews.summary?.count ?? 0}` +
      (reviews.summary?.average ? ` · promedio ${reviews.summary.average}` : '') +
      ` · plazo de entrega publicado: ${config.deliveryTime ? 'sí' : 'NO'}` +
      ` · correos al cliente: ${config.emailUpdates ? 'activos' : 'inactivos'}`,
  );
  const auth = Object.entries(config.auth ?? {})
    .map(([name, on]) => `${name}: ${on ? 'activo' : 'sin credenciales'}`)
    .join(' · ');
  console.log(`Acceso de clientes · invitado: activo · ${auth || 'sin datos'}`);
  // Google activo: el inicio del login debe llevar a Google con un ID de cliente bien formado y
  // la dirección de regreso exacta (sin iniciar sesión; nunca imprime el ID).
  if (config.auth?.google) {
    const start = await fetch(new URL('/auth/google', base), { redirect: 'manual' });
    const target = new URL(start.headers.get('location') || 'about:blank');
    const id = target.searchParams.get('client_id') || '';
    const checks = {
      'va a Google': target.hostname === 'accounts.google.com',
      'ID de cliente con formato válido': /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id),
      'regreso a /auth/google/callback':
        target.searchParams.get('redirect_uri') === `${base.origin}/auth/google/callback`,
    };
    console.log(
      `Login con Google · ${Object.entries(checks)
        .map(([name, ok]) => `${name}: ${ok ? 'sí' : 'NO'}`)
        .join(' · ')}`,
    );
    if (!checks['ID de cliente con formato válido']) {
      // Pistas para corregirlo en Render sin mostrar el valor.
      const hints = {
        'termina en .apps.googleusercontent.com': id.endsWith('.apps.googleusercontent.com'),
        'empieza con números y guion': /^\d+-/.test(id),
        'tiene espacios': /\s/.test(id),
        'parece el secreto (GOCSPX-)': id.startsWith('GOCSPX-'),
        'repite el sufijo': id.split('.apps.googleusercontent.com').length > 2,
      };
      console.log(
        `Pistas del ID (${id.length} caracteres) · ${Object.entries(hints)
          .map(([name, ok]) => `${name}: ${ok ? 'sí' : 'no'}`)
          .join(' · ')}`,
      );
    }
    if (Object.values(checks).includes(false)) failures.push('login con Google');
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`Fallos en: ${failures.join(', ')}`);
  process.exit(1);
}
