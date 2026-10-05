import { FAVORITES_KEY, GAME_INFO, INVOICE_SEQ_KEY, STORAGE_KEY } from './config.js';
import { cleanUid } from './format.js';
import { state } from './state.js';

// Persistencia local heredada del HTML original. En la Fase 2 se limita a preferencias
// y favoritos: órdenes, historial y datos del cliente no deben vivir en localStorage.

export function saveLocal() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        game: state.game,
        tariff: state.tariff,
        qty: state.qty,
        customerName: state.customerName,
        customerEmail: state.customerEmail,
        playerUid: state.playerUid,
        nickname: state.nickname,
        region: state.region,
        regionLabel: state.regionLabel,
        verified: state.verified,
        invoice: state.invoice,
        currentOrder: state.currentOrder,
        purchaseHistory: state.purchaseHistory,
      }),
    );
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota): la tienda sigue funcionando.
  }
}

export function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (s && typeof s === 'object') Object.assign(state, s);
    const fav = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    state.favorites = Array.isArray(fav) ? fav.filter((x) => typeof x === 'string') : [];
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FAVORITES_KEY);
    } catch {
      // Sin acceso al almacenamiento: se continúa con el estado por defecto.
    }
  }
  state.game = GAME_INFO[state.game] ? state.game : 'freefire';
  state.tariff = state.tariff === 'promo' ? 'promo' : 'normal';
  state.qty =
    state.qty && typeof state.qty === 'object' && !Array.isArray(state.qty) ? state.qty : {};
  state.customerName = typeof state.customerName === 'string' ? state.customerName : '';
  state.customerEmail = typeof state.customerEmail === 'string' ? state.customerEmail : '';
  state.playerUid = cleanUid(state.playerUid);
  state.nickname = typeof state.nickname === 'string' ? state.nickname : '';
  state.region = typeof state.region === 'string' ? state.region : '';
  state.regionLabel = typeof state.regionLabel === 'string' ? state.regionLabel : '';
  state.regionSources = Array.isArray(state.regionSources) ? state.regionSources : [];
  state.verified = state.verified === true;
  state.invoice = Number(state.invoice) > 0 ? Number(state.invoice) : 1;
  state.currentOrder =
    state.currentOrder && typeof state.currentOrder === 'object' ? state.currentOrder : null;
  state.purchaseHistory = Array.isArray(state.purchaseHistory)
    ? state.purchaseHistory.filter((x) => x && typeof x === 'object').slice(0, 100)
    : [];
}

export function nextInvoice() {
  try {
    let n = Number(localStorage.getItem(INVOICE_SEQ_KEY) || 0) + 1;
    if (!Number.isSafeInteger(n) || n < 1) n = 1;
    localStorage.setItem(INVOICE_SEQ_KEY, String(n));
    return n;
  } catch {
    return state.invoice + 1;
  }
}
