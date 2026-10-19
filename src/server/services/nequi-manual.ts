import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import { fulfillments, nequiTransfers, notifications, orders, payments } from '../db/schema.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, notFound, type Actor, type ServiceDeps } from './context.js';
import {
  deliverNotifications,
  enqueueOrderNotifications,
  enqueueSheetSync,
} from './notifications.js';
import { lockPaymentMethod, markOrderPaid } from './order-payment.js';
import {
  isUniqueViolation,
  loadOrderForAccess,
  transitionOrder,
  type OrderAccess,
  type OrderRow,
} from './orders.js';
import { DEFAULT_REVIEW_HOURS } from './nequi-view.js';
import { requirePaymentMethod } from './payment-methods.js';
import { kickTopups } from './topups.js';

/**
 * Nequi por transferencia (NequiManualPayment), independiente de Mercado Pago:
 *
 *   el cliente elige Nequi → ve el celular del dueño, el total exacto y la referencia del pedido
 *   → transfiere desde su app Nequi → (opcional) avisa con los 4 últimos dígitos de su Nequi →
 *   el dueño ve el movimiento en SU app Nequi → lo confirma en el panel con la referencia de ese
 *   movimiento y el monto → el pedido queda pagado y entra a la cola de entrega.
 *
 * - La única confirmación es la del dueño autenticado (doble factor). Ni una captura, ni el aviso
 *   del cliente, ni el navegador, ni Mercado Pago confirman un pago Nequi.
 * - Nunca llama a Mercado Pago ni usa su configuración; si Nequi falla, Mercado Pago sigue igual.
 * - Una referencia de Nequi confirma un solo pedido (índice único) y el monto debe ser el total.
 * - Del cliente solo se guardan los 4 últimos dígitos de su Nequi, nunca el número completo.
 */

const nequiReference = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{4,40}$/, 'Referencia de Nequi: 4 a 40 letras, números o guiones.');

export const reportNequiSchema = z.strictObject({
  senderLast4: z.string().regex(/^\d{4}$/, 'Escribe los 4 últimos dígitos de tu Nequi.'),
  reference: nequiReference.optional(),
});

export const confirmNequiSchema = z.strictObject({
  nequiReference,
  amountCop: z.number().int().positive().max(100_000_000),
});

export const rejectNequiSchema = z.strictObject({
  reason: z.string().trim().min(3).max(200),
});

function assertNequiOrder(order: OrderRow): void {
  if (order.paymentMethod !== 'nequi_manual') {
    throw invalidState('Este pedido no se paga por transferencia Nequi.');
  }
}

/** El cliente elige pagar por transferencia Nequi: el pedido queda con ese método. */
export async function chooseNequiManual(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  actor: Actor,
): Promise<OrderRow> {
  requirePaymentMethod(deps, 'nequi_manual');
  return deps.db.transaction(async (tx) => {
    const order = await loadOrderForAccess(deps, tx, publicRef, access, true);
    if (order.status !== 'AWAITING_PAYMENT' || order.verificationStatus !== 'CONFIRMED') {
      throw invalidState('Esta orden no está lista para pagar.');
    }
    if (order.expiresAt.getTime() <= deps.now().getTime()) {
      throw new AppError('ORDER_EXPIRED', 409, 'El tiempo para pagar este pedido terminó.');
    }
    await lockPaymentMethod(tx, actor, order, 'nequi_manual');
    return order;
  });
}

/**
 * El cliente avisa que transfirió. No confirma nada: el pedido sigue esperando pago, se mantiene
 * abierto `reviewHours` para que el dueño lo verifique y el dueño recibe un aviso. Funciona aunque
 * Nequi se haya apagado después de elegirlo (la plata pudo llegar igual).
 */
