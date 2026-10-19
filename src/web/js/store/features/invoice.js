import { cartItems, total } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { money } from '../format.js';
import { serverLabel } from '../servers.js';
import { runtime, state } from '../state.js';
import { humanStatus, paymentInProgress } from './order-status.js';
import { chosenPayMeans, PAY_MEANS } from './pay-means.js';

// Antes de crear el pedido, la tarjeta es solo un RESUMEN de la compra (no es factura ni se puede
// descargar). Con pedido muestra exactamente la orden del servidor; el comprobante descargable
// existe únicamente cuando Mercado Pago aprobó el pago y el servidor le dio número y código.

/** Lo que se ve en lugar de la referencia mientras no hay pedido. */
export const SUMMARY_LABEL = 'RESUMEN';

export const invoiceReference = () => state.currentOrder?.reference || SUMMARY_LABEL;

/** ¿Hay comprobante real? Solo un pedido pagado, con número y código del servidor. */
export const hasReceipt = () => Boolean(state.currentOrder?.receipt);

/**
 * Pedido pagado: número consecutivo del comprobante y código de verificación (los asigna el
 * servidor; el dueño los comprueba en su panel). Antes del pago, el código corto del pedido.
 */
export const invoiceCode = () => {
  const order = state.currentOrder;
  if (order?.receipt) {
    return `N.º ${String(order.receipt.number).padStart(6, '0')} · ${order.receipt.verificationCode}`;
  }
  return order?.receiptCode || '—';
};

/** Estado de la descarga del comprobante (JPG, PDF, compartir). */
function exportState(lines) {
  const order = state.currentOrder;
  if (hasReceipt()) {
    return {
      enabled: true,
      text: `Comprobante N.º ${String(order.receipt.number).padStart(6, '0')} listo para descargar.`,
    };
  }
  if (order) {
    return {
      enabled: false,
      text: `Pedido ${order.reference} registrado. El comprobante se emite cuando Mercado Pago confirma el pago.`,
    };
  }
  return {
    enabled: false,
    text: lines.length
      ? 'Esto es un resumen, no una factura. El comprobante se emite cuando Mercado Pago confirma el pago.'
      : 'Agrega una recarga para empezar tu compra.',
  };
}

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
  AWAITING_PAYMENT: 'Pagar con Mercado Pago',
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
  if (runtime.paymentBusy)
    return { text: 'Abriendo Mercado Pago…', enabled: false, note: 'Te llevamos al pago seguro' };
  if (!order || ['REJECTED', 'EXPIRED', 'REFUNDED'].includes(order.status)) {
    const ready = cartItems().length > 0 && state.uidAccepted && chosenPayMeans() !== null;
    const blocked = !cfg
      ? 'Sin conexión con el servidor'
      : cfg.maintenanceMode
        ? 'Tienda en mantenimiento'
        : !cfg.checkoutEnabled
          ? 'Compras pausadas temporalmente'
          : '';
    // Un solo botón, como en las tiendas de recargas: crea el pedido y lleva al cobro.
    const amount = cartItems().length ? ' ' + money(total()) : '';
    return {
      text: runtime.orderBusy ? 'Creando pedido…' : 'Pagar' + amount,
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
  if (order.status === 'AWAITING_PAYMENT' && order.payment.method === 'nequi_manual') {
    // Pedido de Nequi: el botón lleva a las instrucciones; nunca abre Mercado Pago.
    const reported = order.payment.nequi?.transfer?.status === 'REPORTED';
    return {
      text: reported ? 'Transferencia por verificar' : 'Ver cómo pagar por Nequi',
      enabled: !runtime.paymentBusy,
      note: reported
        ? 'Verificamos tu transferencia en nuestra cuenta Nequi. No transfieras de nuevo.'
        : 'Transfiere desde tu app Nequi y pulsa «Ya transferí»',
      ok: false,
    };
  }
  if (paymentInProgress(order)) {
    // Efecty o PSE pueden tardar en acreditarse: avisar antes de abrir otro pago.
    return {
      text: order.payment.canPay ? 'Pagar con otro medio' : 'Pago en proceso',
      enabled: order.payment.canPay && !runtime.paymentBusy,
      note: 'Tu pago está en proceso en Mercado Pago. Si ya pagaste (Efecty o PSE pueden tardar), no pagues de nuevo.',
      ok: false,
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
  // Región verificada (operador o proveedor) o, si aún no la hay, el servidor que eligió el cliente.
  const chosenServer = serverLabel(order ? order.playerServer : state.playerServer);
  setText(
    'invoiceRegion',
    (showPlayer ? verification.region : lookup ? lookup.region : '') || chosenServer || '—',
  );
  setText('invoiceTotal', money(invoiceTotal()));
  setText('invoiceCode', invoiceCode());
  setText('invoiceState', order ? humanStatus(order) : 'Sin pedido');
  const stateEl = $('invoiceState');
  if (stateEl) stateEl.className = order ? 'ready' : 'pending';
  const means = chosenPayMeans();
  const orderMethod =
    order?.payment?.method === 'nequi_manual'
      ? 'Nequi'
      : order?.payment?.method === 'mercadopago' || !means || means !== 'nequi_manual'
        ? 'Mercado Pago'
        : 'Nequi';
  setText(
    'invoiceMethod',
    order
      ? orderMethod + ' · ' + humanStatus(order)
      : means
        ? PAY_MEANS[means].split(' (')[0]
        : 'Pendiente',
  );
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
  const exportInfo = exportState(lines);
  for (const id of ['jpgBtn', 'pdfBtn', 'shareBtn']) {
    if ($(id)) $(id).disabled = !exportInfo.enabled;
  }
  setText('exportMsg', exportInfo.text);
  if ($('customerName') && !order && $('customerName').value !== state.customerName)
    $('customerName').value = state.customerName;
}
