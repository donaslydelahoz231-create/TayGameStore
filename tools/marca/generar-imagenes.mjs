// Genera las imágenes de marca de la tienda en src/web/public a partir de diseños HTML propios
// (corona y colores de TayGameStore; sin logos ni arte de terceros):
//   og-image.png (1200×630, vista previa al compartir), apple-touch-icon.png (180×180) y
//   favicon.ico (32×32, PNG dentro de un contenedor ICO).
//
//   node tools/marca/generar-imagenes.mjs
//
// Usa el Chromium de Playwright. Las fuentes (Oxanium y Plus Jakarta Sans) vienen de Google Fonts,
// como en la tienda; sin red se usan las del sistema.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const raiz = resolve(import.meta.dirname, '../..');
const destino = resolve(raiz, 'src/web/public');
const corona = await readFile(resolve(destino, 'favicon.svg'), 'utf8');
const coronaUri = `data:image/svg+xml;base64,${Buffer.from(corona).toString('base64')}`;

const fuentes =
  '<link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@700;800&family=Plus+Jakarta+Sans:wght@500;600&display=block" rel="stylesheet">';

const portada = `<!doctype html><html><head>${fuentes}<style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#050815;color:#eef2ff;font-family:'Plus Jakarta Sans',sans-serif;
    position:relative;overflow:hidden;display:flex;align-items:center;padding:0 88px}
  .orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55}
  .a{width:520px;height:520px;background:#8b3dff;top:-160px;right:-120px}
  .b{width:420px;height:420px;background:#37d6ff;bottom:-220px;left:-120px;opacity:.35}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:48px 48px}
  .contenido{position:relative;display:flex;align-items:center;gap:56px}
  img{width:220px;height:220px;border-radius:44px;box-shadow:0 0 80px rgba(139,61,255,.55)}
  .marca{font-family:Oxanium,sans-serif;font-weight:800;font-size:84px;letter-spacing:-1px}
  .marca span{color:#ffc857}
  .lema{font-family:Oxanium,sans-serif;font-weight:700;font-size:40px;margin-top:8px;color:#37d6ff}
  .detalle{font-size:26px;margin-top:22px;color:#c9d0f5;font-weight:500;line-height:1.4}
</style></head><body><div class="grid"></div><div class="orb a"></div><div class="orb b"></div>
<div class="contenido"><img src="${coronaUri}" alt=""><div>
  <div class="marca">TayGame<span>Store</span></div>
  <div class="lema">Tu ID. Tu recarga. Tu siguiente jugada.</div>
  <div class="detalle">Recargas de diamantes por ID<br>Verificación del jugador · Pago con Mercado Pago</div>
</div></div></body></html>`;

const icono = (lado) =>
  `<!doctype html><html><head><style>*{margin:0}body{width:${lado}px;height:${lado}px}
  img{width:${lado}px;height:${lado}px;display:block}</style></head>
  <body><img src="${coronaUri}" alt=""></body></html>`;

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
  async function capturar(html, ancho, alto) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    await pagina.setContent(html, { waitUntil: 'networkidle' });
    await pagina.evaluate('document.fonts.ready');
    const png = await pagina.screenshot({ type: 'png', omitBackground: false });
    await pagina.close();
    return png;
  }
  await writeFile(resolve(destino, 'og-image.png'), await capturar(portada, 1200, 630));
  await writeFile(resolve(destino, 'apple-touch-icon.png'), await capturar(icono(180), 180, 180));
  await writeFile(resolve(destino, 'favicon.ico'), ico(await capturar(icono(32), 32, 32), 32));
  console.warn('Imágenes generadas en src/web/public');
} finally {
  await navegador.close();
}
