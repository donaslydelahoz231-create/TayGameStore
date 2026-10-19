import { api, ApiError, errorMessage } from '../api.js';
import { scrollToSection } from '../scroll.js';
import { uuid } from '../compat.js';
import { cartItems, total } from '../cart-model.js';
import { $ } from '../dom.js';
import { EMAIL_PATTERN, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { storeOrderToken } from '../storage.js';
import { toast } from '../ui.js';
import { loadCatalog } from './catalog.js';
import { chosenMethod, chosenMpMeans, chosenPayMeans } from './pay-means.js';
import { changePaymentMethod, startNequi } from './nequi.js';
import { lookupExpired, verifyPlayer } from './player.js';
import { setCurrentOrder, startPolling } from './orders.js';

// Checkout: el pedido sigue SOLO el flujo del método elegido.
//   1. "Pagar": el servidor recalcula todo y crea la orden (idempotente por checkoutKey).
//   2. Mercado Pago: si el cliente ya confirmó su ID, en el mismo paso el servidor crea la
//      preferencia y se redirige a Mercado Pago (un solo botón, como en las tiendas de recargas).
//      Nequi: el pedido queda con Nequi y se muestran el celular, el total y la referencia; el
//      cliente transfiere desde su app y avisa. Nequi nunca pasa por Mercado Pago.
//   3. Con verificación del equipo, el cliente confirma su cuenta y "Pagar" lleva al cobro.
// El navegador nunca decide que algo está pagado: lo confirma el servidor con el proveedor del
// pedido (Mercado Pago, o el dueño al ver la transferencia Nequi).

function newCheckoutKey() {
  runtime.checkoutKey = uuid();
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
  if (!state.uidAccepted && state.playerLookup?.uid === state.playerUid)
    return ['Confirma el jugador: pulsa "Sí, es mi cuenta".', 'verificacion'];
  if (!state.uidAccepted && $('playerUidConfirm'))
    return ['Confirma tu ID: escríbelo otra vez y pulsa "Sí, es mi ID".', 'verificacion'];
  if (!state.uidAccepted || !validUid(state.playerUid))
    return ['Escribe y verifica el UID del jugador.', 'verificacion'];
  if (!state.customerName.trim()) return ['Escribe el nombre del cliente.', 'factura'];
  if (!EMAIL_PATTERN.test(state.customerEmail.trim()))
    return ['Escribe un correo válido para el pedido.', 'factura'];
  if (!chosenPayMeans()) return ['Elige cómo pagar.', 'factura'];
  if (!$('acceptTerms').checked) return ['Debes aceptar los términos de la compra.', 'factura'];
  return null;
}

/** Consulta instantánea confirmada por el cliente para este UID (si la hay). */
function confirmedLookup() {
  const found = state.playerLookup;
  if (found?.confirmed && found.uid === state.playerUid) {
    return { playerLookup: { ref: found.ref, nickname: found.nickname } };
  }
  // ID escrito dos veces y confirmado por el cliente (modo `customer`).
  if (state.uidConfirmed && state.uidConfirmed === state.playerUid) {
    return { confirmedPlayerUid: state.uidConfirmed };
  }
  return {};
}

async function createOrder() {
  const missing = missingRequirement();
  if (missing) {
    toast(missing[0], 'bad');
    if (missing[1]) scrollToSection(missing[1]);
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
        playerServer: state.playerServer,
        customerName: state.customerName.trim(),
        customerEmail: state.customerEmail.trim(),
        acceptTerms: true,
        termsVersion: state.serverConfig.termsVersion,
        expectedTotalCop: total(),
        items: cartItems().map((x) => ({ sku: x.p.id, quantity: x.qty })),
        ...confirmedLookup(),
      },
    });
    if (j.accessToken) storeOrderToken(j.order.reference, j.accessToken);
    resetCheckoutKey();
    setCurrentOrder(j.order);
    startPolling();
    if (j.order.status === 'AWAITING_PAYMENT' && chosenMethod() === 'nequi_manual') {
      runtime.orderBusy = false;
      await startNequi(j.order);
    } else if (j.order.status === 'AWAITING_PAYMENT' && j.order.payment?.canPay) {
      // Como en las tiendas de recargas: un solo paso, del pedido directo al cobro.
      toast('Pedido creado. Te llevamos a Mercado Pago para pagar…', 'good');
      runtime.orderBusy = false;
      await goToCheckout(j.order);
    } else if (j.order.status === 'AWAITING_PAYMENT') {
      toast('Pedido guardado. Los pagos no están disponibles ahora; inténtalo más tarde.', 'bad');
      scrollToSection('factura');
    } else {
      toast('Pedido creado. Estamos verificando el jugador.', 'good');
      scrollToSection('verificacion');
    }
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.code === 'PRICE_CHANGED' || err.code === 'PRODUCT_UNAVAILABLE')
    ) {
      await loadCatalog(state.game);
    }
    if (err instanceof ApiError && err.code === 'IDEMPOTENCY_CONFLICT') resetCheckoutKey();
    if (err instanceof ApiError && err.code === 'PLAYER_CONFIRMATION_REQUIRED') {
      // El servidor exige la confirmación (p. ej. cambió de modo): se vuelve a pedir.
      verifyPlayer();
      scrollToSection('verificacion');
    }
    if (err instanceof ApiError && err.code === 'PLAYER_LOOKUP_EXPIRED') {
      lookupExpired();
      scrollToSection('verificacion');
    }
    toast(errorMessage(err, 'No se pudo crear el pedido.'), 'bad');
  } finally {
    runtime.orderBusy = false;
    renderAll();
  }
}

