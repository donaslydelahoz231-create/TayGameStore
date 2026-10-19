import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import {
  fulfillments,
  nequiTransfers,
  orders,
  PAYMENT_METHODS,
  paymentAttempts,
  payments,
  type PaymentMethod,
} from '../db/schema.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, type Actor, type ServiceDeps } from './context.js';
import { deliverFromInventory } from './inventory.js';
import { enqueueOrderNotifications } from './notifications.js';
import {
  closeOpenAttempts,
  loadOrderForAccess,
  transitionOrder,
  type OrderAccess,
  type OrderRow,
} from './orders.js';
import { PAYMENT_METHOD_LABELS, requirePaymentMethod } from './payment-methods.js';
import { assignReceiptNumber } from './receipts.js';
import { routeToProvider } from './topups.js';

/**
 * Coordinador de pagos del pedido (OrderPaymentCoordinator). Solo reglas generales del pedido:
 * - fija el método de pago que eligió el cliente y no lo deja cambiar en silencio;
 * - un cambio de método es un procedimiento explícito que evita cobros y entregas dobles;
 * - aplica los efectos comunes de «pedido pagado» (comprobante, cola de entrega, avisos).
 * Nunca confirma un pago: eso lo hace cada proveedor con su propio mecanismo. Y nunca convierte
 * la confirmación de un proveedor en la de otro (además lo impide el trigger
 * `payments_provider_matches_order` en la base de datos).
 */

/** ¿Un pago de este proveedor puede pagar este pedido? Solo si es el método del pedido. */
export function belongsToOrder(
  order: Pick<OrderRow, 'paymentMethod'>,
  provider: PaymentMethod,
): boolean {
  return order.paymentMethod === provider;
}

/**
 * Fija el método del pedido la primera vez que el cliente elige cómo pagar. Si ya tiene otro, no
 * lo cambia: para eso está `changePaymentMethod`. Llamar dentro de la transacción del proveedor.
 */
export async function lockPaymentMethod(
  tx: Tx,
  actor: Actor,
  order: OrderRow,
  method: PaymentMethod,
): Promise<void> {
  if (order.paymentMethod === method) return;
  if (order.paymentMethod) {
    throw new AppError(
      'PAYMENT_METHOD_LOCKED',
      409,
      `Este pedido se paga con ${PAYMENT_METHOD_LABELS[order.paymentMethod]}. Si quieres pagar de otra forma, usa «Cambiar método de pago».`,
    );
  }
  const [updated] = await tx
    .update(orders)
    .set({ paymentMethod: method, updatedAt: sql`now()` })
    .where(and(eq(orders.id, order.id), sql`${orders.paymentMethod} is null`))
    .returning({ id: orders.id });
  if (!updated) throw new AppError('CONFLICT', 409, 'El pedido cambió; recarga la página.');
  await audit(tx, actor, {
    entityType: 'order',
    entityId: order.id,
    action: 'order.payment_method_set',
    data: { method },
  });
  order.paymentMethod = method;
}

export const changePaymentMethodSchema = z.strictObject({
  to: z.enum(PAYMENT_METHODS),
  /** El cliente confirma que no pagó ni va a pagar con el método anterior. */
  confirm: z.literal(true),
});

/**
 * Cambio explícito de método de pago. Solo mientras el pedido espera pago y sin ningún pago
 * registrado (de ningún proveedor) ni transferencia Nequi avisada. Cierra los intentos abiertos
 * de Mercado Pago sin llamarlo; si aun así llegara un pago del método anterior, nunca paga el
 * pedido: queda para reembolso (ver `applyProviderPayment`). Así no hay cobros ni entregas dobles.
 */
