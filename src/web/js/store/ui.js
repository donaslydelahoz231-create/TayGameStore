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

export function modal(id, open) {
  const el = $(id);
  if (!el) return;
  el.hidden = !open;
  document.body.classList.toggle('lock', open || !!$('cartDrawer')?.classList.contains('open'));
}

export function closeMenus() {
  const e = $('accountMenu');
  if (e) e.hidden = true;
  $('accountBtn')?.setAttribute('aria-expanded', 'false');
}
