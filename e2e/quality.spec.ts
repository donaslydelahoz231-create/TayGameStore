import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

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
});

test('accesibilidad del panel de administración (acceso)', async ({ page }) => {
  await page.goto('/admin.html');
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
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(await axe(page), path).toEqual([]);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const narrow = await context.newPage();
    await narrow.goto(path);
    expect(await horizontalOverflow(narrow), `${path} a 360 px`).toEqual([]);
    await context.close();
  }
  await page.goto('/');
  await enterAsGuest(page);
  const links = page.locator('label.consent a');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', '/terminos.html');
  await expect(links.nth(1)).toHaveAttribute('href', '/privacidad.html');
});
