import { state } from './state.js';

// Cálculos del carrito para la interfaz. Los importes reales los decide el servidor.

export const currentProducts = () =>
  Array.isArray(state.products[state.game]) ? state.products[state.game] : [];

export const productById = (id) =>
  Object.values(state.products)
    .flat()
    .find((p) => p && p.id === id) || null;

export const priceOf = (p) =>
  state.tariff === 'promo' ? Number(p.promo || p.normal || 0) : Number(p.normal || 0);

export const cartItems = () =>
  Object.entries(state.qty)
    .map(([id, q]) => ({ p: productById(id), qty: Number(q) }))
    .filter((x) => x.p && Number.isInteger(x.qty) && x.qty > 0)
    .map((x) => ({ ...x, line: priceOf(x.p) * x.qty }));

export const total = () => cartItems().reduce((s, x) => s + x.line, 0);

export const countItems = () => cartItems().reduce((s, x) => s + x.qty, 0);
