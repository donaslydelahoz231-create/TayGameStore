// Genera las imágenes de marca de la tienda en src/web/public a partir de diseños HTML propios
// (Tay y el logotipo de brand/, el arte de los paquetes de art/ y los colores de TayGameStore; sin
// logos ni arte de terceros):
//   og-image.png (1200×630, vista previa al compartir), apple-touch-icon.png (180×180, desde
//   brand/tay-app.svg) y favicon.ico (32×32 desde favicon.svg, PNG dentro de un contenedor ICO).
//
//   node tools/marca/generar-imagenes.mjs
//
// Usa el Chromium de Playwright y las fuentes de la propia tienda (src/web/public/fonts): no
// necesita red. Después, og-image.png se reduce a 256 colores para que WhatsApp la muestre (pesa
// menos de 300 KB):
//   convert src/web/public/og-image.png -dither FloydSteinberg -colors 256 PNG8:src/web/public/og-image.png
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const raiz = resolve(import.meta.dirname, '../..');
const destino = resolve(raiz, 'src/web/public');

async function dataUri(ruta, tipo) {
  return `data:${tipo};base64,${(await readFile(resolve(destino, ruta))).toString('base64')}`;
}
const logo = await dataUri('brand/tay-logo.svg', 'image/svg+xml');
const app = await dataUri('brand/tay-app.svg', 'image/svg+xml');
const favicon = await dataUri('favicon.svg', 'image/svg+xml');
const arte = await Promise.all(
  ['art/paquete-1166.webp', 'art/paquete-2398.webp', 'art/paquete-6160.webp'].map((r) =>
    dataUri(r, 'image/webp'),
  ),
);
const fuentes = `<style>
  @font-face{font-family:Unbounded;font-weight:400 900;src:url(${await dataUri('fonts/unbounded-latin.woff2', 'font/woff2')}) format('woff2')}
  @font-face{font-family:'Instrument Sans';font-weight:400 700;font-stretch:75% 100%;src:url(${await dataUri('fonts/instrument-sans-latin.woff2', 'font/woff2')}) format('woff2')}
</style>`;

const portada = `<!doctype html><html><head>${fuentes}<style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;position:relative;color:#eef2ff;font-family:'Instrument Sans',sans-serif;
    background:radial-gradient(120% 90% at 85% 10%,#3b1796 0,#160f4d 38%,#060818 72%)}
  .rejilla{position:absolute;inset:0;opacity:.5;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:44px 44px;
    mask-image:linear-gradient(100deg,#000 30%,transparent 80%)}
  .halo{position:absolute;width:640px;height:640px;right:-120px;top:-40px;border-radius:50%;
    background:radial-gradient(circle,rgba(55,214,255,.28),transparent 62%)}
  .texto{position:absolute;left:80px;top:96px;width:600px}
  .texto img{height:92px;display:block}
  h1{font-family:Unbounded,sans-serif;font-weight:700;font-size:54px;line-height:1.04;letter-spacing:-.01em;margin-top:44px}
  h1 span{background:linear-gradient(100deg,#37d6ff,#8b7bff 55%,#b06bff);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{margin-top:22px;font-size:26px;color:#c9d0f5;font-weight:500}
  .arte{position:absolute;right:56px;top:84px;width:470px;height:470px}
  .arte img{position:absolute;width:300px;height:300px;border-radius:32px;object-fit:cover;
    box-shadow:0 30px 70px rgba(0,0,0,.55),0 0 0 1.5px rgba(167,197,255,.25)}
  .a1{left:0;top:150px;transform:rotate(-9deg)}.a2{left:150px;top:0;transform:rotate(4deg)}
  .a3{left:170px;top:190px;transform:rotate(-2deg);width:290px!important;height:290px!important}
</style></head><body><div class="halo"></div><div class="rejilla"></div>
<div class="texto"><img src="${logo}" alt="">
  <h1>Diamantes de Free Fire <span>por ID</span></h1>
  <p>Confirmas tu ID y pagas con Mercado Pago.</p></div>
<div class="arte"><img class="a1" src="${arte[0]}" alt=""><img class="a2" src="${arte[1]}" alt=""><img class="a3" src="${arte[2]}" alt=""></div>
</body></html>`;

const icono = (src, lado) =>
  `<!doctype html><html><head><style>*{margin:0}body{width:${lado}px;height:${lado}px}
  img{width:${lado}px;height:${lado}px;display:block}</style></head>
  <body><img src="${src}" alt=""></body></html>`;

/** ICO con una sola imagen PNG (formato admitido por los navegadores actuales). */
function ico(png, lado) {
  const cabecera = Buffer.alloc(6 + 16);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(1, 4); // una imagen
  cabecera.writeUInt8(lado, 6); // ancho
  cabecera.writeUInt8(lado, 7); // alto
  cabecera.writeUInt16LE(1, 10); // planos
  cabecera.writeUInt16LE(32, 12); // bits por píxel
  cabecera.writeUInt32LE(png.length, 14); // tamaño de la imagen
  cabecera.writeUInt32LE(22, 18); // posición de la imagen
  return Buffer.concat([cabecera, png]);
}

const navegador = await chromium.launch();
try {
  async function capturar(html, ancho, alto, transparente = false) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    await pagina.setContent(html, { waitUntil: 'networkidle' });
    await pagina.evaluate('document.fonts.ready');
    const png = await pagina.screenshot({ type: 'png', omitBackground: transparente });
    await pagina.close();
    return png;
  }
  await writeFile(resolve(destino, 'og-image.png'), await capturar(portada, 1200, 630));
  await writeFile(
    resolve(destino, 'apple-touch-icon.png'),
    await capturar(icono(app, 180), 180, 180),
  );
  await writeFile(
    resolve(destino, 'favicon.ico'),
    ico(await capturar(icono(favicon, 32), 32, 32, true), 32),
  );
  console.warn('Imágenes generadas en src/web/public');
} finally {
  await navegador.close();
}
