import type { FulfillmentStatus, OrderStatus } from '../db/schema.js';

/**
 * Transiciones permitidas. Cualquier otra es un error de programación o una carrera que la
 * base de datos detecta con CAS (`UPDATE … WHERE status = <esperado>`).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  AWAITING_VERIFICATION: ['AWAITING_PAYMENT', 'REJECTED', 'EXPIRED', 'NEEDS_REVIEW'],
  REJECTED: ['NEEDS_REVIEW'],
  AWAITING_PAYMENT: ['PAID', 'EXPIRED', 'NEEDS_REVIEW'],
  PAID: ['DELIVERING', 'NEEDS_REVIEW', 'REFUNDED'],
  DELIVERING: ['DELIVERED', 'PAID', 'NEEDS_REVIEW', 'REFUNDED'],
  DELIVERED: ['REFUNDED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['PAID', 'REFUNDED', 'EXPIRED'],
  EXPIRED: ['NEEDS_REVIEW'],
  REFUNDED: [],
};

export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  READY_FOR_FULFILLMENT: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['DELIVERING', 'READY_FOR_FULFILLMENT', 'CANCELLED'],
  DELIVERING: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: ['READY_FOR_FULFILLMENT', 'CANCELLED'],
  CANCELLED: [],
};

/** Estados en los que una orden sigue "abierta" para los límites antifraude. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  'AWAITING_VERIFICATION',
  'AWAITING_PAYMENT',
];

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FULFILLMENT_TRANSITIONS[from].includes(to);
}
