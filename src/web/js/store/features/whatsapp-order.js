import { api, errorMessage } from '../api.js';
import { cartItems } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { EMAIL_PATTERN, money, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { scrollToSection } from '../scroll.js';
import { serverLabel } from '../servers.js';
import { runtime, state } from '../state.js';
import { modal, toast } from '../ui.js';
import { goToNextStep, preparePayment, submitCheckout } from './checkout.js';
import { changePaymentMethod } from './nequi.js';
import { orderChannel } from './order-channel.js';
import { showOrderSent } from './order-sent.js';
import { isFinalOrderStatus, setCurrentOrder } from './orders.js';
import { chosenPayMeans } from './pay-means.js';

/**
 * Envío del pedido desde la tienda (ORDER_CHANNEL `whatsapp` o `ambos`). Pedido del dueño,
 * 2026-11-18: «que el cliente no tenga que entrar a WhatsApp y enviar manualmente; que solo
 * mediante mi tienda me llegue el pedido» y, al cliente, una pestaña flotante «Compra exitosa»
 * con un mensaje de espera (order-sent.js).
 *
 * Con Nequi: «Revisar, pagar y enviar» crea el pedido real ANTES de mostrar la cuenta (así nadie
 * paga un pedido que no quedó guardado), el cliente transfiere, escribe los 4 últimos dígitos de su
 * cuenta y pulsa «Confirmar pago y enviar». Eso es el aviso «Ya transferí» de siempre: el pedido queda en el
 * panel y en la hoja del dueño, y el servidor le escribe a su WhatsApp (CallMeBot, si está
 * configurado). Con tarjeta, PSE, Efecty o saldo: el pago en línea de siempre (Mercado Pago);
 * al confirmarse el pago, el pedido también le llega al dueño.
 *
 * El navegador nunca decide que algo está pagado: «Compra exitosa» dice que el pedido llegó a la
 * tienda; el pago lo confirma el dueño al ver la transferencia en su app Nequi.
 */

const SHORT_PAY_MEANS = {
  tarjeta: 'Tarjeta (crédito o débito)',
  pse: 'PSE',
  efecty: 'Efecty',
  saldo: 'Saldo de Mercado Pago',
  nequi_manual: 'Nequi',
};

/** Ayuda de «Elige cómo pagar» cuando la tienda solo recibe pedidos con este botón. */
const PAY_HINTS = {
  none: 'Elige cómo pagar. Con Nequi te mostramos la cuenta y el total exacto antes de enviar tu pedido; con tarjeta, PSE, Efecty o saldo pagas en línea con Mercado Pago.',
  nequiOnly:
    'Elige Nequi: te mostramos la cuenta y el total exacto antes de enviar tu pedido, y nos llega al instante.',
  transfer:
    'Al revisar tu pedido verás la cuenta Nequi y el total exacto: transfieres, nos informas el pago y tu pedido nos llega al instante.',
  link: 'Pagas en línea con Mercado Pago. Cuando se confirma el pago, tu pedido nos llega solo.',
};

const isDemo = () => state.serverConfig?.demo === true;
const nequiOn = () => state.serverConfig?.paymentMethods?.nequiManual === true;
const orderPath = (order, suffix) => '/api/orders/' + encodeURIComponent(order.reference) + suffix;

/** `transfer`: Nequi (el cliente paga antes de enviar); `link`: pago en línea con Mercado Pago. */
function payKind(means) {
  if (!means) return null;
  return means === 'nequi_manual' && nequiOn() ? 'transfer' : 'link';
}

/** Lo que falta para revisar el pedido (mismas reglas que «Pagar»). */
function missingForOrder() {
  const cfg = state.serverConfig;
  if (!cfg) return ['Sin conexión con la tienda. Inténtalo de nuevo.', false];
  if (cfg.maintenanceMode) return ['La tienda está en mantenimiento. Inténtalo más tarde.', false];
  if (!cfg.checkoutEnabled) return ['Las compras no están habilitadas en este momento.', false];
  const items = cartItems();
  if (!items.length) return ['Agrega una recarga.', true];
  const max = cfg.limits?.maxOrderTotalCop;
  if (max && items.reduce((acc, x) => acc + x.line, 0) > max)
    return [`El pedido supera el máximo de ${money(max)} por pedido.`, false];
  if (!state.uidAccepted && state.playerLookup?.uid === state.playerUid)
    return ['Confirma el jugador: pulsa "Sí, es mi cuenta".', true];
  if (!state.uidAccepted && $('playerUidConfirm'))
    return ['Confirma tu ID: escríbelo otra vez y pulsa "Sí, es mi ID".', true];
  if (!state.uidAccepted || !validUid(state.playerUid))
    return ['Escribe y verifica el UID del jugador.', true];
  if (!state.customerName.trim()) return ['Escribe el nombre del cliente.', true];
  if (!EMAIL_PATTERN.test(state.customerEmail.trim()))
    return ['Escribe un correo válido para el pedido.', true];
  if (!chosenPayMeans()) return ['Elige cómo pagar.', true];
  if (!$('acceptTerms')?.checked) return ['Debes aceptar los términos de la compra.', true];
  return null;
}

/**
 * Pedido real listo para pagar por Nequi: el que ya está abierto (si espera pago) o uno nuevo.
 * Devuelve null si no se puede seguir (el cliente ya vio por qué).
 */
async function nequiOrder() {
  let order = state.currentOrder;
  if (order && !isFinalOrderStatus(order.status) && order.status !== 'AWAITING_PAYMENT') {
    if (order.status === 'AWAITING_VERIFICATION') {
      toast('Estamos verificando el jugador. Te avisamos aquí para que pagues.');
      scrollToSection('verificacion');
    } else {
      toast('Este pedido ya está en curso. Para otra recarga, pulsa «Nuevo pedido».');
      scrollToSection('seguimiento');
    }
    return null;
  }
  if (!order || isFinalOrderStatus(order.status)) {
    if (order) setCurrentOrder(null);
    order = await submitCheckout();
    if (!order) return null;
    if (order.status === 'AWAITING_VERIFICATION') {
      toast('Pedido creado. Estamos verificando el jugador.', 'good');
      scrollToSection('verificacion');
      return null;
    }
  }
  if (order.payment?.method === 'mercadopago') {
    // Pedido que ya iba por Mercado Pago: cambia a Nequi solo si el cliente confirma.
    if (!(await changePaymentMethod(order))) return null;
    order = state.currentOrder;
  }
  if (order.payment?.method !== 'nequi_manual') {
    runtime.paymentBusy = 'nequi';
    renderAll();
    try {
      const j = await api(orderPath(order, '/nequi'), { method: 'POST' });
      setCurrentOrder(j.order);
      order = j.order;
    } catch (err) {
      toast(errorMessage(err, 'Nequi no está disponible ahora. Tu pedido sigue guardado.'), 'bad');
      return null;
    } finally {
      runtime.paymentBusy = false;
      renderAll();
    }
  }
  return order;
}

/** Resumen del pedido tal como lo guardó el servidor (precios, descuentos y total reales). */
function summaryHtml(order) {
  const facts = [
    ['Cliente', order.customerName],
    ['Correo', order.customerEmail],
    ['ID Free Fire', order.playerUid],
    ['Servidor', serverLabel(order.playerServer ?? state.playerServer) || 'Sin indicar'],
    ['Pago', SHORT_PAY_MEANS.nequi_manual],
  ]
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  const lines = order.items
    .map((item) => {
      const off = Math.max(0, (item.listPriceCop - item.unitPriceCop) * item.quantity);
      return `<li><div class="wa-line-name"><b>${esc(item.name)}</b></div><div class="wa-line-math"><span>${item.quantity} × ${esc(money(item.unitPriceCop))}</span>${
        item.listPriceCop > item.unitPriceCop ? `<s>${esc(money(item.listPriceCop))}</s>` : ''
      }<strong>${esc(money(item.lineTotalCop))}</strong></div>${
        off > 0 ? `<small class="wa-line-off">Descuento promo −${esc(money(off))}</small>` : ''
      }</li>`;
    })
    .join('');
  const totals = [
    ...(order.discountCop > 0
      ? [
          ['Subtotal', money(order.subtotalCop), ''],
          ['Descuentos', '−' + money(order.discountCop), 'wa-off'],
        ]
      : []),
    ['Total', money(order.totalCop), 'wa-total'],
  ]
    .map(
      ([k, v, cls]) =>
        `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`,
    )
    .join('');
  return `<div class="wa-ref"><span>Pedido</span><b translate="no">${esc(order.reference)}</b></div><dl class="wa-facts">${facts}</dl><ul class="wa-lines" aria-label="Productos del pedido">${lines}</ul><dl class="wa-totals">${totals}</dl>`;
}

/** Instrucciones de pago con la cuenta que el servidor muestra para ESTE pedido. */
function payInfoHtml(order) {
  const nequi = order.payment?.nequi;
  const account = nequi?.account;
  if (!account || (!account.brebKey && !account.phone)) {
    return '<p class="wa-pay-lead">Nequi no está disponible ahora. Tu pedido quedó guardado: inténtalo más tarde o escríbenos por soporte.</p>';
  }
  const rows = [
    ['Total exacto', `<strong>${esc(money(nequi.amountCop ?? order.totalCop))}</strong>`],
    ...(account.brebKey
      ? [
          [
            'Llave Bre-B',
            `<strong translate="no">${esc(account.brebKey)}</strong><button class="nequi-copy" type="button" data-copy="${esc(account.brebKey)}">Copiar</button>`,
          ],
        ]
      : []),
    ...(account.phone
      ? [['Celular Nequi', `<strong translate="no">${esc(account.phone)}</strong>`]]
      : []),
    ...(account.holder ? [['Titular', `<strong>${esc(account.holder)}</strong>`]] : []),
    [
      'Referencia',
      `<strong translate="no">${esc(order.reference)}</strong><button class="nequi-copy" type="button" data-copy="${esc(order.reference)}">Copiar</button>`,
    ],
  ]
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join('');
  return `<ol class="wa-pay-steps"><li>Desde tu app Nequi o la de tu banco, envía el <b>total exacto</b> a la cuenta de abajo${account.holder ? ' (revisa que el titular coincida)' : ''}.</li><li>En el mensaje de la transferencia escribe la <b>referencia</b> de tu pedido.</li><li>Escribe los 4 últimos dígitos de tu cuenta, marca «Ya hice la transferencia» y pulsa «Confirmar pago y enviar».</li></ol><dl class="nequi-pay wa-pay-data">${rows}</dl>${
    isDemo()
      ? '<p class="wa-pay-demo"><b>DEMO:</b> cuenta de ejemplo. No transfieras dinero real.</p>'
      : ''
  }`;
}

function paymentFields() {
  return {
    last4: String($('waPayLast4')?.value || '').replace(/\D/g, ''),
    reference: String($('waPayRef')?.value || '').trim(),
    paid: Boolean($('waPayDone')?.checked),
  };
}

/** Lo que falta del pago antes de enviar (el cliente ya transfirió). */
function missingPayment(fields) {
  if (fields.last4.length !== 4)
    return ['Escribe los 4 últimos dígitos de la cuenta desde la que pagaste.', 'waPayLast4'];
  if (fields.reference && !/^[A-Za-z0-9-]{4,40}$/.test(fields.reference))
    return ['La referencia solo lleva letras, números o guiones (4 a 40).', 'waPayRef'];
  if (!fields.paid) return ['Marca «Ya hice la transferencia» cuando hayas pagado.', 'waPayDone'];
  return null;
}

/** Estado del botón «Confirmar pago y enviar» según lo que el cliente informó del pago. */
export function refreshWhatsAppSend() {
  if ($('waOrderModal')?.hidden !== false) return;
  const missing = missingPayment(paymentFields());
  const send = $('waOrderSend');
  send.classList.toggle('is-blocked', Boolean(missing));
  send.setAttribute('aria-disabled', missing || runtime.paymentBusy ? 'true' : 'false');
  setText(
    'waOrderStatus',
    missing
      ? 'Para enviar falta: ' + missing[0].charAt(0).toLowerCase() + missing[0].slice(1)
      : 'Al pulsar «Confirmar pago y enviar», tu pedido y tu pago nos llegan al instante.',
  );
}

/** Pedido al que pertenecen los datos del pago escritos en el formulario. */
let fieldsFor = '';

/** «Revisar, pagar y enviar»: valida y sigue el camino del medio de pago elegido. */
export async function openWhatsAppReview() {
  const missing = missingForOrder();
  if (missing) {
    toast(missing[0], 'bad');
    if (missing[1]) goToNextStep();
    return;
  }
  if (runtime.orderBusy || runtime.paymentBusy) return;
  // Tarjeta, PSE, Efecty o saldo: el pago en línea de siempre (Mercado Pago confirma solo).
  if (payKind(chosenPayMeans()) !== 'transfer') {
    await preparePayment();
    return;
  }
  const order = await nequiOrder();
  if (!order) return;
  if (order.reference !== fieldsFor) {
    // Pedido distinto: los datos del pago de otro pedido no sirven.
    fieldsFor = order.reference;
    for (const id of ['waPayLast4', 'waPayRef']) if ($(id)) $(id).value = '';
    if ($('waPayDone')) $('waPayDone').checked = false;
  }
  $('waOrderSummary').innerHTML = summaryHtml(order);
  $('waPayInfo').innerHTML = payInfoHtml(order);
  const reported = order.payment?.nequi?.transfer?.status === 'REPORTED';
  setText('waOrderTitle', reported ? 'Ya enviaste este pedido' : 'Revisa, paga y envía tu pedido');
  setText('waOrderSendLabel', reported ? 'Corregir y reenviar' : 'Confirmar pago y enviar');
  $('waDemoBadge').hidden = !isDemo();
  $('waDemoNote').hidden = !isDemo();
  modal('waOrderModal', true);
  refreshWhatsAppSend();
}

/** «Confirmar pago y enviar»: informa la transferencia; el pedido le llega al dueño solo. */
export async function onWhatsAppSend() {
  const order = state.currentOrder;
  if (!order || runtime.paymentBusy) return;
  const fields = paymentFields();
  const missing = missingPayment(fields);
  if (missing) {
    toast(missing[0], 'bad');
    $(missing[1])?.focus();
    return;
  }
  runtime.paymentBusy = 'nequi';
  const send = $('waOrderSend');
  const label = $('waOrderSendLabel')?.textContent || 'Confirmar pago y enviar';
  send.setAttribute('aria-disabled', 'true');
  send.classList.add('is-busy');
  setText('waOrderSendLabel', 'Enviando…');
  try {
    const j = await api(orderPath(order, '/nequi/report'), {
      method: 'POST',
      body: {
        senderLast4: fields.last4,
        ...(fields.reference ? { reference: fields.reference } : {}),
      },
    });
    setCurrentOrder(j.order);
    modal('waOrderModal', false);
    showOrderSent(j.order);
  } catch (err) {
    toast(errorMessage(err, 'No se pudo enviar tu pedido. Inténtalo de nuevo.'), 'bad');
    setText('waOrderSendLabel', label);
  } finally {
    runtime.paymentBusy = false;
    send.classList.remove('is-busy');
    renderAll();
    refreshWhatsAppSend();
  }
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, 'good');
  } catch {
    toast('No se pudo copiar: selecciona el texto y cópialo.', 'bad');
  }
}

