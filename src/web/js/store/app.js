import { $, setText } from './dom.js';
import { registerRenderers, renderAll } from './render.js';
import { state } from './state.js';
import { lastOrderReference, loadLocal, saveLocal, watchOtherTabs } from './storage.js';
import { toast } from './ui.js';
import { bind } from './bindings.js';
import { bootstrapSession, renderAccount, renderHeader } from './features/account.js';
import { renderDrawer, renderSmartCart } from './features/cart.js';
import { loadCatalog, renderGames, renderProducts } from './features/catalog.js';
import { showEntryLanding, revealStore } from './features/entry.js';
import { renderHistory } from './features/history.js';
import { renderInvoice } from './features/invoice.js';
import { navObserver } from './features/nav.js';
import { isFinalOrderStatus, loadOrder, startPolling, syncOrder } from './features/orders.js';
import { renderPlayer, renderPlayerMode } from './features/player.js';
import { bootstrapConfig, renderService } from './features/service.js';
import { renderSupport } from './features/support.js';
import { renderChecks } from './features/tracking.js';

const CLOCK_REFRESH_MS = 1000;

// Orden de render del HTML original; saveLocal persiste las preferencias al final.
registerRenderers([
  renderHeader,
  renderService,
  renderGames,
  renderProducts,
  renderSmartCart,
  renderDrawer,
  renderInvoice,
  renderChecks,
  renderPlayer,
  renderPlayerMode,
  renderSupport,
  renderAccount,
  renderHistory,
  saveLocal,
]);

const formatClock = (date) =>
  date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

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
  const reference =
    returned && /^TGS-[0-9A-Z]{10}$/.test(returned) ? returned : lastOrderReference();
  if (!reference) return;
  try {
    // Al volver de Mercado Pago el servidor consulta el pago; el navegador no decide nada.
    const order = returned ? await syncOrder(reference) : await loadOrder(reference);
    if (!order) return;
    revealStore();
    if (!isFinalOrderStatus(order.status)) startPolling();
    if (returned) {
      toast(
        order.status === 'PAID' || order.status === 'DELIVERING' || order.status === 'DELIVERED'
          ? 'Pago confirmado por Mercado Pago.'
          : 'Estamos confirmando tu pago con Mercado Pago. Este estado se actualiza solo.',
        order.status === 'PAID' ? 'good' : '',
      );
      $('seguimiento')?.scrollIntoView({ behavior: 'smooth' });
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
  navObserver();
  watchOtherTabs(renderAll);
  try {
    renderAll();
  } catch (err) {
    console.error('[TayGameStore initial render]', err);
  }

  // Ninguna espera bloquea la primera interacción; cada carga tiene su propio timeout.
  await bootstrapConfig();
  await Promise.allSettled([loadCatalog('freefire'), bootstrapSession(), resumeOrder()]);
  renderAll();

  setText('heroTime', formatClock(new Date()));
  setInterval(() => setText('heroTime', formatClock(new Date())), CLOCK_REFRESH_MS);
}

export function startStore() {
  init().catch((err) => {
    console.error('[TayGameStore init]', err);
    showEntryLanding();
    toast('No se pudo iniciar la tienda. Recarga la página.', 'bad');
  });
}

export { state };
