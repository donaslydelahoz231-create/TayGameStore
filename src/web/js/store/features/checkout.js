import { api, ApiError, errorMessage } from '../api.js';
import { cartItems, total } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { EMAIL_PATTERN, money, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { storeOrderToken } from '../storage.js';
import { modal, toast } from '../ui.js';
import { loadCatalog } from './catalog.js';
import { setCurrentOrder, startPolling } from './orders.js';

// Checkout con Mercado Pago (Checkout Pro):
//   1. "Crear pedido": el servidor recalcula todo y crea la orden (idempotente por checkoutKey).
//   2. El equipo verifica el jugador y el cliente confirma su cuenta.
//   3. "Confirmar y pagar": resumen completo → el servidor crea la preferencia → redirección.
// El navegador nunca decide que algo está pagado: lo confirma el servidor con Mercado Pago.

const METHOD = 'mercadopago';

function scrollTo(id) {
  $(id)?.scrollIntoView({ behavior: 'smooth' });
}

function newCheckoutKey() {
  runtime.checkoutKey = crypto.randomUUID();
  try {
    sessionStorage.setItem('tgs_checkout_key', runtime.checkoutKey);
  } catch {
    // Sin sessionStorage: la clave vive en memoria (sigue protegiendo el doble clic).
  }
  return runtime.checkoutKey;
}

export function currentCheckoutKey() {
  if (runtime.checkoutKey) return runtime.checkoutKey;
  try {
    const saved = sessionStorage.getItem('tgs_checkout_key');
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return (runtime.checkoutKey = saved);
  } catch {
    // Ver newCheckoutKey.
  }
  return newCheckoutKey();
}

export function resetCheckoutKey() {
  runtime.checkoutKey = null;
  try {
    sessionStorage.removeItem('tgs_checkout_key');
  } catch {
    // Sin sessionStorage.
  }
}

/** Requisitos previos a crear el pedido. Devuelve un mensaje si falta algo. */
function missingRequirement() {
  const cfg = state.serverConfig;
  if (!cfg) return ['Sin conexión con el servidor. Inténtalo de nuevo.', null];
  if (cfg.maintenanceMode) return ['La tienda está en mantenimiento. Inténtalo más tarde.', null];
  if (!cfg.checkoutEnabled) return ['Las compras no están habilitadas en este momento.', null];
  if (!cartItems().length) return ['Agrega una recarga.', 'catalogo'];
  if (!state.uidAccepted || !validUid(state.playerUid))
    return ['Escribe y verifica el UID del jugador.', 'verificacion'];
  if (!state.customerName.trim()) return ['Escribe el nombre del cliente.', 'factura'];
  if (!EMAIL_PATTERN.test(state.customerEmail.trim()))
    return ['Escribe un correo válido para el pedido.', 'factura'];
  if ($('paymentMethod').value !== METHOD)
    return ['Selecciona Mercado Pago como método de pago.', 'factura'];
  if (!$('acceptTerms').checked) return ['Debes aceptar los términos de la compra.', 'factura'];
  return null;
}

async function createOrder() {
  const missing = missingRequirement();
  if (missing) {
    toast(missing[0], 'bad');
    if (missing[1]) scrollTo(missing[1]);
    return;
  }
  if (runtime.orderBusy) return;
  runtime.orderBusy = true;
  $('payBtn').disabled = true;
  try {
    const j = await api('/api/checkout', {
      method: 'POST',
      body: {
        checkoutKey: currentCheckoutKey(),
        game: 'freefire',
        playerUid: state.playerUid,
        customerName: state.customerName.trim(),
        customerEmail: state.customerEmail.trim(),
        acceptTerms: true,
        termsVersion: state.serverConfig.termsVersion,
        expectedTotalCop: total(),
        items: cartItems().map((x) => ({ sku: x.p.id, quantity: x.qty })),
      },
    });
    if (j.accessToken) storeOrderToken(j.order.reference, j.accessToken);
    resetCheckoutKey();
    setCurrentOrder(j.order);
    startPolling();
    toast('Pedido creado. Estamos verificando el jugador.', 'good');
    scrollTo('verificacion');
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'PRICE_CHANGED' || err.code === 'PRODUCT_UNAVAILABLE')
    ) {
      await loadCatalog(state.game);
    }
    if (err instanceof ApiError && err.code === 'IDEMPOTENCY_CONFLICT') resetCheckoutKey();
    toast(errorMessage(err, 'No se pudo crear el pedido.'), 'bad');
  } finally {
    runtime.orderBusy = false;
    renderAll();
  }
}

