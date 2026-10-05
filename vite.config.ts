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
  return {
    name: 'tgs-precompress',
    apply: 'build',
    async closeBundle() {
      const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
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

export default defineConfig({
  root,
  plugins: [precompress()],
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
