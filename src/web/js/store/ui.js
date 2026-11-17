import { $ } from './dom.js';

let toastTimer = null;

/**
 * Aviso breve. `action` opcional ({ label, onClick }) añade un botón (p. ej. "Deshacer") y
 * deja el aviso visible más tiempo.
 */
export function toast(message, type = '', action) {
  const stack = $('toastStack');
  if (!stack) return;
  clearTimeout(toastTimer);
  stack.replaceChildren();
  const el = document.createElement('div');
  el.className = 'toast show ' + type + (action ? ' has-action' : '');
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.onclick = () => {
      el.remove();
      action.onClick();
    };
    el.appendChild(button);
  }
  stack.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 2800);
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
      // Una ventana puede marcar dónde empieza el foco (el acceso: la propia caja, que anuncia su
      // título; así un Enter de más no abre Google ni Facebook sin querer).
      (el.querySelector('[data-focus-start]') || el.querySelector(FOCUSABLE))?.focus({
        preventScroll: true,
      });
    });
  } else if (!open && wasOpen) {
    const opener = openers.get(id);
    openers.delete(id);
    if (opener && document.contains(opener) && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
  }
}

/**
 * Con una ventana abierta (aria-modal), Tab y Mayús+Tab dan la vuelta dentro de ella: el foco no
 * se escapa a la tienda que queda detrás.
 */
export function trapModalFocus() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const open = [...document.querySelectorAll('.modal:not([hidden])')].pop();
    if (!open) return;
    const items = [...open.querySelectorAll(FOCUSABLE)].filter(
      (n) => n.getClientRects().length && n.getAttribute('aria-disabled') !== 'true',
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const atStart = active === first || active?.hasAttribute?.('data-focus-start');
    if (!open.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && atStart) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });
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
