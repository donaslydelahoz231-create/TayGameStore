import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  auditEvents,
  blocklist,
  fulfillments,
  ORDER_STATUSES,
  orders,
  paymentAttempts,
  payments,
} from '../db/schema.js';
import { canTransitionFulfillment } from '../domain/state-machines.js';
import { AppError } from '../plugins/errors.js';
import { isUniqueViolation, toPublicOrder, transitionOrder } from './orders.js';
import { audit, invalidState, notFound, type Actor, type ServiceDeps } from './context.js';

// ── Órdenes ──────────────────────────────────────────────────────────────────

export const orderFilterSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});

export async function listOrdersForAdmin(
  deps: ServiceDeps,
  filter: z.infer<typeof orderFilterSchema>,
) {
  const conditions = [
    filter.status ? eq(orders.status, filter.status) : undefined,
    filter.q
      ? sql`(${orders.publicRef} = ${filter.q.toUpperCase()} or ${orders.playerUid} = ${filter.q} or ${orders.customerEmail} = ${filter.q.toLowerCase()})`
      : undefined,
  ].filter((condition) => condition !== undefined);
  return deps.db
    .select({
      id: orders.id,
      reference: orders.publicRef,
      status: orders.status,
      verificationStatus: orders.verificationStatus,
      playerUid: orders.playerUid,
      customerEmail: orders.customerEmail,
      totalCop: orders.totalCop,
      createdAt: orders.createdAt,
      expiresAt: orders.expiresAt,
    })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(100);
}

export async function getOrderForAdmin(deps: ServiceDeps, orderId: string) {
  const [order] = await deps.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw notFound();
  const [view, paymentRows, attempts, fulfillment, history] = await Promise.all([
    toPublicOrder(deps, deps.db, order),
    deps.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.createdAt)),
    deps.db
      .select({
        id: paymentAttempts.id,
        status: paymentAttempts.status,
        preferenceId: paymentAttempts.preferenceId,
        createdAt: paymentAttempts.createdAt,
        expiresAt: paymentAttempts.expiresAt,
      })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, order.id))
      .orderBy(desc(paymentAttempts.createdAt)),
    deps.db.select().from(fulfillments).where(eq(fulfillments.orderId, order.id)),
    deps.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'order'), eq(auditEvents.entityId, order.id)))
      .orderBy(desc(auditEvents.id))
      .limit(50),
  ]);
  return {
    id: order.id,
    order: view,
    verification: {
      status: order.verificationStatus,
      nickname: order.verifiedNickname,
      region: order.verifiedRegion,
      note: order.verificationNote,
      verifiedAt: order.verifiedAt,
      confirmedAt: order.confirmedAt,
    },
    payments: paymentRows.map((p) => ({
      id: p.id,
      providerPaymentId: p.providerPaymentId,
      status: p.status,
      providerStatus: p.providerStatus,
      providerStatusDetail: p.providerStatusDetail,
      amountCop: p.amountCop,
      currency: p.currency,
      amountMatches: p.amountMatches,
      isOrderPayment: p.isOrderPayment,
      approvedAt: p.approvedAt,
      lastSyncedAt: p.lastSyncedAt,
    })),
    attempts,
    fulfillment: fulfillment[0] ?? null,
    history,
  };
}

// ── Verificación manual del jugador ──────────────────────────────────────────

export const verifySchema = z.discriminatedUnion('result', [
  z.strictObject({
    result: z.literal('VERIFIED'),
    nickname: z.string().trim().min(1).max(40),
    region: z.string().trim().min(1).max(40),
    note: z.string().trim().max(200).optional(),
  }),
  z.strictObject({
    result: z.enum(['NOT_FOUND', 'AMBIGUOUS', 'BLOCKED_ACCOUNT']),
    note: z.string().trim().max(200).optional(),
  }),
]);