export async function reportNequiTransfer(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  actor: Actor,
  input: z.infer<typeof reportNequiSchema>,
): Promise<OrderRow> {
  const reviewHours = deps.config.nequi.manual?.reviewHours ?? DEFAULT_REVIEW_HOURS;
  const now = deps.now();
  const order = await deps.db.transaction(async (tx) => {
    const order = await loadOrderForAccess(deps, tx, publicRef, access, true);
    assertNequiOrder(order);
    if (order.status !== 'AWAITING_PAYMENT' || order.expiresAt.getTime() <= now.getTime()) {
      throw invalidState(
        'Este pedido ya no espera pago. Si ya transferiste, escríbenos con la referencia del pedido.',
      );
    }
    const values = {
      senderLast4: input.senderLast4,
      customerReference: input.reference ?? null,
      reportedAt: now,
    };
    const [open] = await tx
      .select({ id: nequiTransfers.id })
      .from(nequiTransfers)
      .where(and(eq(nequiTransfers.orderId, order.id), eq(nequiTransfers.status, 'REPORTED')))
      .for('update');
    if (open) {
      // Corrección del mismo aviso: solo cambian sus datos. Ni se vuelve a escribir al dueño ni se
      // alarga el plazo, así repetir el aviso no inunda su correo ni deja el pedido abierto sin fin.
      await tx
        .update(nequiTransfers)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(nequiTransfers.id, open.id));
    } else {
      // Aviso nuevo (el primero o tras un rechazo del dueño): plazo para verificar y correo.
      await tx.insert(nequiTransfers).values({ ...values, orderId: order.id, status: 'REPORTED' });
      const keepOpenUntil = new Date(now.getTime() + reviewHours * 3_600_000);
      if (order.expiresAt < keepOpenUntil) {
        await tx
          .update(orders)
          .set({ expiresAt: keepOpenUntil, updatedAt: sql`now()` })
          .where(eq(orders.id, order.id));
        order.expiresAt = keepOpenUntil;
      }
      await enqueueOwnerAlert(deps, tx, order.id);
    }
    // Sin los dígitos del cliente: el historial solo dice que hubo un aviso.
    await audit(tx, actor, {
      entityType: 'order',
      entityId: order.id,
      action: 'nequi_transfer.reported',
      data: {
        orderId: order.id,
        withReference: Boolean(input.reference),
        corrected: Boolean(open),
      },
    });
    return order;
  });
  await deliverNotifications(deps, { orderId: order.id });
  return order;
}

/** Aviso al dueño por correo (si hay correo configurado), uno por cada aviso nuevo del cliente. */
async function enqueueOwnerAlert(deps: ServiceDeps, tx: Tx, orderId: string): Promise<void> {
  if (!deps.mailer || !deps.config.adminEmails.length) return;
  const now = deps.now();
  await tx
    .insert(notifications)
    .values({ kind: 'nequi_reported_owner', channel: 'email', orderId, nextAttemptAt: now })
    .onConflictDoUpdate({
      target: [notifications.orderId, notifications.kind, notifications.channel],
      set: { status: 'PENDING', attempts: 0, lastError: null, sentAt: null, nextAttemptAt: now },
    });
}

/**
 * El dueño confirma que la transferencia llegó a su cuenta Nequi. Es la confirmación de pago de
 * este método: crea el pago `nequi_manual` del pedido. Si el pedido ya había vencido, queda en
 * revisión (como un pago tardío) para que el dueño decida en el panel.
 */
export async function confirmNequiTransfer(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof confirmNequiSchema>,
  actor: Actor,
): Promise<void> {
  if (actor.type !== 'admin' || !actor.userId) {
    throw new AppError('FORBIDDEN', 403, 'Solo el dueño confirma transferencias Nequi.');
  }
  const reviewer = actor.userId;
  const now = deps.now();
  let paid = false;
  try {
    await deps.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order) throw notFound();
      assertNequiOrder(order);
      if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'EXPIRED') {
        throw invalidState('Este pedido ya no espera pago.');
      }
      if (input.amountCop !== order.totalCop) {
        throw new AppError(
          'NEQUI_AMOUNT_MISMATCH',
          409,
          `El monto recibido no es el total del pedido (${order.totalCop} COP). No se confirma: resuélvelo con el cliente.`,
        );
      }
      const [payment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          provider: 'nequi_manual',
          providerPaymentId: input.nequiReference,
          status: 'APPROVED',
          providerStatus: 'verified_by_owner',
          amountCop: input.amountCop,
          currency: 'COP',
          amountMatches: true,
          approvedAt: now,
          lastSyncedAt: now,
        })
        .returning();
      if (!payment) throw new Error('no se guardó el pago Nequi');
      // El trigger payments_provider_matches_order exige que el pedido sea de Nequi.
      await tx
        .update(payments)
        .set({ isOrderPayment: true, updatedAt: sql`now()` })
        .where(eq(payments.id, payment.id));
      const reviewed = {
        status: 'CONFIRMED' as const,
        nequiReference: input.nequiReference,
        amountCop: input.amountCop,
        paymentId: payment.id,
        reviewedBy: reviewer,
        reviewedAt: now,
      };
      const [open] = await tx
        .select({ id: nequiTransfers.id })
        .from(nequiTransfers)
        .where(and(eq(nequiTransfers.orderId, order.id), eq(nequiTransfers.status, 'REPORTED')))
        .for('update');
      if (open) {
        await tx
          .update(nequiTransfers)
          .set({ ...reviewed, updatedAt: sql`now()` })
          .where(eq(nequiTransfers.id, open.id));
      } else {
        await tx.insert(nequiTransfers).values({ ...reviewed, orderId: order.id });
      }
      await audit(tx, actor, {
        entityType: 'payment',
        entityId: payment.id,
        action: 'nequi_transfer.confirmed',
        toStatus: 'APPROVED',
        data: { orderId: order.id, provider: 'nequi_manual', amountCop: input.amountCop },
      });
      if (order.status === 'AWAITING_PAYMENT') {
        await markOrderPaid(deps, tx, actor, order, payment.id);
        paid = true;
      } else {
        await transitionOrder(
          tx,
          actor,
          order,
          'NEEDS_REVIEW',
          {},
          { reason: 'late_nequi_transfer', paymentId: payment.id },
        );
        await enqueueSheetSync(deps, tx, order.id);
      }
    });
  } catch (error) {
    if (
      isUniqueViolation(error, 'payments_provider_payment_key') ||
      isUniqueViolation(error, 'nequi_transfers_reference_key')
    ) {
      throw new AppError(
        'NEQUI_REFERENCE_USED',
        409,
        'Esa referencia de Nequi ya confirmó otro pago: revisa el movimiento en tu app Nequi.',
      );
    }
    throw error;
  }
  await deliverNotifications(deps, { orderId });
  if (paid) kickTopups(deps, orderId);
}

