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
import { PARTIAL_REFUND_DETAIL } from '../domain/order-states.js';
import {
  mapMercadoPagoStatus,
  PaymentProviderError,
  type PayMeans,
  type ProviderPayment,
} from '../integrations/payments/gateway.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, type Actor, type ServiceDeps } from './context.js';
import { deliverFromInventory } from './inventory.js';
import { kickTopups, routeToProvider } from './topups.js';
import { assignReceiptNumber } from './receipts.js';
import {
  deliverNotifications,
  enqueueOrderNotifications,
  enqueueSheetSync,
} from './notifications.js';
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
  payMeans?: PayMeans,
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
    const means = payMeans ?? null;
    if (open?.status === 'OPEN' && open.checkoutUrl) {
      if ((open.payMeans ?? null) === means) return { order, attempt: open, reuse: true };
      // Otro medio: la preferencia anterior solo ofrece el medio viejo. Se cierra este intento y
      // se crea otro. Un pago hecho en la preferencia anterior se sigue aplicando por la
      // referencia del pedido, y un segundo pago aprobado queda para reembolso (nunca dos
      // entregas).
      await tx
        .update(paymentAttempts)
        .set({ status: 'CLOSED', lastError: 'pay_means_changed', updatedAt: sql`now()` })
        .where(and(eq(paymentAttempts.id, open.id), eq(paymentAttempts.status, 'OPEN')));
      await audit(tx, actor, {
        entityType: 'payment_attempt',
        entityId: open.id,
        action: 'payment_attempt.closed',
        fromStatus: 'OPEN',
        toStatus: 'CLOSED',
        data: { orderId: order.id, reason: 'pay_means_changed', from: open.payMeans, to: means },
      });
    } else if (open) {
      return { order, attempt: open, reuse: false };
    }
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        orderId: order.id,
        status: 'CREATING',
        payMeans: means,
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
      data: { orderId: order.id, amountCop: order.totalCop, payMeans: means },
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
        payMeans,
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

  const applied = await deps.db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.publicRef, ref))
      .limit(1)
      .for('update');
    if (!order)
      return { orderRef: ref, paymentStatus: undefined, ignored: true, notifyOrderId: undefined };

    const amountMatches =
      payment.currency === 'COP' &&
      typeof payment.amount === 'number' &&
      payment.amount === order.totalCop;
    // Un pago de prueba nunca cuenta en producción, ni uno real en sandbox. Sin `live_mode`
    // no se puede saber: también va a revisión.
    const modeMatches = payment.liveMode === (deps.config.mercadoPago?.mode === 'production');
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
      paymentMethodId: payment.paymentMethodId ?? null,
      paymentTypeId: payment.paymentTypeId ?? null,
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
    } else if (
      existing.status !== status ||
      existing.providerStatus !== payment.status ||
      // Un reembolso parcial deja el estado en `approved` y solo cambia el detalle.
      existing.providerStatusDetail !== (payment.statusDetail ?? null)
    ) {
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
      return { orderRef: ref, paymentStatus: status, ignored: false, notifyOrderId: undefined };
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
        providerStatusDetail: payment.statusDetail ?? null,
        amountMatches,
        liveMode: payment.liveMode ?? null,
        modeMatches,
      },
    });

    const effect = await applyOrderEffects(
      deps,
      tx,
      actor,
      order,
      row,
      status,
      amountMatches,
      modeMatches,
    );
    return {
      orderRef: ref,
      paymentStatus: status,
      ignored: false,
      notifyOrderId: effect ? order.id : undefined,
    };
  });
  // Solo tras confirmar la transacción: el aviso nunca anuncia un pago que no quedó guardado.
  const { notifyOrderId, ...result } = applied;
  if (notifyOrderId) {
    await deliverNotifications(deps, { orderId: notifyOrderId });
    kickTopups(deps, notifyOrderId);
  }
  return result;
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
  order: typeof orders.$inferSelect,
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

