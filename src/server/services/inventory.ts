import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import { inventoryCodes, orderItems, products } from '../db/schema.js';
import { decrypt, encrypt, keyedHash } from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { audit, notFound, type Actor, type ServiceDeps } from './context.js';

/**
 * Inventario de recargas: quién tiene los diamantes.
 *
 * El dueño compra PIN de Free Fire a una red autorizada (docs/procedimiento-diamantes.md) y los
 * carga en el panel, cada uno en su paquete. Al empezar la entrega de un pedido pagado se le
 * reserva un PIN por unidad (el más antiguo primero); al entregarlo quedan usados. Si no hay
 * suficientes, el pedido se entrega como hasta ahora (recarga manual) y el panel lo indica.
 *
 * Los PIN valen dinero: van cifrados, nunca salen en registros ni auditoría, y solo los ve un
 * administrador con doble factor en el detalle del pedido al que se asignaron.
 */

/** Por debajo de esta cantidad disponible, el panel avisa para reponer. */
export const LOW_STOCK = 3;

const normalizeCode = (code: string) => code.replace(/[\s-]+/g, '').toUpperCase();

export const addInventorySchema = z.strictObject({
  productId: z.uuid(),
  codes: z
    .array(
      z
        .string()
        .trim()
        .max(80)
        .transform(normalizeCode)
        .pipe(z.string().regex(/^[A-Z0-9]{6,40}$/, 'PIN con formato no válido')),
    )
    .min(1)
    .max(200),
  /** Costo de compra por PIN (para calcular el margen). Opcional. */
  costCop: z.number().int().positive().max(1_000_000).optional(),
  /** De dónde salió el lote (red, factura). Sin datos personales. */
  source: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u)
    .optional(),
});

export async function addInventory(
  deps: ServiceDeps,
  input: z.infer<typeof addInventorySchema>,
  actor: Actor,
): Promise<{ added: number; duplicates: number }> {
  const [product] = await deps.db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(eq(products.id, input.productId));
  if (!product) throw notFound();
  const unique = [...new Set(input.codes)];
  const keys = deps.config.secrets.mfaKeys;
  const rows = unique.map((code) => ({
    productId: product.id,
    codeEnc: encrypt(keys, code),
    codeHash: keyedHash(keys, `inventory:${code}`).hash,
    costCop: input.costCop ?? null,
    source: input.source ?? null,
    createdBy: actor.userId ?? null,
  }));
  const inserted = await deps.db.transaction(async (tx) => {
    const created = await tx
      .insert(inventoryCodes)
      .values(rows)
      .onConflictDoNothing({ target: inventoryCodes.codeHash })
      .returning({ id: inventoryCodes.id });
    await audit(tx, actor, {
      entityType: 'inventory',
      entityId: product.id,
      action: 'inventory.added',
      // Solo cantidades: nunca los PIN.
      data: {
        sku: product.sku,
        added: created.length,
        duplicates: input.codes.length - created.length,
      },
    });
    return created.length;
  });
  return { added: inserted, duplicates: input.codes.length - inserted };
}

export interface InventoryLine {
  productId: string;
  sku: string;
  name: string;
  available: number;
  assigned: number;
  used: number;
  void: number;
  lowStock: boolean;
}

/** Existencias por paquete activo (incluye los que aún no tienen PIN cargados). */
export async function inventorySummary(deps: ServiceDeps): Promise<InventoryLine[]> {
  const rows = await deps.db
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      status: inventoryCodes.status,
      n: sql<number>`count(${inventoryCodes.id})::int`,
    })
    .from(products)
    .leftJoin(inventoryCodes, eq(inventoryCodes.productId, products.id))
    .where(eq(products.active, true))
    .groupBy(products.id, products.sku, products.name, products.sortOrder, inventoryCodes.status)
    .orderBy(asc(products.sortOrder));
  const lines = new Map<string, InventoryLine>();
  for (const row of rows) {
    const line = lines.get(row.productId) ?? {
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      available: 0,
      assigned: 0,
      used: 0,
      void: 0,
      lowStock: false,
    };
    if (row.status === 'AVAILABLE') line.available = row.n;
    if (row.status === 'ASSIGNED') line.assigned = row.n;
    if (row.status === 'USED') line.used = row.n;
    if (row.status === 'VOID') line.void = row.n;
    lines.set(row.productId, line);
  }
  // Solo se avisa de los paquetes que el dueño gestiona con inventario (alguna vez tuvo PIN).
  return [...lines.values()].map((line) => ({
    ...line,
    lowStock:
      line.available + line.assigned + line.used + line.void > 0 && line.available < LOW_STOCK,
  }));
}