export async function verifyPlayer(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof verifySchema>,
  actor: Actor,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw notFound();
    if (
      order.status !== 'AWAITING_VERIFICATION' ||
      !['PENDING', 'VERIFIED'].includes(order.verificationStatus)
    ) {
      throw invalidState('La orden no está esperando verificación.');
    }
    const now = deps.now();
    if (input.result === 'VERIFIED') {
      const [updated] = await tx
        .update(orders)
        .set({
          verificationStatus: 'VERIFIED',
          verifiedNickname: input.nickname,
          verifiedRegion: input.region,
          verificationNote: input.note ?? null,
          verifiedBy: actor.userId ?? null,
          verifiedAt: now,
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, 'AWAITING_VERIFICATION')))
        .returning({ id: orders.id });
      if (!updated) throw new AppError('CONFLICT', 409, 'La orden cambió; recarga.');
      await audit(tx, actor, {
        entityType: 'order',
        entityId: order.id,
        action: 'verification.verified',
        fromStatus: order.verificationStatus,
        toStatus: 'VERIFIED',
        data: { region: input.region },
      });
      return;
    }
    await transitionOrder(
      tx,
      actor,
      order,
      'REJECTED',
      {
        verificationStatus: input.result,
        verificationNote: input.note ?? null,
        verifiedBy: actor.userId ?? null,
        verifiedAt: now,
      },
      { verification: input.result },
    );
  });
}

// ── Entrega manual ───────────────────────────────────────────────────────────

function requireFulfillmentEnabled(deps: ServiceDeps) {
  if (!deps.config.flags.fulfillmentEnabled) {
    throw new AppError('FULFILLMENT_DISABLED', 503, 'Las entregas están pausadas.');
  }
}

export type FulfillmentAction = 'claim' | 'release' | 'start' | 'deliver' | 'fail';

export const fulfillmentActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('claim') }),
  z.strictObject({ action: z.literal('release') }),
  z.strictObject({ action: z.literal('start') }),
  z.strictObject({ action: z.literal('deliver'), evidence: z.string().trim().min(3).max(500) }),
  z.strictObject({ action: z.literal('fail'), reason: z.string().trim().min(3).max(300) }),
]);

export async function fulfillmentAction(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof fulfillmentActionSchema>,
  actor: Actor,
): Promise<void> {
  requireFulfillmentEnabled(deps);
  const adminId = actor.userId;
  if (!adminId) throw new AppError('FORBIDDEN', 403, 'Acción no permitida.');
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    const [fulfillment] = await tx
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, orderId))
      .for('update');
    if (!order || !fulfillment) throw notFound();
    const now = deps.now();
    const claimExpired =
      fulfillment.claimedAt !== null &&
      now.getTime() - fulfillment.claimedAt.getTime() >
        deps.config.orders.claimTimeoutMinutes * 60_000;
    const mine = fulfillment.claimedBy === adminId;

    let to = fulfillment.status;
    const changes: Partial<typeof fulfillments.$inferInsert> = {};
    switch (input.action) {
      case 'claim': {
        // Nunca se entrega sin un pago aprobado, del importe correcto, asociado a la orden.
        const [paid] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.orderId, orderId),
              eq(payments.isOrderPayment, true),
              eq(payments.status, 'APPROVED'),
              eq(payments.amountMatches, true),
            ),
          );
        if (!paid || order.status !== 'PAID')
          throw invalidState('La orden no tiene un pago confirmado.');
        to = 'CLAIMED';
        Object.assign(changes, { claimedBy: adminId, claimedAt: now });
        break;
      }
      case 'release':
        if (!mine && !claimExpired)
          throw new AppError('FORBIDDEN', 403, 'La orden la reclamó otro operador.');
        to = 'READY_FOR_FULFILLMENT';
        Object.assign(changes, { claimedBy: null, claimedAt: null });
        break;
      case 'start':
        if (!mine) throw new AppError('FORBIDDEN', 403, 'Reclama la orden antes de entregarla.');
        to = 'DELIVERING';
        Object.assign(changes, { startedAt: now });
        break;
      case 'deliver':
        if (!mine)
          throw new AppError('FORBIDDEN', 403, 'Solo quien reclamó la orden puede entregarla.');
        to = 'DELIVERED';
        Object.assign(changes, {
          deliveredAt: now,
          deliveredBy: adminId,
          evidence: input.evidence,
        });
        break;
      case 'fail':
        if (!mine)
          throw new AppError('FORBIDDEN', 403, 'Solo quien reclamó la orden puede marcarla.');
        to = 'FAILED';
        Object.assign(changes, { failureReason: input.reason });
        break;
    }
    if (!canTransitionFulfillment(fulfillment.status, to)) {
      throw invalidState(`Acción no permitida en estado ${fulfillment.status}.`);
    }
    const [updated] = await tx
      .update(fulfillments)
      .set({ ...changes, status: to, updatedAt: sql`now()` })
      .where(and(eq(fulfillments.id, fulfillment.id), eq(fulfillments.status, fulfillment.status)))
      .returning({ id: fulfillments.id });
    if (!updated) throw new AppError('CONFLICT', 409, 'Otro operador cambió la entrega; recarga.');
    await audit(tx, actor, {
      entityType: 'fulfillment',
      entityId: fulfillment.id,
      action: `fulfillment.${input.action}`,
      fromStatus: fulfillment.status,
      toStatus: to,
      data: { orderId },
    });
    if (to === 'DELIVERING' && order.status === 'PAID')
      await transitionOrder(tx, actor, order, 'DELIVERING');
    if (to === 'DELIVERED') await transitionOrder(tx, actor, order, 'DELIVERED');
    if (to === 'FAILED')
      await transitionOrder(tx, actor, order, 'NEEDS_REVIEW', {}, { reason: 'fulfillment_failed' });
  });
}

