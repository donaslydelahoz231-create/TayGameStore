import { and, avg, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { orderItems, reviews, REVIEW_STATUSES, type ReviewStatus } from '../db/schema.js';
import { AppError } from '../plugins/errors.js';
import { audit, invalidState, notFound, type Actor, type ServiceDeps } from './context.js';
import { loadOrderForAccess, type OrderAccess } from './orders.js';

/**
 * Reseñas de compras verificadas. Solo quien hizo un pedido entregado puede opinar (una vez por
 * pedido), se publican cuando el dueño las aprueba y su contenido no se puede editar (la base lo
 * impide). La tienda nunca muestra reseñas que no vengan de un pedido real.
 */

/** Sin enlaces: evita spam y estafas en una página pública. */
const LINK = /(https?:\/\/|www\.|\.(com|co|net|org|io|me|ly)\b)/i;

export const reviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .max(400)
    .transform((text) =>
      text
        .replace(/\p{Cc}+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .refine((text) => !LINK.test(text), 'Las reseñas no pueden llevar enlaces.')
    .optional(),
});

export const moderateSchema = z.strictObject({ action: z.enum(['publish', 'hide']) });

/** «Laura Martínez Gómez» → «Laura M.»; un solo nombre queda igual. Nunca el correo ni el ID. */
export function publicAuthorName(customerName: string): string {
  const words = customerName
    .replace(/[^\p{L}\p{N}' -]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const first = (words[0] ?? 'Cliente').slice(0, 24);
  const initial = words[1]?.[0];
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export interface CustomerReview {
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
}

/** Estado de la reseña de un pedido para su comprador. */
export async function reviewForOrder(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
): Promise<{ eligible: boolean; review: CustomerReview | null }> {
  const order = await loadOrderForAccess(deps, deps.db, publicRef, access);
  const [row] = await deps.db.select().from(reviews).where(eq(reviews.orderId, order.id)).limit(1);
  return {
    eligible: order.status === 'DELIVERED' && !row,
    review: row ? toCustomerReview(row) : null,
  };
}

export async function createReview(
  deps: ServiceDeps,
  publicRef: string,
  access: OrderAccess,
  input: z.infer<typeof reviewSchema>,
  actor: Actor,
): Promise<CustomerReview> {
  return deps.db.transaction(async (tx) => {
    const order = await loadOrderForAccess(deps, tx, publicRef, access, true);
    if (order.status !== 'DELIVERED') {
      throw invalidState('Podrás dejar tu reseña cuando tu recarga esté entregada.');
    }
    const comment = input.comment ? input.comment : null;
    const [row] = await tx
      .insert(reviews)
      .values({
        orderId: order.id,
        game: order.game,
        rating: input.rating,
        comment,
        authorName: publicAuthorName(order.customerName),
      })
      .onConflictDoNothing({ target: reviews.orderId })
      .returning();
    if (!row) throw new AppError('CONFLICT', 409, 'Ya dejaste tu reseña para este pedido.');
    await audit(tx, actor, {
      entityType: 'review',
      entityId: row.id,
      action: 'review.created',
      toStatus: row.status,
      data: { orderId: order.id, rating: row.rating, withComment: comment !== null },
    });
    return toCustomerReview(row);
  });
}

export interface PublicReview {
  author: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Paquetes del pedido reseñado («100 + 10 Diamantes»): prueba de que hubo compra. */
  purchase: string;
}

/** Reseñas publicadas y su resumen. Solo aprobadas por el dueño. */
export async function publicReviews(
  deps: ServiceDeps,
  game: 'freefire',
  limit = 12,
): Promise<{ summary: { count: number; average: number | null }; reviews: PublicReview[] }> {
  const published = and(eq(reviews.game, game), eq(reviews.status, 'PUBLISHED'));
  const [[summary], rows] = await Promise.all([
    deps.db
      .select({ n: count(), average: avg(reviews.rating) })
      .from(reviews)
      .where(published),
    deps.db.select().from(reviews).where(published).orderBy(desc(reviews.createdAt)).limit(limit),
  ]);
  const purchases = await purchasesOf(
    deps,
    rows.map((row) => row.orderId),
  );
  const average = summary?.average == null ? null : Math.round(Number(summary.average) * 10) / 10;
  return {
    summary: { count: summary?.n ?? 0, average: summary?.n ? average : null },
    reviews: rows.map((row) => ({
      author: row.authorName,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      purchase: purchases.get(row.orderId) ?? '',
    })),
  };
}

// ── Panel ────────────────────────────────────────────────────────────────────

export const reviewFilterSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
});

export async function listReviewsForAdmin(
  deps: ServiceDeps,
  filter: z.infer<typeof reviewFilterSchema>,
) {
  const rows = await deps.db
    .select()
    .from(reviews)
    .where(filter.status ? eq(reviews.status, filter.status) : undefined)
    .orderBy(desc(reviews.createdAt))
    .limit(200);
  const purchases = await purchasesOf(
    deps,
    rows.map((row) => row.orderId),
  );
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    author: row.authorName,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    purchase: purchases.get(row.orderId) ?? '',
    createdAt: row.createdAt.toISOString(),
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
  }));
}

export async function moderateReview(
  deps: ServiceDeps,
  id: string,
  input: z.infer<typeof moderateSchema>,
  actor: Actor,
): Promise<void> {
  const to: ReviewStatus = input.action === 'publish' ? 'PUBLISHED' : 'HIDDEN';
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(reviews).where(eq(reviews.id, id)).for('update');
    if (!row) throw notFound();
    if (row.status === to) return;
    await tx
      .update(reviews)
      .set({
        status: to,
        moderatedBy: actor.userId ?? null,
        moderatedAt: deps.now(),
        updatedAt: deps.now(),
      })
      .where(eq(reviews.id, id));
    await audit(tx, actor, {
      entityType: 'review',
      entityId: id,
      action: 'review.moderated',
      fromStatus: row.status,
      toStatus: to,
    });
  });
}

export async function pendingReviewCount(deps: ServiceDeps): Promise<number> {
  const [row] = await deps.db
    .select({ n: count() })
    .from(reviews)
    .where(eq(reviews.status, 'PENDING'));
  return row?.n ?? 0;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function toCustomerReview(row: typeof reviews.$inferSelect): CustomerReview {
  return {
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** «100 + 10 Diamantes ×2 · 310 + 31 Diamantes» por pedido. */
async function purchasesOf(deps: ServiceDeps, orderIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!orderIds.length) return result;
  const items = await deps.db
    .select({ orderId: orderItems.orderId, name: orderItems.name, quantity: orderItems.quantity })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(orderItems.name);
  for (const item of items) {
    const label = item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
    const previous = result.get(item.orderId);
    result.set(item.orderId, previous ? `${previous} · ${label}` : label);
  }
  return result;
}
