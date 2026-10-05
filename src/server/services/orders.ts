import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx, Tx } from '../db/client.js';
import {
  blocklist,
  fulfillments,
  orderItems,
  orders,
  paymentAttempts,
  payments,
  products,
  type OrderStatus,
} from '../db/schema.js';
import { computeTotals, effectivePrice } from '../domain/pricing.js';
import { canTransitionOrder, OPEN_ORDER_STATUSES } from '../domain/state-machines.js';
import {
  keyedHash,
  publicOrderRef,
  randomToken,
  receiptCode,
  sha256,
  verifyKeyedHash,
} from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, notFound, type Actor, type ServiceDeps } from './context.js';

export type OrderRow = typeof orders.$inferSelect;

/** Cambia el estado de una orden con CAS y deja auditoría. */
export async function transitionOrder(
  tx: Tx,
  actor: Actor,
  order: Pick<OrderRow, 'id' | 'status'>,
  to: OrderStatus,
  changes: Partial<typeof orders.$inferInsert> = {},
  data: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  if (!canTransitionOrder(order.status, to)) {
    throw invalidState(`Transición no permitida: ${order.status} → ${to}.`);
  }
  const updated = await tx
    .update(orders)
    .set({ ...changes, status: to, updatedAt: sql`now()` })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (updated.length !== 1) throw new AppError('CONFLICT', 409, 'La orden cambió; reintenta.');
  await audit(tx, actor, {
    entityType: 'order',
    entityId: order.id,
    action: 'order.transition',
    fromStatus: order.status,
    toStatus: to,
    data,
  });
  order.status = to;
}

// ── Acceso ───────────────────────────────────────────────────────────────────

export interface OrderAccess {
  userId?: string | undefined;
  guestHash?: string | undefined;
  /** Token de acceso del enlace de la orden (cabecera `x-order-token`). */
  token?: string | undefined;
  isAdmin?: boolean;
}

function canAccess(deps: ServiceDeps, order: OrderRow, access: OrderAccess): boolean {
  if (access.isAdmin) return true;
  if (access.userId && order.userId === access.userId) return true;
  if (access.guestHash && order.guestHash === access.guestHash) return true;
  if (access.token) {
    return verifyKeyedHash(
      deps.config.secrets.orderTokenKeys,
      access.token,
      order.accessTokenHash,
      order.accessTokenKeyVersion,
    );
  }
  return false;
}

/** Carga una orden si el solicitante tiene acceso. Inexistente y ajena responden igual (404). */
export async function loadOrderForAccess(
  deps: ServiceDeps,
  db: DbOrTx,
  publicRef: string,
  access: OrderAccess,
  lock = false,
): Promise<OrderRow> {
  const query = db.select().from(orders).where(eq(orders.publicRef, publicRef)).limit(1);
  const [order] = lock ? await query.for('update') : await query;
  if (!order || !canAccess(deps, order, access)) throw notFound();
  return order;
}

// ── Vista pública ─────────────────────────────────────────────────────────────

export interface PublicOrder {
  reference: string;
  status: OrderStatus;
  createdAt: string;
  expiresAt: string;
  game: string;
  playerUid: string;
  customerName: string;
  customerEmail: string;
  items: {
    sku: string;
    name: string;
    quantity: number;
    listPriceCop: number;
    unitPriceCop: number;
    lineTotalCop: number;
  }[];
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  currency: string;
  termsVersion: string;
  receiptCode: string;
  verification: {
    status: string;
    nickname: string | null;
    region: string | null;
  };
  payment: { status: string | null; canPay: boolean; checkoutAvailable: boolean };
  fulfillment: { status: string | null; deliveredAt: string | null };
}