export async function changePaymentMethod(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  actor: Actor,
  to: PaymentMethod,
): Promise<OrderRow> {
  requirePaymentMethod(deps, to);
  return deps.db.transaction(async (tx) => {
    const order = await loadOrderForAccess(deps, tx, publicRef, access, true);
    if (order.status !== 'AWAITING_PAYMENT' || order.expiresAt.getTime() <= deps.now().getTime()) {
      throw invalidState('Este pedido ya no espera pago: el método no se puede cambiar.');
    }
    const from = order.paymentMethod;
    if (from === to) return order;
    if (!from) {
      await lockPaymentMethod(tx, actor, order, to);
      return order;
    }
    const [anyPayment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    if (anyPayment) {
      throw new AppError(
        'PAYMENT_ALREADY_STARTED',
        409,
        'Ya hay un pago registrado para este pedido: no se puede cambiar el método. Escríbenos a soporte.',
      );
    }
    const [reported] = await tx
      .select({ id: nequiTransfers.id })
      .from(nequiTransfers)
      .where(and(eq(nequiTransfers.orderId, order.id), eq(nequiTransfers.status, 'REPORTED')))
      .limit(1);
    if (reported) {
      throw new AppError(
        'NEQUI_TRANSFER_REPORTED',
        409,
        'Avisaste una transferencia Nequi para este pedido: espera a que la verifiquemos o escríbenos. No pagues por otro medio.',
      );
    }
    const closed = await tx
      .update(paymentAttempts)
      .set({ status: 'CLOSED', lastError: 'payment_method_changed', updatedAt: sql`now()` })
      .where(
        and(
          eq(paymentAttempts.orderId, order.id),
          sql`${paymentAttempts.status} in ('CREATING', 'OPEN')`,
        ),
      )
      .returning({ id: paymentAttempts.id });
    const [updated] = await tx
      .update(orders)
      .set({ paymentMethod: to, updatedAt: sql`now()` })
      .where(and(eq(orders.id, order.id), eq(orders.paymentMethod, from)))
      .returning({ id: orders.id });
    if (!updated) throw new AppError('CONFLICT', 409, 'El pedido cambió; recarga la página.');
    await audit(tx, actor, {
      entityType: 'order',
      entityId: order.id,
      action: 'order.payment_method_changed',
      data: { from, to, attemptsClosed: closed.length },
    });
    order.paymentMethod = to;
    return order;
  });
}

const PIN_EVIDENCE =
  'PIN del inventario entregado automáticamente al cliente (canje en pagostore.com).';

/**
 * PIN_AUTO_DELIVERY: con PIN para todas las unidades, el pedido recién pagado queda entregado
 * en la misma transacción (nunca dos veces: la orden y la entrega cambian con CAS). Sin PIN
 * suficientes, o con las entregas pausadas, sigue en la cola manual.
 */
async function autoDeliverPins(
  deps: ServiceDeps,
  tx: Tx,
  actor: Actor,
  order: OrderRow,
): Promise<void> {
  if (!deps.config.orders.pinAutoDelivery || !deps.config.flags.fulfillmentEnabled) return;
  // La entrega debe seguir en cola y bloqueada para esta transacción; si no, no se toca nada
  // (el pago ya quedó registrado y el pedido sigue el camino manual).
  const [ready] = await tx
    .select({ id: fulfillments.id })
    .from(fulfillments)
    .where(
      and(eq(fulfillments.orderId, order.id), eq(fulfillments.status, 'READY_FOR_FULFILLMENT')),
    )
    .for('update');
  if (!ready) return;
  const now = deps.now();
  const pins = await deliverFromInventory(tx, order.id, now);
  if (!pins) return;
  await transitionOrder(tx, actor, order, 'DELIVERING');
  await tx
    .update(fulfillments)
    .set({
      status: 'DELIVERED',
      startedAt: now,
      deliveredAt: now,
      evidence: PIN_EVIDENCE,
      updatedAt: sql`now()`,
    })
    .where(eq(fulfillments.id, ready.id));
  await audit(tx, actor, {
    entityType: 'fulfillment',
    entityId: ready.id,
    action: 'fulfillment.auto_pin',
    fromStatus: 'READY_FOR_FULFILLMENT',
    toStatus: 'DELIVERED',
    // Solo la cantidad: nunca los PIN.
    data: { orderId: order.id, pins },
  });
  await transitionOrder(tx, actor, order, 'DELIVERED', {}, { method: 'pin' });
  await enqueueOrderNotifications(deps, tx, order.id, 'delivered');
}

/**
 * Efectos de «pedido pagado», iguales para todos los proveedores. Llamar solo cuando el proveedor
 * del pedido ya confirmó con su propio mecanismo y su pago quedó como el pago del pedido.
 */
export async function markOrderPaid(
  deps: ServiceDeps,
  tx: Tx,
  actor: Actor,
  order: OrderRow,
  paymentId: string,
): Promise<void> {
  await transitionOrder(tx, actor, order, 'PAID', {}, { paymentId });
  // Comprobante N.º consecutivo: existe si y solo si el pago quedó guardado.
  await assignReceiptNumber(tx, order.id);
  await closeOpenAttempts(tx, order.id, 'CLOSED');
  await tx
    .insert(fulfillments)
    .values({
      orderId: order.id,
      mode: deps.config.fulfillmentMode,
      status: 'READY_FOR_FULFILLMENT',
    })
    .onConflictDoNothing();
  await audit(tx, actor, {
    entityType: 'fulfillment',
    entityId: order.id,
    action: 'fulfillment.ready',
    toStatus: 'READY_FOR_FULFILLMENT',
  });
  // Aviso al dueño y al cliente: existe si y solo si el pago quedó guardado.
  await enqueueOrderNotifications(deps, tx, order.id, 'paid');
  await autoDeliverPins(deps, tx, actor, order);
  // Sin PIN: si el distribuidor cubre el pedido, la recarga directa se encarga.
  await routeToProvider(deps, tx, order);
}
