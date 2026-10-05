import { cartItems } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { validUid } from '../format.js';
import { state } from '../state.js';

/** Checklist previa al pago y "Ruta de seguimiento". */
export function renderChecks() {
  const a = validUid(state.playerUid),
    b = !!(state.verified && state.nickname),
    c = cartItems().length > 0;
  [
    ['uidState', a],
    ['nickState', b],
    ['cartState', c],
  ].forEach(([id, ok]) => {
    const e = $(id);
    if (!e) return;
    e.textContent = ok ? 'Listo' : 'Pendiente';
    e.classList.toggle('ok', ok);
    e.parentElement?.querySelector('.check')?.classList.toggle('ok', ok);
  });
  $('trackPlayer').classList.toggle('done', b);
  $('trackPlayer').querySelector('small').textContent = b
    ? state.regionLabel || state.region
    : 'Esperando UID';
  $('trackPayment').classList.toggle('done', a && b && c);
  $('trackPayment').querySelector('small').textContent =
    a && b && c ? 'Checkout listo' : 'Esperando requisitos';
  $('trackDelivery').classList.toggle('done', state.currentOrder?.status === 'FULFILLED');
  $('trackDelivery').querySelector('small').textContent =
    state.currentOrder?.status === 'FULFILLED' ? 'Recarga entregada' : 'Proveedor / backend';
  setText(
    'trackingMessage',
    !c
      ? 'Selecciona una recarga para comenzar.'
      : !b
        ? 'Verifica y confirma el jugador.'
        : state.currentOrder?.status === 'FULFILLED'
          ? 'Operación completada. Recarga entregada.'
          : state.currentOrder
            ? 'Pedido creado. El estado se actualiza automáticamente.'
            : 'Factura lista. El siguiente paso es el pago.',
  );
}
