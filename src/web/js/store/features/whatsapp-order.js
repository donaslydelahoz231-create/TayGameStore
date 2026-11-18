import { cartItems } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { EMAIL_PATTERN, money, validUid } from '../format.js';
import { serverLabel } from '../servers.js';
import { state } from '../state.js';
import { modal, toast } from '../ui.js';
import { goToNextStep } from './checkout.js';
import { PAY_MEANS, chosenPayMeans } from './pay-means.js';
import {
  orderChannel,
  orderReference,
  orderSummary,
  whatsappDigits,
  whatsappMessage,
  whatsappUrl,
} from './whatsapp-message.js';

/**
 * Pedido por WhatsApp (ORDER_CHANNEL `whatsapp` o `ambos`). El cliente:
 *   1. elige paquetes y completa los datos que pide la tienda (ID confirmado, nombre, correo,
 *      cómo pagar y términos);
 *   2. revisa el pedido y paga: con Nequi ve la cuenta y el total exacto, transfiere e informa el
 *      pago (4 últimos dígitos y referencia); con tarjeta, PSE, Efecty o saldo pide el enlace de pago;
 *   3. abre WhatsApp con el pedido y el pago en un mensaje hacia el número oficial
 *      (SUPPORT_WHATSAPP) y lo envía él mismo.
 *
 * Aislado de los pedidos reales: no llama a /api/checkout ni a /pay, no crea pedidos, no cobra ni
 * confirma pagos (el dueño verifica el movimiento antes de entregar). Los datos de la cuenta Nequi
 * llegan en /api/config → `orderPayment.nequi`; sin ellos, se piden por WhatsApp. Con la
 * demostración (`demo` en /api/config) todo dice DEMO y la cuenta es de ejemplo.
 */

const SHORT_PAY_MEANS = {
  tarjeta: 'Tarjeta (crédito o débito)',
  pse: 'PSE',
  efecty: 'Efecty',
  saldo: 'Saldo de Mercado Pago',
  nequi_manual: 'Nequi',
};

/** Ayuda de «Elige cómo pagar» cuando la tienda solo recibe pedidos por WhatsApp. */
const WA_PAY_HINTS = {
  none: 'Elige cómo pagar. Con Nequi te mostramos la cuenta y el total exacto antes de enviar tu pedido; con tarjeta, PSE, Efecty o saldo te enviamos el enlace de pago seguro por WhatsApp.',
  transfer:
    'Al revisar tu pedido verás la cuenta Nequi y el total exacto: transfieres y nos informas el pago en el mismo paso, antes de enviarlo por WhatsApp.',
  link: 'Envías tu pedido por WhatsApp y te respondemos con el enlace de pago seguro. En esta página no se cobra nada.',
};

const isDemo = () => state.serverConfig?.demo === true;
const storeNumber = () => whatsappDigits(state.serverConfig?.support?.whatsapp);

/** Cuenta Nequi para transferir (solo si la tienda la publica para este canal). */
function nequiAccount() {
  const n = state.serverConfig?.orderPayment?.nequi;
  if (!n || (!n.brebKey && !n.phone)) return null;
  return { brebKey: n.brebKey || '', phone: n.phone || '', holder: n.holder || '' };
}

/** `transfer`: el cliente paga antes de enviar (Nequi con cuenta publicada); `link`: se le envía. */
function payKind(means) {
  if (!means) return null;
  return means === 'nequi_manual' && nequiAccount() ? 'transfer' : 'link';
}