export async function toPublicOrder(
  deps: ServiceDeps,
  db: DbOrTx,
  order: OrderRow,
): Promise<PublicOrder> {
  const [items, orderPayments, fulfillmentRows] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.sku)),
    db
      .select({ status: payments.status, isOrderPayment: payments.isOrderPayment })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .orderBy(desc(payments.updatedAt)),
    db
      .select({ status: fulfillments.status, deliveredAt: fulfillments.deliveredAt })
      .from(fulfillments)
      .where(eq(fulfillments.orderId, order.id))
      .limit(1),
  ]);
  const shownVerification = ['VERIFIED', 'CONFIRMED'].includes(order.verificationStatus);
  const paymentStatus =
    orderPayments.find((p) => p.isOrderPayment)?.status ?? orderPayments[0]?.status ?? null;
  const fulfillment = fulfillmentRows[0];
  return {
    reference: order.publicRef,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    game: order.game,
    playerUid: order.playerUid,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      listPriceCop: item.listPriceCop,
      unitPriceCop: item.unitPriceCop,
      lineTotalCop: item.lineTotalCop,
    })),
    subtotalCop: order.subtotalCop,
    discountCop: order.discountCop,
    totalCop: order.totalCop,
    currency: order.currency,
    termsVersion: order.termsVersion,
    receiptCode: order.receiptCode,
    verification: {
      status: order.verificationStatus,
      nickname: shownVerification ? order.verifiedNickname : null,
      region: shownVerification ? order.verifiedRegion : null,
    },
    payment: {
      status: paymentStatus,
      canPay:
        order.status === 'AWAITING_PAYMENT' &&
        order.expiresAt.getTime() > deps.now().getTime() &&
        deps.config.flags.paymentsEnabled &&
        deps.gateway !== undefined,
      checkoutAvailable: deps.config.flags.paymentsEnabled && deps.gateway !== undefined,
    },
    fulfillment: {
      status: fulfillment?.status ?? null,
      deliveredAt: fulfillment?.deliveredAt?.toISOString() ?? null,
    },
  };
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export const checkoutSchema = z.strictObject({
  checkoutKey: z.uuid(),
  game: z.literal('freefire'),
  playerUid: z.string().regex(/^\d{6,12}$/),
  customerName: z.string().trim().min(2).max(80),
  customerEmail: z
    .email()
    .max(160)
    .transform((email) => email.toLowerCase()),
  acceptTerms: z.literal(true),
  termsVersion: z.string().min(1).max(40),
  expectedTotalCop: z.number().int().positive().optional(),
  items: z
    .array(
      z.strictObject({
        sku: z.string().min(1).max(60),
        quantity: z.number().int().min(1).max(5),
      }),
    )
    .min(1)
    .max(20),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CheckoutResult {
  order: PublicOrder;
  /** Solo se devuelve al crear la orden: el cliente debe guardarlo (enlace de acceso). */
  accessToken: string | undefined;
  created: boolean;
}

async function assertNotBlocked(
  db: DbOrTx,
  now: Date,
  entries: { kind: 'email' | 'uid' | 'ip_hash' | 'google_sub'; value: string | undefined }[],
): Promise<void> {
  const present = entries.filter((entry): entry is { kind: typeof entry.kind; value: string } =>
    Boolean(entry.value),
  );
  if (!present.length) return;
  const rows = await db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(
      and(
        or(...present.map((e) => and(eq(blocklist.kind, e.kind), eq(blocklist.value, e.value)))),
        or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)),
      ),
    )
    .limit(1);
  if (rows.length) {
    // Mensaje genérico: no se revela qué dato está bloqueado.
    throw new AppError('BLOCKED', 403, 'No es posible procesar esta compra. Contacta a soporte.');
  }
}

