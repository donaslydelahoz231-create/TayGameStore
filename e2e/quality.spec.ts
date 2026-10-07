import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';
import { ADMIN_PATH } from './support/admin-path.js';

/**
 * Calidad transversal: accesibilidad (axe-core, WCAG 2.1 A/AA) y responsive real (sin
 * desbordes horizontales) en los anchos objetivo. Contra el servidor real de pruebas.
 */

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440, 1920];

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'se recorren los anchos dentro del test');
  consoleErrors = await preparePage(page);
});
test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

async function axe(page: Page, include?: string) {
  let builder = new AxeBuilder({ page })
    // Sin precarga de CSS de terceros (la CSP de la tienda bloquea esas descargas, como debe).
    .options({ preload: false })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 4)
          .join(' | ')}`,
    );
}

/**
 * Contenido (texto o controles) que sale del viewport: quedaría cortado o generaría scroll
 * lateral. Las capas decorativas sin texto que su contenedor recorta a propósito se ignoran.
 */
async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.display === 'none' || style.visibility === 'hidden')
        continue;
      if (el.closest('[hidden], .modal, #cartDrawer, #entryExperience, #bootScreen')) continue;
      const interactive = el.matches('a[href], button, input, select, textarea');
      const hasOwnText = Array.from(el.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (!interactive && !hasOwnText) continue;
      // Parte visible: lo que sobresale de un ancestro con overflow distinto de visible
      // (p. ej. la marca de agua de la factura dentro de .invoice) está recortado y no se ve.
      const rect = el.getBoundingClientRect();
      let left = rect.left;
      let right = rect.right;
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
        if (getComputedStyle(up).overflowX === 'visible') continue;
        const box = up.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
      if (right - left > 0 && (right > width + 1 || left < -1)) {
        const id = el.id ? '#' + el.id : '';
        const cls =
          typeof el.className === 'string' && el.className
            ? '.' + el.className.trim().split(/\s+/).join('.')
            : '';
        offenders.push(
          `${el.tagName.toLowerCase()}${id}${cls} [${Math.round(left)}→${Math.round(right)} > ${width}]`,
        );
      }
    }
    return offenders.slice(0, 8);
  });
}

test('accesibilidad: sin violaciones críticas ni graves (entrada, acceso, tienda, modales)', async ({
  page,
}) => {
  await page.goto('/');
  expect(await axe(page), 'pantalla de entrada').toEqual([]);
  await page.locator('#enterStoreBtn').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  expect(await axe(page, '#loginModal'), 'modal de acceso').toEqual([]);
  await page.locator('#guestBtn').click();
  await expect(page.locator('#products .product').first()).toBeVisible();
  expect(await axe(page, '#app'), 'tienda').toEqual([]);
  await page.locator('#cartBtn').click();
  expect(await axe(page, '#cartDrawer'), 'carrito').toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('#playerFinderBtn').click();
  expect(await axe(page, '#playerFinderModal'), 'buscar jugador').toEqual([]);
  await page.keyboard.press('Escape');
  for (const [button, dialog] of [
    ['#howBtn', '#howModal'],
    ['#securityBtn', '#securityModal'],
    ['#favoritesBtn', '#favoritesModal'],
  ] as const) {
    await page.locator(button).click();
    await expect(page.locator(dialog)).toBeVisible();
    expect(await axe(page, dialog), dialog).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator(dialog)).toBeHidden();
  }
  await page.locator('#searchBtn').click();
  await page.locator('#searchInput').fill('100');
  expect(await axe(page, '#searchPanel'), 'búsqueda').toEqual([]);
});

test('accesibilidad del panel con sesión: todas las pestañas y el detalle de un pedido', async ({
  page,
  context,
}) => {
  // Pedido de ejemplo para que la tabla y el detalle tengan contenido.
  await page.goto('/');
  await enterAsGuest(page);
  await page.locator('#products .product .add-btn').first().click();
  await page.locator('#playerUid').fill('765432555');
  await page.locator('#verifyBtn').click();
  await page.locator('#customerName').fill('Cliente Axe');
  await page.locator('#customerEmail').fill('axe-panel@example.com');
  await page.locator('#paymentMethod').selectOption('mercadopago');
  await page.locator('#acceptTerms').check();
  await page.locator('#payBtn').click();
  await expect(page.locator('#invoiceRef')).toHaveText(/^TGS-/);

  const session = await page.request.post('/__e2e__/admin-session', {
    data: {},
    headers: { 'x-tgs-csrf': '1' },
  });
  const { token } = (await session.json()) as { token: string };
  await context.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
  await page.goto(ADMIN_PATH);
  await expect(page.locator('#admApp')).toBeVisible();
  await page.locator('#admOrders tr', { hasText: 'TGS-' }).first().click();
  await expect(page.locator('#admDetail h2')).toBeVisible();
  expect(await axe(page), 'pedidos y detalle').toEqual([]);
  for (const tab of ['products', 'inventory', 'blocklist', 'audit']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    expect(await axe(page), tab).toEqual([]);
  }
});

test('accesibilidad del panel de administración (acceso)', async ({ page }) => {
  await page.goto(ADMIN_PATH);
  await page.locator('#admLogin').waitFor();
  expect(await axe(page)).toEqual([]);
});

test('el carrito cerrado no es alcanzable con el teclado', async ({ page }) => {
  await page.goto('/');
  await enterAsGuest(page);
  const focusableInClosedDrawer = await page.evaluate(() => {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return -1;
    return drawer.inert || drawer.closest('[inert]')
      ? 0
      : drawer.querySelectorAll('button, a[href], input').length;
  });
  expect(focusableInClosedDrawer).toBe(0);
});

test('los modales son diálogos accesibles y devuelven el foco al cerrar', async ({ page }) => {
  await page.goto('/');
  await enterAsGuest(page);
  const opener = page.locator('#playerFinderBtn');
  await opener.click();
  const dialog = page.locator('#playerFinderModal [role="dialog"]');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#playerFinderModal')).toBeHidden();
  await expect(opener).toBeFocused();
});

test('el menú de escritorio se ve completo con una sesión iniciada', async ({ page }) => {
  await page.goto('/');
  await page.locator('#enterStoreBtn').click();
  await page.locator('[data-provider="facebook"]').click();
  await expect(page.locator('#accountName')).toHaveText('Gamer Facebook');
  const clipped: string[] = [];
  // Por encima de 1100 px conviven píldora de estado, menú y nombre de la cuenta.
  for (const width of [1101, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const hidden = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('.nav');
      return nav ? nav.scrollWidth - nav.clientWidth : -1;
    });
    if (hidden !== 0) clipped.push(`${width}px: ${hidden}px del menú ocultos`);
  }
  expect(clipped).toEqual([]);
});

test('los enlaces del menú dejan cada sección justo bajo la cabecera', async ({ page }) => {
  // Con animaciones: el desplazamiento suave es el que se quedaba corto o se pasaba.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await enterAsGuest(page);
  // `soporte` queda al final de la página y no puede subir hasta la cabecera.
  for (const id of ['verificacion', 'factura', 'seguimiento', 'catalogo']) {
    await page.locator(`.nav a[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    // scroll-padding-top de la página: 82 px (cabecera fija + aire).
    await expect
      .poll(
        () => page.evaluate((i) => document.getElementById(i)?.getBoundingClientRect().top, id),
        { message: `#${id}` },
      )
      .toBeCloseTo(82, -1);
  }
});

