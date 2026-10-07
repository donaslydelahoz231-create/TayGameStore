import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * Presupuesto de movimiento (styles/layers/33-motion-budget.css, js/effects/offscreen.js):
 * las animaciones existen y corren donde se ven; fuera de pantalla o tapadas por la pantalla
 * de entrada se pausan y continúan al volver. El resto de la suite usa movimiento reducido.
 */
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'movimiento: un solo viewport');
  consoleErrors = await preparePage(page);
});
test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

/** Estado de las animaciones CSS con nombre dentro de un contenedor. */
function animationsIn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const states = { running: 0, paused: 0, names: [] as string[] };
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      const name = (animation as CSSAnimation).animationName;
      if (!name || !(target instanceof Element) || !root?.contains(target)) continue;
      if (animation.playState === 'running') states.running++;
      if (animation.playState === 'paused') states.paused++;
      if (!states.names.includes(name)) states.names.push(name);
    }
    return states;
  }, selector);
}

test('las animaciones se conservan y solo se pausan donde no se ven', async ({ page }) => {
  await page.goto('/');
  // Tienda tapada por la pantalla de entrada: sus animaciones esperan en pausa.
  await expect.poll(async () => (await animationsIn(page, '#app')).running).toBe(0);
  expect((await animationsIn(page, '#app')).paused).toBeGreaterThan(0);
  expect((await animationsIn(page, '#entryExperience')).running).toBeGreaterThan(0);

  await enterAsGuest(page);
  // En la portada se ven y corren las animaciones de siempre.
  await expect.poll(async () => (await animationsIn(page, '.hero')).running).toBeGreaterThan(0);
  const hero = await animationsIn(page, '.hero');
  for (const name of ['tgsTitleGlow', 'tgsButtonAura', 'tgsReactorFloat']) {
    expect(hero.names, name).toContain(name);
  }
  // La pantalla de entrada ya oculta deja de animarse.
  await expect.poll(async () => (await animationsIn(page, '#entryExperience')).running).toBe(0);

  // Lejos de la portada, sus animaciones se pausan… Saltos inmediatos: lo que se prueba son las
  // animaciones, no el desplazamiento suave (en Firefox dos desplazamientos suaves seguidos
  // pueden dejar la página abajo).
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.ceil(window.scrollY + window.innerHeight) >=
          document.documentElement.scrollHeight - 2,
      ),
    )
    .toBe(true);
  await expect(page.locator('main > section.hero')).toHaveClass(/tgs-offscreen/);
  await expect.poll(async () => (await animationsIn(page, '.hero')).running).toBe(0);
  // …y continúan al volver.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('main > section.hero')).not.toHaveClass(/tgs-offscreen/);
  await expect.poll(async () => (await animationsIn(page, '.hero')).running).toBeGreaterThan(0);
});

test('la barra de avance sigue el scroll sin cambiar su ancho', async ({ page }) => {
  await page.goto('/');
  await enterAsGuest(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  // Escala en lugar de ancho: no recalcula el layout de la página en cada scroll.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = document.getElementById('tgsMotionBar');
        if (!bar) return 0;
        return new DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
      }),
    )
    .toBeGreaterThan(0.2);
  const width = await page.evaluate(
    () => document.getElementById('tgsMotionBar')?.getBoundingClientRect().width ?? 0,
  );
  expect(width).toBeGreaterThan(0);
});
