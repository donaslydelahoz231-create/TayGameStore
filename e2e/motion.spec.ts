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
  // Tay, el personaje de la marca, ya se mueve en la bienvenida.
  expect((await animationsIn(page, '.entry-mascot')).names).toContain('tgsTayBlink');

  await enterAsGuest(page);
  // En la portada se ven y corren las animaciones de siempre.
  await expect.poll(async () => (await animationsIn(page, '.hero')).running).toBeGreaterThan(0);
  const hero = await animationsIn(page, '.hero');
  // (Sin el aura de los botones ni el diamante del panel de estado desde el 2026-10-28: retrasaban
  // la respuesta a cada toque y el panel ahora es solo información.)
  for (const name of [
    'tgsTitleGlow',
    // Tay: flota, parpadea, saluda, brilla y su órbita gira.
    'tgsTayFloat',
    'tgsTayBlink',
    'tgsTayHand',
    'tgsTayShine',
    'tgsTayOrbit',
  ]) {
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

test('al abrir la tienda hay una presentación; «Entrar» pasa por una transición antes del acceso', async ({
  page,
}) => {
  // Registro de fases (clases y apertura del acceso) para comprobar que no se cruzan.
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { tgsPhases: string[] }).tgsPhases = log;
    document.addEventListener('DOMContentLoaded', () => {
      const intro = document.getElementById('tgsIntro');
      const entry = document.getElementById('entryExperience');
      const login = document.getElementById('loginModal');
      if (!intro || !entry || !login) return;
      const snap = () =>
        [
          intro.hidden ? 'intro:oculta' : 'intro:' + intro.className,
          'bienvenida:' + entry.className,
          login.hidden ? 'acceso:cerrado' : 'acceso:abierto',
        ].join(' | ');
      const record = () => {
        const now = snap();
        if (log[log.length - 1] !== now) log.push(now);
      };
      new MutationObserver(record).observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'hidden'],
      });
      record();
    });
  });
  const phases = () =>
    page.evaluate(() => (window as unknown as { tgsPhases: string[] }).tgsPhases.slice());

  await page.goto('/');
  const intro = page.locator('#tgsIntro');
  await expect(intro).toBeVisible();
  // La barra sigue la carga real y anuncia su estado a los lectores de pantalla.
  await expect
    .poll(() => intro.locator('.intro-bar').getAttribute('aria-valuenow').then(Number))
    .toBeGreaterThan(0);
  await expect(intro.locator('.intro-status')).toHaveAttribute('role', 'status');
  // Mientras se ve, la bienvenida de debajo no recibe el foco ni se ve su contenido.
  await expect(page.locator('#entryExperience')).toHaveAttribute('inert', '');
  await expect(page.locator('#entryExperience .entry-shell')).toHaveCSS('opacity', '0');
  // Se puede saltar; la bienvenida queda lista y usable.
  await intro.locator('.intro-skip').click();
  await expect(intro).toBeHidden();
  await expect(page.locator('#entryExperience')).toHaveClass(/entry-ready/);
  await expect(page.locator('#entryExperience')).not.toHaveAttribute('inert', '');
  // Sin cruces: la bienvenida entra solo cuando la presentación ya se fue (salida → diamante → oculta).
  const opening = await phases();
  const ready = opening.findIndex((line) => line.includes('entry-ready'));
  expect(ready).toBeGreaterThan(0);
  expect(opening[ready]).toContain('intro:oculta');
  expect(opening.some((line) => line.includes('is-leaving') && line.includes('is-iris'))).toBe(
    true,
  );

  // Una vez por sesión: al recargar no se repite.
  await page.reload();
  await expect(page.locator('#entryExperience')).toHaveClass(/entry-ready/);
  await expect(intro).toBeHidden();

  // «Entrar»: la bienvenida sale, el diamante cubre, se abre el acceso y el diamante lo revela.
  await page.locator('#enterStoreBtn').click();
  await expect(intro).toHaveClass(/is-transition/);
  await expect(intro.locator('.intro-status')).toHaveText('Abriendo TayGameStore…');
  await expect(page.locator('#loginModal')).toBeVisible();
  await expect(intro).toBeHidden();
  const entering = await phases();
  const leaving = entering.findIndex((line) => line.includes('entry-leaving'));
  const cover = entering.findIndex((line) => line.includes('is-transition'));
  const opened = entering.findIndex((line) => line.includes('acceso:abierto'));
  expect(leaving).toBeGreaterThanOrEqual(0);
  // El diamante llega cuando la bienvenida ya se fue, y no antes.
  expect(cover).toBeGreaterThan(leaving);
  expect(entering[leaving]).toContain('intro:oculta');
  // El acceso se abre con la pantalla cubierta (no durante el movimiento del diamante).
  expect(entering[opened]).toContain('is-transition');
  expect(entering[opened]).not.toContain('is-iris');
  expect(entering[entering.length - 1]).toContain('intro:oculta');
});