// ── Resolución de revisiones ─────────────────────────────────────────────────

export const resolveReviewSchema = z.strictObject({
  resolution: z.enum(['resume_fulfillment', 'close']),
  note: z.string().trim().min(3).max(300),
});

/**
 * - resume_fulfillment: hay un pago aprobado y correcto asociado → vuelve a PAID y a la cola.
 * - close: no queda dinero cobrado vigente (todo rechazado o reembolsado según Mercado Pago).
 * El reembolso se hace en el panel de Mercado Pago; la conciliación lo registra.
 */
export async function resolveReview(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof resolveReviewSchema>,
  actor: Actor,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw notFound();
    if (order.status !== 'NEEDS_REVIEW') throw invalidState('La orden no está en revisión.');
    const rows = await tx.select().from(payments).where(eq(payments.orderId, orderId));
    if (input.resolution === 'resume_fulfillment') {
      const valid = rows.find(
        (p) => p.isOrderPayment && p.status === 'APPROVED' && p.amountMatches,
      );
      if (!valid) throw invalidState('No hay un pago aprobado y correcto para esta orden.');
      if (order.confirmedAt === null) throw invalidState('El cliente no confirmó el jugador.');
      await transitionOrder(tx, actor, order, 'PAID', {}, { note: input.note });
      const [existing] = await tx
        .select()
        .from(fulfillments)
        .where(eq(fulfillments.orderId, orderId))
        .for('update');
      if (!existing) {
        await tx
          .insert(fulfillments)
          .values({ orderId, mode: deps.config.fulfillmentMode, status: 'READY_FOR_FULFILLMENT' });
      } else if (existing.status === 'DELIVERED') {
        throw invalidState('La orden ya se entregó.');
      } else if (existing.status !== 'READY_FOR_FULFILLMENT') {
        await tx
          .update(fulfillments)
          .set({
            status: 'READY_FOR_FULFILLMENT',
            claimedBy: null,
            claimedAt: null,
            updatedAt: sql`now()`,
          })
          .where(eq(fulfillments.id, existing.id));
      }
      return;
    }
    const live = rows.filter((p) =>
      ['APPROVED', 'PENDING', 'DISPUTED', 'NEEDS_REFUND', 'UNKNOWN'].includes(p.status),
    );
    if (live.length) {
      throw invalidState(
        'Hay pagos vigentes. Reembólsalos en Mercado Pago y concilia antes de cerrar.',
      );
    }
    const refunded = rows.some((p) => p.status === 'REFUNDED');
    await transitionOrder(
      tx,
      actor,
      order,
      refunded ? 'REFUNDED' : 'EXPIRED',
      {},
      { note: input.note },
    );
    await tx
      .update(fulfillments)
      .set({ status: 'CANCELLED', updatedAt: sql`now()` })
      .where(
        and(
          eq(fulfillments.orderId, orderId),
          inArray(fulfillments.status, ['READY_FOR_FULFILLMENT', 'CLAIMED', 'FAILED']),
        ),
      );
  });
}

// ── Lista de bloqueo ─────────────────────────────────────────────────────────

export const blockSchema = z.strictObject({
  kind: z.enum(['email', 'uid', 'ip_hash', 'google_sub']),
  value: z.string().trim().min(3).max(160),
  reason: z.string().trim().min(3).max(200),
  expiresAt: z.iso.datetime().nullable().default(null),
});