/** El dueño no encontró la transferencia: el aviso queda rechazado y el pedido sigue esperando. */
export async function rejectNequiTransfer(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof rejectNequiSchema>,
  actor: Actor,
): Promise<void> {
  if (actor.type !== 'admin' || !actor.userId) {
    throw new AppError('FORBIDDEN', 403, 'Solo el dueño revisa transferencias Nequi.');
  }
  const reviewer = actor.userId;
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw notFound();
    assertNequiOrder(order);
    const [rejected] = await tx
      .update(nequiTransfers)
      .set({
        status: 'REJECTED',
        rejectionReason: input.reason,
        reviewedBy: reviewer,
        reviewedAt: deps.now(),
        updatedAt: sql`now()`,
      })
      .where(and(eq(nequiTransfers.orderId, order.id), eq(nequiTransfers.status, 'REPORTED')))
      .returning({ id: nequiTransfers.id });
    if (!rejected) throw invalidState('No hay una transferencia Nequi por verificar.');
    await audit(tx, actor, {
      entityType: 'order',
      entityId: order.id,
      action: 'nequi_transfer.rejected',
      data: { orderId: order.id, reason: input.reason },
    });
  });
}

export const nequiRefundSchema = z.strictObject({
  /** Referencia del movimiento de devolución en la app Nequi del dueño. */
  refundReference: nequiReference,
  note: z.string().trim().min(3).max(200),
});

/**
 * El dueño devolvió el dinero por Nequi (desde su app) y lo registra: el pago Nequi queda
 * reembolsado y el pedido cerrado como reembolsado, igual que un reembolso de Mercado Pago en un
 * pedido de Mercado Pago. Nunca toca pagos de otro proveedor.
 */
export async function recordNequiRefund(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof nequiRefundSchema>,
  actor: Actor,
): Promise<void> {
  if (actor.type !== 'admin' || !actor.userId) {
    throw new AppError('FORBIDDEN', 403, 'Solo el dueño registra devoluciones Nequi.');
  }
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw notFound();
    assertNequiOrder(order);
    if (!['PAID', 'DELIVERING', 'DELIVERED', 'NEEDS_REVIEW'].includes(order.status)) {
      throw invalidState('Este pedido no tiene un pago Nequi que devolver.');
    }
    const [refunded] = await tx
      .update(payments)
      .set({
        status: 'REFUNDED',
        providerStatus: 'refunded_by_owner',
        providerStatusDetail: input.refundReference,
        lastSyncedAt: deps.now(),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(payments.orderId, order.id),
          eq(payments.provider, 'nequi_manual'),
          eq(payments.isOrderPayment, true),
          eq(payments.status, 'APPROVED'),
        ),
      )
      .returning({ id: payments.id });
    if (!refunded) throw invalidState('Este pedido no tiene un pago Nequi aprobado.');
    await audit(tx, actor, {
      entityType: 'payment',
      entityId: refunded.id,
      action: 'nequi_payment.refunded',
      fromStatus: 'APPROVED',
      toStatus: 'REFUNDED',
      data: { orderId: order.id, note: input.note },
    });
    await transitionOrder(tx, actor, order, 'REFUNDED', {}, { paymentId: refunded.id });
    await tx
      .update(fulfillments)
      .set({ status: 'CANCELLED', updatedAt: sql`now()` })
      .where(
        and(
          eq(fulfillments.orderId, order.id),
          inArray(fulfillments.status, ['READY_FOR_FULFILLMENT', 'CLAIMED', 'FAILED']),
        ),
      );
    await enqueueOrderNotifications(deps, tx, order.id, 'refunded');
  });
  await deliverNotifications(deps, { orderId });
}

/** Pedidos con una transferencia Nequi avisada y sin revisar (alerta del panel). */
export async function pendingNequiCount(deps: ServiceDeps): Promise<number> {
  const [row] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(nequiTransfers)
    .where(eq(nequiTransfers.status, 'REPORTED'));
  return row?.n ?? 0;
}
