import { api, errorMessage } from '../api.js';
import { scrollToSection } from '../scroll.js';
import { $, esc } from '../dom.js';
import { money } from '../format.js';
import { state } from '../state.js';
import { modal, toast } from '../ui.js';
import { historyStatusClass, humanStatus } from './order-status.js';
import { setCurrentOrder, startPolling } from './orders.js';

// Historial de compras: lo devuelve el servidor (órdenes de esta cuenta o de este navegador).

let loading = false;
let lastError = '';

export function renderHistory() {
  const box = $('historyList');
  if (!box) return;
  box.replaceChildren();
  if (loading && !state.purchaseHistory.length) {
    box.innerHTML = '<div class="history-empty">Cargando tus compras…</div>';
    return;
  }
  if (lastError && !state.purchaseHistory.length) {
    box.innerHTML = `<div class="history-empty">${esc(lastError)}</div>`;
    return;
  }
  if (!state.purchaseHistory.length) {
    box.innerHTML =
      '<div class="history-empty">Todavía no hay compras registradas en este navegador o cuenta.</div>';
    return;
  }
  state.purchaseHistory.forEach((o) => {
    const el = document.createElement('article');
    const date = new Date(o.createdAt).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const items = o.items
      .map((x) => `<li><b>${esc(String(x.quantity))}×</b> ${esc(x.name)}</li>`)
      .join('');
    const who = o.verification?.nickname || o.playerUid;
    // «Compra exitosa» solo cuando el servidor confirmó el pago con el proveedor y emitió el
    // comprobante (número y código): el navegador nunca lo decide.
    const paid = Boolean(o.receipt);
    const success = paid
      ? `<p class="history-success"><b>Compra exitosa</b><span>Comprobante N.º ${esc(
          String(o.receipt.number).padStart(6, '0'),
        )}</span></p>`
      : '';
    el.className = 'history-entry' + (paid ? ' is-paid' : '');
    el.innerHTML = `<div class="history-main"><div class="history-head"><b translate="no">${esc(o.reference)}</b><strong>${esc(money(o.totalCop))}</strong></div>${success}<small>${esc(date)} · ${esc(who)}</small><ul class="history-items" aria-label="Paquetes">${items}</ul><span class="history-status ${historyStatusClass(o.status)}">${esc(humanStatus(o))}</span><div class="history-source">Registro del servidor</div></div><div class="history-actions"><button class="btn ${paid ? 'primary' : 'glass'} history-view" type="button">${paid ? 'Ver comprobante' : 'Ver'}</button><button class="btn glass history-copy" type="button">Copiar</button></div>`;
    el.querySelector('.history-view').onclick = () => {
      setCurrentOrder(o);
      startPolling();
      modal('historyModal', false);
      scrollToSection('factura');
    };
    el.querySelector('.history-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(o.reference);
        toast('Referencia copiada.', 'good');
      } catch {
        toast('No fue posible copiar la referencia.', 'bad');
      }
    };
    box.appendChild(el);
  });
}

export async function syncPurchaseHistory() {
  if (state.previewOnly) return;
  loading = true;
  lastError = '';
  renderHistory();
  try {
    const j = await api('/api/orders');
    state.purchaseHistory = Array.isArray(j.orders) ? j.orders : [];
  } catch (err) {
    lastError = errorMessage(err, 'No se pudo cargar el historial.');
  } finally {
    loading = false;
    renderHistory();
  }
}
