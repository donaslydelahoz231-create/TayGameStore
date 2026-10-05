import { priceOf, productById } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { modal, toast } from '../ui.js';
import { setQty } from './cart.js';

/** Lista del modal de favoritos (guardados en este navegador). */
export function renderFavorites() {
  const box = $('favoritesList');
  if (!box) return;
  box.replaceChildren();
  const list = state.favorites.map(productById).filter(Boolean);
  setText('favCount', list.length);
  if (!list.length) {
    box.innerHTML =
      '<div class="favorite-empty">Todavía no tienes paquetes favoritos. Pulsa ★ en cualquier paquete para guardarlo.</div>';
    return;
  }
  list.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'favorite-entry';
    el.innerHTML = `<div><b>★ ${esc(p.name)}</b><small>${money(priceOf(p))} · ${esc(p.desc || 'Recarga gamer')}</small></div><button type="button">Agregar</button>`;
    el.querySelector('button').onclick = () => {
      setQty(p.id, Number(state.qty[p.id] || 0) + 1);
      renderAll();
      modal('favoritesModal', false);
      toast('Añadido desde favoritos.', 'good');
    };
    box.appendChild(el);
  });
}
