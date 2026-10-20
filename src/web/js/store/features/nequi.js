import { api, errorMessage } from '../api.js';
import { $, setText } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { scrollToSection } from '../scroll.js';
import { runtime, state } from '../state.js';
import { toast } from '../ui.js';
import { setCurrentOrder } from './orders.js';

/**
 * Pago por transferencia Nequi, independiente de Mercado Pago. El navegador solo muestra lo que
 * dice el servidor (llave Bre-B o celular, titular, total y referencia del pedido) y manda el aviso
 * «Ya transferí»; nunca decide que algo está pagado: lo confirma el dueño al ver el dinero en su
 * cuenta Nequi.
 */

const orderPath = (order, suffix) => '/api/orders/' + encodeURIComponent(order.reference) + suffix;

function showNequiBox() {
  scrollToSection('factura');
  setTimeout(() => $('nequiBox')?.focus?.({ preventScroll: true }), 450);
}

/** El pedido queda con Nequi como método y se muestran las instrucciones. */
export async function startNequi(order) {
  if (!order || runtime.paymentBusy) return;
  runtime.paymentBusy = 'nequi';
  renderAll();
  try {
    const j = await api(orderPath(order, '/nequi'), { method: 'POST' });
    setCurrentOrder(j.order);
    toast('Pedido listo para pagar por Nequi. Sigue los pasos.', 'good');
    showNequiBox();
  } catch (err) {
    toast(errorMessage(err, 'Nequi no está disponible ahora. Tu pedido sigue guardado.'), 'bad');
  } finally {
    runtime.paymentBusy = false;
    renderAll();
  }
}

/**
 * Cambio explícito de Mercado Pago a Nequi: solo si el cliente confirma que no pagó en Mercado
 * Pago. Lo contrario no se ofrece: un pedido de Nequi nunca abre Mercado Pago (para pagar con
 * Mercado Pago, el cliente empieza un pedido nuevo).
 */
export async function changePaymentMethod(order) {
  if (!order || runtime.paymentBusy) return false;
  const question =
    '¿Pagar por Nequi? Hazlo solo si NO pagaste en Mercado Pago: así no pagas dos veces.';
  if (!window.confirm(question)) return false;
  runtime.paymentBusy = 'nequi';
  renderAll();
  try {
    const j = await api(orderPath(order, '/payment-method'), {
      method: 'POST',
      body: { to: 'nequi_manual', confirm: true },
    });
    setCurrentOrder(j.order);
    return true;
  } catch (err) {
    toast(errorMessage(err, 'No se pudo cambiar el método de pago.'), 'bad');
    return false;
  } finally {
    runtime.paymentBusy = false;
    renderAll();
  }
}

/** Copia la llave Bre-B que muestra el servidor (sin escribirla a mano no hay errores de tipeo). */
export async function copyNequiKey() {
  const key = state.currentOrder?.payment?.nequi?.account?.brebKey;
  if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    toast('Llave copiada.', 'good');
  } catch {
    toast('No se pudo copiar: selecciónala y cópiala a mano.', 'bad');
  }
}

/** «Ya transferí»: avisa al dueño para que verifique (no confirma ningún pago). */
export async function reportNequi(event) {
  event.preventDefault();
  const order = state.currentOrder;
  if (!order || runtime.paymentBusy) return;
  const last4 = ($('nequiLast4')?.value ?? '').trim();
  const reference = ($('nequiCustomerRef')?.value ?? '').trim();
  if (!/^\d{4}$/.test(last4)) {
    toast('Escribe los 4 últimos dígitos de la cuenta desde la que pagaste.', 'bad');
    $('nequiLast4')?.focus();
    return;
  }
  if (reference && !/^[A-Za-z0-9-]{4,40}$/.test(reference)) {
    toast('La referencia solo lleva letras, números o guiones (4 a 40).', 'bad');
    return;
  }
  runtime.paymentBusy = 'nequi';
  renderAll();
  try {
    const j = await api(orderPath(order, '/nequi/report'), {
      method: 'POST',
      body: { senderLast4: last4, ...(reference ? { reference } : {}) },
    });
    setCurrentOrder(j.order);
    toast('Aviso enviado. Verificamos la transferencia y te confirmamos aquí.', 'good');
  } catch (err) {
    toast(errorMessage(err, 'No se pudo enviar el aviso. Inténtalo de nuevo.'), 'bad');
  } finally {
    runtime.paymentBusy = false;
    renderAll();
  }
}

function statusText(nequi) {
  const transfer = nequi.transfer;
  if (!nequi.account && (!transfer || transfer.status !== 'REPORTED')) {
    return 'Nequi no está disponible ahora. Si ya transferiste, avísanos con los 4 dígitos o escríbenos con el ID del pedido.';
  }
  if (transfer?.status === 'REPORTED') {
    return `Recibimos tu aviso: estamos verificando la transferencia en nuestra cuenta Nequi (hasta ${nequi.reviewHours} h). No transfieras de nuevo.`;
  }
  if (transfer?.status === 'REJECTED') {
    return `No encontramos tu transferencia${transfer.rejectionReason ? `: ${transfer.rejectionReason}` : ''}. Revisa la llave o el número, el monto y el ID del pedido, o escríbenos.`;
  }
  return 'Solo confirmamos el pago cuando vemos el dinero en nuestra cuenta Nequi. Nunca te pediremos claves ni códigos.';
}

/** Caja de Nequi del pedido actual (oculta en pedidos de Mercado Pago o ya pagados). */
export function renderNequi() {
  const box = $('nequiBox');
  if (!box) return;
  const order = state.currentOrder;
  const nequi = order?.payment?.nequi;
  const visible = Boolean(nequi) && order.status === 'AWAITING_PAYMENT';
  box.hidden = !visible;
  if (!visible) return;
  const account = nequi.account;
  $('nequiSteps').hidden = !account;
  setText('nequiAmount', money(nequi.amountCop));
  $('nequiKeyRow').hidden = !account?.brebKey;
  setText('nequiKey', account?.brebKey ?? '—');
  $('nequiPhoneRow').hidden = !account?.phone;
  setText('nequiPhone', account?.phone ?? '—');
  setText(
    'nequiTarget',
    account?.brebKey && account?.phone
      ? 'la llave Bre-B o al celular Nequi'
      : account?.brebKey
        ? 'la llave Bre-B'
        : 'el celular Nequi',
  );
  setText('nequiRef', nequi.reference);
  $('nequiHolderWrap').hidden = !account?.holder;
  $('nequiHolderCheck').hidden = !account?.holder;
  setText('nequiHolder', account?.holder ?? '');
  setText('nequiStatus', statusText(nequi));
  const reported = nequi.transfer?.status === 'REPORTED';
  setText('nequiReportBtn', reported ? 'Corregir mi aviso' : 'Ya transferí');
  $('nequiReportBtn').disabled = Boolean(runtime.paymentBusy);
}
