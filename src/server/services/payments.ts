import { and, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Tx } from '../db/client.js';
import {
  fulfillments,
  orderItems,
  orders,
  paymentAttempts,
  paymentEvents,
  payments,
  type PaymentStatus,
} from '../db/schema.js';
import {
  mapMercadoPagoStatus,
  PaymentProviderError,
  type ProviderPayment,
} from '../integrations/payments/gateway.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, type Actor, type ServiceDeps } from './context.js';
import {
  closeOpenAttempts,
  loadOrderForAccess,
  transitionOrder,
  type OrderAccess,
} from './orders.js';

const unavailable = () =>
  new AppError(
    'PAYMENT_PROVIDER_UNAVAILABLE',
    503,
    'Mercado Pago no responde en este momento. Tu pedido sigue guardado; inténtalo de nuevo.',
  );

function requireGateway(deps: ServiceDeps) {
  if (!deps.config.flags.paymentsEnabled || !deps.gateway) {
    throw new AppError('PAYMENTS_DISABLED', 503, 'Los pagos no están habilitados en este momento.');
  }
  return deps.gateway;
}

// ── Inicio del pago ("Confirmar y pagar") ────────────────────────────────────

export async function startPayment(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  actor: Actor,
): Promise<{ checkoutUrl: string }> {
  const gateway = requireGateway(deps);
  const base = deps.config.publicBaseUrl;
  if (!base) throw new AppError('PAYMENTS_DISABLED', 503, 'Falta PUBLIC_BASE_URL.');
  const now = deps.now();

  // 1) Reserva (o reutiliza) el único intento abierto de la orden.
  const plan = await deps.db.transaction(async (tx) => {
    const order = await loadOrderForAccess(deps, tx, publicRef, access, true);
    if (order.status !== 'AWAITING_PAYMENT' || order.verificationStatus !== 'CONFIRMED') {
      throw invalidState('Esta orden no está lista para pagar.');
    }
    if (order.expiresAt.getTime() <= now.getTime()) {
      throw new AppError('ORDER_EXPIRED', 409, 'El tiempo para pagar este pedido terminó.');
    }
    const [open] = await tx
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.orderId, order.id),
          inArray(paymentAttempts.status, ['CREATING', 'OPEN']),
        ),
      )
      .for('update');
    if (open?.status === 'OPEN' && open.checkoutUrl) {
      return { order, attempt: open, reuse: true };
    }
    if (open) return { order, attempt: open, reuse: false };
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        orderId: order.id,
        status: 'CREATING',
        idempotencyKey: randomUUID(),
        amountCop: order.totalCop,
        currency: 'COP',
        expiresAt: order.expiresAt,
      })
      .returning();
    if (!attempt) throw new Error('no se creó el intento de pago');
    await audit(tx, actor, {
      entityType: 'payment_attempt',
      entityId: attempt.id,
      action: 'payment_attempt.created',
      toStatus: 'CREATING',
      data: { orderId: order.id, amountCop: order.totalCop },
    });
    return { order, attempt, reuse: false };
  });
  if (plan.reuse && plan.attempt.checkoutUrl) return { checkoutUrl: plan.attempt.checkoutUrl };

  // 2) Crea la preferencia fuera de la transacción (llamada de red). Repetir es seguro: la
  //    clave de idempotencia es la misma en cada intento.
  const items = await deps.db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, plan.order.id));
  let session;
  try {
    session = await gateway.createCheckout(
      {
        orderRef: plan.order.publicRef,
        items: items.map((item) => ({
          id: item.sku,
          title: item.name,
          quantity: item.quantity,
          unitPriceCop: item.unitPriceCop,
        })),
        totalCop: plan.order.totalCop,
        expiresAt: plan.order.expiresAt,
        returnUrl: `${base}/?pedido=${encodeURIComponent(plan.order.publicRef)}#seguimiento`,
        notificationUrl: `${base}/api/webhooks/mercadopago`,
      },
      plan.attempt.idempotencyKey,
    );
  } catch (error) {
    const uncertain = error instanceof PaymentProviderError && error.uncertain;
    deps.log.warn({ err: error, attemptId: plan.attempt.id, uncertain }, 'createCheckout failed');
    if (!uncertain) {
      await deps.db
        .update(paymentAttempts)
        .set({ status: 'FAILED', lastError: 'provider_rejected', updatedAt: sql`now()` })
        .where(
          and(eq(paymentAttempts.id, plan.attempt.id), eq(paymentAttempts.status, 'CREATING')),
        );
    }
    throw unavailable();
  }

  // 3) Abre el intento (CAS: solo si sigue CREATING).
  const [opened] = await deps.db
    .update(paymentAttempts)
    .set({
      status: 'OPEN',
      preferenceId: session.preferenceId,
      checkoutUrl: session.checkoutUrl,
      updatedAt: sql`now()`,
    })
    .where(and(eq(paymentAttempts.id, plan.attempt.id), eq(paymentAttempts.status, 'CREATING')))
    .returning();
  if (!opened) {
    // Otra petición lo abrió (misma preferencia por idempotencia) o la orden expiró.
    const [current] = await deps.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, plan.attempt.id));
    if (current?.status === 'OPEN' && current.checkoutUrl)
      return { checkoutUrl: current.checkoutUrl };
    throw invalidState('El intento de pago ya no está disponible.');
  }
  await audit(deps.db, actor, {
    entityType: 'payment_attempt',
    entityId: opened.id,
    action: 'payment_attempt.opened',
    fromStatus: 'CREATING',
    toStatus: 'OPEN',
    data: { preferenceId: session.preferenceId },
  });
  return { checkoutUrl: session.checkoutUrl };
}