/**
 * "Revisar factura" (carrito lateral y panel del catálogo): lleva al siguiente paso que falta
 * y le da el foco, en lugar de solo desplazar la página.
 */
export function goToNextStep() {
  const order = state.currentOrder;
  if (order && !['REJECTED', 'EXPIRED', 'REFUNDED'].includes(order.status)) {
    scrollToSection(order.status === 'AWAITING_VERIFICATION' ? 'verificacion' : 'factura');
    return;
  }
  const steps = [
    ['verificacion', 'playerUid', () => state.uidAccepted],
    ['factura', 'customerName', () => state.customerName.trim().length > 0],
    ['factura', 'customerEmail', () => EMAIL_PATTERN.test(state.customerEmail.trim())],
    ['factura', 'payMeansCard', () => chosenPayMeans() !== null],
    ['factura', 'acceptTerms', () => $('acceptTerms').checked],
  ];
  const missing = steps.find(([, , done]) => !done());
  const [section, field] = missing ?? ['factura', 'payBtn'];
  scrollToSection(section);
  setTimeout(() => $(field)?.focus({ preventScroll: true }), 450);
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
    scrollToSection('verificacion');
    return;
  }
  if (order.status === 'AWAITING_PAYMENT') {
    const method = order.payment.method;
    const wanted = chosenMethod();
    if (method === 'nequi_manual') {
      // Pedido de Nequi: siempre sigue con Nequi y nunca abre Mercado Pago (para pagar con
      // Mercado Pago, el cliente empieza un pedido nuevo).
      scrollToSection('factura');
      setTimeout(() => $('nequiBox')?.focus({ preventScroll: true }), 450);
      return;
    }
    if (wanted === 'nequi_manual') {
      if (method === 'mercadopago' && !(await changePaymentMethod(order))) return;
      await startNequi(state.currentOrder);
      return;
    }
    if (!order.payment.canPay) {
      toast('Los pagos no están disponibles en este momento. Tu pedido sigue guardado.', 'bad');
      return;
    }
    await goToCheckout(order);
    return;
  }
  scrollToSection('seguimiento');
}

/** El servidor crea (o reutiliza) la preferencia de Mercado Pago y se redirige al cobro. */
async function goToCheckout(order) {
  if (!order || runtime.paymentBusy) return;
  runtime.paymentBusy = true;
  renderAll();
  try {
    // El medio elegido hace que Mercado Pago abra directo ese formulario (tarjeta, PSE…).
    const payMeans = chosenMpMeans();
    const j = await api('/api/orders/' + encodeURIComponent(order.reference) + '/pay', {
      method: 'POST',
      ...(payMeans ? { body: { payMeans } } : {}),
    });
    const url = new URL(j.checkoutUrl);
    // Solo https (Mercado Pago) o el propio origen (entorno de pruebas).
    if (url.protocol !== 'https:' && url.origin !== location.origin) {
      throw new ApiError('INVALID_CHECKOUT_URL', 'Respuesta de pago inválida.');
    }
    location.assign(url.toString());
  } catch (err) {
    toast(errorMessage(err, 'No se pudo abrir Mercado Pago. Tu pedido sigue guardado.'), 'bad');
    runtime.paymentBusy = false;
    renderAll();
  }
}
