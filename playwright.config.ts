import { defineConfig } from '@playwright/test';

/**
 * Pruebas end-to-end contra el servidor real (Fastify + PostgreSQL + build de Vite), con
 * Mercado Pago sustituido por un doble de pruebas (e2e/support/server.ts).
 * Requiere E2E_DATABASE_URL o TEST_DATABASE_URL (base desechable terminada en _test).
 *
 * Las capturas visuales dependen del motor de render y de las fuentes: se generaron con el
 * Chromium de @playwright/test 1.56.1 en Linux y deben regenerarse en ese mismo entorno.
 */
/** Motor: chromium (por defecto), firefox o webkit (Safari). Las referencias visuales son de Chromium. */
const BROWSER = (process.env.E2E_BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';
if (!['chromium', 'firefox', 'webkit'].includes(BROWSER)) {
  throw new Error(`E2E_BROWSER inválido: ${BROWSER}`);
}

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
    browserName: BROWSER,
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
    command: 'npm run build && node --import tsx e2e/support/server.ts',
    url: 'http://127.0.0.1:4173/api/ready',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
