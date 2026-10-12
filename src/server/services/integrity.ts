import { createHash } from 'node:crypto';
import { and, asc, between, desc, gt, lt, sql } from 'drizzle-orm';
import { catalogFingerprint, formatFingerprint } from '../domain/catalog-fingerprint.js';
import { auditEvents, auditSeals } from '../db/schema.js';
import { listCatalog } from './catalog.js';
import type { ServiceDeps } from './context.js';
import { lastReceiptNumber } from './receipts.js';

/**
 * Sellos de integridad del historial (cadena de hashes, como un libro contable):
 *
 *   sello N = sha256(sello N-1 · N · último evento · huella de cada evento del tramo)
 *
 * El historial (`audit_events`) ya no se puede modificar ni borrar desde la app (trigger). Los
 * sellos agregan la prueba: si alguien con acceso total a la base cambiara, borrara o insertara
 * un evento antiguo, al recalcular la cadena el sello de ese tramo deja de coincidir. Y como el
 * diagnóstico diario publica la huella del último sello fuera de la base (resumen de GitHub
 * Actions), rehacer toda la cadena también se nota: la huella de ayer ya no aparecería.
 */

const GENESIS = '0'.repeat(64);
/** Solo se sellan eventos con este margen: una transacción aún abierta no queda fuera. */
const SEAL_DELAY_MS = 10 * 60_000;
const SEAL_BATCH = 5_000;

type EventRow = typeof auditEvents.$inferSelect;

/** Huella de un evento: todos sus campos, en un orden fijo. */
export function eventDigest(row: EventRow): string {
  const fields = [
    row.id,
    row.createdAt.toISOString(),
    row.entityType,
    row.entityId,
    row.action,
    row.fromStatus ?? '',
    row.toStatus ?? '',
    row.actorType,
    row.actorId ?? '',
    JSON.stringify(row.data),
    row.ipHash ?? '',
  ];
  return createHash('sha256').update(fields.join('\u001f')).digest('hex');
}

export function sealHash(prevHash: string, seq: number, uptoEventId: number, digests: string[]) {
  return createHash('sha256')
    .update(`${prevHash}\n${seq}\n${uptoEventId}\n${digests.join('\n')}`)
    .digest('hex');
}

/** Sella los eventos nuevos (con margen de 10 min). Devuelve cuántos selló. */
export async function sealAudit(deps: ServiceDeps): Promise<number> {
  const [last] = await deps.db.select().from(auditSeals).orderBy(desc(auditSeals.seq)).limit(1);
  const cutoff = new Date(deps.now().getTime() - SEAL_DELAY_MS);
  const fromId = (last?.uptoEventId ?? 0) + 1;
  const rows = await deps.db
    .select()
    .from(auditEvents)
    .where(and(gt(auditEvents.id, fromId - 1), lt(auditEvents.createdAt, cutoff)))
    .orderBy(asc(auditEvents.id))
    .limit(SEAL_BATCH);
  const upto = rows.at(-1);
  if (!upto) return 0;
  // El tramo es [fromId, upto.id]: incluye cualquier evento de ese rango, aunque llegara tarde.
  const range = await deps.db
    .select()
    .from(auditEvents)
    .where(between(auditEvents.id, fromId, upto.id))
    .orderBy(asc(auditEvents.id));
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  await deps.db.insert(auditSeals).values({
    seq,
    fromEventId: fromId,
    uptoEventId: upto.id,
    events: range.length,
    totalEvents: (last?.totalEvents ?? 0) + range.length,
    prevHash,
    hash: sealHash(prevHash, seq, upto.id, range.map(eventDigest)),
  });
  return range.length;
}

export interface ChainCheck {
  ok: boolean;
  seals: number;
  sealedEvents: number;
  /** Primer sello que no coincide (si la cadena está rota). */
  brokenAt: number | null;
  reason: string | null;
  head: { seq: number; fingerprint: string; at: string; uptoEventId: number } | null;
}

/** Recalcula toda la cadena desde los eventos. */
export async function verifyChain(deps: ServiceDeps): Promise<ChainCheck> {
  const seals = await deps.db.select().from(auditSeals).orderBy(asc(auditSeals.seq));
  let prev = GENESIS;
  let expectedFrom = 1;
  let total = 0;
  const broken = (seq: number, reason: string): ChainCheck => ({
    ok: false,
    seals: seals.length,
    sealedEvents: total,
    brokenAt: seq,
    reason,
    head: null,
  });
  for (const [index, seal] of seals.entries()) {
    if (seal.seq !== index + 1) return broken(seal.seq, 'falta un sello');
    if (seal.prevHash !== prev) return broken(seal.seq, 'el sello no sigue al anterior');
    if (seal.fromEventId !== expectedFrom) return broken(seal.seq, 'tramo de eventos alterado');
    const rows = await deps.db
      .select()
      .from(auditEvents)
      .where(between(auditEvents.id, seal.fromEventId, seal.uptoEventId))
      .orderBy(asc(auditEvents.id));
    if (rows.length !== seal.events) return broken(seal.seq, 'faltan o sobran eventos');
    if (sealHash(prev, seal.seq, seal.uptoEventId, rows.map(eventDigest)) !== seal.hash) {
      return broken(seal.seq, 'un evento sellado fue modificado');
    }
    total += rows.length;
    if (seal.totalEvents !== total) return broken(seal.seq, 'el conteo no cuadra');
    prev = seal.hash;
    expectedFrom = seal.uptoEventId + 1;
  }
  const head = seals.at(-1);
  return {
    ok: true,
    seals: seals.length,
    sealedEvents: total,
    brokenAt: null,
    reason: null,
    head: head
      ? {
          seq: head.seq,
          fingerprint: formatFingerprint(head.hash),
          at: head.createdAt.toISOString(),
          uptoEventId: head.uptoEventId,
        }
      : null,
  };
}

export async function currentCatalogFingerprint(deps: ServiceDeps) {
  // Lo mismo que publica /api/catalog (con la promo ya ajustada al piso de ganancia): así la huella
  // del panel y la del diagnóstico diario se comparan directamente.
  const rows = await listCatalog(deps, 'freefire');
  return { products: rows.length, fingerprint: catalogFingerprint(rows) };
}

/** Lo que ve el dueño en «Integridad» (y, sin datos de pedidos, el diagnóstico diario). */
export async function integritySummary(deps: ServiceDeps) {
  const [chain, lastReceipt, catalog, [pending]] = await Promise.all([
    verifyChain(deps),
    lastReceiptNumber(deps),
    currentCatalogFingerprint(deps),
    deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(
        gt(
          auditEvents.id,
          sql`coalesce((select max(${auditSeals.uptoEventId}) from ${auditSeals}), 0)`,
        ),
      ),
  ]);
  return {
    chain,
    unsealedEvents: pending?.n ?? 0,
    lastReceipt,
    catalog: { ...catalog, locked: deps.config.catalogLocked },
    checkedAt: deps.now().toISOString(),
  };
}
