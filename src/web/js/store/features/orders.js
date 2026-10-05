import { api } from '../api.js';
import { FINAL_ORDER_STATUSES } from '../config.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { upsertPurchaseHistory } from './history.js';

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_DURATION_MS = 15 * 60 * 1000;

const isFinal = (status) => FINAL_ORDER_STATUSES.includes(String(status || '').toUpperCase());

/** Consulta el estado de la orden actual. Devuelve true si es un estado final. */
export async function pollOrder() {
  const ref = state.currentOrder?.reference;
  if (!ref) return false;
  if (state.localDemo) return isFinal(state.currentOrder?.status);
  const code = state.currentOrder?.code || '';
  try {
    const j = await api(
      '/api/orders/' + encodeURIComponent(ref) + '?code=' + encodeURIComponent(code),
    );
    state.currentOrder = j.order;
    upsertPurchaseHistory(j.order);
    renderAll();
    return isFinal(j.order.status);
  } catch {
    return false;
  }
}

export function startPolling() {
  clearInterval(runtime.pollTimer);
  pollOrder();
  runtime.pollTimer = setInterval(async () => {
    if (await pollOrder()) clearInterval(runtime.pollTimer);
  }, POLL_INTERVAL_MS);
  setTimeout(() => clearInterval(runtime.pollTimer), POLL_MAX_DURATION_MS);
}

export { isFinal as isFinalOrderStatus };
