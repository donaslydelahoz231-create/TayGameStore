import { api } from '../api.js';
import { currentProducts, priceOf, productById } from '../cart-model.js';
import { GAME_INFO } from '../config.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { saveLocal } from '../storage.js';
import { toast } from '../ui.js';
import { setQty } from './cart.js';

/** Convierte un producto del servidor al formato de la interfaz. */
function fromServer(p) {
  return {
    id: p.sku,
    name: p.name,
    desc: p.description,
    tag: p.tag,
    diamonds: p.units,
    normal: p.listPriceCop,
    promo: p.priceCop,
    price: p.priceCop,
    providerAvailable: true,
  };
}

/** Catálogo desde el servidor. Sin servidor no se muestran precios (nunca precios fijos). */
export async function loadCatalog(game) {
  if (game !== 'freefire') {
    state.products[game] = [];
    renderAll();
    return;
  }
  if (state.previewOnly) {
    state.catalogStatus = 'error';
    renderAll();
    return;
  }
  state.catalogStatus = 'loading';
  renderAll();
  try {
    const j = await api('/api/catalog?game=' + encodeURIComponent(game));
    state.products[game] = Array.isArray(j.products) ? j.products.map(fromServer) : [];
    state.catalogStatus = state.products[game].length ? 'ready' : 'empty';
    // Productos que ya no existen salen del carrito.
    for (const id of Object.keys(state.qty)) if (!productById(id)) delete state.qty[id];
    saveLocal();
  } catch {
    state.catalogStatus = 'error';
  }
  renderAll();
}

/** Pestañas de juego, estado del catálogo y tarifa. */
export function renderGames() {
  document.querySelectorAll('.game-tab').forEach((tab) => {
    const active = tab.dataset.game === state.game;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    const em = tab.querySelector('em');
    if (em) {
      em.textContent = tab.dataset.game === 'freefire' ? 'ACTIVO' : 'PRÓXIMAMENTE';
    }
  });
  const info = GAME_INFO[state.game] || GAME_INFO.freefire;
  setText('catalogTitle', info.name);
  const STATUS = {
    loading: 'Cargando catálogo…',
    ready: 'Catálogo disponible',
    empty: 'Catálogo pendiente de configuración',
    error: 'No se pudo cargar el catálogo',
  };
  setText('catalogStatus', state.previewOnly ? 'Vista previa visual' : STATUS[state.catalogStatus]);
  document
    .querySelectorAll('.tariff-toggle button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tariff === state.tariff));
  const playerSection = $('verificacion');
  if (playerSection) {
    playerSection.querySelector('.hint').textContent =
      state.game === 'freefire'
        ? 'El equipo verifica nickname y región con una fuente oficial después de crear el pedido. Nunca te pediremos la contraseña.'
        : 'Este juego está preparado visualmente. La verificación se habilitará cuando exista un flujo de jugador real para esa categoría.';
  }
  const playerInput = $('playerUid');
  if (playerInput) playerInput.disabled = state.game !== 'freefire';
  const verifyBtn = $('verifyBtn');
  if (verifyBtn) verifyBtn.disabled = state.game !== 'freefire' || runtime.playerBusy;
}

export function renderProducts() {
  const box = $('products');
  if (!box) return;
  box.replaceChildren();
  const list = currentProducts();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.innerHTML =
      state.catalogStatus === 'error'
        ? '<b>No pudimos cargar el catálogo</b><small>Revisa tu conexión. Se reintentará automáticamente al recuperar la red.</small>'
        : state.catalogStatus === 'loading'
          ? '<b>Cargando catálogo…</b><small>Consultando precios vigentes.</small>'
          : '<b>Catálogo todavía no habilitado</b><small>Esta categoría aún no tiene productos disponibles. No se muestran precios inventados.</small>';
    box.appendChild(empty);
    setText('favCount', state.favorites.length);
    return;
  }
  state.favorites = state.favorites.filter((id) => !!productById(id));
  setText('favCount', state.favorites.length);
  list.forEach((p) => {
    const q = Number(state.qty[p.id] || 0),
      fav = state.favorites.includes(p.id),
      saving = Math.max(0, Number(p.normal || 0) - Number(p.promo || 0));
    const el = document.createElement('article');
    el.className =
      'product' + (q ? ' selected' : '') + (!p.providerAvailable ? ' unavailable' : '');
    const visualCount = Math.min(4, Math.max(1, Math.ceil(Number(p.diamonds || 1) / 350)));
    const addLabel = q ? 'Añadido' : 'Agregar';
    const providerNote = 'Disponible';
    el.innerHTML = `<div class="product-top"><span class="product-tag">${esc(p.tag || 'Recarga')}</span><button class="fav-btn${fav ? ' on' : ''}" type="button" aria-pressed="${fav}" aria-label="${fav ? 'Quitar' : 'Añadir'} ${esc(p.name)} ${fav ? 'de favoritos' : 'a favoritos'}">★</button></div><div class="product-visual">${Array.from({ length: visualCount }, () => '<svg><use href="#icon-diamond"></use></svg>').join('')}<span class="visual-ring"></span></div><div class="product-name">${esc(p.name)}</div><div class="product-desc">${esc(p.desc || 'Recarga gamer')}</div><div class="product-price"><div><strong>${money(priceOf(p))}</strong>${state.tariff === 'promo' && saving ? `<s>${money(p.normal)}</s>` : ''}</div><small>${state.tariff === 'promo' && saving ? 'Ahorra ' + money(saving) : providerNote}</small></div><div class="product-actions"><button class="add-btn" type="button">${addLabel}</button><div class="qty"><button type="button" data-op="minus" ${q ? '' : 'disabled'}>−</button><span>${q}</span><button type="button" data-op="plus">+</button></div></div>`;
    const favBtn = el.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(p.id);
    });
    favBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.querySelector('.add-btn').onclick = (e) => {
      e.stopPropagation();
      setQty(p.id, q || 1);
      renderAll();
      toast('Paquete añadido. Continúa con jugador → factura → pedido.', 'good');
    };
    el.querySelector('[data-op="plus"]').onclick = (e) => {
      e.stopPropagation();
      setQty(p.id, q + 1);
      renderAll();
    };
    el.querySelector('[data-op="minus"]').onclick = (e) => {
      e.stopPropagation();
      setQty(p.id, q - 1);
      renderAll();
    };
    box.appendChild(el);
  });
}

export function toggleFavorite(id) {
  const i = state.favorites.indexOf(id);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(id);
  state.favorites = [...new Set(state.favorites)];
  saveLocal();
  renderProducts();
  toast(i >= 0 ? 'Quitado de favoritos.' : '★ Añadido a favoritos.', 'good');
}

export function selectTariff(tariff) {
  state.tariff = tariff === 'promo' ? 'promo' : 'normal';
  renderAll();
}
