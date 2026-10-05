import { priceOf, productById } from '../cart-model.js';
import { scrollToSection } from '../scroll.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { saveLocal } from '../storage.js';
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
      '<div class="favorite-empty">Todavía no tienes paquetes favoritos. Pulsa ★ en cualquier paquete para guardarlo.<br><button class="btn glass favorite-browse" type="button">Ver catálogo</button></div>';
    box.querySelector('.favorite-browse').onclick = () => {
      modal('favoritesModal', false);
      scrollToSection('catalogo');
    };
    return;
  }
  list.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'favorite-entry';
    const inCart = Number(state.qty[p.id] || 0);
    el.innerHTML = `<div><b>★ ${esc(p.name)}</b><small>${money(priceOf(p))} · ${esc(p.desc || 'Recarga gamer')}${inCart ? ` · ${inCart} en el carrito` : ''}</small></div><div class="favorite-actions"><button type="button" data-fav-op="add">Agregar</button><button type="button" data-fav-op="remove" aria-label="Quitar ${esc(p.name)} de favoritos">Quitar</button></div>`;
    el.querySelector('[data-fav-op="add"]').onclick = () => {
      setQty(p.id, Number(state.qty[p.id] || 0) + 1);
      renderAll();
      renderFavorites();
      toast('Añadido al carrito desde favoritos.', 'good');
    };
    el.querySelector('[data-fav-op="remove"]').onclick = () => {
      state.favorites = state.favorites.filter((id) => id !== p.id);
      saveLocal();
      renderAll();
      renderFavorites();
      toast('Quitado de favoritos.', '', {
        label: 'Deshacer',
        onClick: () => {
          state.favorites = [...new Set([...state.favorites, p.id])];
          saveLocal();
          renderAll();
          renderFavorites();
        },
      });
    };
    box.appendChild(el);
  });
}
