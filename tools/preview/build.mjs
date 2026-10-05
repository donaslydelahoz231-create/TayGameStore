// Construye dist/preview/: la tienda con el entorno de prueba del navegador (tools/preview/shim.js).
// SOLO para enseñar y probar la tienda sin servidor. Nunca se despliega: el servidor sirve dist/web.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
await copyFile(join(import.meta.dirname, 'shim.js'), join(out, 'preview/shim.js'));

const SHIM_TAG = '<script src="./preview/shim.js"></script>';
for (const page of ['index.html', 'admin.html', 'terminos.html', 'privacidad.html']) {
  const file = join(out, page);
  let html = await readFile(file, 'utf8');
  // Enlaces relativos: la vista previa no vive en la raíz de un dominio.
  html = html
    .replaceAll('href="/terminos.html"', 'href="terminos.html"')
    .replaceAll('href="/privacidad.html"', 'href="privacidad.html"')
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