export async function createOrder(
  deps: ServiceDeps,
  input: CheckoutInput,
  context: { actor: Actor; guestHash: string | undefined; googleSub: string | undefined },
): Promise<CheckoutResult> {
  const { config } = deps;
  const now = deps.now();
  const requestHash = sha256(
    JSON.stringify({
      playerUid: input.playerUid,
      email: input.customerEmail,
      items: [...input.items].sort((a, b) => a.sku.localeCompare(b.sku)),
    }),
  );

  const replay = async (): Promise<CheckoutResult | undefined> => {
    const [existing] = await deps.db
      .select()
      .from(orders)
      .where(eq(orders.checkoutKey, input.checkoutKey))
      .limit(1);
    if (!existing) return undefined;
    const sameOwner =
      (context.actor.userId !== undefined && existing.userId === context.actor.userId) ||
      (context.guestHash !== undefined && existing.guestHash === context.guestHash);
    if (existing.requestHash !== requestHash || !sameOwner) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        409,
        'Esta solicitud ya se usó con otros datos. Recarga la página.',
      );
    }
    return {
      order: await toPublicOrder(deps, deps.db, existing),
      accessToken: undefined,
      created: false,
    };
  };

  const previous = await replay();
  if (previous) return previous;

  if (input.termsVersion !== config.orders.termsVersion) {
    throw new AppError('CONFLICT', 409, 'Los términos cambiaron. Revísalos y vuelve a aceptarlos.');
  }
  const skus = [...new Set(input.items.map((item) => item.sku))];
  if (skus.length !== input.items.length) {
    throw new AppError('VALIDATION_ERROR', 400, 'Hay productos repetidos en el pedido.');
  }
  if (input.items.some((item) => item.quantity > config.orders.maxUnitsPerProduct)) {
    throw new AppError(
      'LIMIT_EXCEEDED',
      422,
      `Máximo ${config.orders.maxUnitsPerProduct} unidades por producto.`,
    );
  }

  await assertNotBlocked(deps.db, now, [
    { kind: 'email', value: input.customerEmail },
    { kind: 'uid', value: input.playerUid },
    { kind: 'ip_hash', value: context.actor.ipHash },
    { kind: 'google_sub', value: context.googleSub },
  ]);

  const accessToken = randomToken();
  const tokenHash = keyedHash(config.secrets.orderTokenKeys, accessToken);

  try {
    const order = await deps.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(and(inArray(products.sku, skus), eq(products.game, input.game)));
      const bySku = new Map(rows.map((row) => [row.sku, row]));
      const lines = input.items.map((item) => {
        const product = bySku.get(item.sku);
        if (!product?.active) {
          throw new AppError(
            'PRODUCT_UNAVAILABLE',
            409,
            'Uno de los productos ya no está disponible.',
          );
        }
        const unitPriceCop = effectivePrice(product, now);
        return { product, quantity: item.quantity, unitPriceCop, listPriceCop: product.priceCop };
      });
      const totals = computeTotals(lines);
      if (totals.totalCop > config.orders.maxOrderTotalCop) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          422,
          `El total máximo por orden es ${config.orders.maxOrderTotalCop.toLocaleString('es-CO')} COP.`,
        );
      }
      if (input.expectedTotalCop !== undefined && input.expectedTotalCop !== totals.totalCop) {
        throw new AppError('PRICE_CHANGED', 409, 'Los precios cambiaron. Revisa tu pedido.');
      }

      // Serializa por email/UID para que el límite de órdenes abiertas no se pueda saltar
      // con peticiones simultáneas.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'checkout:' + input.customerEmail}))`,
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'checkout:' + input.playerUid}))`,
      );
      const [byEmail] = await tx
        .select({ n: count() })
        .from(orders)
        .where(
          and(
            eq(orders.customerEmail, input.customerEmail),
            inArray(orders.status, [...OPEN_ORDER_STATUSES]),
          ),
        );
      const [byUid] = await tx
        .select({ n: count() })
        .from(orders)
        .where(
          and(
            eq(orders.playerUid, input.playerUid),
            inArray(orders.status, [...OPEN_ORDER_STATUSES]),
          ),
        );
      if ((byEmail?.n ?? 0) >= config.orders.maxOpenOrdersPerEmail) {
        throw new AppError('LIMIT_EXCEEDED', 429, 'Tienes demasiados pedidos pendientes.');
      }
      if ((byUid?.n ?? 0) >= config.orders.maxOpenOrdersPerUid) {
        throw new AppError(
          'LIMIT_EXCEEDED',
          429,
          'Ese jugador tiene demasiados pedidos pendientes.',
        );
      }

      const [created] = await tx
        .insert(orders)
        .values({
          publicRef: publicOrderRef(),
          checkoutKey: input.checkoutKey,
          requestHash,
          status: 'AWAITING_VERIFICATION',
          game: input.game,
          playerUid: input.playerUid,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          userId: context.actor.userId ?? null,
          guestHash: context.guestHash ?? null,
          accessTokenHash: tokenHash.hash,
          accessTokenKeyVersion: tokenHash.version,
          subtotalCop: totals.subtotalCop,
          discountCop: totals.discountCop,
          totalCop: totals.totalCop,
          currency: 'COP',
          termsVersion: input.termsVersion,
          termsAcceptedAt: now,
          verificationStatus: 'PENDING',
          expiresAt: new Date(now.getTime() + config.orders.verificationTtlMinutes * 60_000),
          receiptCode: receiptCode(),
          ipHash: context.actor.ipHash ?? null,
        })
        .returning();
      if (!created) throw new Error('no se creó la orden');
      await tx.insert(orderItems).values(
        lines.map((line) => ({
          orderId: created.id,
          productId: line.product.id,
          sku: line.product.sku,
          name: line.product.name,
          units: line.product.units,
          listPriceCop: line.listPriceCop,
          unitPriceCop: line.unitPriceCop,
          quantity: line.quantity,
          lineTotalCop: line.unitPriceCop * line.quantity,
        })),
      );
      await audit(tx, context.actor, {
        entityType: 'order',
        entityId: created.id,
        action: 'order.created',
        toStatus: created.status,
        data: { totalCop: created.totalCop, items: lines.length },
      });
      return created;
    });
    return { order: await toPublicOrder(deps, deps.db, order), accessToken, created: true };
  } catch (error) {
    // Dos envíos simultáneos con la misma clave: el segundo choca con el UNIQUE y se resuelve
    // devolviendo la orden del primero.
    if (isUniqueViolation(error, 'orders_checkout_key_key')) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw error;
  }
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === '23505') {
      return constraint === undefined || candidate.constraint === constraint;
    }
    current = candidate.cause;
  }
  return false;
}

// ── Listado del cliente ──────────────────────────────────────────────────────

export async function listOrdersForOwner(
  deps: ServiceDeps,
  owner: { userId: string | undefined; guestHash: string | undefined },
): Promise<PublicOrder[]> {
  const conditions = [
    owner.userId ? eq(orders.userId, owner.userId) : undefined,
    owner.guestHash ? eq(orders.guestHash, owner.guestHash) : undefined,
  ].filter((condition) => condition !== undefined);
  if (!conditions.length) return [];
  const rows = await deps.db
    .select()
    .from(orders)
    .where(or(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(50);
  return Promise.all(rows.map((row) => toPublicOrder(deps, deps.db, row)));
}

// ── Confirmación del jugador por el cliente ──────────────────────────────────

export const confirmPlayerSchema = z.strictObject({
  confirm: z.boolean(),
  /** Nickname que el cliente vio: si el operador lo cambió, se vuelve a mostrar. */
  nickname: z.string().min(1).max(60),
});

export async function confirmPlayer(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  input: z.infer<typeof confirmPlayerSchema>,
  actor: Actor,
): Promise<PublicOrder> {
  const now = deps.now();
  const order = await deps.db.transaction(async (tx) => {
    const row = await loadOrderForAccess(deps, tx, publicRef, access, true);
    if (row.status !== 'AWAITING_VERIFICATION' || row.verificationStatus !== 'VERIFIED') {
      throw invalidState('El jugador todavía no está verificado o ya se confirmó.');
    }
    if (row.verifiedNickname !== input.nickname) {
      throw new AppError('CONFLICT', 409, 'La verificación cambió. Revisa de nuevo el jugador.');
    }
    if (input.confirm) {
      await transitionOrder(tx, actor, row, 'AWAITING_PAYMENT', {
        verificationStatus: 'CONFIRMED',
        confirmedAt: now,
        expiresAt: new Date(now.getTime() + deps.config.orders.paymentTtlMinutes * 60_000),
      });
    } else {
      await transitionOrder(tx, actor, row, 'REJECTED', {
        verificationStatus: 'DECLINED_BY_CUSTOMER',
      });
    }
    return row;
  });
  const [fresh] = await deps.db.select().from(orders).where(eq(orders.id, order.id));
  if (!fresh) throw notFound();
  return toPublicOrder(deps, deps.db, fresh);
}

/** Intentos de pago abiertos de una orden (para cerrarlos al expirar). */
export async function closeOpenAttempts(
  tx: Tx,
  orderId: string,
  status: 'CLOSED' | 'EXPIRED',
): Promise<void> {
  await tx
    .update(paymentAttempts)
    .set({ status, updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        inArray(paymentAttempts.status, ['CREATING', 'OPEN']),
      ),
    );
}
