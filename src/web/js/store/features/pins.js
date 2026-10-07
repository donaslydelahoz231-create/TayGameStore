import { api } from '../api.js';
import { $, esc, setHtml } from '../dom.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { accessHeaders } from './orders.js';

// PIN entregados automáticamente (inventario del dueño). Solo se piden al servidor cuando el
// comprador pulsa «Ver mi PIN» y nunca se guardan en el navegador.

/** Muestra el recuadro del PIN solo para un pedido entregado con PIN. */
export function renderPins() {
  const box = $('pinBox');
  if (!box) return;
  const order = state.currentOrder;
  const ready = order?.status === 'DELIVERED' && order.fulfillment?.pins > 0;
  if (!ready || box.dataset.ref !== order.reference) {
    box.dataset.ref = ready ? order.reference : '';
    setHtml('pinList', '');
    $('showPins').hidden = false;
  }
  box.hidden = !ready;
}

async function copyPin(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast('PIN copiado.', 'good');
  } catch {
    toast('No se pudo copiar: selecciónalo y cópialo a mano.', 'bad');
  }
}

export async function showPins() {
  const order = state.currentOrder;
  if (!order) return;
  const button = $('showPins');
  button.disabled = true;
  try {
    const { pins } = await api('/api/orders/' + encodeURIComponent(order.reference) + '/pins', {
      headers: accessHeaders(order.reference),
    });
    if (!pins.length) {
      toast('Este pedido no tiene PIN disponibles.', 'bad');
      return;
    }
    setHtml(
      'pinList',
      pins
        .map(
          (p, i) =>
            `<div class="pin-row"><div><small>${esc(p.name)}</small><code>${esc(p.code)}</code></div><button class="btn glass" type="button" data-pin="${i}">Copiar</button></div>`,
        )
        .join(''),
    );
    $('pinList')
      .querySelectorAll('[data-pin]')
      .forEach((b) => {
        b.onclick = () => copyPin(pins[Number(b.dataset.pin)].code);
      });
    button.hidden = true;
  } catch {
    toast('No pudimos mostrar el PIN. Inténtalo de nuevo.', 'bad');
  } finally {
    button.disabled = false;
  }
}
