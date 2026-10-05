import { productById } from './cart-model.js';
import { FINAL_ORDER_STATUSES } from './config.js';
import { $, setText } from './dom.js';
import { registerRenderers, renderAll } from './render.js';
import { runtime, state } from './state.js';
import { loadLocal, nextInvoice, saveLocal } from './storage.js';
import { toast } from './ui.js';
import { bind } from './bindings.js';
import { bootstrapSession, logout, renderAccount, renderHeader } from './features/account.js';
import { renderDrawer, renderSmartCart, setQty } from './features/cart.js';
import { loadCatalog, renderGames, renderProducts, toggleFavorite } from './features/catalog.js';
import { preparePayment } from './features/checkout.js';
import { showEntryLanding } from './features/entry.js';
import { renderHistory } from './features/history.js';
import { renderInvoice } from './features/invoice.js';
import { navObserver } from './features/nav.js';
import { pollOrder } from './features/orders.js';
import { verifyPlayer } from './features/player.js';
import { bootstrapConfig, checkHealth, renderService } from './features/service.js';
import { renderSupport } from './features/support.js';
import { renderChecks } from './features/tracking.js';

const ORDER_REFRESH_MS = 15000;
const CLOCK_REFRESH_MS = 1000;

// Orden de render del HTML original; saveLocal persiste al final de cada render.
registerRenderers([
  renderHeader,
  renderService,
  renderGames,
  renderProducts,
  renderSmartCart,
  renderDrawer,
  renderInvoice,
  renderChecks,
  renderSupport,
  renderAccount,
  renderHistory,
  saveLocal,
]);

const formatClock = (date) =>
  date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

async function init() {
  loadLocal();
  if (!Number(state.invoice)) state.invoice = nextInvoice();
  const customer = $('customerName'),
    email = $('customerEmail'),
    uid = $('playerUid'),
    terms = $('acceptTerms');
  if (customer) customer.value = state.customerName || '';
  if (email) email.value = state.customerEmail || '';
  if (uid) uid.value = state.playerUid || '';
  if (terms) terms.checked = false;
  showEntryLanding();
  bind();
  navObserver();
  try {
    renderAll();
  } catch (err) {
    console.error('[TayGameStore initial render]', err);
  }

  // Never block first interaction while waiting for backend/provider services.
  bootstrapConfig().catch(() => {});
  loadCatalog('freefire').catch(() => {});
  bootstrapSession().catch(() => {});
  checkHealth().catch(() => {});

  setInterval(() => {
    const st = String(state.currentOrder?.status || '').toUpperCase();
    if (state.currentOrder && !FINAL_ORDER_STATUSES.includes(st) && !runtime.pollTimer)
      pollOrder().catch(() => {});
  }, ORDER_REFRESH_MS);
  setText('heroTime', formatClock(new Date()));
  setInterval(() => setText('heroTime', formatClock(new Date())), CLOCK_REFRESH_MS);
}

/** API de depuración en consola (heredada del HTML original). */
window.TGS = {
  state,
  verifyPlayer,
  preparePayment,
  pollOrder,
  logout,
  addPackage: (id, qty = 1) => {
    if (!productById(id)) return false;
    setQty(id, qty);
    renderAll();
    return true;
  },
  toggleFavorite: (id) => {
    if (!productById(id)) return false;
    toggleFavorite(id);
    return true;
  },
};

export function startStore() {
  init().catch((err) => {
    console.error('[TayGameStore init]', err);
    bind();
    showEntryLanding();
    toast('TayGameStore está listo. Las funciones conectadas requieren el servidor.', 'bad');
  });
}