/** Botones «Copiar» de la llave y la referencia (dentro de las instrucciones de pago). */
export function onPayInfoClick(event) {
  const button = event.target.closest?.('[data-copy]');
  if (button) void copyText(button.dataset.copy || '', 'Copiado.');
}

/** Muestra el envío desde la tienda según el canal; el pago en línea no se borra, solo se oculta. */
export function renderWhatsAppOrder() {
  const channel = orderChannel(state.serverConfig);
  const box = $('waOrderBox');
  if (!box) return;
  const on = channel !== 'checkout';
  const onlyThisButton = channel === 'whatsapp';
  box.hidden = !on;
  $('payBtn').hidden = onlyThisButton;
  $('paymentState').hidden = onlyThisButton;
  document.body.classList.toggle('order-whatsapp', on);
  if (!on) return;
  $('waOrderDemo').hidden = !isDemo();
  if (onlyThisButton) {
    const mpOn = state.serverConfig?.paymentMethods?.mercadopago !== false;
    setText('payMeansHint', PAY_HINTS[payKind(chosenPayMeans()) || (mpOn ? 'none' : 'nequiOnly')]);
  }
  const missing = missingForOrder();
  const ready = !missing;
  box.classList.toggle('is-ready', ready);
  setText(
    'waOrderHint',
    !ready
      ? 'Para continuar falta: ' + missing[0].charAt(0).toLowerCase() + missing[0].slice(1)
      : payKind(chosenPayMeans()) === 'transfer'
        ? 'Todo listo: revisa tu pedido, paga por Nequi y envíalo. Nos llega al instante.'
        : 'Todo listo: pagas en línea con Mercado Pago y tu pedido nos llega solo.',
  );
}
