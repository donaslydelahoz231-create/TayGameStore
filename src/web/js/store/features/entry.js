import { priceOf } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';

/**
 * Oferta de la pantalla de entrada: precio «desde» y medios de pago, ambos del servidor (el
 * catálogo y /api/config). Sin datos no se muestra nada: nunca un precio ni un medio inventado.
 */
export function renderEntryOffer() {
  const box = $('entryOffer');
  if (!box) return;
  const products = Array.isArray(state.products.freefire) ? state.products.freefire : [];
  const prices = products
    .filter((p) => p.providerAvailable !== false)
    .map(priceOf)
    .filter((n) => n > 0);
  const methods = state.serverConfig?.paymentMethods || {};
  const names = [methods.nequiManual && 'Nequi', methods.mercadopago && 'Mercado Pago'].filter(
    Boolean,
  );
  setText('entryFrom', prices.length ? 'Desde ' + money(Math.min(...prices)) : '');
  setText('entryPay', names.length ? 'Paga con ' + names.join(' o ') : '');
  box.hidden = !prices.length && !names.length;
  renderShowcase(products);
}

/**
 * Vitrina de la entrada: cada arte lleva la cantidad y el precio de su paquete solo si el
 * catálogo del servidor lo trae disponible; si no, se ve solo la imagen.
 */
function renderShowcase(products) {
  document.querySelectorAll('#entryShowcase .entry-tile').forEach((tile) => {
    const caption = tile.querySelector('figcaption');
    if (!caption) return;
    const p = products.find(
      (item) => Number(item.diamonds) === Number(tile.dataset.units) && item.providerAvailable,
    );
    caption.replaceChildren();
    if (!p) return;
    const units = document.createElement('b');
    units.textContent = Number(p.diamonds).toLocaleString('es-CO');
    const label = document.createElement('small');
    label.textContent = 'diamantes';
    const price = document.createElement('em');
    price.textContent = money(priceOf(p));
    caption.append(units, label, price);
  });
}

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
