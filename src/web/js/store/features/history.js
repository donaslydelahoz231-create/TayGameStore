import { api, errorMessage } from '../api.js';
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
    const items = o.items.map((x) => `${x.quantity}× ${x.name}`).join(' · ');
    const who = o.verification?.nickname || o.playerUid;
    el.className = 'history-entry';
    el.innerHTML = `<div><b>${esc(o.reference)}</b><small>${esc(date)} · ${esc(who)} · ${money(o.totalCop)}</small><small>${esc(items)}</small><span class="history-status ${historyStatusClass(o.status)}">${esc(humanStatus(o))}</span><div class="history-source">Registro del servidor</div></div><div class="history-actions"><button class="btn glass history-view" type="button">Ver</button><button class="btn primary history-copy" type="button">Copiar</button></div>`;
    el.querySelector('.history-view').onclick = () => {
      setCurrentOrder(o);
      startPolling();
      modal('historyModal', false);
      $('factura').scrollIntoView({ behavior: 'smooth' });
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
