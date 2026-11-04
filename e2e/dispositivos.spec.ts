import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest, preparePage, unexpectedErrors } from './support/page.js';

/**
 * La tienda en los dispositivos de Chrome DevTools (medidas de devtools-frontend,
 * front_end/models/emulation/EmulatedDevices.ts), en vertical y en horizontal, y los plegables
 * abiertos. Pedido del dueño (2026-11-04): que se adapte sin fallos visuales ni de funciones.
 * Cada caso comprueba lo que se encontró roto en la auditoría (ver 50-dispositivos.css): sin
 * desplazamiento lateral, el menú de la cabecera completo y que nada tape las opciones del menú de
 * la cuenta, los resultados de búsqueda ni los controles del carrito.
 */
// Todos los dispositivos de la lista (74 tamaños distintos): [nombres, ancho, alto, móvil, táctil].
// Los que comparten tamaño van en el mismo caso. Los plegables, también abiertos.
const DISPOSITIVOS: [
  nombres: string,
  ancho: number,
  alto: number,
  movil: boolean,
  tactil: boolean,
][] = [
  ['iPhone SE', 375, 667, true, true],
  ['iPhone SE horizontal', 667, 375, true, true],
  ['iPhone XR', 414, 896, true, true],
  ['iPhone XR horizontal', 896, 414, true, true],
  ['iPhone 12 Pro · iPhone 14 · iPhone 16e', 390, 844, true, true],
  ['iPhone 12 Pro horizontal · iPhone 14 horizontal · iPhone 16e horizontal', 844, 390, true, true],
  ['iPhone 14 Plus', 428, 926, true, true],
  ['iPhone 14 Plus horizontal', 926, 428, true, true],
  ['iPhone 14 Pro · iPhone 15 · iPhone 15 Pro · iPhone 16', 393, 852, true, true],
  [
    'iPhone 14 Pro horizontal · iPhone 15 horizontal · iPhone 15 Pro horizontal · iPhone 16 horizontal',
    852,
    393,
    true,
    true,
  ],
  ['iPhone 14 Pro Max · iPhone 15 Plus · iPhone 15 Pro Max · iPhone 16 Plus', 430, 932, true, true],
  [
    'iPhone 14 Pro Max horizontal · iPhone 15 Plus horizontal · iPhone 15 Pro Max horizontal · iPhone 16 Plus horizontal',
    932,
    430,
    true,
    true,
  ],
  ['iPhone 16 Pro', 402, 874, true, true],
  ['iPhone 16 Pro horizontal', 874, 402, true, true],
  ['iPhone 16 Pro Max', 440, 956, true, true],
  ['iPhone 16 Pro Max horizontal', 956, 440, true, true],
  ['Pixel 7 · Pixel 8 · Pixel 8a · Samsung Galaxy S20 Ultra', 412, 915, true, true],
  [
    'Pixel 7 horizontal · Pixel 8 horizontal · Pixel 8a horizontal · Samsung Galaxy S20 Ultra horizontal',
    915,
    412,
    true,
    true,
  ],
  ['Pixel 8 Pro · Pixel 9 Pro XL', 448, 997, true, true],
  ['Pixel 8 Pro horizontal · Pixel 9 Pro XL horizontal', 997, 448, true, true],
  ['Pixel 9 · Pixel 10', 412, 924, true, true],
  ['Pixel 9 horizontal · Pixel 10 horizontal', 924, 412, true, true],
  ['Pixel 9 Pro', 427, 952, true, true],
  ['Pixel 9 Pro horizontal', 952, 427, true, true],
  ['Samsung Galaxy S8+', 360, 740, true, true],
  ['Samsung Galaxy S8+ horizontal', 740, 360, true, true],
  ['Surface Pro 7', 912, 1368, true, true],
  ['Surface Pro 7 horizontal', 1368, 912, true, true],
  ['iPad Mini', 768, 1024, true, true],
  ['iPad Mini horizontal', 1024, 768, true, true],
  ['iPad Pro 13', 1032, 1376, true, true],
  ['iPad Pro 13 horizontal', 1376, 1032, true, true],
  ['Surface Pro 10', 960, 1440, true, true],
  ['Surface Pro 10 horizontal', 1440, 960, true, true],
  ['Surface Duo', 540, 720, true, true],
  ['Surface Duo horizontal', 720, 540, true, true],
  ['Surface Duo abierto', 1114, 720, true, true],
  ['Surface Duo abierto horizontal', 720, 1114, true, true],
  ['Samsung Galaxy A55', 360, 800, true, true],
  ['Samsung Galaxy A55 horizontal', 800, 360, true, true],
  ['Pixel 9 Pro Fold', 412, 922, true, true],
  ['Pixel 9 Pro Fold horizontal', 922, 412, true, true],
  ['Pixel 9 Pro Fold abierto', 836, 842, true, true],
  ['Pixel 9 Pro Fold abierto horizontal', 842, 836, true, true],
  ['Galaxy Z Fold 6', 412, 968, true, true],
  ['Galaxy Z Fold 6 horizontal', 968, 412, true, true],
  ['Galaxy Z Fold 6 abierto', 744, 860, true, true],
  ['Galaxy Z Fold 6 abierto horizontal', 860, 744, true, true],
  ['Galaxy Z Fold 5', 344, 882, true, true],
  ['Galaxy Z Fold 5 horizontal', 882, 344, true, true],
  ['Galaxy Z Fold 5 abierto', 690, 829, true, true],
  ['Galaxy Z Fold 5 abierto horizontal', 829, 690, true, true],
  ['Asus Zenbook Fold', 853, 1280, false, true],
  ['Asus Zenbook Fold horizontal', 1280, 853, false, true],
  ['Asus Zenbook Fold abierto', 1706, 1280, false, true],
  ['Asus Zenbook Fold abierto horizontal', 1280, 1706, false, true],
  ['Samsung Galaxy A51/71', 412, 914, true, true],
  ['Samsung Galaxy A51/71 horizontal', 914, 412, true, true],
  ['Nest Hub Max · Nest Hub Max horizontal · Portátil MDPI horizontal', 1280, 800, true, true],
  ['Galaxy Tab S4', 712, 1138, true, true],
  ['Galaxy Tab S4 horizontal', 1138, 712, true, true],
  ['JioPhone 2', 240, 320, true, true],
  ['JioPhone 2 horizontal', 320, 240, true, true],
  ['Portátil táctil', 950, 1280, false, true],
  ['Portátil táctil horizontal', 1280, 950, false, true],
  ['Portátil HiDPI', 900, 1440, false, false],
  ['Portátil HiDPI horizontal', 1440, 900, false, false],
  ['Portátil MDPI', 800, 1280, false, false],
  ['Moto G4', 360, 640, true, true],
  ['Moto G4 horizontal', 640, 360, true, true],
  ['Moto G Power', 412, 823, true, true],
  ['Moto G Power horizontal', 823, 412, true, true],
  ['Facebook on Android', 412, 892, true, true],
  ['Facebook on Android horizontal', 892, 412, true, true],
];
// Firefox no emula celulares (isMobile); Chromium y WebKit sí.
const MOVIL = (process.env.E2E_BROWSER ?? 'chromium') !== 'firefox';