async function applyOrderEffects(
  deps: ServiceDeps,
  tx: Tx,
  actor: Actor,
  order: typeof orders.$inferSelect,
  payment: typeof payments.$inferSelect,
  status: PaymentStatus,
  amountMatches: boolean,
  modeMatches: boolean,
): Promise<'PAID' | 'REFUNDED' | void> {
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
      // Si el pedido ya estaba pagado, su fila de «Entregas» pasa a «Requiere revisión».
      await enqueueSheetSync(deps, tx, order.id);
    }
  };

  if (status === 'APPROVED') {
    // Mercado Pago devolvió parte del dinero: el pago ya no cubre el pedido completo. Revisión
    // humana, se haya entregado o no (el reembolso total sí cierra el pedido, más abajo).
    if (payment.providerStatusDetail === PARTIAL_REFUND_DETAIL) {
      return review('payment_partially_refunded');
    }
    if (!amountMatches) return review('amount_or_currency_mismatch');
    if (!modeMatches) return review('live_mode_mismatch');
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
      return 'PAID';
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
    let refundedNow = false;
    if (order.status !== 'REFUNDED') {
      await transitionOrder(tx, actor, order, 'REFUNDED', {}, { paymentId: payment.id });
      await enqueueOrderNotifications(deps, tx, order.id, 'refunded');
      refundedNow = true;
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
    return refundedNow ? 'REFUNDED' : undefined;
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
 * Antigüedad del `ts` firmado en la cabecera `x-signature` («ts=…,v1=…») de Mercado Pago.
 * Solo se registra (H-04, docs/seguridad/HALLAZGOS.md): con datos reales se decide la tolerancia.
 * Un `ts` de 13 cifras o más se interpreta como milisegundos y se informa la unidad detectada.
 */
export function webhookSignatureAge(
  signature: string | undefined,
  now: Date,
): { seconds: number; unit: 'seconds' | 'milliseconds' } | undefined {
  const match = /(?:^|,)\s*ts=(\d{9,16})\s*(?:,|$)/.exec(signature ?? '');
  if (!match?.[1]) return undefined;
  const raw = Number(match[1]);
  const unit = raw >= 1e12 ? 'milliseconds' : 'seconds';
  const signedAtMs = unit === 'milliseconds' ? raw : raw * 1000;
  return { seconds: Math.round((now.getTime() - signedAtMs) / 1000), unit };
}

/**
 * Una firma inválida se registra en la auditoría como mucho una vez por minuto y por IP (y 30 por
 * minuto en total): la auditoría es de solo inserción y el escudo no bloquea esta ruta, así que sin
 * límite cualquiera podría llenar (y mantener despierta) la base de datos con avisos falsos. Las
 * repeticiones se cuentan en el siguiente evento (`suppressed`); el log del servidor las ve todas.
 */
const INVALID_AUDIT_WINDOW_MS = 60_000;
const INVALID_AUDIT_MAX_PER_WINDOW = 30;
const invalidAudits = new Map<string, { at: number; suppressed: number }>();
let invalidWindow = { start: 0, count: 0 };

function invalidWebhookAudit(key: string, nowMs: number): { due: boolean; suppressed: number } {
  if (nowMs - invalidWindow.start >= INVALID_AUDIT_WINDOW_MS) {
    invalidWindow = { start: nowMs, count: 0 };
  }
  const last = invalidAudits.get(key);
  if (
    (last && nowMs - last.at < INVALID_AUDIT_WINDOW_MS) ||
    invalidWindow.count >= INVALID_AUDIT_MAX_PER_WINDOW
  ) {
    if (last) last.suppressed += 1;
    return { due: false, suppressed: 0 };
  }
  // Memoria acotada: pasadas mil IPs distintas se empieza de nuevo.
  if (invalidAudits.size >= 1000) invalidAudits.clear();
  invalidAudits.set(key, { at: nowMs, suppressed: 0 });
  invalidWindow.count += 1;
  return { due: true, suppressed: last?.suppressed ?? 0 };
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
    const record = invalidWebhookAudit(actor.ipHash ?? 'sin-ip', deps.now().getTime());
    if (record.due) {
      await audit(deps.db, actor, {
        entityType: 'webhook',
        entityId: notification.dataId ?? 'unknown',
        action: 'webhook.invalid_signature',
        data: { alert: true, suppressed: record.suppressed },
      });
    }
    return { accepted: false };
  }
  const age = webhookSignatureAge(notification.signature, deps.now());
  deps.log.info(
    { requestIdMp: notification.requestId, tsAgeSeconds: age?.seconds, tsUnit: age?.unit },
    'webhook signature age',
  );
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
