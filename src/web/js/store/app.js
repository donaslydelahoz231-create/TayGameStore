import { $ } from './dom.js';
import { scrollToSection } from './scroll.js';
import { registerRenderers, renderAll } from './render.js';
import { state } from './state.js';
import { lastOrderReference, loadLocal, saveLocal, watchOtherTabs } from './storage.js';
import { toast } from './ui.js';
import { bind } from './bindings.js';
import { bootstrapSession, renderAccount, renderHeader } from './features/account.js';
import { renderDrawer, renderSmartCart } from './features/cart.js';
import { loadCatalog, renderGames, renderProducts } from './features/catalog.js';
import { renderEntryOffer, showEntryLanding, revealStore } from './features/entry.js';
import { initSound } from '../effects/sonido.js';
import { playIntro } from './features/intro.js';
import { renderHistory } from './features/history.js';
import { renderInvoice } from './features/invoice.js';
import { navObserver } from './features/nav.js';
import { isFinalOrderStatus, loadOrder, startPolling, syncOrder } from './features/orders.js';
import { consumeAccessFragment, renderTrackAccess } from './features/order-access.js';
import { renderPins } from './features/pins.js';
import { loadReviews, renderDeliveryTime, renderReviewBox } from './features/reviews.js';
import { renderPayMeansHint } from './features/pay-means.js';
import { renderNequi } from './features/nequi.js';
import { renderPlayer, renderPlayerMode } from './features/player.js';
import { bootstrapConfig, renderService } from './features/service.js';
import { renderSupport } from './features/support.js';
import { renderPromo, watchPromoChanges } from './features/promo.js';
import { renderPromoStrip } from './features/tariffs.js';
import { renderChecks } from './features/tracking.js';

// Orden de render del HTML original; saveLocal persiste las preferencias al final.
registerRenderers([
  renderHeader,
  renderEntryOffer,
  renderService,
  renderGames,
  renderProducts,
  renderPromoStrip,
  renderSmartCart,
  renderDrawer,
  renderInvoice,
  renderPayMeansHint,
  renderNequi,
  renderChecks,
  renderTrackAccess,
  renderPins,
  renderReviewBox,
  renderPlayer,
  renderPlayerMode,
  renderSupport,
  renderAccount,
  renderHistory,
  saveLocal,
]);

/** Recupera el pedido: retorno desde Mercado Pago (?pedido=REF) o el último de este navegador. */
async function resumeOrder() {
  const params = new URLSearchParams(location.search);
  const returned = params.get('pedido');
  if (returned) {
    params.delete('pedido');
    history.replaceState(
      {},
      '',
      location.pathname + (params.toString() ? '?' + params : '') + location.hash,
    );
  }
  // Enlace privado de seguimiento (#pedido=…&codigo=…), abierto en este u otro dispositivo.
  const linked = consumeAccessFragment();
  const reference =
    returned && /^TGS-[0-9A-Z]{10}$/.test(returned) ? returned : (linked ?? lastOrderReference());
  if (!reference) return;
  try {
    // Al volver de Mercado Pago el servidor consulta el pago; el navegador no decide nada.
    const order = returned ? await syncOrder(reference) : await loadOrder(reference);
    if (!order) {
      if (linked)
        toast('Ese enlace de seguimiento no es válido o no corresponde a un pedido.', 'bad');
      return;
    }
    revealStore();
    if (!isFinalOrderStatus(order.status)) startPolling();
    if (linked && !returned) scrollToSection('seguimiento');
    if (returned) {
      toast(
        order.status === 'PAID' || order.status === 'DELIVERING' || order.status === 'DELIVERED'
          ? 'Pago confirmado por Mercado Pago.'
          : 'Estamos confirmando tu pago con Mercado Pago. Este estado se actualiza solo.',
        order.status === 'PAID' ? 'good' : '',
      );
      scrollToSection('seguimiento');
    }
  } catch {
    toast(
      'No pudimos consultar tu pedido ahora. Pulsa "Actualizar estado" en unos segundos.',
      'bad',
    );
  }
}

async function init() {
  loadLocal();
  const terms = $('acceptTerms');
  if (terms) terms.checked = false;
  showEntryLanding();
  bind();
  // Sonido de bienvenida (suena con el primer toque) y presentación de la marca mientras llegan
  // precios y catálogo (no bloquea la carga).
  initSound();
  playIntro();
  navObserver();
  watchOtherTabs(renderAll);
  try {
    renderAll();
  } catch (err) {
    console.error('[TayGameStore initial render]', err);
  }

  // Ninguna espera bloquea la primera interacción; cada carga tiene su propio timeout.
  await bootstrapConfig();
  renderDeliveryTime();
  await Promise.allSettled([
    loadCatalog('freefire'),
    bootstrapSession(),
    resumeOrder(),
    loadReviews(),
  ]);
  renderAll();

  // TAY RADAR empieza o termina con la tienda abierta: precios y avisos del servidor al día.
  watchPromoChanges(async () => {
    await bootstrapConfig();
    await loadCatalog(state.game);
    renderPromo();
    renderAll();
  });
}

export function startStore() {
  init().catch((err) => {
    console.error('[TayGameStore init]', err);
    showEntryLanding();
    toast('No se pudo iniciar la tienda. Recarga la página.', 'bad');
  });
}

export { state };