/** Controles visibles que no se pueden tocar porque otra cosa queda encima de su centro. */
function tapados(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const fallas: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!encima || encima === el || el.contains(encima)) continue;
      const quien = encima.id ? `#${encima.id}` : `${encima.tagName}.${encima.className}`;
      fallas.push(`${el.textContent?.trim().slice(0, 30)} → tapado por ${quien}`);
    }
    return fallas;
  }, selector);
}

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'cada caso fija su propio tamaño');
  consoleErrors = await preparePage(page);
  // Como en producción, con WhatsApp y correo de soporte configurados: los botones de los dos
  // canales ocupan espacio (en el JioPhone 2 ensanchaban la sección «Pedido»). Número ficticio.
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as { support?: Record<string, unknown> };
    config.support = { ...config.support, whatsapp: '570000000000' };
    await route.fulfill({ response, json: config });
  });
});
test.afterEach(() => {
  expect(unexpectedErrors(consoleErrors)).toEqual([]);
});

test.describe('acceso y teclado en celular (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: MOVIL });

  test('«Continuar como invitado» se puede tocar y Escape cierra el menú de la cuenta', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#enterStoreBtn').click();
    await expect(page.locator('#guestBtn')).toBeVisible();
    // Mínimo táctil de WCAG 2.5.8 (24 px); antes medía 17 px de alto.
    const caja = await page.locator('#guestBtn').boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(24);
    await page.locator('#guestBtn').click();
    await expect(page.locator('#loginModal')).toBeHidden();

    await page.locator('#accountBtn').click();
    await expect(page.locator('#accountMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#accountMenu')).toBeHidden();
    await expect(page.locator('#accountBtn')).toHaveAttribute('aria-expanded', 'false');
  });
});