test('ir a una sección no te devuelve a ella si ya te desplazaste a otra parte', async ({
  page,
}) => {
  await page.goto('/');
  await enterAsGuest(page);
  await page.locator('.nav a[href="#factura"]').click();
  await expect(page).toHaveURL(/#factura$/);
  // Enseguida la persona vuelve arriba con la barra de desplazamiento (sin rueda ni teclado):
  // las correcciones de posición posteriores no deben llevarla otra vez a la factura.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('sin desbordes horizontales en 360–1920 px (sin ocultarlos con overflow-x)', async ({
  browser,
}) => {
  const problems: string[] = [];
  for (const width of WIDTHS) {
    // Contexto limpio por ancho (como un dispositivo distinto).
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      locale: 'es-CO',
    });
    const page = await context.newPage();
    const errors = await preparePage(page);
    await page.goto('/');
    await enterAsGuest(page);
    await page.addStyleTag({ content: 'html,body{overflow-x:visible!important}' });
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const offenders = await horizontalOverflow(page);
    // Texto superpuesto en las tarjetas Tay Lab (el enlace inferior tapaba la descripción).
    const overlaps = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.lab-card')).filter((card) => {
          const text = card.querySelector('p')?.getBoundingClientRect();
          const link = card.querySelector('span:last-child')?.getBoundingClientRect();
          return text && link && text.bottom > link.top + 1;
        }).length,
    );
    if (overlaps) problems.push(`${width}px: ${overlaps} tarjetas Tay Lab con texto superpuesto`);
    if (scroll > 0 || offenders.length)
      problems.push(`${width}px: +${scroll}px ${offenders.join(', ')}`);
    consoleErrors.push(...errors);
    await context.close();
  }
  expect(problems).toEqual([]);
});

