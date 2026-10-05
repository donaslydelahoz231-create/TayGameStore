import { FAVORITES_KEY, GAME_INFO, LAST_ORDER_KEY, LEGACY_KEYS, STORAGE_KEY } from './config.js';
import { state } from './state.js';

// Almacenamiento local: SOLO preferencias (juego, tarifa, carrito) y favoritos. Ni datos
// personales, ni órdenes, ni tokens: eso vive en el servidor y en cookies HttpOnly.

function safe(action) {
  try {
    return action();
  } catch {
    // Almacenamiento no disponible (modo privado, cuota): la tienda sigue funcionando.
    return undefined;
  }
}

export function saveLocal() {
  safe(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ game: state.game, tariff: state.tariff, qty: state.qty }),
    );
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  });
}

/** Lee solo las claves conocidas y con el tipo esperado (nada de Object.assign masivo). */
export function loadLocal() {
  safe(() => LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)));
  const saved = safe(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    if (typeof saved.game === 'string' && Object.hasOwn(GAME_INFO, saved.game))
      state.game = saved.game;
    state.tariff = saved.tariff === 'promo' ? 'promo' : 'normal';
    const qty = {};
    if (saved.qty && typeof saved.qty === 'object' && !Array.isArray(saved.qty)) {
      for (const [sku, n] of Object.entries(saved.qty)) {
        if (/^[a-z0-9-]{2,60}$/.test(sku) && Number.isInteger(n) && n > 0 && n <= 5) qty[sku] = n;
      }
    }
    state.qty = qty;
  }
  const fav = safe(() => JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  state.favorites = Array.isArray(fav) ? fav.filter((x) => typeof x === 'string').slice(0, 50) : [];
}

export function rememberOrder(reference) {
  safe(() => {
    if (reference) localStorage.setItem(LAST_ORDER_KEY, reference);
    else localStorage.removeItem(LAST_ORDER_KEY);
  });
}

export function lastOrderReference() {
  const ref = safe(() => localStorage.getItem(LAST_ORDER_KEY));
  return typeof ref === 'string' && /^TGS-[0-9A-Z]{10}$/.test(ref) ? ref : null;
}

/** Tokens de acceso a órdenes: solo en la pestaña (sessionStorage), nunca en localStorage. */
export function storeOrderToken(reference, token) {
  safe(() => sessionStorage.setItem('tgs_ot_' + reference, token));
}

export function orderToken(reference) {
  return safe(() => sessionStorage.getItem('tgs_ot_' + reference)) || null;
}
