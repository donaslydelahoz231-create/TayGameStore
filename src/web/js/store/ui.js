import { $ } from './dom.js';

let toastTimer = null;

export function toast(message, type = '') {
  const stack = $('toastStack');
  if (!stack) return;
  clearTimeout(toastTimer);
  stack.replaceChildren();
  const el = document.createElement('div');
  el.className = 'toast show ' + type;
  el.textContent = message;
  stack.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

/** Elemento que abrió cada modal: recibe el foco de vuelta al cerrarlo (accesibilidad). */
const openers = new Map();

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function modal(id, open) {
  const el = $(id);
  if (!el) return;
  const wasOpen = !el.hidden;
  el.hidden = !open;
  document.body.classList.toggle('lock', open || !!$('cartDrawer')?.classList.contains('open'));
  if (open && !wasOpen) {
    openers.set(id, document.activeElement);
    // Foco dentro del diálogo (el primer control), sin desplazar la página.
    requestAnimationFrame(() => {
      if (el.hidden || el.contains(document.activeElement)) return;
      el.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
    });
  } else if (!open && wasOpen) {
    const opener = openers.get(id);
    openers.delete(id);
    if (opener && document.contains(opener) && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
  }
}

/** Cierra todos los modales abiertos (Escape), devolviendo el foco. */
export function closeAllModals() {
  document.querySelectorAll('.modal:not([hidden])').forEach((m) => modal(m.id, false));
}

export function closeMenus() {
  const e = $('accountMenu');
  if (e) e.hidden = true;
  $('accountBtn')?.setAttribute('aria-expanded', 'false');
}