// ── Aplicación del resultado oficial del proveedor ───────────────────────────

export interface ApplyResult {
  orderRef: string | undefined;
  paymentStatus: PaymentStatus | undefined;
  ignored: boolean;
}

/**
 * Aplica un pago consultado a Mercado Pago. Idempotente: repetirlo con los mismos datos no
 * tiene efecto (UNIQUE del id del proveedor, CAS de estados, bloqueo de la orden).
 */
export async function applyProviderPayment(
  deps: ServiceDeps,
  payment: ProviderPayment,
  actor: Actor,
): Promise<ApplyResult> {
  const ref = payment.externalReference;
  if (!ref) return { orderRef: undefined, paymentStatus: undefined, ignored: true };
  const mapped = mapMercadoPagoStatus(payment.status);

  return deps.db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.publicRef, ref))
      .limit(1)
      .for('update');
    if (!order) return { orderRef: ref, paymentStatus: undefined, ignored: true };

    const amountMatches =
      payment.currency === 'COP' &&
      typeof payment.amount === 'number' &&
      payment.amount === order.totalCop;
    const [existing] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, 'mercadopago'), eq(payments.providerPaymentId, payment.id)))
      .for('update');
    const [attempt] = await tx
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, order.id))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);

    // Un pago marcado para reembolso no vuelve a contar como pago de la orden.
    const status: PaymentStatus =
      existing?.status === 'NEEDS_REFUND' && mapped === 'APPROVED' ? 'NEEDS_REFUND' : mapped;
    const values = {
      status,
      providerStatus: payment.status,
      providerStatusDetail: payment.statusDetail ?? null,
      amountCop: Math.round(payment.amount ?? 0),
      currency: payment.currency ?? 'UNKNOWN',
      amountMatches,
      approvedAt: payment.approvedAt ?? null,
      lastSyncedAt: deps.now(),
    };
    let row: typeof existing;
    if (!existing) {
      [row] = await tx
        .insert(payments)
        .values({
          ...values,
          orderId: order.id,
          attemptId: attempt?.id ?? null,
          provider: 'mercadopago',
          providerPaymentId: payment.id,
        })
        .returning();
    } else if (existing.status !== status || existing.providerStatus !== payment.status) {
      [row] = await tx
        .update(payments)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(payments.id, existing.id))
        .returning();
    } else {
      await tx
        .update(payments)
        .set({ lastSyncedAt: deps.now() })
        .where(eq(payments.id, existing.id));
      return { orderRef: ref, paymentStatus: status, ignored: false };
    }
    if (!row) throw new Error('no se guardó el pago');
    await audit(tx, actor, {
      entityType: 'payment',
      entityId: row.id,
      action: 'payment.synced',
      fromStatus: existing?.status,
      toStatus: status,
      data: {
        orderId: order.id,
        providerPaymentId: payment.id,
        providerStatus: payment.status,
        amountMatches,
      },
    });

    await applyOrderEffects(deps, tx, actor, order, row, status, amountMatches);
    return { orderRef: ref, paymentStatus: status, ignored: false };
  });
}

