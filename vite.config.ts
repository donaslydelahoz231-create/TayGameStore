import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const API_TARGET = 'http://127.0.0.1:3000';
const root = resolve(import.meta.dirname, 'src/web');

export default defineConfig({
  root,
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // El CSS se publica tal cual (lightningcss reordena propiedades y cambia el render).
    cssMinify: false,
    rolldownOptions: {
      // Tienda y panel de administración (páginas independientes, mismo origen).
      input: { main: resolve(root, 'index.html'), admin: resolve(root, 'admin.html') },
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
