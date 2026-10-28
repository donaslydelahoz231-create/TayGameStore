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
  consoleErrors = await preparePage(page, { intro: true });
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

test.describe('con «reducir movimiento» (en muchos celulares, «Quitar animaciones»)', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('la presentación, la bienvenida y «Entrar» se ven con fundidos, sin diamante ni piezas que vuelan', async ({
    page,
  }) => {
    // Si en algún momento aparece el diamante (recorte) o la salida con movimiento, se registra.
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { tgsSoftLog: string[] }).tgsSoftLog = seen;
      document.addEventListener('DOMContentLoaded', () => {
        const intro = document.getElementById('tgsIntro');
        if (!intro) return;
        new MutationObserver(() => {
          for (const name of ['is-iris', 'is-leaving']) {
            if (intro.classList.contains(name) && !seen.includes(name)) seen.push(name);
          }
        }).observe(intro, { attributes: true, attributeFilter: ['class'] });
      });
    });
    await page.goto('/');
    const intro = page.locator('#tgsIntro');
    const entry = page.locator('#entryExperience');
    // Antes no había presentación con movimiento reducido: ahora sale la versión suave.
    await expect(intro).toBeVisible();
    await expect(intro).toHaveClass(/is-soft/);
    await expect(entry).toHaveAttribute('inert', '');
    // Lo que dura y se ve dentro de la presentación son solo fundidos de opacidad (el resto queda
    // en 0,01 ms, como siempre con movimiento reducido).
    const names = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .filter((a) => Number(a.effect?.getComputedTiming().duration) > 1)
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && document.getElementById('tgsIntro')?.contains(target);
        })
        .map((a) => (a as CSSAnimation).animationName ?? 'script'),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => name !== 'tgsFade')).toEqual([]);
    // Termina sola con la carga real y deja la bienvenida lista y usable.
    await expect(intro).toBeHidden({ timeout: 8_000 });
    await expect(entry).toHaveClass(/entry-ready/);
    await expect(entry).not.toHaveAttribute('inert', '');

    // «Entrar»: la marca aparece con un fundido, el acceso se abre debajo y la marca se va.
    await page.locator('#enterStoreBtn').click();
    await expect(intro).toHaveClass(/is-transition/);
    await expect(intro).toHaveClass(/is-soft/);
    await expect(page.locator('#loginModal')).toBeVisible();
    await expect(intro).toBeHidden();
    expect(
      await page.evaluate(() => (window as unknown as { tgsSoftLog: string[] }).tgsSoftLog),
    ).toEqual([]);
    // El recorte en diamante nunca se aplicó.
    await expect(intro).toHaveCSS('clip-path', 'none');
  });
});

test.describe('en pantallas táctiles', () => {
  // Se comprueba con Chromium (emulación de Android). Firefox no admite `isMobile` (falla al crear
  // el contexto, antes de entrar a la prueba: por eso el salto va aquí) y el toque emulado de
  // WebKit en Linux no se ha verificado.
  test.skip(({ browserName }) => browserName !== 'chromium', 'toque emulado: solo Chromium');
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test('al tocar la vitrina, Tay mira hacia el dedo, la vitrina se inclina y salen destellos', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('.intro-skip').click();
    const entry = page.locator('#entryExperience');
    await expect(entry).toHaveClass(/entry-ready/);
    const stage = page.locator('.entry-stage');
    const vitrina = page.locator('.entry-vitrina');
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    if (!box) throw new Error('la vitrina no se ve');
    const before = await page
      .locator('.entry-vitrina')
      .evaluate((el) => getComputedStyle(el).transform);
    await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height * 0.5);
    // Un toque suelta destellos alrededor del dedo y Tay mira hacia allá (a la derecha).
    await expect.poll(() => page.locator('.entry-spark').count()).toBeGreaterThan(0);
    await expect
      .poll(() => vitrina.evaluate((el) => Number(el.style.getPropertyValue('--px'))))
      .toBeGreaterThan(0.1);
    await expect
      .poll(() => page.locator('.entry-vitrina').evaluate((el) => getComputedStyle(el).transform))
      .not.toBe(before);
    // Al soltar, todo vuelve al centro y los destellos se van solos.
    await expect
      .poll(() => vitrina.evaluate((el) => Number(el.style.getPropertyValue('--px'))), {
        timeout: 4_000,
      })
      .toBe(0);
    await expect(page.locator('.entry-spark')).toHaveCount(0);
    // El botón «Entrar» no se mueve bajo el dedo (el efecto magnético es solo para ratón).
    await page.locator('#enterStoreBtn').scrollIntoViewIfNeeded();
    const cta = await page.locator('#enterStoreBtn').boundingBox();
    if (!cta) throw new Error('sin botón «Entrar»');
    await page.touchscreen.tap(cta.x + 4, cta.y + 4);
    await expect(page.locator('#enterStoreBtn')).toHaveCSS('translate', /^(none|0px)$/);
  });
});