async function applyOrderEffects(
  deps: ServiceDeps,
  tx: Tx,
  actor: Actor,
  order: typeof orders.$inferSelect,
  payment: typeof payments.$inferSelect,
  status: PaymentStatus,
  amountMatches: boolean,
): Promise<void> {
  const review = async (reason: string) => {
    if (order.status !== 'NEEDS_REVIEW' && order.status !== 'REFUNDED') {
      await transitionOrder(
        tx,
        actor,
        order,
        'NEEDS_REVIEW',
        {},
        { reason, paymentId: payment.id },
      );
    }
  };

  if (status === 'APPROVED') {
    if (!amountMatches) return review('amount_or_currency_mismatch');
    if (payment.isOrderPayment) return;
    const [other] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.isOrderPayment, true)));
    if (other) {
      // Segundo pago aprobado de la misma orden: nunca se entrega dos veces.
      await tx
        .update(payments)
        .set({ status: 'NEEDS_REFUND', updatedAt: sql`now()` })
        .where(eq(payments.id, payment.id));
      await audit(tx, actor, {
        entityType: 'payment',
        entityId: payment.id,
        action: 'payment.duplicate_needs_refund',
        fromStatus: 'APPROVED',
        toStatus: 'NEEDS_REFUND',
        data: { orderId: order.id, alert: true },
      });
      return;
    }
    await tx
      .update(payments)
      .set({ isOrderPayment: true, updatedAt: sql`now()` })
      .where(eq(payments.id, payment.id));
    if (order.status === 'AWAITING_PAYMENT') {
      await transitionOrder(tx, actor, order, 'PAID', {}, { paymentId: payment.id });
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
      return;
    }
    // Pago aprobado de una orden que no lo esperaba (expirada, rechazada…): revisión humana.
    return review(`late_or_unexpected_payment_from_${order.status}`);
  }

  if (status === 'REFUNDED' && payment.isOrderPayment) {
    if (
      order.status !== 'REFUNDED' &&
      order.status !== 'NEEDS_REVIEW' &&
      !['PAID', 'DELIVERING', 'DELIVERED'].includes(order.status)
    ) {
      return review('refund_on_unexpected_status');
    }
    if (order.status !== 'REFUNDED') {
      await transitionOrder(tx, actor, order, 'REFUNDED', {}, { paymentId: payment.id });
    }
    await tx
      .update(fulfillments)
      .set({ status: 'CANCELLED', updatedAt: sql`now()` })
      .where(
        and(
          eq(fulfillments.orderId, order.id),
          inArray(fulfillments.status, ['READY_FOR_FULFILLMENT', 'CLAIMED', 'FAILED']),
        ),
      );
    return;
  }

  if (status === 'DISPUTED' && payment.isOrderPayment) return review('payment_disputed');
  if (status === 'UNKNOWN') return review('unknown_provider_status');
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export interface WebhookNotification {
  topic: string | undefined;
  dataId: string | undefined;
  requestId: string | undefined;
  signature: string | undefined;
}

/**
 * Procesa una notificación de Mercado Pago: autentica la firma, deduplica, consulta el pago a
 * Mercado Pago (nunca confía en el cuerpo) y aplica el resultado.
 * Devuelve `accepted=false` solo si la firma no es válida.
 */
export async function handleWebhook(
  deps: ServiceDeps,
  notification: WebhookNotification,
  actor: Actor,
): Promise<{ accepted: boolean }> {
  const gateway = deps.gateway;
  if (!gateway) return { accepted: false };
  if (
    !gateway.verifyWebhook({
      signature: notification.signature,
      requestId: notification.requestId,
      dataId: notification.dataId,
    })
  ) {
    deps.log.warn(
      { requestIdMp: notification.requestId, alert: 'webhook_invalid' },
      'invalid webhook signature',
    );
    await audit(deps.db, actor, {
      entityType: 'webhook',
      entityId: notification.dataId ?? 'unknown',
      action: 'webhook.invalid_signature',
      data: { alert: true },
    });
    return { accepted: false };
  }
  if (
    notification.topic !== 'payment' ||
    !notification.dataId ||
    !/^\d{1,30}$/.test(notification.dataId)
  ) {
    return { accepted: true }; // Firmada pero de otro tipo: se reconoce y se ignora.
  }
  const dedupeKey = `${notification.topic}:${notification.dataId}:${notification.requestId ?? ''}`;
  const [event] = await deps.db
    .insert(paymentEvents)
    .values({
      dedupeKey,
      requestId: notification.requestId ?? null,
      topic: notification.topic,
      resourceId: notification.dataId,
    })
    .onConflictDoNothing()
    .returning();
  if (!event) return { accepted: true }; // Duplicado exacto: ya se registró.
  await processPaymentEvent(deps, event.id, notification.dataId, actor);
  return { accepted: true };
}

