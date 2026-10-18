import type { FulfillmentStatus, OrderStatus, PaymentStatus } from '../db/schema.js';

/**
 * Estado del pago y estado de la recarga, separados, tal como los ven el cliente y el dueño.
 *
 * No son columnas nuevas: se derivan del estado guardado y validado en el servidor (pedido, pagos
 * consultados a Mercado Pago y entrega). Así nunca se contradicen con la máquina de estados ni
 * los puede fijar el navegador.
 *
 * - Pago confirmado solo existe si Mercado Pago aprobó un pago con el importe, la moneda y el modo
 *   correctos (`isOrderPayment`). Reembolsado, solo si Mercado Pago informó la devolución.
 * - Recarga completada solo existe si la entrega quedó registrada con evidencia (CHECK en la base),
 *   y una entrega solo empieza con el pedido pagado.
 */
export const PAYMENT_STATES = [
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'EXPIRED',
  'IN_REVIEW',
  'REFUNDED',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const RECHARGE_STATES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'NEEDS_REVIEW',
  'CANCELLED',
] as const;
export type RechargeState = (typeof RECHARGE_STATES)[number];

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Rechazado',
  EXPIRED: 'Vencido',
  IN_REVIEW: 'En revisión',
  REFUNDED: 'Reembolsado',
};

export const RECHARGE_STATE_LABELS: Record<RechargeState, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En proceso',
  COMPLETED: 'Completado',
  NEEDS_REVIEW: 'Requiere revisión',
  CANCELLED: 'Cancelado',
};

/** Detalle de Mercado Pago para un pago aprobado con una devolución parcial. */
export const PARTIAL_REFUND_DETAIL = 'partially_refunded';

export interface PaymentFacts {
  status: PaymentStatus;
  isOrderPayment: boolean;
  providerStatusDetail?: string | null | undefined;
}

export interface OrderFacts {
  status: OrderStatus;
  /** Pagos de la orden, el más reciente primero. */
  payments: readonly PaymentFacts[];
  fulfillment: FulfillmentStatus | null | undefined;
}

export function paymentState({ status, payments }: OrderFacts): PaymentState {
  const orderPayment = payments.find((payment) => payment.isOrderPayment);
  if (status === 'REFUNDED' || orderPayment?.status === 'REFUNDED') return 'REFUNDED';
  if (
    orderPayment &&
    (orderPayment.status === 'DISPUTED' ||
      orderPayment.providerStatusDetail === PARTIAL_REFUND_DETAIL)
  ) {
    return 'IN_REVIEW';
  }
  if (status === 'PAID' || status === 'DELIVERING' || status === 'DELIVERED') return 'CONFIRMED';
  if (status === 'NEEDS_REVIEW') {
    // En revisión por la entrega (no por el dinero): el pago sigue confirmado.
    return orderPayment?.status === 'APPROVED' ? 'CONFIRMED' : 'IN_REVIEW';
  }
  if (status === 'EXPIRED') return 'EXPIRED';
  // Pedido rechazado antes de pagar (jugador no confirmado): no hubo cobro.
  if (status === 'REJECTED') return 'DECLINED';
  // Pedido esperando pago: manda el último resultado de Mercado Pago, si lo hay.
  const latest = payments[0]?.status;
  if (latest === 'DECLINED') return 'DECLINED';
  if (latest === 'UNKNOWN' || latest === 'DISPUTED' || latest === 'NEEDS_REFUND')
    return 'IN_REVIEW';
  return 'PENDING';
}

export function rechargeState({ status, fulfillment }: OrderFacts): RechargeState {
  switch (fulfillment) {
    case 'DELIVERED':
      return 'COMPLETED';
    case 'FAILED':
      return 'NEEDS_REVIEW';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'DELIVERING':
      return status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'IN_PROGRESS';
    case 'READY_FOR_FULFILLMENT':
    case 'CLAIMED':
      return status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'PENDING';
    default:
      if (status === 'EXPIRED' || status === 'REJECTED' || status === 'REFUNDED')
        return 'CANCELLED';
      if (status === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
      return 'PENDING';
  }
}

export function orderStates(facts: OrderFacts): { payment: PaymentState; recharge: RechargeState } {
  return { payment: paymentState(facts), recharge: rechargeState(facts) };
}
