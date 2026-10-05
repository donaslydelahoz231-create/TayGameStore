import { priceOf } from '../cart-model.js';
import { GAME_INFO } from '../config.js';
import { $, esc } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { modal } from '../ui.js';
import { finderSearch } from './player.js';

const MAX_RESULTS = 8;

export function openSearch() {
  $('searchPanel').hidden = false;
  $('searchInput').focus();
}

export function closeSearch() {
  $('searchPanel').hidden = true;
  $('searchInput').value = '';
  $('searchResults').replaceChildren();
}

export function search(e) {
  const q = String(e.target.value || '')
      .toLowerCase()
      .trim(),
    box = $('searchResults');
  box.replaceChildren();
  if (!q) return;
  const found = [];
  if (/^\d{6,12}$/.test(q))
    found.push({
      name: 'Buscar jugador ' + q,
      info: 'Consulta real de UID',
      action: () => {
        $('finderUid').value = q;
        modal('playerFinderModal', true);
        finderSearch();
      },
    });
  Object.entries(state.products).forEach(([game, list]) =>
    list.forEach((p) => {
      if ((p.name + ' ' + GAME_INFO[game].name).toLowerCase().includes(q))
        found.push({
          name: p.name,
          info: GAME_INFO[game].name + ' · ' + money(priceOf(p)),
          action: () => {
            state.game = game;
            renderAll();
            $('catalogo').scrollIntoView({ behavior: 'smooth' });
          },
        });
    }),
  );
  found.push({
    name: 'Verificar jugador',
    info: 'Abrir Player ID',
    action: () => {
      $('verificacion').scrollIntoView({ behavior: 'smooth' });
    },
  });
  found.push({
    name: 'Factura viva',
    info: 'Revisar pedido',
    action: () => $('factura').scrollIntoView({ behavior: 'smooth' }),
  });
  found.slice(0, MAX_RESULTS).forEach((r) => {
    const b = document.createElement('button');
    b.className = 'search-result';
    b.type = 'button';
    b.innerHTML = '<b>' + esc(r.name) + '</b><span>' + esc(r.info) + '</span>';
    b.onclick = () => {
      closeSearch();
      r.action();
    };
    box.appendChild(b);
  });
}
