// Construye dist/preview/: la tienda con el entorno de prueba del navegador (tools/preview/shim.js).
// SOLO para enseñar y probar la tienda sin servidor. Nunca se despliega: el servidor sirve dist/web.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '../..');
const out = join(root, 'dist/preview');

await build({
  root: join(root, 'src/web'),
  configFile: join(root, 'vite.config.ts'),
  base: './',
  logLevel: 'warn',
  build: { outDir: out, emptyOutDir: true },
});

// Sin precomprimidos: la vista previa se publica como archivos estáticos simples.
for (const entry of await readdir(out, { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && /\.(br|gz)$/.test(entry.name)) await rm(join(entry.parentPath, entry.name));
}

await mkdir(join(out, 'preview'), { recursive: true });
// Canales de soporte reales de la vista previa: solo desde variables de entorno al construir.
const wa = (process.env.PREVIEW_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
const mail = (process.env.PREVIEW_SUPPORT_EMAIL || '').trim();
if (wa && !/^\d{8,15}$/.test(wa))
  throw new Error('PREVIEW_SUPPORT_WHATSAPP no es un número válido');
if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
  throw new Error('PREVIEW_SUPPORT_EMAIL no es un correo válido');
let shim = await readFile(join(import.meta.dirname, 'shim.js'), 'utf8');
if (wa || mail) {
  const marked = /\/\*__PREVIEW_SUPPORT__\*\/ \{[^}]*\}/;
  if (!marked.test(shim)) throw new Error('No se encontró el marcador de soporte en shim.js');
  shim = shim.replace(
    marked,
    JSON.stringify({ whatsapp: wa || null, email: mail || 'soporte@example.com' }),
  );
}
await writeFile(join(out, 'preview/shim.js'), shim);

const SHIM_TAG = '<script src="./preview/shim.js"></script>';
const PAGES = [
  'index.html',
  'admin.html',
  'terminos.html',
  'privacidad.html',
  'cookies.html',
  'reembolsos.html',
];
for (const page of PAGES) {
  const file = join(out, page);
  let html = await readFile(file, 'utf8');
  // Enlaces relativos: la vista previa no vive en la raíz de un dominio.
  html = html
    .replace(/href="\/(terminos|privacidad|cookies|reembolsos)\.html/g, 'href="$1.html')
    .replaceAll('href="/"', 'href="index.html"');
  if (page === 'index.html') {
    // Nombre propio en la galería de artefactos: se distingue de la tienda real.
    html = html.replace(/<title>[^<]*<\/title>/, '<title>Tienda TayGameStore</title>');
  }
  if (page === 'index.html' || page === 'admin.html') {
    // Antes que los módulos de la app: intercepta /api/* desde el primer fetch.
    html = html.replace(/<script type="module"/, `${SHIM_TAG}\n    <script type="module"`);
    if (!html.includes(SHIM_TAG))
      throw new Error(`No se pudo insertar el entorno de prueba en ${page}`);
  }
  await writeFile(file, html);
}
console.warn(`Vista previa lista en ${out} (abre index.html con cualquier servidor estático).`);
