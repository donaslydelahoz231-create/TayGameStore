import { $ } from '../dom.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';

/** Abre la tienda tras la pantalla de entrada (invitado o sesión). */
export function revealStore() {
  if (state.storeUnlocked) return;
  state.storeUnlocked = true;
  document.body.classList.remove('entry-locked', 'lock');
  $('entryExperience')?.classList.add('out');
  $('app')?.classList.remove('store-locked');
  $('app')?.classList.add('store-ready');
  $('app')?.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('bootScreen')?.classList.add('out'), 120);
  renderAll();
}

/** Vuelve a la pantalla de entrada cinematográfica. */
export function showEntryLanding() {
  state.storeUnlocked = false;
  $('entryExperience')?.classList.remove('out');
  $('app')?.classList.add('store-locked');
  $('app')?.classList.remove('store-ready');
  $('app')?.setAttribute('aria-hidden', 'true');
  document.body.classList.add('entry-locked');
  document.body.classList.add('lock');
}
