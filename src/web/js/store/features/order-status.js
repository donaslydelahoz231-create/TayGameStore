/** Textos de estado de una orden del servidor (estado + verificación del jugador). */
const STATUS_TEXT = {
  AWAITING_VERIFICATION: 'Verificando jugador',
  AWAITING_PAYMENT: 'Pago pendiente',
  PAID: 'Pago confirmado',
  DELIVERING: 'Recarga en proceso',
  DELIVERED: 'Recarga completada',
  NEEDS_REVIEW: 'En revisión',
  EXPIRED: 'Pedido vencido',
  REJECTED: 'Pedido rechazado',
  REFUNDED: 'Reembolsado',
};

/**
 * Pago iniciado en Mercado Pago que aún no se acredita (p. ej. efectivo en Efecty o PSE en
 * proceso). El pedido sigue esperando el pago: lo confirma el servidor, nunca el navegador.
 */
export function paymentInProgress(order) {
  return order?.status === 'AWAITING_PAYMENT' && order.payment?.status === 'PENDING';
}

export function humanStatus(order) {
  if (!order) return 'Pendiente';
  if (paymentInProgress(order)) return 'Pago en proceso';
  if (order.status === 'AWAITING_VERIFICATION' && order.verification?.status === 'VERIFIED') {
    return 'Confirma tu cuenta';
  }
  return STATUS_TEXT[order.status] || 'Estado pendiente';
}

export function historyStatusClass(status) {
  if (['PAID', 'DELIVERING', 'DELIVERED'].includes(status)) return 'ok';
  if (['REJECTED', 'EXPIRED', 'REFUNDED'].includes(status)) return 'bad';
  return 'warn';
}
