import { cartItems, total } from '../cart-model.js';
import { $, esc, setText } from '../dom.js';
import { money, validUid } from '../format.js';
import { runtime, state } from '../state.js';
import { humanStatus } from './order-status.js';

/**
 * Código visual del comprobante (hash FNV-1a de 32 bits calculado en el navegador).
 * NO es un identificador seguro ni una firma: solo decora el comprobante. El acceso a
 * órdenes debe usar un token del servidor (plan v2, §6.3).
 */
export function hashCode() {
  const text = [
    state.invoice,
    state.playerUid,
    state.nickname,
    state.region,
    total(),
    JSON.stringify(cartItems().map((x) => [x.p.id, x.qty])),
  ].join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ('00000000' + (h >>> 0).toString(16).toUpperCase()).slice(-8);
}

export const invoiceReference = () =>
  state.currentOrder?.reference || 'TGS-' + String(state.invoice).padStart(4, '0');

/** Comprobante en vivo y estado del botón de pago. */
export function renderInvoice() {
  const items = cartItems(),
    ready =
      items.length > 0 &&
      state.verified &&
      validUid(state.playerUid) &&
      !!state.nickname &&
      $('paymentMethod')?.value === 'wompi';
  setText('invoiceRef', invoiceReference());
  setText('trackingRef', state.currentOrder?.reference || '');
  setText(
    'invoiceDate',
    new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  setText('invoiceClient', state.customerName.trim() || state.nickname || '—');
  setText('invoiceUid', state.verified ? state.playerUid : '—');
  setText('invoiceNick', state.verified ? state.nickname : '—');
  setText('invoiceRegion', state.verified ? state.regionLabel || state.region || '—' : '—');
  setText('invoiceTotal', money(total()));
  setText('invoiceCode', hashCode());
  setText(
    'invoiceState',
    state.currentOrder?.status
      ? humanStatus(state.currentOrder.status)
      : ready
        ? 'Listo para pagar'
        : 'Pendiente',
  );
  const stateEl = $('invoiceState');
  if (stateEl)
    stateEl.className = state.currentOrder?.status ? 'ready' : ready ? 'ready' : 'pending';
  setText(
    'invoiceMethod',
    state.currentOrder ? 'Wompi · ' + humanStatus(state.currentOrder.status) : 'Pendiente',
  );
  const rows = $('invoiceRows');
  rows.replaceChildren();
  if (!items.length)
    rows.innerHTML =
      '<div class="invoice-line"><span>Sin paquetes</span><span>—</span><strong>$ 0 COP</strong></div>';
  else
    items.forEach((x) => {
      const el = document.createElement('div');
      el.className = 'invoice-line';
      el.innerHTML = `<span>${esc(x.p.name)}<small>${esc(x.p.desc || 'Recarga gamer')}</small></span><span>${x.qty}</span><strong>${money(x.line)}</strong>`;
      rows.appendChild(el);
    });
  $('payBtn').disabled = !ready || (!state.localDemo && state.previewOnly) || runtime.paymentBusy;
  $('paymentState').className = 'payment-state ' + (ready ? 'ok' : '');
  $('paymentState').querySelector('span').textContent = state.localDemo
    ? ready
      ? 'Modo demo: checkout listo · sin cobro real'
      : 'Completa jugador, datos y método de pago'
    : ready
      ? 'Requisitos completos'
      : 'Esperando requisitos';
  setText('payBtn', state.localDemo ? 'Simular pago demo' : 'Continuar con Wompi');
  setText(
    'exportMsg',
    items.length
      ? 'Comprobante listo para generar.'
      : 'Agrega una recarga para habilitar el comprobante.',
  );
  if ($('customerName') && $('customerName').value !== state.customerName)
    $('customerName').value = state.customerName;
}