export async function addBlock(
  deps: ServiceDeps,
  input: z.infer<typeof blockSchema>,
  actor: Actor,
) {
  const value = input.kind === 'email' ? input.value.toLowerCase() : input.value;
  try {
    const [row] = await deps.db
      .insert(blocklist)
      .values({
        kind: input.kind,
        value,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: actor.userId ?? null,
      })
      .returning();
    if (!row) throw new Error('no se creó el bloqueo');
    await audit(deps.db, actor, {
      entityType: 'blocklist',
      entityId: row.id,
      action: 'blocklist.added',
      data: { kind: row.kind },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError('CONFLICT', 409, 'Ese valor ya está bloqueado.');
    throw error;
  }
}

export async function removeBlock(deps: ServiceDeps, id: string, actor: Actor) {
  const [row] = await deps.db.delete(blocklist).where(eq(blocklist.id, id)).returning();
  if (!row) throw notFound();
  await audit(deps.db, actor, {
    entityType: 'blocklist',
    entityId: id,
    action: 'blocklist.removed',
    data: { kind: row.kind },
  });
}

export async function listBlocks(deps: ServiceDeps) {
  return deps.db.select().from(blocklist).orderBy(desc(blocklist.createdAt)).limit(500);
}

// ── Alertas y auditoría ──────────────────────────────────────────────────────

export async function alertSummary(deps: ServiceDeps) {
  const now = deps.now();
  const paidWaitingSince = new Date(now.getTime() - 30 * 60_000);
  const pendingSince = new Date(now.getTime() - 60 * 60_000);
  const [
    [review],
    [needsRefund],
    [paidWaiting],
    [paidToDeliver],
    [pendingLong],
    [awaitingVerification],
    [invalidWebhooks],
    [autoBlocks],
    [mfaLocks],
    [activeIpBlocks],
  ] = await Promise.all([
    deps.db.select({ n: count() }).from(orders).where(eq(orders.status, 'NEEDS_REVIEW')),
    deps.db.select({ n: count() }).from(payments).where(eq(payments.status, 'NEEDS_REFUND')),
    deps.db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.status, 'PAID'), lt(orders.updatedAt, paidWaitingSince))),
    deps.db.select({ n: count() }).from(orders).where(eq(orders.status, 'PAID')),
    deps.db
      .select({ n: count() })
      .from(payments)
      .where(
        and(inArray(payments.status, ['PENDING', 'UNKNOWN']), lt(payments.createdAt, pendingSince)),
      ),
    deps.db.select({ n: count() }).from(orders).where(eq(orders.status, 'AWAITING_VERIFICATION')),
    deps.db
      .select({ n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'webhook.invalid_signature'),
          sql`${auditEvents.createdAt} > now() - interval '24 hours'`,
        ),
      ),
    deps.db
      .select({ n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'security.auto_block'),
          sql`${auditEvents.createdAt} > now() - interval '24 hours'`,
        ),
      ),
    deps.db
      .select({ n: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'admin.mfa_locked'),
          sql`${auditEvents.createdAt} > now() - interval '24 hours'`,
        ),
      ),
    deps.db
      .select({ n: count() })
      .from(blocklist)
      .where(
        and(
          eq(blocklist.kind, 'ip_hash'),
          sql`(${blocklist.expiresAt} is null or ${blocklist.expiresAt} > now())`,
        ),
      ),
  ]);
  return {
    needsReview: review?.n ?? 0,
    needsRefund: needsRefund?.n ?? 0,
    paidWithoutDelivery: paidWaiting?.n ?? 0,
    paidToDeliver: paidToDeliver?.n ?? 0,
    paymentsPendingTooLong: pendingLong?.n ?? 0,
    awaitingVerification: awaitingVerification?.n ?? 0,
    invalidWebhooks24h: invalidWebhooks?.n ?? 0,
    autoBlocks24h: autoBlocks?.n ?? 0,
    mfaLocks24h: mfaLocks?.n ?? 0,
    activeIpBlocks: activeIpBlocks?.n ?? 0,
  };
}

export async function listAudit(deps: ServiceDeps, limit = 200) {
  return deps.db.select().from(auditEvents).orderBy(desc(auditEvents.id)).limit(limit);
}