/** Lo que falta para revisar el pedido (mismas reglas que el pago en línea). */
function missingForWhatsApp() {
  const cfg = state.serverConfig;
  if (!cfg) return ['Sin conexión con la tienda. Inténtalo de nuevo.', false];
  if (cfg.maintenanceMode) return ['La tienda está en mantenimiento. Inténtalo más tarde.', false];
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

/** La referencia se mantiene mientras el pedido no cambie (reabrir o informar el pago no la cambia). */
let lastSignature = '';
let lastReference = '';

function paymentFields() {
  return {
    last4: String($('waPayLast4')?.value || '').replace(/\D/g, ''),
    reference: String($('waPayRef')?.value || ''),
    paid: Boolean($('waPayDone')?.checked),
  };
}

function currentSummary() {
  const items = cartItems();
  const means = chosenPayMeans();
  const kind = payKind(means);
  const label = means ? SHORT_PAY_MEANS[means] || PAY_MEANS[means] : null;
  const base = {
    items,
    customer: { name: state.customerName, email: state.customerEmail },
    player: { uid: state.playerUid, server: serverLabel(state.playerServer) },
  };
  const signature = JSON.stringify([
    items.map((x) => [x.p.id, x.qty, x.p.price]),
    base.customer,
    base.player,
    label,
    isDemo(),
  ]);
  if (signature !== lastSignature || !lastReference) {
    lastSignature = signature;
    lastReference = orderReference(isDemo(), (bytes) => crypto.getRandomValues(bytes));
    // Pedido distinto: los datos del pago de antes no sirven.
    for (const id of ['waPayLast4', 'waPayRef']) if ($(id)) $(id).value = '';
    if ($('waPayDone')) $('waPayDone').checked = false;
  }
  return orderSummary({
    ...base,
    payment: { kind, label, ...(kind === 'transfer' ? paymentFields() : {}) },
    reference: lastReference,
    demo: isDemo(),
    createdAt: new Date(),
  });
}

function summaryHtml(summary) {
  const facts = [
    ['Cliente', summary.customer.name],
    ['Correo', summary.customer.email],
    ['ID Free Fire', summary.player.uid],
    ['Servidor', summary.player.server || 'Sin indicar'],
    ['Pago', summary.payment.label || 'Por acordar por WhatsApp'],
  ]
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  const lines = summary.lines
    .map(
      (line) =>
        `<li><div class="wa-line-name"><b>${esc(line.name)}</b><small>${esc(
          line.diamonds.toLocaleString('es-CO'),
        )} 💎</small></div><div class="wa-line-math"><span>${line.qty} × ${esc(money(line.unitPrice))}</span>${
          line.unitDiscount > 0 ? `<s>${esc(money(line.unitList))}</s>` : ''
        }<strong>${esc(money(line.total))}</strong></div>${
          line.discount > 0
            ? `<small class="wa-line-off">Descuento promo −${esc(money(line.discount))}</small>`
            : ''
        }</li>`,
    )
    .join('');
  const totals = [
    ...(summary.discount > 0
      ? [
          ['Subtotal', money(summary.subtotal), ''],
          ['Descuentos', '−' + money(summary.discount), 'wa-off'],
        ]
      : []),
    ['Total', money(summary.total), 'wa-total'],
  ]
    .map(
      ([k, v, cls]) =>
        `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`,
    )
    .join('');
  return `<div class="wa-ref"><span>Referencia</span><b translate="no">${esc(summary.reference)}</b></div><dl class="wa-facts">${facts}</dl><ul class="wa-lines" aria-label="Productos del pedido">${lines}</ul><dl class="wa-totals">${totals}</dl>`;
}

/** Instrucciones de pago según el medio elegido. */
function payInfoHtml(summary) {
  const pay = summary.payment;
  if (pay.kind === 'transfer') {
    const n = nequiAccount();
    const rows = [
      ['Total exacto', `<strong>${esc(money(summary.total))}</strong>`],
      ...(n.brebKey
        ? [
            [
              'Llave Bre-B',
              `<strong translate="no">${esc(n.brebKey)}</strong><button class="nequi-copy" type="button" data-copy="${esc(n.brebKey)}">Copiar</button>`,
            ],
          ]
        : []),
      ...(n.phone ? [['Celular Nequi', `<strong translate="no">${esc(n.phone)}</strong>`]] : []),
      ...(n.holder ? [['Titular', `<strong>${esc(n.holder)}</strong>`]] : []),
      [
        'Referencia del pedido',
        `<strong translate="no">${esc(summary.reference)}</strong><button class="nequi-copy" type="button" data-copy="${esc(summary.reference)}">Copiar</button>`,
      ],
    ]
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
      .join('');
    return `<ol class="wa-pay-steps"><li>Desde tu app Nequi o la de tu banco, envía el <b>total exacto</b> a la cuenta de abajo${n.holder ? ' (revisa que el titular coincida)' : ''}.</li><li>En el mensaje de la transferencia escribe la <b>referencia del pedido</b>.</li><li>Escribe los 4 últimos dígitos de tu cuenta, marca «Ya hice la transferencia» y envía tu pedido por WhatsApp.</li></ol><dl class="nequi-pay wa-pay-data">${rows}</dl>${
      summary.demo
        ? '<p class="wa-pay-demo"><b>DEMO:</b> cuenta de ejemplo. No transfieras dinero real.</p>'
        : ''
    }`;
  }
  if (pay.kind === 'link') {
    return `<p class="wa-pay-lead">Elegiste <b>${esc(pay.label)}</b>. Envía tu pedido por WhatsApp y te respondemos con ${
      pay.label === 'Nequi' ? 'los datos para pagar' : 'el enlace de pago seguro'
    }. En esta página no se cobra nada.</p>`;
  }
  return '<p class="wa-pay-lead">Elige cómo pagar en tu pedido.</p>';
}

/** Lo que falta del pago antes de enviar (solo con transferencia: el cliente ya pagó). */
function missingPayment(summary) {
  if (summary.payment.kind !== 'transfer') return null;
  if (summary.payment.last4.length !== 4)
    return ['Escribe los 4 últimos dígitos de la cuenta desde la que pagaste.', 'waPayLast4'];
  if (!summary.payment.paid)
    return ['Marca «Ya hice la transferencia» cuando hayas pagado.', 'waPayDone'];
  return null;
}

/** Recalcula el mensaje y el enlace con lo que el cliente informa del pago. */
export function refreshWhatsAppSend() {
  if ($('waOrderModal')?.hidden !== false) return;
  const summary = currentSummary();
  const message = whatsappMessage(summary);
  const url = whatsappUrl(storeNumber(), message);
  setText('waOrderMessage', message);
  const missing = missingPayment(summary);
  const send = $('waOrderSend');
  send.href = url || '#';
  send.hidden = !url;
  send.classList.toggle('is-blocked', Boolean(missing));
  send.setAttribute('aria-disabled', missing ? 'true' : 'false');
  setText(
    'waOrderSendLabel',
    summary.payment.kind === 'transfer'
      ? 'Enviar pedido y pago por WhatsApp'
      : 'Enviar pedido por WhatsApp',
  );
  $('waNoNumber').hidden = Boolean(url);
  // Lo que falta del pago se dice siempre (también sin número), para que el paso se entienda.
  setText(
    'waOrderStatus',
    missing
      ? 'Para enviar falta: ' + missing[0].charAt(0).toLowerCase() + missing[0].slice(1)
      : url
        ? 'Al pulsar el botón se abre WhatsApp con tu pedido listo: revísalo y envíalo tú.'
        : '',
  );
}

/** «Revisar y pagar»: valida, arma el resumen y las instrucciones de pago. */
export function openWhatsAppReview() {
  const missing = missingForWhatsApp();
  if (missing) {
    toast(missing[0], 'bad');
    if (missing[1]) goToNextStep();
    return;
  }
  const summary = currentSummary();
  $('waOrderSummary').innerHTML = summaryHtml(summary);
  $('waPayInfo').innerHTML = payInfoHtml(summary);
  $('waPayFields').hidden = summary.payment.kind !== 'transfer';
  $('waDemoBadge').hidden = !summary.demo;
  $('waDemoNote').hidden = !summary.demo;
  modal('waOrderModal', true);
  refreshWhatsAppSend();
}

/** Botón de envío: sin el pago informado no abre WhatsApp; nada se envía solo. */
export function onWhatsAppSend(event) {
  const summary = currentSummary();
  const missing = missingPayment(summary);
  if (missing) {
    event.preventDefault();
    toast(missing[0], 'bad');
    $(missing[1])?.focus();
    return;
  }
  setText(
    'waOrderStatus',
    'Se abrió WhatsApp con tu pedido. Revisa el mensaje y pulsa enviar en WhatsApp.',
  );
  toast('Se abrió WhatsApp: revisa el mensaje y envíalo.', 'good');
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, 'good');
  } catch {
    toast('No se pudo copiar: selecciona el texto y cópialo.', 'bad');
  }
}

