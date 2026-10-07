import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

const API_TARGET = 'http://127.0.0.1:3000';
const root = resolve(import.meta.dirname, 'src/web');
const outDir = resolve(import.meta.dirname, 'dist/web');

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);
const MIN_BYTES = 1024;

/**
 * Genera `.br` y `.gz` junto a cada archivo de texto del build. El servidor los entrega con
 * `preCompressed` de @fastify/static: sin compresión en caliente ni dependencias nuevas.
 */
function precompress(): Plugin {
  const brotli = promisify(brotliCompress);
  const gz = promisify(gzip);
  let target = outDir;
  return {
    name: 'tgs-precompress',
    apply: 'build',
    configResolved(config) {
      // Respeta un outDir distinto (p. ej. el build de vista previa en dist/preview).
      target = config.build.outDir;
    },
    async closeBundle() {
      const entries = await readdir(target, { recursive: true, withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile() && COMPRESSIBLE.has(extname(entry.name)))
        .map((entry) => join(entry.parentPath, entry.name));
      await Promise.all(
        files.map(async (file) => {
          const content = await readFile(file);
          if (content.length < MIN_BYTES) return;
          const [br, gzipped] = await Promise.all([
            brotli(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
            gz(content, { level: 9 }),
          ]);
          await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gzipped)]);
        }),
      );
    },
  };
}

/**
 * Pone la URL pública (PUBLIC_BASE_URL del entorno de build, la misma que usa el servidor) en las
 * etiquetas de vista previa del HTML: WhatsApp y Facebook exigen direcciones absolutas. Sin ella,
 * quedan relativas. Solo se aceptan URLs http(s) sin caracteres que rompan un atributo.
 */
function siteUrl(): Plugin {
  const raw = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  const url = /^https?:\/\/[^\s"'<>\\]+$/.test(raw) ? raw : '';
  return {
    name: 'tgs-site-url',
    transformIndexHtml: {
      order: 'pre',
      // Sin URL pública no hay canonical (una dirección relativa no sirve y Vite la trataría como
      // archivo); el resto queda relativo.
      handler: (html) =>
        (url
          ? html
          : html.replace(/\n\s*<link rel="canonical" href="__TGS_SITE_URL__\/">/, '')
        ).replaceAll('__TGS_SITE_URL__', url),
    },
  };
}

export default defineConfig({
  root,
  plugins: [siteUrl(), precompress()],
  build: {
    outDir,
    emptyOutDir: true,
    // El CSS se publica tal cual (lightningcss reordena propiedades y cambia el render).
    cssMinify: false,
    rolldownOptions: {
      // Tienda y panel de administración (páginas independientes, mismo origen).
      input: {
        main: resolve(root, 'index.html'),
        admin: resolve(root, 'admin.html'),
        terminos: resolve(root, 'terminos.html'),
        privacidad: resolve(root, 'privacidad.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API_TARGET,
      '/auth': API_TARGET,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
