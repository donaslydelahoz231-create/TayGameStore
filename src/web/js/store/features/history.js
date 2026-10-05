import { api } from '../api.js';
import { cartItems, priceOf, total } from '../cart-model.js';
import { $, esc } from '../dom.js';
import { money } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { saveLocal } from '../storage.js';
import { modal, toast } from '../ui.js';
import { hashCode, invoiceReference } from './invoice.js';
import { historyStatusClass, humanStatus } from './order-status.js';

// Historial de compras. Hoy se guarda en localStorage (heredado del original); la fuente
// de verdad debe ser el backend (Fase 2 en adelante).

const MAX_HISTORY = 100;

function snapshotCurrentOrder() {
  const items = cartItems();
  return {
    reference: invoiceReference(),
    code: state.currentOrder?.code || hashCode(),
    status: state.currentOrder?.status || 'PENDING',
    createdAt: new Date().toISOString(),
    invoice: Number(state.invoice) || 1,
    customerName: state.customerName.trim() || state.nickname || 'Cliente',
    customerEmail: state.customerEmail.trim(),
    uid: state.playerUid,
    nickname: state.nickname,
    region: state.regionLabel || state.region,
    total: total(),
    items: items.map((x) => ({
      id: x.p.id,
      name: x.p.name,
      qty: x.qty,
      price: priceOf(x.p),
      line: x.line,
    })),
  };
}

export function upsertPurchaseHistory(order) {
  if (!order) return;
  const ref = order.reference || 'TGS-' + String(state.invoice).padStart(4, '0'),
    base = snapshotCurrentOrder();
  const item = {
    ...base,
    ...order,
    reference: ref,
    status: order.status || base.status,
    items: Array.isArray(order.items) && order.items.length ? order.items : base.items,
  };
  const idx = state.purchaseHistory.findIndex((x) => x.reference === ref);
  if (idx >= 0) state.purchaseHistory[idx] = { ...state.purchaseHistory[idx], ...item };
  else state.purchaseHistory.unshift(item);
  state.purchaseHistory = state.purchaseHistory.slice(0, MAX_HISTORY);
  saveLocal();
}

export function renderHistory() {
  const box = $('historyList');
  if (!box) return;
  box.replaceChildren();
  if (!state.purchaseHistory.length) {
    box.innerHTML =
      '<div class="history-empty">Todavía no hay compras registradas. Cuando prepares o completes una orden, aparecerá aquí con su comprobante.</div>';
    return;
  }
  state.purchaseHistory.forEach((o) => {
    const el = document.createElement('article'),
      date = o.createdAt
        ? new Date(o.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
        : 'Fecha no disponible';
    const items = Array.isArray(o.items)
      ? o.items.map((x) => `${x.qty || x.quantity || 1}× ${x.name}`).join(' · ')
      : 'Compra TayGameStore';
    el.className = 'history-entry';
    el.innerHTML = `<div><b>${esc(o.reference || 'Sin referencia')}</b><small>${esc(date)} · ${esc(o.nickname || o.uid || 'Jugador')} · ${money(Number(o.total) || 0)}</small><small>${esc(items)}</small><span class="history-status ${historyStatusClass(o.status)}">${esc(humanStatus(o.status))}</span><div class="history-source">${o.demo ? 'Modo demo/local' : 'Registro de compra'}</div></div><div class="history-actions"><button class="btn glass history-view" type="button">Ver</button><button class="btn primary history-copy" type="button">Copiar</button></div>`;
    el.querySelector('.history-view').onclick = () => {
      state.currentOrder = { ...state.currentOrder, ...o };
      state.invoice = Number(o.invoice) || state.invoice;
      state.playerUid = o.uid || state.playerUid;
      state.nickname = o.nickname || state.nickname;
      state.region = o.region || state.region;
      state.customerName = o.customerName || state.customerName;
      state.customerEmail = o.customerEmail || state.customerEmail;
      if ($('customerName')) $('customerName').value = state.customerName;
      if ($('customerEmail')) $('customerEmail').value = state.customerEmail;
      modal('historyModal', false);
      renderAll();
      $('factura').scrollIntoView({ behavior: 'smooth' });
    };
    el.querySelector('.history-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(o.reference || '');
        toast('Referencia copiada.', 'good');
      } catch {
        toast('No fue posible copiar la referencia.', 'bad');
      }
    };
    box.appendChild(el);
  });
}

export async function syncPurchaseHistory() {
  if (state.localDemo || !state.session) return;
  try {
    const j = await api('/api/orders?limit=100');
    if (Array.isArray(j.orders)) {
      j.orders.forEach(upsertPurchaseHistory);
      renderHistory();
    }
  } catch {
    // Sin backend: se muestra el historial local.
  }
}
