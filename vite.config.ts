import { defineConfig } from 'vite';

const API_TARGET = 'http://127.0.0.1:3000';

// Fase 0: Vite sirve y compila el HTML original sin modificarlo.
// La modularización llega en la Fase 1.
export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // El CSS inline del HTML original no se transforma (lightningcss reordena
    // propiedades y reescribe color-scheme). Se revisará al extraer el CSS en la Fase 1.
    cssMinify: false,
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
