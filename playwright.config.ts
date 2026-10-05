import { defineConfig } from '@playwright/test';

/**
 * Referencias visuales del frontend original (Fase 0), antes de cualquier refactor.
 * Se ejecutan contra el build de Vite servido con `vite preview` y sin backend.
 *
 * Las capturas dependen del motor de render y de las fuentes del sistema: se generaron
 * con el Chromium que corresponde a @playwright/test 1.56.1 en Linux y deben
 * regenerarse en ese mismo entorno.
 */
const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

export default defineConfig({
  testDir: 'e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    // Tolerancia estricta. threshold 0,02 (por defecto 0,2) para detectar cambios sutiles de color.
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 150,
      threshold: 0.02,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    deviceScaleFactor: 1,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // Debe ir en contextOptions: como opción directa de `use` se ignora sin aviso.
    // El spec verifica que la emulación esté activa.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: VIEWPORTS.map(({ name, width, height }) => ({
    name,
    use: { viewport: { width, height } },
  })),
  webServer: {
    command: 'npm run build:web && npx vite preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
