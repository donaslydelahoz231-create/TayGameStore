import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { fulfillments, oauthStates, orders, payments, sessions } from '../db/schema.js';
import { withTimeout } from '../lib/time.js';
import { audit, SYSTEM_ACTOR, type ServiceDeps } from './context.js';
import { closeOpenAttempts, transitionOrder } from './orders.js';
import { purgeExpiredLookups } from './player.js';
import {
  failedPaymentEvents,
  ordersNeedingReconciliation,
  processPaymentEvent,
  reconcileOrder,
} from './payments.js';

/**
 * Tareas programadas dentro del mismo proceso. Cada una toma un advisory lock de PostgreSQL:
 * con varias instancias o tras un reinicio, solo una la ejecuta a la vez. Todas son idempotentes.
 */

const JOB_LOCKS = {
  expireOrders: 7301,
  reconcilePayments: 7302,
  retryEvents: 7303,
  releaseClaims: 7304,
  cleanup: 7305,
} as const;
export type JobName = keyof typeof JOB_LOCKS;

/** Expira órdenes vencidas sin pagos en curso. Antes concilia con Mercado Pago. */
export async function expireOrders(deps: ServiceDeps): Promise<number> {
  const now = deps.now();
  const due = await deps.db
    .select({ id: orders.id, ref: orders.publicRef, status: orders.status })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ['AWAITING_VERIFICATION', 'AWAITING_PAYMENT']),
        lt(orders.expiresAt, now),
      ),
    )
    .limit(50);
  let expired = 0;
  for (const candidate of due) {
    if (candidate.status === 'AWAITING_PAYMENT' && deps.gateway) {
      try {
        await reconcileOrder(deps, candidate.ref, SYSTEM_ACTOR);
      } catch (error) {
        // Sin confirmar con Mercado Pago no se expira: se reintenta en la siguiente pasada.
        deps.log.warn({ err: error, ref: candidate.ref }, 'expiry reconciliation failed');
        continue;
      }
    }
    await deps.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, candidate.id))
        .for('update');
      if (!order || !['AWAITING_VERIFICATION', 'AWAITING_PAYMENT'].includes(order.status)) return;
      if (order.expiresAt.getTime() > now.getTime()) return;
      const [inFlight] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            inArray(payments.status, ['PENDING', 'APPROVED', 'UNKNOWN']),
          ),
        )
        .limit(1);
      if (inFlight) return; // Pago en curso (p. ej. efectivo pendiente): no se expira.
      await transitionOrder(tx, SYSTEM_ACTOR, order, 'EXPIRED', {}, { reason: 'ttl' });
      await closeOpenAttempts(tx, order.id, 'EXPIRED');
      expired += 1;
    });
  }
  return expired;
}

export async function reconcilePayments(deps: ServiceDeps): Promise<number> {
  if (!deps.gateway) return 0;
  const refs = await ordersNeedingReconciliation(deps, 25);
  let done = 0;
  for (const ref of refs) {
    try {
      await reconcileOrder(deps, ref, SYSTEM_ACTOR);
      done += 1;
    } catch (error) {
      deps.log.warn({ err: error, ref, alert: 'reconciliation_failed' }, 'reconciliation failed');
    }
  }
  return done;
}

export async function retryFailedEvents(deps: ServiceDeps): Promise<number> {
  if (!deps.gateway) return 0;
  const events = await failedPaymentEvents(deps, 25);
  for (const event of events) {
    await processPaymentEvent(deps, event.id, event.resourceId, SYSTEM_ACTOR);
  }
  return events.length;
}

/** Libera reclamos de entrega abandonados (CLAIMED sin iniciar). Nunca toca DELIVERING. */
export async function releaseStaleClaims(deps: ServiceDeps): Promise<number> {
  const limit = new Date(deps.now().getTime() - deps.config.orders.claimTimeoutMinutes * 60_000);
  const released = await deps.db
    .update(fulfillments)
    .set({
      status: 'READY_FOR_FULFILLMENT',
      claimedBy: null,
      claimedAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(fulfillments.status, 'CLAIMED'), lt(fulfillments.claimedAt, limit)))
    .returning({ id: fulfillments.id, orderId: fulfillments.orderId });
  for (const row of released) {
    await audit(deps.db, SYSTEM_ACTOR, {
      entityType: 'fulfillment',
      entityId: row.id,
      action: 'fulfillment.claim_released_timeout',
      fromStatus: 'CLAIMED',
      toStatus: 'READY_FOR_FULFILLMENT',
      data: { orderId: row.orderId },
    });
  }
  return released.length;
}

export async function cleanup(deps: ServiceDeps): Promise<number> {
  const now = deps.now();
  const removedSessions = await deps.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date(now.getTime() - 7 * 24 * 3_600_000)))
    .returning({ id: sessions.id });
  const removedStates = await deps.db
    .delete(oauthStates)
    .where(lt(oauthStates.expiresAt, now))
    .returning({ stateHash: oauthStates.stateHash });
  const removedLookups = await purgeExpiredLookups(deps);
  return removedSessions.length + removedStates.length + removedLookups;
}

const JOBS: Record<JobName, (deps: ServiceDeps) => Promise<number>> = {
  expireOrders,
  reconcilePayments,
  retryEvents: retryFailedEvents,
  releaseClaims: releaseStaleClaims,
  cleanup,
};

const JOB_TIMEOUT_MS = 50_000;

/**
 * Ejecuta una tarea si obtiene su lock (`pg_try_advisory_xact_lock`, liberado al terminar la
 * transacción que lo sostiene). Devuelve null si otra instancia la está ejecutando.
 */
export async function runJob(deps: ServiceDeps, name: JobName): Promise<number | null> {
  return deps.db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${JOB_LOCKS[name]}) as locked`,
    );
    if (!lock.rows[0]?.locked) return null;
    return withTimeout(JOBS[name](deps), JOB_TIMEOUT_MS);
  });
}

export interface Scheduler {
  stop(): void;
}

const SCHEDULE: [JobName, number][] = [
  ['expireOrders', 60_000],
  ['reconcilePayments', 120_000],
  ['retryEvents', 60_000],
  ['releaseClaims', 120_000],
  ['cleanup', 3_600_000],
];

export function startScheduler(deps: ServiceDeps): Scheduler {
  const timers: NodeJS.Timeout[] = [];
  const running = new Set<JobName>();
  for (const [name, every] of SCHEDULE) {
    const tick = () => {
      if (running.has(name)) return; // Sin solapamiento dentro del proceso.
      running.add(name);
      runJob(deps, name)
        .then((result) => {
          if (result) deps.log.info({ job: name, result }, 'job finished');
        })
        .catch((error: unknown) =>
          deps.log.error({ err: error, job: name, alert: 'job_failed' }, 'job failed'),
        )
        .finally(() => running.delete(name));
    };
    // Desfase aleatorio para que varias instancias no arranquen a la vez.
    const first = setTimeout(tick, 5_000 + Math.floor(Math.random() * 10_000));
    const timer = setInterval(tick, every);
    first.unref();
    timer.unref();
    timers.push(first, timer);
  }
  return { stop: () => timers.forEach((timer) => clearTimeout(timer)) };
}
