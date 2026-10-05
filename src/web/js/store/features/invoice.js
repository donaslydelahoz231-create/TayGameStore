import { cartItems, total } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { runtime, state } from '../state.js';
import { humanStatus } from './order-status.js';

// Comprobante en vivo. Antes de crear el pedido es un borrador con los precios del catálogo;
// después muestra exactamente la orden del servidor (referencia, totales, estado).

export const invoiceReference = () => state.currentOrder?.reference || 'BORRADOR';

export const invoiceCode = () => state.currentOrder?.receiptCode || '--------';

/** Líneas del comprobante: las de la orden si existe, si no las del carrito. */
export function invoiceLines() {
  const order = state.currentOrder;
  if (order) {
    return order.items.map((i) => ({
      name: i.name,
      desc: i.sku,
      qty: i.quantity,
      line: i.lineTotalCop,
    }));
  }
  return cartItems().map((x) => ({
    name: x.p.name,
    desc: x.p.desc || 'Recarga gamer',
    qty: x.qty,
    line: x.line,
  }));
}

export const invoiceTotal = () => (state.currentOrder ? state.currentOrder.totalCop : total());

const BUTTON_TEXT = {
  AWAITING_VERIFICATION: 'Verificando jugador…',
  AWAITING_PAYMENT: 'Confirmar y pagar',
  PAID: 'Pago confirmado',
  DELIVERING: 'Recarga en proceso',
  DELIVERED: 'Recarga entregada',
  NEEDS_REVIEW: 'Pedido en revisión',
};

function payButtonState() {
  const order = state.currentOrder;
  const cfg = state.serverConfig;
  if (state.previewOnly)
    return { text: 'Requiere servidor', enabled: false, note: 'Vista previa visual' };
  if (!order || ['REJECTED', 'EXPIRED', 'REFUNDED'].includes(order.status)) {
    const ready =
      cartItems().length > 0 && state.uidAccepted && $('paymentMethod')?.value === 'mercadopago';
    const blocked = !cfg
      ? 'Sin conexión con el servidor'
      : cfg.maintenanceMode
        ? 'Tienda en mantenimiento'
        : !cfg.checkoutEnabled
          ? 'Compras pausadas temporalmente'
          : '';
    return {
      text: 'Crear pedido',
      enabled: !blocked && !runtime.orderBusy,
      note:
        blocked || (ready ? 'Requisitos completos' : 'Completa jugador, datos y método de pago'),
      ok: ready && !blocked,
    };
  }
  if (order.status === 'AWAITING_VERIFICATION') {
    const verified = order.verification?.status === 'VERIFIED';
    return {
      text: verified ? 'Confirma tu cuenta' : BUTTON_TEXT.AWAITING_VERIFICATION,
      enabled: verified,
      note: verified ? 'Revisa el jugador y confírmalo' : 'El equipo está verificando el jugador',
    };
  }
  if (order.status === 'AWAITING_PAYMENT') {
    return {
      text: order.payment.canPay ? BUTTON_TEXT.AWAITING_PAYMENT : 'Pagos no disponibles',
      enabled: order.payment.canPay && !runtime.paymentBusy,
      note: order.payment.canPay
        ? 'Serás redirigido a Mercado Pago'
        : 'Tu pedido sigue guardado; inténtalo más tarde',
      ok: order.payment.canPay,
    };
  }
  return {
    text: BUTTON_TEXT[order.status] || 'Ver seguimiento',
    enabled: true,
    note: humanStatus(order),
    ok: ['PAID', 'DELIVERING', 'DELIVERED'].includes(order.status),
  };
}

/** Comprobante en vivo y estado del botón principal. */
export function renderInvoice() {
  const order = state.currentOrder;
  const lines = invoiceLines();
  const verification = order?.verification;
  const lookup = !order && state.playerLookup?.confirmed ? state.playerLookup : null;
  const showPlayer = verification && ['VERIFIED', 'CONFIRMED'].includes(verification.status);
  setText('invoiceRef', invoiceReference());
  setText('trackingRef', order?.reference || '—');
  setText(
    'invoiceDate',
    new Date(order?.createdAt || Date.now()).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  setText('invoiceClient', order?.customerName || state.customerName.trim() || '—');
  setText('invoiceUid', order?.playerUid || (state.uidAccepted ? state.playerUid : '—'));
  setText('invoiceNick', showPlayer ? verification.nickname : lookup ? lookup.nickname : '—');
  setText('invoiceRegion', showPlayer ? verification.region || '—' : lookup ? lookup.region : '—');
  setText('invoiceTotal', money(invoiceTotal()));
  setText('invoiceCode', invoiceCode());
  setText('invoiceState', order ? humanStatus(order) : 'Pendiente');
  const stateEl = $('invoiceState');
  if (stateEl) stateEl.className = order ? 'ready' : 'pending';
  setText('invoiceMethod', order ? 'Mercado Pago · ' + humanStatus(order) : 'Pendiente');
  const rows = $('invoiceRows');
  rows.replaceChildren();
  if (!lines.length)
    rows.innerHTML =
      '<div class="invoice-line"><span>Sin paquetes</span><span>—</span><strong>$ 0 COP</strong></div>';
  else
    lines.forEach((x) => {
      const el = document.createElement('div');
      el.className = 'invoice-line';
      el.innerHTML = `<span>${esc(x.name)}<small>${esc(x.desc)}</small></span><span>${x.qty}</span><strong>${money(x.line)}</strong>`;
      rows.appendChild(el);
    });
  const button = payButtonState();
  $('payBtn').disabled = !button.enabled;
  setText('payBtn', button.text);
  $('paymentState').className = 'payment-state ' + (button.ok ? 'ok' : '');
  $('paymentState').querySelector('span').textContent = button.note;
  setText(
    'exportMsg',
    lines.length
      ? 'Comprobante listo para generar.'
      : 'Agrega una recarga para habilitar el comprobante.',
  );
  if ($('customerName') && !order && $('customerName').value !== state.customerName)
    $('customerName').value = state.customerName;
}