for (const [nombres, w, h, movil, tactil] of DISPOSITIVOS) {
  test.describe(`${nombres} (${w}×${h})`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: MOVIL && movil });

    test('se adapta sin desbordes y sin controles tapados', async ({ page }) => {
      await page.goto('/');
      await enterAsGuest(page);

      // Sin desplazamiento lateral ni página alejada: en un celular, si algo es más ancho que la
      // pantalla el navegador aleja la página entera (innerWidth crece) y todo se ve pequeño.
      const anchos = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
        diseno: document.documentElement.clientWidth,
      }));
      expect(anchos.pagina, 'la página no se desplaza de lado').toBeLessThanOrEqual(w);
      expect(anchos.ventana, 'la página no se aleja').toBe(w);
      expect(anchos.diseno, 'el diseño ocupa el ancho de la pantalla').toBe(w);

      // Si se ve el menú de la cabecera, cabe entero antes de la búsqueda.
      const cabecera = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('.header .nav');
        if (!nav || getComputedStyle(nav).display === 'none') return null;
        const links = [...nav.querySelectorAll('a')].map((a) => a.getBoundingClientRect());
        return {
          finMenu: Math.max(...links.map((r) => r.right)),
          inicioBotones: document.querySelector('#searchBtn')!.getBoundingClientRect().left,
        };
      });
      if (cabecera) {
        expect(cabecera.finMenu, 'el menú termina antes de la búsqueda').toBeLessThanOrEqual(
          cabecera.inicioBotones,
        );
      }

      // Menú de la cuenta: cada opción se puede tocar.
      await page.locator('#accountBtn').click();
      await expect(page.locator('#accountMenu')).toBeVisible();
      expect(await tapados(page, '#accountMenu button')).toEqual([]);
      // …y cabe a lo ancho (en el JioPhone 2 se salía 33 px por la izquierda).
      const menu = await page.locator('#accountMenu').boundingBox();
      expect(menu?.x ?? -1, 'el menú no se sale por la izquierda').toBeGreaterThanOrEqual(0);
      expect((menu?.x ?? 0) + (menu?.width ?? 0), 'ni por la derecha').toBeLessThanOrEqual(w);
      await page.locator('#accountBtn').click();
      await expect(page.locator('#accountMenu')).toBeHidden();

      // Búsqueda: cada resultado se puede tocar.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('#searchBtn').click();
      await page.locator('#searchInput').fill('diamantes');
      await expect(page.locator('#searchResults button').first()).toBeVisible();
      expect(await tapados(page, '#searchResults button')).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('#searchPanel')).toBeHidden();

      // Carrito: con un paquete, sus controles y el botón de seguir se pueden tocar. El más caro:
      // su total es el más largo y es el que hacía crecer la barra de compra.
      const agregar = page.locator('#products .product .add-btn:not([disabled])').last();
      await agregar.scrollIntoViewIfNeeded();
      await agregar.click();
      // Con el paquete en el resumen y la barra de compra a la vista, la página sigue sin
      // desbordarse (en el JioPhone 2 el resumen ensanchaba el catálogo a 242 px).
      await expect(page.locator('#cartBadge')).toHaveText('1');
      const conPaquete = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      expect(conPaquete.pagina, 'con un paquete, sin desplazamiento lateral').toBeLessThanOrEqual(
        w,
      );
      expect(conPaquete.ventana, 'con un paquete, la página no se aleja').toBe(w);
      // La barra de compra del celular: ninguna burbuja de soporte se monta sobre ella (con un
      // total largo la barra crece) y «Revisar pedido» se puede tocar. Se espera a que las
      // burbujas lleguen a su sitio: con movimiento reducido el cambio de posición aún pasa por
      // una transición de 0,01 ms (20-reduced-motion.css) y el primer cuadro trae la anterior.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const barra = document.querySelector<HTMLElement>('#buyBar');
              if (!barra || barra.hidden || getComputedStyle(barra).display === 'none') return [];
              const borde = barra.getBoundingClientRect().top;
              return [...document.querySelectorAll<HTMLElement>('.support-float-btn')]
                .filter((b) => b.getBoundingClientRect().height > 0)
                .filter((b) => b.getBoundingClientRect().bottom > borde + 0.5)
                .map((b) => b.id);
            }),
          { message: 'burbujas sobre la barra de compra' },
        )
        .toEqual([]);
      expect(await tapados(page, '#buyBar:not([hidden]) .btn')).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('#cartBtn').click();
      await expect(page.locator('#cartDrawer')).not.toHaveAttribute('inert');
      await expect(page.locator('#cartDrawer .drawer-controls button').first()).toBeVisible();
      expect(await tapados(page, '#cartDrawer button')).toEqual([]);
    });
  });
}
