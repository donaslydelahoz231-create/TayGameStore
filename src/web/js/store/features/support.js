import { cartItems } from '../cart-model.js';
import { TGS_PUBLIC_SUPPORT } from '../config.js';
import { $, setText } from '../dom.js';
import { serverLabel } from '../servers.js';
import { state } from '../state.js';

/**
 * Mensaje que abre WhatsApp o el correo, según el momento del cliente: con pedido (referencia,
 * ID y servidor), con paquetes en el carrito, o una consulta antes de comprar.
 */
export function supportMessage() {
  const order = state.currentOrder;
  if (order?.reference) {
    const server = serverLabel(order.playerServer);
    return `Hola TayGameStore, necesito soporte con mi pedido ${order.reference} (ID ${order.playerUid}${server ? ', servidor ' + server : ''}).`;
  }
  const items = cartItems();
  if (items.length) {
    const list = items.map((x) => `${x.qty}× ${x.p.name}`).join(', ');
    const uid = state.uidAccepted && state.playerUid ? ` para el ID ${state.playerUid}` : '';
    return `Hola TayGameStore, quiero recargar ${list}${uid}.`;
  }
  return 'Hola TayGameStore, quiero recargar diamantes de Free Fire.';
}

const ALWAYS_HIDDEN_WHEN_OFF = new Set([
  'waBtn',
  'invoiceWa',
  'mailBtn',
  'invoiceMail',
  'floatWhatsApp',
  'floatEmail',
]);

/** Canales oficiales de soporte (definidos por el backend; vacíos hasta configurarlos). */
export function renderSupport() {
  const s = state.serverConfig?.support || {};
  const wa = String(s.whatsapp || TGS_PUBLIC_SUPPORT.whatsapp || '').replace(/\D/g, '');
  const mail = String(s.email || TGS_PUBLIC_SUPPORT.email || '').trim();
  const message = supportMessage();
  const subject = state.currentOrder?.reference
    ? 'Soporte TayGameStore ' + state.currentOrder.reference
    : 'Consulta TayGameStore';
  const waUrl = wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(message) : '';
  const mailUrl = mail
    ? 'mailto:' +
      mail +
      '?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(message)
    : '';
  const links = [
    ['waBtn', waUrl, !!wa],
    ['invoiceWa', waUrl, !!wa],
    ['mailBtn', mailUrl, !!mail],
    ['invoiceMail', mailUrl, !!mail],
    ['floatWhatsApp', waUrl, !!wa],
    ['floatEmail', mailUrl, !!mail],
  ];
  for (const [id, url, ready] of links) {
    const el = $(id);
    if (!el) continue;
    el.href = ready ? url : '#';
    el.hidden = !ready && ALWAYS_HIDDEN_WHEN_OFF.has(id);
    el.classList.toggle('disabled', !ready);
    el.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }
  // Burbujas flotantes: solo los canales configurados; sin ninguno, no se muestran.
  const float = $('supportFloat');
  if (float) float.hidden = !(wa || mail);
  setText('supportWhatsappState', wa ? 'Canal oficial disponible' : 'No disponible por ahora');
  setText('supportEmailState', mail ? 'Canal oficial disponible' : 'No disponible por ahora');
  const st = $('supportBackendState');
  if (st) {
    st.classList.toggle('ok', !!(wa || mail));
    st.querySelector('i').style.background = wa || mail ? 'var(--green)' : 'var(--gold)';
    st.lastChild.textContent = wa || mail ? ' Canales oficiales activos' : ' Sin canales activos';
  }
}
