import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { products } from '../db/schema.js';
import { effectivePrice, weekendWindow } from '../domain/pricing.js';
import { AppError } from '../plugins/errors.js';
import { isUniqueViolation } from './orders.js';
import { audit, notFound, type Actor, type ServiceDeps } from './context.js';

/** Producto tal como lo ve el cliente. `price` es el que se cobrará (decide el servidor). */
export interface PublicProduct {
  sku: string;
  name: string;
  description: string;
  tag: string;
  units: number;
  listPriceCop: number;
  priceCop: number;
  promoEndsAt: string | null;
}

export async function listCatalog(deps: ServiceDeps, game: 'freefire'): Promise<PublicProduct[]> {
  const now = deps.now();
  const rows = await deps.db
    .select()
    .from(products)
    .where(and(eq(products.game, game), eq(products.active, true)))
    .orderBy(asc(products.sortOrder), asc(products.priceCop));
  const schedule = deps.config.promoSchedule;
  // Con promo de fin de semana, la oferta termina a más tardar el lunes 00:00 (Colombia).
  const weekendEnd = schedule === 'weekends' ? weekendWindow(now).endsAt : null;
  return rows.map((row) => {
    const price = effectivePrice(row, now, schedule);
    const ends = [row.promoEndsAt, weekendEnd].filter((d): d is Date => d !== null);
    const promoEndsAt = ends.length ? new Date(Math.min(...ends.map((d) => d.getTime()))) : null;
    return {
      sku: row.sku,
      name: row.name,
      description: row.description,
      tag: row.tag,
      units: row.units,
      listPriceCop: row.priceCop,
      priceCop: price,
      promoEndsAt: price < row.priceCop && promoEndsAt ? promoEndsAt.toISOString() : null,
    };
  });
}

export const productSchema = z
  .strictObject({
    sku: z.string().regex(/^[a-z0-9-]{2,60}$/),
    game: z.literal('freefire'),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(160).default(''),
    tag: z.string().trim().max(30).default(''),
    units: z.number().int().positive().max(1_000_000),
    priceCop: z.number().int().positive().max(1_000_000),
    promoPriceCop: z.number().int().positive().nullable().default(null),
    promoEndsAt: z.iso.datetime().nullable().default(null),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .refine((p) => p.promoPriceCop === null || p.promoPriceCop < p.priceCop, {
    message: 'El precio promocional debe ser menor que el normal.',
    path: ['promoPriceCop'],
  });
export type ProductInput = z.infer<typeof productSchema>;

export async function listAllProducts(deps: ServiceDeps) {
  return deps.db.select().from(products).orderBy(asc(products.game), asc(products.sortOrder));
}

export async function createProduct(deps: ServiceDeps, input: ProductInput, actor: Actor) {
  try {
    const [row] = await deps.db
      .insert(products)
      .values({ ...input, promoEndsAt: input.promoEndsAt ? new Date(input.promoEndsAt) : null })
      .returning();
    if (!row) throw new Error('no se creó el producto');
    await audit(deps.db, actor, {
      entityType: 'product',
      entityId: row.id,
      action: 'product.created',
      data: { sku: row.sku, priceCop: row.priceCop, promoPriceCop: row.promoPriceCop },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error))
      throw new AppError('CONFLICT', 409, 'Ya existe un producto con ese SKU.');
    throw error;
  }
}

export async function updateProduct(
  deps: ServiceDeps,
  id: string,
  input: ProductInput,
  actor: Actor,
) {
  const [row] = await deps.db
    .update(products)
    .set({
      ...input,
      promoEndsAt: input.promoEndsAt ? new Date(input.promoEndsAt) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, id))
    .returning();
  if (!row) throw notFound();
  await audit(deps.db, actor, {
    entityType: 'product',
    entityId: row.id,
    action: 'product.updated',
    data: {
      sku: row.sku,
      priceCop: row.priceCop,
      promoPriceCop: row.promoPriceCop,
      active: row.active,
    },
  });
  return row;
}