export function copyWhatsAppMessage() {
  return copyText($('waOrderMessage')?.textContent || '', 'Mensaje copiado.');
}

/** Botones «Copiar» de la llave y la referencia (dentro de las instrucciones de pago). */
export function onPayInfoClick(event) {
  const button = event.target.closest?.('[data-copy]');
  if (button) void copyText(button.dataset.copy || '', 'Copiado.');
}

/** Muestra el pedido por WhatsApp según el canal; el pago en línea no se borra, solo se oculta. */
export function renderWhatsAppOrder() {
  const channel = orderChannel(state.serverConfig);
  const box = $('waOrderBox');
  if (!box) return;
  const on = channel !== 'checkout';
  const onlyWhatsApp = channel === 'whatsapp';
  box.hidden = !on;
  $('payBtn').hidden = onlyWhatsApp;
  $('paymentState').hidden = onlyWhatsApp;
  document.body.classList.toggle('order-whatsapp', on);
  if (!on) return;
  $('waOrderDemo').hidden = !isDemo();
  if (onlyWhatsApp) {
    const kind = payKind(chosenPayMeans());
    setText('payMeansHint', WA_PAY_HINTS[kind || 'none']);
  }
  const missing = missingForWhatsApp();
  const ready = !missing;
  $('waOrderBox').classList.toggle('is-ready', ready);
  setText(
    'waOrderHint',
    !ready
      ? 'Para continuar falta: ' + missing[0].charAt(0).toLowerCase() + missing[0].slice(1)
      : storeNumber()
        ? 'Todo listo: revisa tu pedido, paga y envíalo por WhatsApp.'
        : 'Todo listo para revisar. El envío se activa cuando la tienda configure su WhatsApp.',
  );
}
