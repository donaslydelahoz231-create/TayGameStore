import { $ } from './dom.js';

/**
 * Desplazamiento a una sección que termina donde debe, bajo la cabecera fija.
 * La animación de entrada (28-cinematic-v4.css) desplaza y escala cada sección mientras
 * aparece, y `scrollIntoView` apuntaba a esa posición transformada; además, imágenes y
 * contenido que se completan durante el desplazamiento cambian alturas. Por eso se usa la
 * posición de maquetación (`offsetTop`, sin transformaciones) y, al terminar, se mide de nuevo
 * y se corrige sin animación. Si la persona toma el control (rueda, toque, teclado, clic o
 * barra de desplazamiento) o algo más mueve la página, deja de corregir: nunca la devuelve a
 * una sección de la que ya se fue (un clic en otro botón caería en otro sitio).
 */
const TOLERANCE_PX = 4;
const CHECKS_AFTER_SETTLE_MS = [150, 400, 800, 1200];
const SETTLE_FALLBACK_MS = 1200;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Espera a que termine el desplazamiento; `scrollend` no existe en navegadores antiguos. */
function afterScroll(callback) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('scrollend', finish);
    callback();
  };
  const timer = setTimeout(finish, SETTLE_FALLBACK_MS);
  if ('onscrollend' in window) window.addEventListener('scrollend', finish);
}

function scrollPadding() {
  return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

/** Posición en el documento sin transformaciones (las de la animación de entrada). */
function layoutTop(element) {
  let top = 0;
  for (let node = element; node instanceof HTMLElement; node = node.offsetParent) {
    top += node.offsetTop;
  }
  return top;
}

/** Cuánto falta por desplazar para dejar la sección justo bajo la cabecera. */
function offsetFromTarget(target) {
  return layoutTop(target) - scrollPadding() - window.scrollY;
}

/** Salto sin animación. `behavior: 'instant'` no existe en navegadores antiguos. */
function jumpBy(offset) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollBy(0, offset);
  root.style.scrollBehavior = previous;
}

function atPageEnd() {
  const root = document.documentElement;
  return Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 1;
}

/** Solo el último desplazamiento pedido sigue corrigiendo. */
let latestRequest = 0;

export function scrollToSection(id) {
  const target = $(id);
  if (!target) return;
  const request = ++latestRequest;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  const userEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  userEvents.forEach((type) =>
    window.addEventListener(type, cancel, { once: true, passive: true }),
  );
  const stop = () => userEvents.forEach((type) => window.removeEventListener(type, cancel));

  // Dónde dejó la página este desplazamiento: si cambia, otro la movió (la barra de
  // desplazamiento, otro código, la persona) y ya no se corrige. Los cambios de altura del
  // contenido mueven el destino, no la posición de la página.
  let leftAt = 0;
  const correct = () => {
    if (cancelled || request !== latestRequest) return;
    if (Math.abs(window.scrollY - leftAt) > TOLERANCE_PX) {
      cancelled = true;
      return;
    }
    const offset = offsetFromTarget(target);
    const reached = Math.abs(offset) <= TOLERANCE_PX || (offset > 0 && atPageEnd());
    if (!reached) jumpBy(offset);
    leftAt = window.scrollY;
  };
  // Tras el salto se pintan otras secciones y el destino puede volver a moverse: se vigila un
  // momento después de asentarse.
  const watch = () => {
    leftAt = window.scrollY;
    requestAnimationFrame(() => requestAnimationFrame(correct));
    CHECKS_AFTER_SETTLE_MS.forEach((ms) => setTimeout(correct, ms));
    setTimeout(stop, CHECKS_AFTER_SETTLE_MS[CHECKS_AFTER_SETTLE_MS.length - 1] + 50);
  };

  window.scrollTo({
    top: Math.max(0, window.scrollY + offsetFromTarget(target)),
    behavior: reducedMotion() ? 'auto' : 'smooth',
  });
  afterScroll(watch);
}

/** Enlaces internos a secciones (`#catalogo`, `#factura`…): mismo desplazamiento corregido. */
export function bindSectionLinks(sectionIds) {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    const id = link?.getAttribute('href')?.slice(1);
    if (!id || !sectionIds.includes(id)) return;
    event.preventDefault();
    history.pushState(null, '', `#${id}`);
    scrollToSection(id);
  });
}
