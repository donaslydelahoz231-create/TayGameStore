import { api } from '../api.js';
import { currentProducts, priceOf, productById } from '../cart-model.js';
import { FALLBACK_FREEFIRE, GAME_INFO } from '../config.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { saveLocal } from '../storage.js';
import { toast } from '../ui.js';
import { setQty } from './cart.js';

export async function loadCatalog(game) {
  if (state.localDemo) {
    if (game === 'freefire')
      state.products.freefire = FALLBACK_FREEFIRE.map((p) => ({
        ...p,
        providerAvailable: true,
        demo: true,
      }));
    else state.products[game] = [];
    renderAll();
    return;
  }
  try {
    const j = await api('/api/catalog?game=' + encodeURIComponent(game));
    state.products[game] = Array.isArray(j.products)
      ? j.products.map((p) => ({
          ...p,
          normal: Number(p.normal),
          promo: Number(p.promo),
          diamonds: Number(p.diamonds || 0),
        }))
      : [];
    if (game === 'freefire' && !state.products.freefire.length)
      state.products.freefire = FALLBACK_FREEFIRE.map((p) => ({ ...p }));
  } catch {
    if (game === 'freefire' && !state.products.freefire.length)
      state.products.freefire = FALLBACK_FREEFIRE.map((p) => ({ ...p }));
    else state.products[game] = [];
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
  const available = currentProducts().length;
  const ready = currentProducts().some((p) => p.providerAvailable);
  setText(
    'catalogStatus',
    state.previewOnly
      ? 'Vista previa visual'
      : ready
        ? 'Catálogo disponible'
        : available
          ? 'Catálogo configurado · proveedor pendiente'
          : 'Catálogo pendiente de configuración',
  );
  setText('tlabel', state.tariff === 'promo' ? 'Tarifa promo' : 'Tarifa normal');
  document
    .querySelectorAll('.tariff-toggle button')
    .forEach((b) => b.classList.toggle('active', b.dataset.tariff === state.tariff));
  const playerSection = $('verificacion');
  if (playerSection) {
    playerSection.querySelector('.hint').textContent =
      state.game === 'freefire'
        ? 'La consulta se ejecuta en el backend. Nickname y región solo aparecen cuando una fuente real los devuelve.'
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
      '<b>Catálogo todavía no habilitado</b><small>El administrador debe configurar productos y proveedor reales para esta categoría. No se muestran precios inventados.</small>';
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
    const providerNote = p.providerAvailable
      ? 'Disponible'
      : state.localDemo
        ? 'Demo disponible · sin cobro real'
        : 'Proveedor pendiente';
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
      toast(
        state.localDemo
          ? 'Paquete añadido. Continúa con jugador → factura → pago demo.'
          : p.providerAvailable
            ? 'Paquete añadido. Continúa con jugador → factura → checkout.'
            : 'Paquete añadido al carrito. El checkout real validará el proveedor en el backend.',
        'good',
      );
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