test('páginas legales: accesibles, sin desbordes y enlazadas desde la aceptación', async ({
  page,
  browser,
}) => {
  for (const path of ['/terminos.html', '/privacidad.html']) {
    const response = await page.goto(path);
    // Los datos del vendedor no deben aparecer en buscadores.
    expect(response?.headers()['x-robots-tag'], path).toBe('noindex, noarchive, nosnippet');
    await expect(page.locator('h1')).toBeVisible();
    // Los datos del vendedor llegan desde la configuración del servidor (LEGAL_*, SUPPORT_*).
    await expect(page.locator('main')).toContainText('Tienda de Pruebas');
    await expect(page.locator('main')).toContainText('soporte@example.com');
    await expect(page.locator('main')).not.toContainText('[COMPLETAR:LEGAL_NAME]');
    expect(await axe(page), path).toEqual([]);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const narrow = await context.newPage();
    // Igual que el resto de contextos de la suite (preparePage): en Firefox (CI 39-40) era el
    // único contexto sin intercepción de red y su navegación no llegaba a "load".
    const narrowErrors = await preparePage(narrow);
    await narrow.goto(path);
    expect(await horizontalOverflow(narrow), `${path} a 360 px`).toEqual([]);
    expect(unexpectedErrors(narrowErrors), `${path} a 360 px`).toEqual([]);
    await context.close();
  }
  await page.goto('/');
  await enterAsGuest(page);
  const links = page.locator('label.consent a');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', '/terminos.html');
  await expect(links.nth(1)).toHaveAttribute('href', '/privacidad.html');
});

test('legibilidad: ningún texto visible bajo 11 px y foco visible con teclado', async ({
  page,
}) => {
  // Guías de Apple (accessibility.md › Vision): 11 pt mínimo en móvil; foco visible para teclado.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await enterAsGuest(page);
  const tiny = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (!rect.width || style.visibility === 'hidden' || el.closest('[hidden]')) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        const ownText = Array.from(el.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 1,
        );
        return ownText && parseFloat(style.fontSize) < 11;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} ${getComputedStyle(el).fontSize}`),
  );
  expect(tiny).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return style.outlineStyle !== 'none' ? parseFloat(style.outlineWidth) : 0;
      }),
    )
    .toBeGreaterThanOrEqual(2);
});

test('panel y páginas legales: texto legible y controles táctiles de 44 px', async ({
  browser,
  browserName,
}) => {
  // Misma revisión que la tienda (guías de Apple): 11 px mínimo y 44 px en pantallas táctiles.
  test.skip(browserName === 'firefox', 'Firefox no emula un puntero táctil (pointer: coarse)');
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await touch.newPage();
  await preparePage(page);
  const audit = () =>
    page.evaluate(() => {
      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.closest('[hidden],[aria-hidden="true"]');
      };
      const tiny = Array.from(document.querySelectorAll('body *')).filter(
        (el) =>
          visible(el) &&
          Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 1,
          ) &&
          parseFloat(getComputedStyle(el).fontSize) < 11,
      ).length;
      // Controles propios (los enlaces dentro de un párrafo quedan exentos, como en WCAG 2.5.8).
      const small = Array.from(document.querySelectorAll('button, input, select, nav a'))
        .filter(visible)
        .filter((el) => {
          const box = el.matches('input[type="checkbox"]') ? 22 : 44;
          return el.getBoundingClientRect().height < box - 0.5;
        })
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`);
      return { tiny, small };
    });
  try {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const path of ['/terminos.html', '/privacidad.html', ADMIN_PATH]) {
      await page.goto(path);
      expect(await audit(), path).toEqual({ tiny: 0, small: [] });
    }
    const session = await page.request.post('/__e2e__/admin-session', {
      data: {},
      headers: { 'x-tgs-csrf': '1' },
    });
    const { token } = (await session.json()) as { token: string };
    await touch.addCookies([{ name: 'tgs_session', value: token, url: 'http://127.0.0.1:4173' }]);
    await page.goto(ADMIN_PATH);
    await expect(page.locator('#admApp')).toBeVisible();
    for (const tab of ['orders', 'products', 'inventory', 'blocklist', 'audit']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      expect(await audit(), `panel: ${tab}`).toEqual({ tiny: 0, small: [] });
    }
  } finally {
    await touch.close();
  }
});

test('vista previa al compartir, íconos y robots.txt salen del build real', async ({ page }) => {
  await page.goto('/');
  const meta = (selector: string) => page.locator(selector).getAttribute('content');
  expect(await meta('meta[property="og:title"]')).toContain('TayGameStore');
  expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
  // Sin PUBLIC_BASE_URL en el build, las direcciones quedan relativas (nunca el marcador).
  const imagen = await meta('meta[property="og:image"]');
  expect(imagen).toBe('/og-image.png');
  expect(await page.content()).not.toContain('__TGS_SITE_URL__');
  const datos = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(datos ?? '{}')).toMatchObject({ '@type': 'WebSite', name: 'TayGameStore' });

  for (const [ruta, tipo] of [
    ['/og-image.png', 'image/png'],
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'image/'],
    ['/apple-touch-icon.png', 'image/png'],
    ['/robots.txt', 'text/plain'],
  ] as const) {
    const res = await page.request.get(ruta);
    expect(res.status(), ruta).toBe(200);
    expect(res.headers()['content-type'], ruta).toContain(tipo);
  }
});