/**
 * Reserva PIN para un pedido (dentro de la transacción que empieza la entrega). Bloquea las
 * filas con SKIP LOCKED: dos entregas a la vez nunca reciben el mismo PIN.
 * Devuelve cuántas unidades quedaron sin PIN (se entregan a mano).
 */
export async function assignInventory(
  tx: Tx,
  orderId: string,
  now: Date,
): Promise<{ assigned: number; missing: number }> {
  const items = await tx
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  let assigned = 0;
  let missing = 0;
  for (const item of items) {
    const already = await tx
      .select({ id: inventoryCodes.id })
      .from(inventoryCodes)
      .where(
        and(eq(inventoryCodes.orderId, orderId), eq(inventoryCodes.productId, item.productId)),
      );
    const needed = item.quantity - already.length;
    if (needed <= 0) continue;
    const free = await tx
      .select({ id: inventoryCodes.id })
      .from(inventoryCodes)
      .where(
        and(eq(inventoryCodes.productId, item.productId), eq(inventoryCodes.status, 'AVAILABLE')),
      )
      .orderBy(asc(inventoryCodes.createdAt))
      .limit(needed)
      .for('update', { skipLocked: true });
    if (free.length) {
      await tx
        .update(inventoryCodes)
        .set({ status: 'ASSIGNED', orderId, assignedAt: now })
        .where(
          inArray(
            inventoryCodes.id,
            free.map((f) => f.id),
          ),
        );
    }
    assigned += free.length;
    missing += needed - free.length;
  }
  return { assigned, missing };
}

/** Al entregar: los PIN asignados al pedido quedan usados. */
export async function markInventoryUsed(tx: Tx, orderId: string, now: Date): Promise<number> {
  const used = await tx
    .update(inventoryCodes)
    .set({ status: 'USED', usedAt: now })
    .where(and(eq(inventoryCodes.orderId, orderId), eq(inventoryCodes.status, 'ASSIGNED')))
    .returning({ id: inventoryCodes.id });
  return used.length;
}

/** PIN del pedido, descifrados, para el administrador (detalle del pedido). */
export async function inventoryForOrder(deps: ServiceDeps, orderId: string) {
  const rows = await deps.db
    .select({
      id: inventoryCodes.id,
      sku: products.sku,
      status: inventoryCodes.status,
      codeEnc: inventoryCodes.codeEnc,
      assignedAt: inventoryCodes.assignedAt,
      usedAt: inventoryCodes.usedAt,
    })
    .from(inventoryCodes)
    .innerJoin(products, eq(products.id, inventoryCodes.productId))
    .where(eq(inventoryCodes.orderId, orderId))
    .orderBy(asc(products.sku), asc(inventoryCodes.assignedAt));
  return rows.map(({ codeEnc, ...row }) => ({
    ...row,
    code: decrypt(deps.config.secrets.mfaKeys, codeEnc).plaintext,
  }));
}

export const inventoryActionSchema = z.strictObject({
  action: z.enum(['release', 'void']),
});

/**
 * - release: un PIN asignado que no se usó vuelve a estar disponible (pedido no entregado).
 * - void: un PIN inservible (ya canjeado, ilegible) sale del inventario. Solo si no se usó.
 */
export async function inventoryAction(
  deps: ServiceDeps,
  id: string,
  input: z.infer<typeof inventoryActionSchema>,
  actor: Actor,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(inventoryCodes)
      .where(eq(inventoryCodes.id, id))
      .for('update');
    if (!row) throw notFound();
    if (input.action === 'release' && row.status !== 'ASSIGNED') {
      throw new AppError('INVALID_STATE', 409, 'Solo se libera un PIN asignado y sin usar.');
    }
    if (input.action === 'void' && !['AVAILABLE', 'ASSIGNED'].includes(row.status)) {
      throw new AppError('INVALID_STATE', 409, 'Ese PIN ya se usó o se anuló.');
    }
    const to = input.action === 'release' ? 'AVAILABLE' : 'VOID';
    await tx
      .update(inventoryCodes)
      .set(
        to === 'AVAILABLE'
          ? { status: to, orderId: null, assignedAt: null }
          : { status: to, orderId: null },
      )
      .where(eq(inventoryCodes.id, id));
    await audit(tx, actor, {
      entityType: 'inventory',
      entityId: row.id,
      action: `inventory.${input.action}`,
      fromStatus: row.status,
      toStatus: to,
      data: { orderId: row.orderId },
    });
  });
}