/** Consulta el pago y lo aplica. Si falla, el evento queda FAILED y lo reintenta el scheduler. */
export async function processPaymentEvent(
  deps: ServiceDeps,
  eventId: number,
  paymentId: string,
  actor: Actor,
): Promise<void> {
  const gateway = deps.gateway;
  if (!gateway) return;
  try {
    const payment = await gateway.getPayment(paymentId);
    const result = await applyProviderPayment(deps, payment, actor);
    await deps.db
      .update(paymentEvents)
      .set({
        status: result.ignored ? 'IGNORED' : 'PROCESSED',
        processedAt: deps.now(),
        attempts: sql`${paymentEvents.attempts} + 1`,
        lastError: null,
      })
      .where(eq(paymentEvents.id, eventId));
  } catch (error) {
    deps.log.warn({ err: error, eventId }, 'payment event processing failed');
    await deps.db
      .update(paymentEvents)
      .set({
        status: 'FAILED',
        attempts: sql`${paymentEvents.attempts} + 1`,
        lastError: error instanceof PaymentProviderError ? 'provider_error' : 'processing_error',
      })
      .where(eq(paymentEvents.id, eventId));
  }
}

// ── Conciliación ─────────────────────────────────────────────────────────────

/** Consulta a Mercado Pago todos los pagos de una orden y los aplica. Seguro de repetir. */
export async function reconcileOrder(
  deps: ServiceDeps,
  publicRef: string,
  actor: Actor,
): Promise<number> {
  const gateway = deps.gateway;
  if (!gateway) return 0;
  const found = await gateway.searchPaymentsByReference(publicRef);
  for (const payment of found) {
    // Solo pagos cuya referencia coincide exactamente con la orden.
    if (payment.externalReference === publicRef) await applyProviderPayment(deps, payment, actor);
  }
  return found.length;
}

/** Retorno del navegador desde Mercado Pago: solo dispara una consulta en servidor. */
export async function syncOrderFromReturn(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  actor: Actor,
): Promise<void> {
  await loadOrderForAccess(deps, deps.db, publicRef, access);
  if (!deps.gateway) return;
  try {
    await reconcileOrder(deps, publicRef, actor);
  } catch (error) {
    // El cliente sigue viendo el estado guardado; la conciliación periódica lo resolverá.
    deps.log.warn({ err: error, publicRef }, 'return sync failed');
  }
}

/** Órdenes con pagos por resolver (intentos abiertos, pagos pendientes o eventos fallidos). */
export async function ordersNeedingReconciliation(
  deps: ServiceDeps,
  limit: number,
): Promise<string[]> {
  const staleBefore = new Date(deps.now().getTime() - 2 * 60_000);
  const rows = await deps.db
    .selectDistinct({ ref: orders.publicRef })
    .from(orders)
    .leftJoin(paymentAttempts, eq(paymentAttempts.orderId, orders.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(
      or(
        and(eq(paymentAttempts.status, 'OPEN'), lt(paymentAttempts.updatedAt, staleBefore)),
        and(
          inArray(payments.status, ['PENDING', 'UNKNOWN', 'DISPUTED', 'NEEDS_REFUND']),
          lt(payments.lastSyncedAt, staleBefore),
        ),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.ref);
}

export async function failedPaymentEvents(deps: ServiceDeps, limit: number) {
  return deps.db
    .select({ id: paymentEvents.id, resourceId: paymentEvents.resourceId })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.status, 'FAILED'),
        lt(paymentEvents.attempts, 20),
        ne(paymentEvents.topic, ''),
      ),
    )
    .orderBy(paymentEvents.receivedAt)
    .limit(limit);
}
