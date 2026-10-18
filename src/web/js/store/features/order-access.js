import { api, ApiError, errorMessage } from '../api.js';
import { $, setHtml } from '../dom.js';
import { state } from '../state.js';
import { orderToken, storeOrderToken } from '../storage.js';
import { toast } from '../ui.js';
import { isFinalOrderStatus, setCurrentOrder, startPolling } from './orders.js';

// Seguimiento privado sin cuenta. Al crear el pedido el servidor entrega un código secreto (32
// bytes aleatorios; solo guarda su HMAC). Con la referencia y ese código el cliente consulta su
// pedido desde cualquier dispositivo. La referencia sola no muestra nada: sin el código la
// respuesta es la misma que para un pedido inexistente.
//
// El enlace privado lleva el código en el fragmento (#pedido=…&codigo=…), que el navegador nunca
// envía al servidor ni a otros sitios; al abrirlo se guarda en la pestaña y se borra de la URL.

const REF = /^TGS-[0-9A-Z]{10}$/;
const REF_IN_TEXT = /TGS-[0-9A-Z]{10}/i;
const CODE = /^[A-Za-z0-9_-]{20,100}$/;

export function privateLink(reference, code) {
  return `${location.origin}/#pedido=${encodeURIComponent(reference)}&codigo=${encodeURIComponent(code)}`;
}

function fromFragment(fragment) {
  const params = new URLSearchParams(fragment);
  return {
    reference: (params.get('pedido') || '').toUpperCase(),
    code: params.get('codigo') || '',
  };
}

/** Si la página se abrió con el enlace privado, guarda el código en la pestaña y limpia la URL. */
export function consumeAccessFragment() {
  if (!location.hash.startsWith('#pedido=')) return null;
  const { reference, code } = fromFragment(location.hash.slice(1));
  history.replaceState({}, '', location.pathname + location.search + '#seguimiento');
  if (!REF.test(reference) || !CODE.test(code)) return null;
  storeOrderToken(reference, code);
  return reference;
}

function show(kind, html) {
  const box = $('lookupResult');
  box.hidden = false;
  box.dataset.kind = kind;
  setHtml('lookupResult', html);
}

/** Acepta el enlace privado completo en el primer campo, o la referencia y el código por separado. */
function parseLookup(rawRef, rawCode) {
  const hash = rawRef.indexOf('#');
  if (hash >= 0) {
    const parsed = fromFragment(rawRef.slice(hash + 1));
    return { reference: parsed.reference, code: parsed.code || rawCode };
  }
  return { reference: (REF_IN_TEXT.exec(rawRef)?.[0] ?? rawRef).toUpperCase(), code: rawCode };
}

export async function lookupOrder(event) {
  event.preventDefault();
  const { reference, code } = parseLookup(
    $('lookupRef').value.trim(),
    $('lookupCode').value.trim(),
  );
  if (!REF.test(reference) || !CODE.test(code)) {
    show(
      'bad',
      'Escribe la referencia (TGS-…) y el código de seguimiento, o pega tu enlace privado completo.',
    );
    return;
  }
  const button = $('lookupBtn');
  button.disabled = true;
  try {
    const j = await api('/api/orders/' + encodeURIComponent(reference), {
      headers: { 'x-order-token': code },
    });
    storeOrderToken(reference, code);
    setCurrentOrder(j.order);
    if (!isFinalOrderStatus(j.order.status)) startPolling();
    $('lookupCode').value = '';
    show('good', '<b>Pedido encontrado.</b> Su estado aparece arriba y se actualiza solo.');
    $('seguimiento')?.scrollIntoView({ block: 'start' });
  } catch (err) {
    show(
      'bad',
      err instanceof ApiError && err.code === 'NOT_FOUND'
        ? 'No encontramos un pedido con esos datos. Revisa la referencia y el código.'
        : errorMessage(err),
    );
  } finally {
    button.disabled = false;
  }
}

/** El enlace privado solo se ofrece en la pestaña que tiene el código de este pedido. */
export function renderTrackAccess() {
  const box = $('trackAccess');
  if (!box) return;
  const order = state.currentOrder;
  box.hidden = !(order && orderToken(order.reference));
}

export async function copyTrackLink() {
  const order = state.currentOrder;
  const code = order && orderToken(order.reference);
  if (!code) return;
  try {
    await navigator.clipboard.writeText(privateLink(order.reference, code));
    toast('Enlace privado copiado. Guárdalo y no lo compartas.', 'good');
  } catch {
    toast('No fue posible copiar automáticamente.');
  }
}
