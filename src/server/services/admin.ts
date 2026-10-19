import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  auditEvents,
  blocklist,
  fulfillments,
  nequiTransfers,
  notifications,
  ORDER_STATUSES,
  orders,
  paymentAttempts,
  payments,
  topups,
  users,
} from '../db/schema.js';
import { orderStates } from '../domain/order-states.js';
import { canTransitionFulfillment } from '../domain/state-machines.js';
import { AppError } from '../plugins/errors.js';
import { isUniqueViolation, loadOrderRelations, toPublicOrder, transitionOrder } from './orders.js';
import { audit, invalidState, notFound, type Actor, type ServiceDeps } from './context.js';
import { assignReceiptNumber } from './receipts.js';
import { pendingReviewCount } from './reviews.js';
import { nequiTransfersFor } from './nequi-view.js';
import { pendingNequiCount } from './nequi-manual.js';
import {
  deliverNotifications,
  enqueueOrderNotifications,
  enqueueSheetSync,
} from './notifications.js';
import {
  assignInventory,
  inventoryForOrder,
  inventorySummary,
  markInventoryUsed,
} from './inventory.js';

// ── Órdenes ──────────────────────────────────────────────────────────────────

/** Día calendario (AAAA-MM-DD) en hora de Colombia (UTC−5, sin horario de verano). */
const colombiaDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00-05:00`)), 'Fecha inválida.');

export const ADMIN_PAGE_SIZE = 50;

export const orderFilterSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
  game: z.enum(['freefire']).optional(),
  /** Desde este día (incluido) y hasta este día (incluido), en hora de Colombia. */
  from: colombiaDay.optional(),
  to: colombiaDay.optional(),
  /** Método de pago, o `nequi_pending`: transferencias Nequi avisadas sin revisar. */
  payment: z.enum(['mercadopago', 'nequi_manual', 'nequi_pending']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const startOfColombiaDay = (day: string) => new Date(`${day}T00:00:00-05:00`);

/**
 * Pedidos del panel: filtros por estado, juego, fechas y búsqueda exacta (referencia, UID o
 * correo), 50 por página. Cada fila trae el estado del pago y el de la recarga por separado.
 */
export async function listOrdersForAdmin(
  deps: ServiceDeps,
  filter: z.infer<typeof orderFilterSchema>,
) {
  const conditions = [
    filter.status ? eq(orders.status, filter.status) : undefined,
    filter.game ? eq(orders.game, filter.game) : undefined,
    filter.from ? gte(orders.createdAt, startOfColombiaDay(filter.from)) : undefined,
    filter.to
      ? lt(orders.createdAt, new Date(startOfColombiaDay(filter.to).getTime() + 24 * 3_600_000))
      : undefined,
    filter.q
      ? sql`(${orders.publicRef} = ${filter.q.toUpperCase()} or ${orders.playerUid} = ${filter.q} or ${orders.customerEmail} = ${filter.q.toLowerCase()})`
      : undefined,
    filter.payment === 'mercadopago' || filter.payment === 'nequi_manual'
      ? eq(orders.paymentMethod, filter.payment)
      : undefined,
    filter.payment === 'nequi_pending'
      ? sql`exists (select 1 from ${nequiTransfers} where ${nequiTransfers.orderId} = ${orders.id} and ${nequiTransfers.status} = 'REPORTED')`
      : undefined,
  ].filter((condition) => condition !== undefined);
  const rows = await deps.db
    .select({
      id: orders.id,
      reference: orders.publicRef,
      status: orders.status,
      game: orders.game,
      verificationStatus: orders.verificationStatus,
      playerUid: orders.playerUid,
      playerServer: orders.playerServer,
      customerEmail: orders.customerEmail,
      totalCop: orders.totalCop,
      currency: orders.currency,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      expiresAt: orders.expiresAt,
    })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(ADMIN_PAGE_SIZE + 1)
    .offset((filter.page - 1) * ADMIN_PAGE_SIZE);
  const page = rows.slice(0, ADMIN_PAGE_SIZE);
  const ids = page.map((row) => row.id);
  const [relations, attempts] = await Promise.all([
    loadOrderRelations(deps.db, ids),
    ids.length
      ? deps.db
          .select({ orderId: paymentAttempts.orderId, payMeans: paymentAttempts.payMeans })
          .from(paymentAttempts)
          .where(inArray(paymentAttempts.orderId, ids))
          .orderBy(desc(paymentAttempts.createdAt))
      : Promise.resolve([]),
  ]);
  const chosenMeans = new Map<string, string | null>();
  for (const attempt of attempts) {
    if (!chosenMeans.has(attempt.orderId)) chosenMeans.set(attempt.orderId, attempt.payMeans);
  }
  return {
    orders: page.map((row) => {
      const relation = relations.get(row.id);
      const orderPayment = relation?.payments.find((payment) => payment.isOrderPayment);
      return {
        ...row,
        items: (relation?.items ?? []).map((item) => ({
          name: item.name,
          quantity: item.quantity,
        })),
        states: orderStates({
          status: row.status,
          payments: relation?.payments ?? [],
          fulfillment: relation?.fulfillment?.status,
        }),
        /** Medio que eligió el cliente en la tienda (último intento de pago). */
        payMeans: chosenMeans.get(row.id) ?? null,
        /** Pago que pagó el pedido según su proveedor (referencia de la transacción y medio). */
        providerPaymentId: orderPayment?.providerPaymentId ?? null,
        paymentMethodId: orderPayment?.paymentMethodId ?? null,
        /** Transferencia Nequi avisada por el cliente y sin revisar. */
        nequiPending: relation?.nequi.some((transfer) => transfer.status === 'REPORTED') ?? false,
      };
    }),
    page: filter.page,
    hasMore: rows.length > ADMIN_PAGE_SIZE,
  };
}

export async function getOrderForAdmin(deps: ServiceDeps, orderId: string) {
  const [order] = await deps.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw notFound();
  const [view, paymentRows, attempts, fulfillment, inventory, topupRows] = await Promise.all([
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
        payMeans: paymentAttempts.payMeans,
        preferenceId: paymentAttempts.preferenceId,
        createdAt: paymentAttempts.createdAt,
        expiresAt: paymentAttempts.expiresAt,
      })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, order.id))
      .orderBy(desc(paymentAttempts.createdAt)),
    deps.db.select().from(fulfillments).where(eq(fulfillments.orderId, order.id)),
    inventoryForOrder(deps, order.id),
    deps.db
      .select({
        referenceNo: topups.referenceNo,
        status: topups.status,
        attempt: topups.attempt,
        providerTransaction: topups.providerTransaction,
        errorCode: topups.errorCode,
        checks: topups.checks,
        updatedAt: topups.updatedAt,
      })
      .from(topups)
      .where(eq(topups.orderId, order.id))
      .orderBy(asc(topups.referenceNo)),
  ]);
  const history = await orderHistory(deps, {
    orderId: order.id,
    fulfillmentIds: fulfillment.map((row) => row.id),
    paymentIds: paymentRows.map((row) => row.id),
    attemptIds: attempts.map((row) => row.id),
  });
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
      provider: p.provider,
      providerPaymentId: p.providerPaymentId,
      status: p.status,
      providerStatus: p.providerStatus,
      providerStatusDetail: p.providerStatusDetail,
      amountCop: p.amountCop,
      currency: p.currency,
      amountMatches: p.amountMatches,
      isOrderPayment: p.isOrderPayment,
      paymentMethodId: p.paymentMethodId,
      paymentTypeId: p.paymentTypeId,
      approvedAt: p.approvedAt,
      lastSyncedAt: p.lastSyncedAt,
    })),
    attempts,
    paymentMethod: order.paymentMethod,
    /** Transferencias Nequi (avisos del cliente y revisiones del dueño), la más reciente primero. */
    nequiTransfers: (await nequiTransfersFor(deps.db, [order.id])).get(order.id) ?? [],
    fulfillment: fulfillment[0] ?? null,
    history,
    /** PIN del inventario asignados a este pedido (solo administradores con doble factor). */
    inventory,
    /** Recargas directas con UniPin (una por unidad e intento). */
    topups: topupRows,
  };
}

/**
 * Historial completo del pedido (pedido, entrega, pagos e intentos de pago), del más reciente al
 * más antiguo, con quién hizo cada cambio y su motivo. Sale de `audit_events`: la aplicación solo
 * puede insertar ahí (sin UPDATE ni DELETE, y triggers en la base), y los sellos de integridad
 * detectan cualquier cambio hecho por fuera.
 */
async function orderHistory(
  deps: ServiceDeps,
  ids: { orderId: string; fulfillmentIds: string[]; paymentIds: string[]; attemptIds: string[] },
) {
  const byEntity = (entityType: string, entityIds: string[]) =>
    entityIds.length
      ? and(eq(auditEvents.entityType, entityType), inArray(auditEvents.entityId, entityIds))
      : undefined;
  const scopes = [
    // `fulfillment.ready` se registra con el id del pedido.
    byEntity('order', [ids.orderId]),
    byEntity('fulfillment', [ids.orderId, ...ids.fulfillmentIds]),
    byEntity('payment', ids.paymentIds),
    byEntity('payment_attempt', ids.attemptIds),
  ].filter((scope) => scope !== undefined);
  const rows = await deps.db
    .select({
      id: auditEvents.id,
      entityType: auditEvents.entityType,
      action: auditEvents.action,
      fromStatus: auditEvents.fromStatus,
      toStatus: auditEvents.toStatus,
      actorType: auditEvents.actorType,
      actorId: auditEvents.actorId,
      data: auditEvents.data,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(or(...scopes))
    .orderBy(desc(auditEvents.id))
    .limit(100);
  const adminIds = [
    ...new Set(
      rows
        .filter((row) => row.actorType === 'admin' && row.actorId)
        .map((row) => row.actorId as string),
    ),
  ].filter((id) => z.uuid().safeParse(id).success);
  const admins = adminIds.length
    ? await deps.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, adminIds))
    : [];
  const emails = new Map(admins.map((row) => [row.id, row.email]));
  return rows.map(({ data, actorId, ...row }) => {
    const detail = (data ?? {}) as Record<string, unknown>;
    const text = [detail.note, detail.reason, detail.resolution].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    return {
      ...row,
      actorEmail: row.actorType === 'admin' && actorId ? (emails.get(actorId) ?? null) : null,
      /** Nota del dueño o motivo del cambio (texto ya validado al guardarlo). */
      note: text ?? null,
    };
  });
}

// ── Notas internas del pedido ────────────────────────────────────────────────

export const orderNoteSchema = z.strictObject({
  note: z.string().trim().min(3).max(500),
});

/**
 * Observación interna del dueño sobre un pedido (no la ve el cliente). Queda en la auditoría
 * de solo inserción: no se puede editar ni borrar desde la aplicación.
 */
export async function addOrderNote(
  deps: ServiceDeps,
  orderId: string,
  input: z.infer<typeof orderNoteSchema>,
  actor: Actor,
): Promise<void> {
  if (!actor.userId) throw new AppError('FORBIDDEN', 403, 'Acción no permitida.');
  const [order] = await deps.db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) throw notFound();
  await audit(deps.db, actor, {
    entityType: 'order',
    entityId: order.id,
    action: 'order.note',
    data: { note: input.note, status: order.status },
  });
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
    // La fila del pedido en «Entregas» (hoja de Google) muestra el estado nuevo enseguida.
    await enqueueSheetSync(deps, tx, order.id);
    await audit(tx, actor, {
      entityType: 'fulfillment',
      entityId: fulfillment.id,
      action: `fulfillment.${input.action}`,
      fromStatus: fulfillment.status,
      toStatus: to,
      data: { orderId },
    });
    if (to === 'DELIVERING' && order.status === 'PAID') {
      await transitionOrder(tx, actor, order, 'DELIVERING');
      // Reserva los PIN del inventario para este pedido (los que haya).
      const stock = await assignInventory(tx, order.id, now);
      if (stock.assigned || stock.missing) {
        await audit(tx, actor, {
          entityType: 'inventory',
          entityId: order.id,
          action: 'inventory.assigned',
          data: { orderId: order.id, assigned: stock.assigned, missing: stock.missing },
        });
      }
    }
    if (to === 'DELIVERED') {
      await markInventoryUsed(tx, order.id, now);
      await transitionOrder(tx, actor, order, 'DELIVERED');
      await enqueueOrderNotifications(deps, tx, order.id, 'delivered');
    }
    if (to === 'FAILED')
      await transitionOrder(tx, actor, order, 'NEEDS_REVIEW', {}, { reason: 'fulfillment_failed' });
  });
  await deliverNotifications(deps, { orderId });
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
    await enqueueSheetSync(deps, tx, order.id);
    const rows = await tx.select().from(payments).where(eq(payments.orderId, orderId));
    if (input.resolution === 'resume_fulfillment') {
      const valid = rows.find(
        (p) => p.isOrderPayment && p.status === 'APPROVED' && p.amountMatches,
      );
      if (!valid) throw invalidState('No hay un pago aprobado y correcto para esta orden.');
      if (order.confirmedAt === null) throw invalidState('El cliente no confirmó el jugador.');
      await transitionOrder(tx, actor, order, 'PAID', {}, { note: input.note });
      await assignReceiptNumber(tx, order.id);
      // Si el pago llegó tarde y se aceptó en revisión, el cliente y el dueño reciben el aviso.
      await enqueueOrderNotifications(deps, tx, order.id, 'paid');
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
    if (refunded) await enqueueOrderNotifications(deps, tx, order.id, 'refunded');
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
  await deliverNotifications(deps, { orderId });
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

/** Una recarga «en proceso» más de 2 h o una revisión de más de 24 h se marcan como atascadas. */
export const STUCK_DELIVERING_MS = 2 * 3_600_000;
export const STUCK_REVIEW_MS = 24 * 3_600_000;

export async function alertSummary(deps: ServiceDeps) {
  const now = deps.now();
  const paidWaitingSince = new Date(now.getTime() - 30 * 60_000);
  const pendingSince = new Date(now.getTime() - 60 * 60_000);
  const [[deliveringStuck], [reviewStuck]] = await Promise.all([
    deps.db
      .select({ n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'DELIVERING'),
          lt(orders.updatedAt, new Date(now.getTime() - STUCK_DELIVERING_MS)),
        ),
      ),
    deps.db
      .select({ n: count() })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'NEEDS_REVIEW'),
          lt(orders.updatedAt, new Date(now.getTime() - STUCK_REVIEW_MS)),
        ),
      ),
  ]);
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
    [notificationsFailed],
    stock,
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
    deps.db.select({ n: count() }).from(notifications).where(eq(notifications.status, 'FAILED')),
    inventorySummary(deps),
  ]);
  const [reviewsPending, nequiToVerify] = await Promise.all([
    pendingReviewCount(deps),
    pendingNequiCount(deps),
  ]);
  return {
    /** Transferencias Nequi que un cliente avisó y el dueño aún no revisa en su app Nequi. */
    nequiToVerify,
    needsReview: review?.n ?? 0,
    needsRefund: needsRefund?.n ?? 0,
    paidWithoutDelivery: paidWaiting?.n ?? 0,
    /** Recargas iniciadas que siguen «en proceso» más de 2 h (¿se entregó y no se marcó?). */
    deliveringTooLong: deliveringStuck?.n ?? 0,
    /** Pedidos en revisión desde hace más de 24 h. */
    reviewTooLong: reviewStuck?.n ?? 0,
    paidToDeliver: paidToDeliver?.n ?? 0,
    paymentsPendingTooLong: pendingLong?.n ?? 0,
    awaitingVerification: awaitingVerification?.n ?? 0,
    invalidWebhooks24h: invalidWebhooks?.n ?? 0,
    autoBlocks24h: autoBlocks?.n ?? 0,
    mfaLocks24h: mfaLocks?.n ?? 0,
    activeIpBlocks: activeIpBlocks?.n ?? 0,
    notificationsFailed: notificationsFailed?.n ?? 0,
    /** Reseñas de clientes esperando que el dueño las publique u oculte. */
    reviewsPending,
    /** Paquetes con inventario de PIN por debajo del mínimo (reponer). */
    lowStock: stock.filter((line) => line.lowStock).map((line) => line.sku),
  };
}

export async function listAudit(deps: ServiceDeps, limit = 200) {
  return deps.db.select().from(auditEvents).orderBy(desc(auditEvents.id)).limit(limit);
}
