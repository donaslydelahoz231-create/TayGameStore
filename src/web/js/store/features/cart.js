import { cartItems, countItems, priceOf, total } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { DEFAULT_MAX_UNITS } from '../config.js';
import { state } from '../state.js';
import { saveLocal } from '../storage.js';
import { closeMenus, toast } from '../ui.js';

/** Máximo por producto fijado por el propietario (el servidor lo vuelve a validar). */
const maxQty = () => state.serverConfig?.limits?.maxUnitsPerProduct || DEFAULT_MAX_UNITS;

export function setQty(id, qty) {
  const wanted = Number(qty) || 0;
  if (wanted > maxQty()) toast(`Máximo ${maxQty()} unidades por paquete.`, 'bad');
  const n = Math.max(0, Math.min(maxQty(), wanted));
  if (n) state.qty[id] = n;
  else delete state.qty[id];
  saveLocal();
}

export function clearCart() {
  state.qty = {};
  renderAll();
  toast('Carrito vaciado.');
}

/** Panel "Compra en curso" junto al catálogo. */
export function renderSmartCart() {
  const items = cartItems(),
    count = countItems();
  setText('smartCount', count + (count === 1 ? ' ítem' : ' ítems'));
  setText('smartTotal', money(total()));
  $('smartReview').disabled = !items.length;
  const list = $('smartList');
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML =
      '<div class="cart-empty">Tu compra empieza aquí.<br>Selecciona una recarga.</div>';
  }
  items.forEach((x) => {
    const el = document.createElement('div');
    el.className = 'cart-item cart-manage';
    el.innerHTML = `<span class="cart-product-icon"><svg><use href="#icon-diamond"></use></svg></span><div class="cart-item-main"><b>${esc(x.p.name)}</b><small>${money(priceOf(x.p))} c/u</small><div class="cart-controls"><button type="button" data-cart-op="minus" aria-label="Disminuir cantidad">−</button><span>${x.qty}</span><button type="button" data-cart-op="plus" aria-label="Aumentar cantidad">+</button><button type="button" class="cart-remove" data-cart-op="remove" aria-label="Eliminar paquete">Eliminar</button></div></div><strong>${money(x.line)}</strong>`;
    el.querySelector('[data-cart-op="minus"]').onclick = () => {
      setQty(x.p.id, x.qty - 1);
      renderAll();
    };
    el.querySelector('[data-cart-op="plus"]').onclick = () => {
      setQty(x.p.id, x.qty + 1);
      renderAll();
    };
    el.querySelector('[data-cart-op="remove"]').onclick = () => {
      setQty(x.p.id, 0);
      renderAll();
      toast('Paquete eliminado del carrito.', 'good');
    };
    list.appendChild(el);
  });
  const recommend = $('smartRecommend')?.querySelector('span');
  if (recommend)
    recommend.textContent = !items.length
      ? 'Selecciona un paquete para recibir una recomendación.'
      : state.uidAccepted
        ? 'UID listo. Completa tus datos y crea el pedido.'
        : count >= 3
          ? 'Tienes varias unidades. Escribe el UID del jugador antes de continuar.'
          : 'Siguiente paso recomendado: escribe tu UID.';
}

/** Carrito lateral. */
export function renderDrawer() {
  const list = $('drawerItems'),
    items = cartItems();
  setText('drawerTotal', money(total()));
  $('drawerReview').disabled = !items.length;
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML = '<div class="drawer-empty">No hay recargas en el carrito.</div>';
    return;
  }
  items.forEach((x) => {
    const el = document.createElement('div');
    el.className = 'drawer-item drawer-manage';
    el.innerHTML = `<span class="mini"><svg><use href="#icon-diamond"></use></svg></span><div class="drawer-item-main"><b>${esc(x.p.name)}</b><small>${money(priceOf(x.p))} c/u</small><div class="drawer-controls"><button type="button" data-drawer-op="minus" aria-label="Disminuir cantidad">−</button><span>${x.qty}</span><button type="button" data-drawer-op="plus" aria-label="Aumentar cantidad">+</button><button type="button" class="drawer-remove" data-drawer-op="remove" aria-label="Eliminar paquete">×</button></div></div><strong>${money(x.line)}</strong>`;
    el.querySelector('[data-drawer-op="minus"]').onclick = () => {
      setQty(x.p.id, x.qty - 1);
      renderAll();
    };
    el.querySelector('[data-drawer-op="plus"]').onclick = () => {
      setQty(x.p.id, x.qty + 1);
      renderAll();
    };
    el.querySelector('[data-drawer-op="remove"]').onclick = () => {
      setQty(x.p.id, 0);
      renderAll();
      toast('Paquete eliminado del carrito.', 'good');
    };
    list.appendChild(el);
  });
}

export function openDrawer() {
  closeMenus();
  $('drawerOverlay').hidden = false;
  $('cartDrawer').inert = false;
  $('cartDrawer').classList.add('open');
  document.body.classList.add('lock');
  renderDrawer();
}

export function closeDrawer() {
  const drawer = $('cartDrawer');
  const hadFocus = drawer.contains(document.activeElement);
  drawer.classList.remove('open');
  drawer.inert = true;
  if (hadFocus) $('cartBtn')?.focus({ preventScroll: true });
  $('drawerOverlay').hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('lock');
}
