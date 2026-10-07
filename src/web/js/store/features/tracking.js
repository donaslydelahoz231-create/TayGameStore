import { cartItems } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { validUid } from '../format.js';
import { state } from '../state.js';

const MESSAGES = {
  AWAITING_VERIFICATION: 'Pedido creado. Nuestro equipo está verificando el jugador.',
  AWAITING_PAYMENT: 'Jugador confirmado. Falta el pago con Mercado Pago.',
  PAID: 'Pago confirmado por Mercado Pago. Preparando tu recarga.',
  DELIVERING: 'Tu recarga se está entregando.',
  DELIVERED: 'Operación completada. Recarga entregada.',
  NEEDS_REVIEW: 'Tu pedido está en revisión. Te contactaremos si hace falta.',
  EXPIRED: 'El pedido venció sin pago. Puedes crear uno nuevo.',
  REJECTED: 'El pedido no continuó (jugador no confirmado).',
  REFUNDED: 'El pago fue reembolsado.',
};

/** Checklist previa al pago y "Ruta de seguimiento" (estado real del servidor). */
export function renderChecks() {
  const order = state.currentOrder;
  const status = order?.status;
  // El UID está listo cuando se aceptó o cuando la consulta instantánea ya encontró ese jugador
  // (falta confirmar el nickname, que es la línea siguiente).
  const found = state.playerLookup?.uid === state.playerUid;
  const uidOk = order ? true : validUid(state.playerUid) && (state.uidAccepted || found);
  const lookup = !order && state.playerLookup?.confirmed ? state.playerLookup : null;
  const selfConfirmed = !order && state.uidConfirmed === state.playerUid && state.uidAccepted;
  const playerOk = order
    ? order.verification?.status === 'CONFIRMED'
    : Boolean(lookup) || selfConfirmed;
  const cartOk = order ? true : cartItems().length > 0;
  [
    ['uidState', uidOk],
    ['nickState', playerOk],
    ['cartState', cartOk],
  ].forEach(([id, ok]) => {
    const e = $(id);
    if (!e) return;
    e.textContent = ok ? 'Listo' : 'Pendiente';
    e.classList.toggle('ok', ok);
    e.parentElement?.querySelector('.check')?.classList.toggle('ok', ok);
  });
  const paid = ['PAID', 'DELIVERING', 'DELIVERED'].includes(status);
  $('trackPlayer').classList.toggle('done', playerOk);
  $('trackPlayer').querySelector('small').textContent = playerOk
    ? (order ? order.verification.region : lookup?.region) || 'Confirmado'
    : order
      ? 'Verificando'
      : 'Esperando UID';
  $('trackPayment').classList.toggle('done', paid);
  $('trackPayment').querySelector('small').textContent = paid
    ? 'Pago confirmado'
    : status === 'AWAITING_PAYMENT'
      ? 'Esperando pago'
      : 'Esperando requisitos';
  $('trackDelivery').classList.toggle('done', status === 'DELIVERED');
  $('trackDelivery').querySelector('small').textContent =
    status === 'DELIVERED'
      ? order.fulfillment?.pins
        ? 'PIN entregado'
        : 'Recarga entregada'
      : status === 'DELIVERING'
        ? 'En proceso'
        : 'Pendiente';
  setText(
    'trackingMessage',
    order
      ? status === 'DELIVERED' && order.fulfillment?.pins
        ? 'Pago confirmado y PIN entregado: ábrelo abajo y canjéalo en pagostore.com.'
        : MESSAGES[status] || 'Consultando el estado del pedido…'
      : !cartOk
        ? 'Selecciona una recarga para comenzar.'
        : !uidOk
          ? 'Escribe el UID del jugador.'
          : 'Factura lista. El siguiente paso es crear el pedido.',
  );
}
