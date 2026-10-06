import { api, ApiError } from '../api.js';
import { FINAL_ORDER_STATUSES } from '../config.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { orderToken, rememberOrder } from '../storage.js';

// Seguimiento de la orden actual. El estado SIEMPRE se lee del servidor: tras recargar,
// volver atrás o reabrir el navegador, la orden se recupera con su referencia.

const isFinal = (status) => FINAL_ORDER_STATUSES.includes(status);

function accessHeaders(reference) {
  const token = orderToken(reference);
  return token ? { 'x-order-token': token } : {};
}

export function setCurrentOrder(order) {
  runtime.orderGeneration += 1;
  const previous = state.currentOrder;
  state.currentOrder = order || null;
  // Celebración visual solo al ver la transición a entregado (no al abrir un pedido antiguo).
  if (
    order?.status === 'DELIVERED' &&
    previous?.reference === order.reference &&
    previous.status !== 'DELIVERED'
  ) {
    dispatchEvent(new CustomEvent('tgs:order-delivered'));
  }
  rememberOrder(order && !isFinal(order.status) ? order.reference : null);
  renderAll();
}

/** Carga una orden por referencia. Devuelve null si no existe o no es de este navegador. */
export async function loadOrder(reference) {
  const generation = runtime.orderGeneration;
  try {
    const j = await api('/api/orders/' + encodeURIComponent(reference), {
      headers: accessHeaders(reference),
    });
    // Mientras esta consulta viajaba, otra acción (confirmar, pagar, actualizar) cambió la
    // orden: esta respuesta es anterior y no debe pisar el estado nuevo.
    if (runtime.orderGeneration !== generation) return state.currentOrder;
    setCurrentOrder(j.order);
    return j.order;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') {
      rememberOrder(null);
      return null;
    }
    throw err;
  }
}

/** Pide al servidor que consulte a Mercado Pago (retorno del pago o "Actualizar estado"). */
export async function syncOrder(reference) {
  const j = await api('/api/orders/' + encodeURIComponent(reference) + '/sync', {
    method: 'POST',
    headers: accessHeaders(reference),
  });
  setCurrentOrder(j.order);
  return j.order;
}

/** Consulta el estado de la orden actual. Devuelve true si es un estado final. */
export async function pollOrder() {
  const ref = state.currentOrder?.reference;
  if (!ref) return true;
  try {
    const order = await loadOrder(ref);
    return !order || isFinal(order.status);
  } catch {
    return false; // Error de red: se reintenta en el siguiente ciclo.
  }
}

/** Intervalo creciente: 5 s (2 min) → 15 s (hasta 15 min) → 60 s. Pausa con la pestaña oculta. */
function nextDelay() {
  const elapsed = Date.now() - runtime.pollStartedAt;
  if (elapsed < 2 * 60_000) return 5_000;
  if (elapsed < 15 * 60_000) return 15_000;
  return 60_000;
}

export function stopPolling() {
  clearTimeout(runtime.pollTimer);
  runtime.pollTimer = null;
}

export function startPolling() {
  stopPolling();
  runtime.pollStartedAt = Date.now();
  const tick = async () => {
    if (document.hidden) {
      runtime.pollTimer = setTimeout(tick, 5_000);
      return;
    }
    const done = await pollOrder();
    if (!done) runtime.pollTimer = setTimeout(tick, nextDelay());
    else runtime.pollTimer = null;
  };
  runtime.pollTimer = setTimeout(tick, 5_000);
}

export { isFinal as isFinalOrderStatus };
