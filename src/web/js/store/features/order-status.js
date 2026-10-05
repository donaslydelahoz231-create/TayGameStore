const STATUS_TEXT = {
  AWAITING_PAYMENT: 'Pago pendiente',
  APPROVED: 'Pago aprobado',
  FULFILLING: 'Recarga en proceso',
  FULFILLED: 'Recarga completada',
  DECLINED: 'Pago rechazado',
  VOIDED: 'Pago anulado',
  ERROR: 'Requiere revisión',
};

export function humanStatus(status) {
  return STATUS_TEXT[String(status || '').toUpperCase()] || 'Estado pendiente';
}

export function historyStatusClass(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'FULFILLED' || s === 'APPROVED') return 'ok';
  if (s === 'DECLINED' || s === 'VOIDED' || s === 'ERROR') return 'bad';
  return 'warn';
}