function summaryText(order) {
  const lines = order.items.map((i) => `${i.quantity}× ${i.name} (${money(i.unitPriceCop)} c/u)`);
  const parts = [...lines];
  if (order.discountCop > 0) parts.push(`Descuento ${money(order.discountCop)}`);
  parts.push(`Subtotal ${money(order.subtotalCop)}`, `Total ${money(order.totalCop)}`);
  parts.push(
    `Región ${order.verification.region || '—'}`,
    'Pago con Mercado Pago',
    `Términos aceptados (v${order.termsVersion})`,
  );
  return parts.join(' · ');
}

/** Pantalla final antes de pagar: todo viene de la orden del servidor. */
function openConfirmation(order) {
  setText('payClient', order.customerName);
  setText('payUid', order.playerUid);
  setText('payNick', order.verification.nickname || '—');
  setText('payAmount', money(order.totalCop));
  const prep = $('paymentPrep');
  prep.className = 'payment-status ok';
  prep.querySelector('span').textContent = summaryText(order);
  $('paymentError').classList.remove('show');
  $('startPayment').disabled = false;
  setText('startPayment', 'Confirmar y pagar');
  modal('paymentModal', true);
}

/** Acción del botón principal según el estado del pedido. */
export async function preparePayment() {
  const order = state.currentOrder;
  if (!order || ['REJECTED', 'EXPIRED', 'REFUNDED'].includes(order.status)) {
    if (order) setCurrentOrder(null);
    return createOrder();
  }
  if (order.status === 'AWAITING_VERIFICATION') {
    toast(
      order.verification.status === 'VERIFIED'
        ? 'Confirma que es tu cuenta para continuar.'
        : 'Estamos verificando el jugador. Te avisaremos aquí.',
    );
    scrollTo('verificacion');
    return;
  }
  if (order.status === 'AWAITING_PAYMENT') {
    if (!order.payment.canPay) {
      toast('Los pagos no están disponibles en este momento. Tu pedido sigue guardado.', 'bad');
      return;
    }
    openConfirmation(order);
    return;
  }
  scrollTo('seguimiento');
}

/** "Confirmar y pagar": el servidor crea (o reutiliza) la preferencia y se redirige. */
export async function startPayment() {
  const order = state.currentOrder;
  if (!order || runtime.paymentBusy) return;
  runtime.paymentBusy = true;
  $('startPayment').disabled = true;
  setText('startPayment', 'Abriendo Mercado Pago…');
  try {
    const j = await api('/api/orders/' + encodeURIComponent(order.reference) + '/pay', {
      method: 'POST',
    });
    const url = new URL(j.checkoutUrl);
    // Solo https (Mercado Pago) o el propio origen (entorno de pruebas).
    if (url.protocol !== 'https:' && url.origin !== location.origin) {
      throw new ApiError('INVALID_CHECKOUT_URL', 'Respuesta de pago inválida.');
    }
    location.assign(url.toString());
  } catch (err) {
    setText(
      'paymentError',
      errorMessage(err, 'No se pudo abrir Mercado Pago. Tu pedido sigue guardado.'),
    );
    $('paymentError').classList.add('show');
    $('startPayment').disabled = false;
    setText('startPayment', 'Confirmar y pagar');
  } finally {
    runtime.paymentBusy = false;
  }
}
