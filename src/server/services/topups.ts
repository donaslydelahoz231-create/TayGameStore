import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { fulfillments, orderItems, orders, payments, topups } from '../db/schema.js';
import { providerCovers, topupRegion } from './topup-coverage.js';
import { audit, SYSTEM_ACTOR, type ServiceDeps } from './context.js';
import {
  deliverNotifications,
  enqueueOrderNotifications,
  enqueueSheetSync,
  enqueueTopupAlert,
} from './notifications.js';
import { transitionOrder } from './orders.js';

/**
 * Recarga directa al ID con el distribuidor (TOPUP_PROVIDER=unipin), sin PIN y sin operador:
 *
 *   pago aprobado → fulfillment `provider` → por unidad: validar jugador → crear recarga
 *   (referencia determinista) → todas confirmadas → pedido ENTREGADO.
 *
 * Garantías:
 * - Solo con un pago aprobado, del importe correcto y asociado al pedido.
 * - Nunca dos recargas por unidad: la referencia es pedido-unidad-intento y UniPin rechaza una
 *   referencia repetida; un intento nuevo solo nace de un error explícito (FAILED).
 * - Una respuesta dudosa (tiempo agotado, error del servidor) se consulta; nunca cuenta como
 *   entregada. Si no se aclara, el pedido pasa a revisión y el dueño recibe un aviso.
 * - Un error explícito (ID inexistente, saldo, configuración) pasa el pedido a revisión con
 *   aviso al dueño; desde el panel puede reintentar («reanudar entrega») o reembolsar.
 */

/** Consultas de una recarga dudosa antes de pedir revisión (~2 h en total). */
export const MAX_CHECKS = 8;
const CHECK_BACKOFF_MINUTES = [1, 2, 5, 10, 15, 30, 30, 30];
/** Reintentos de validación sin respuesta clara antes de darla por fallida. */
const MAX_VALIDATE_RETRIES = 5;
/** Mientras se envía o consulta, la fila queda reservada para este proceso. */
const LEASE_MINUTES = 5;
/** Una pasada no empieza llamadas nuevas pasado este tiempo (el job tiene 50 s). */
const PASS_BUDGET_MS = 25_000;

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/**
 * Dentro de la transacción del pago, si la entrega sigue en cola y el proveedor cubre el pedido:
 * la entrega pasa a modo `provider`. La recarga empieza al confirmar la transacción.
 */
export async function routeToProvider(
  deps: ServiceDeps,
  tx: Tx,
  order: typeof orders.$inferSelect,
): Promise<boolean> {
  if (!deps.config.topup || !deps.config.flags.fulfillmentEnabled) return false;
  const items = await tx
    .select({ sku: orderItems.sku, unitPriceCop: orderItems.unitPriceCop })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  // Solo si el precio cobrado cubre el piso de ganancia; si no, entrega manual (nunca a pérdida).
  const paid = new Map(items.map((item) => [item.sku, item.unitPriceCop]));
  if (!providerCovers(deps, order.playerServer, [...paid.keys()], paid)) return false;
  const routed = await tx
    .update(fulfillments)
    .set({ mode: 'provider', updatedAt: sql`now()` })
    .where(
      and(eq(fulfillments.orderId, order.id), eq(fulfillments.status, 'READY_FOR_FULFILLMENT')),
    )
    .returning({ id: fulfillments.id });
  return routed.length === 1;
}

/** Arranca la recarga de un pedido sin bloquear al que llama (webhook o retorno del pago). */
export function kickTopups(deps: ServiceDeps, orderId: string): void {
  if (!deps.topup) return;
  const task = processTopups(deps, { orderId }).catch((error: unknown) =>
    deps.log.error({ err: error, orderId, alert: 'topup_failed' }, 'topup pass failed'),
  );
  deps.background?.(task);
}

/**
 * Una pasada completa: empezar entregas, enviar unidades, consultar dudosas, cerrar pedidos.
 * Devuelve cuántas entregas y recargas tocó.
 */
export async function processTopups(
  deps: ServiceDeps,
  filter: { orderId?: string } = {},
): Promise<number> {
  const provider = deps.topup;
  if (!provider || !deps.config.topup || !deps.config.flags.fulfillmentEnabled) return 0;
  const started = Date.now();
  const inBudget = () => Date.now() - started < PASS_BUDGET_MS;
  const touched = new Set<string>();

  const ready = await deps.db
    .select({ id: fulfillments.id, orderId: fulfillments.orderId })
    .from(fulfillments)
    .where(
      and(
        eq(fulfillments.mode, 'provider'),
        eq(fulfillments.status, 'READY_FOR_FULFILLMENT'),
        filter.orderId ? eq(fulfillments.orderId, filter.orderId) : undefined,
      ),
    )
    .orderBy(asc(fulfillments.createdAt))
    .limit(10);
  let worked = 0;
  for (const row of ready) {
    if (await startDelivery(deps, row.orderId)) touched.add(row.orderId);
    worked += 1;
  }

  const due = await deps.db
    .select({ id: topups.id, orderId: topups.orderId, status: topups.status })
    .from(topups)
    .where(
      and(
        inArray(topups.status, ['PENDING', 'SENT', 'UNCERTAIN']),
        lte(topups.nextCheckAt, deps.now()),
        filter.orderId ? eq(topups.orderId, filter.orderId) : undefined,
      ),
    )
    .orderBy(asc(topups.nextCheckAt))
    .limit(20);
  for (const row of due) {
    if (!inBudget()) break;
    worked += 1;
    const done =
      row.status === 'PENDING' ? await sendTopup(deps, row.id) : await checkTopup(deps, row.id);
    if (done) touched.add(row.orderId);
  }

  for (const orderId of touched) await finalizeOrder(deps, orderId);
  // Cuenta el trabajo hecho: con recargas en curso, las tareas no entran en reposo.
  return worked;
}

/** Pedido pagado + entrega `provider` en cola → DELIVERING y una recarga por unidad. */
async function startDelivery(deps: ServiceDeps, orderId: string): Promise<boolean> {
  const config = deps.config.topup;
  if (!config) return false;
  const actor = SYSTEM_ACTOR;
  const started = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    const [fulfillment] = await tx
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, orderId))
      .for('update');
    if (
      !order ||
      fulfillment?.status !== 'READY_FOR_FULFILLMENT' ||
      fulfillment.mode !== 'provider'
    )
      return false;
    if (order.status !== 'PAID') return false;
    // Nunca se recarga sin un pago aprobado, del importe correcto, asociado a la orden.
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
    if (!paid) return false;
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.sku));
    const region = topupRegion(deps, order.playerServer);
    const missing = items.filter((item) => !region?.skus[item.sku]);
    if (!region || missing.length) {
      // El catálogo del proveedor cambió desde el pago: la entrega vuelve a la cola manual.
      await tx
        .update(fulfillments)
        .set({ mode: 'manual', updatedAt: sql`now()` })
        .where(eq(fulfillments.id, fulfillment.id));
      await audit(tx, actor, {
        entityType: 'fulfillment',
        entityId: fulfillment.id,
        action: 'fulfillment.topup_not_covered',
        data: { orderId, server: order.playerServer },
      });
      await enqueueTopupAlert(deps, tx, orderId);
      return false;
    }

    const existing = await tx.select().from(topups).where(eq(topups.orderId, orderId));
    const latest = new Map<string, typeof topups.$inferSelect>();
    for (const row of existing) {
      const key = `${row.orderItemId}:${row.unitIndex}`;
      const current = latest.get(key);
      if (!current || current.attempt < row.attempt) latest.set(key, row);
    }
    const now = deps.now();
    const fresh: (typeof topups.$inferInsert)[] = [];
    items.forEach((item, position) => {
      for (let unit = 1; unit <= item.quantity; unit += 1) {
        const last = latest.get(`${item.id}:${unit}`);
        if (last?.status === 'SUCCESS') continue;
        if (last && last.status !== 'FAILED') continue; // En curso: se consulta, no se repite.
        const attempt = (last?.attempt ?? 0) + 1;
        fresh.push({
          orderId,
          orderItemId: item.id,
          unitIndex: unit,
          attempt,
          provider: config.provider,
          referenceNo: `${order.publicRef}-${position + 1}${unit}-${attempt}`,
          gameCode: region.game,
          denominationId: region.skus[item.sku]?.denomination ?? '',
          nextCheckAt: now,
        });
      }
    });
    if (fresh.length) await tx.insert(topups).values(fresh);
    // Las dudosas que agotaron sus consultas se vuelven a consultar al reanudar la entrega.
    await tx
      .update(topups)
      .set({ checks: 0, nextCheckAt: now, updatedAt: sql`now()` })
      .where(and(eq(topups.orderId, orderId), inArray(topups.status, ['SENT', 'UNCERTAIN'])));

    await tx
      .update(fulfillments)
      .set({ status: 'DELIVERING', startedAt: now, failureReason: null, updatedAt: sql`now()` })
      .where(eq(fulfillments.id, fulfillment.id));
    await audit(tx, actor, {
      entityType: 'fulfillment',
      entityId: fulfillment.id,
      action: 'fulfillment.topup_started',
      fromStatus: 'READY_FOR_FULFILLMENT',
      toStatus: 'DELIVERING',
      data: { orderId, units: fresh.length, provider: config.provider },
    });
    await transitionOrder(tx, actor, order, 'DELIVERING', {}, { method: 'topup' });
    await enqueueSheetSync(deps, tx, orderId);
    return true;
  });
  // La fila del pedido en «Entregas» pasa a «En proceso» sin esperar al scheduler.
  if (started) await deliverNotifications(deps, { orderId });
  return started;
}

/** Reserva una fila (CAS de estado y vencimiento); devuelve null si otro proceso la tomó. */
async function claim(
  deps: ServiceDeps,
  id: string,
  from: (typeof topups.$inferSelect)['status'][],
  to?: 'SENT',
) {
  const now = deps.now();
  const [row] = await deps.db
    .update(topups)
    .set({
      ...(to ? { status: to } : {}),
      nextCheckAt: addMinutes(now, LEASE_MINUTES),
      updatedAt: sql`now()`,
    })
    .where(and(eq(topups.id, id), inArray(topups.status, from), lte(topups.nextCheckAt, now)))
    .returning();
  if (!row) return null;
  const [order] = await deps.db
    .select({ playerUid: orders.playerUid, playerServer: orders.playerServer })
    .from(orders)
    .where(eq(orders.id, row.orderId));
  return order ? { row, order } : null;
}

async function save(
  deps: ServiceDeps,
  id: string,
  changes: Partial<typeof topups.$inferInsert>,
  data: Record<string, string | number | boolean | null | undefined> = {},
) {
  const [row] = await deps.db
    .update(topups)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(topups.id, id))
    .returning();
  if (!row) return;
  await audit(deps.db, SYSTEM_ACTOR, {
    entityType: 'fulfillment',
    entityId: row.orderId,
    action: `topup.${row.status.toLowerCase()}`,
    toStatus: row.status,
    // La referencia y el código de error, nunca credenciales ni respuestas completas.
    data: { orderId: row.orderId, referenceNo: row.referenceNo, errorCode: row.errorCode, ...data },
  });
}

const backoff = (checks: number) =>
  CHECK_BACKOFF_MINUTES[Math.min(checks, CHECK_BACKOFF_MINUTES.length - 1)] ?? 30;

/** PENDING → validar → crear. Devuelve true si la fila llegó a un estado que cierra o falla. */
async function sendTopup(deps: ServiceDeps, id: string): Promise<boolean> {
  const provider = deps.topup;
  const claimed = await claim(deps, id, ['PENDING'], 'SENT');
  if (!provider || !claimed) return false;
  const { row, order } = claimed;
  const region = topupRegion(deps, order.playerServer);
  const now = () => deps.now();

  const validate = async () =>
    provider.validateUser({
      game: row.gameCode,
      uidField: region?.uidField ?? 'userid',
      playerUid: order.playerUid,
    });

  const validated = await validate();
  if (validated.kind === 'uncertain') {
    // No se llegó a crear nada: es seguro volver a intentarlo más tarde.
    const checks = row.checks + 1;
    if (checks >= MAX_VALIDATE_RETRIES) {
      await save(deps, id, {
        status: 'FAILED',
        errorCode: `validacion_${validated.reason}`,
        checks,
      });
      return true;
    }
    await save(deps, id, {
      status: 'PENDING',
      checks,
      nextCheckAt: addMinutes(now(), backoff(checks)),
    });
    return false;
  }
  if (validated.kind === 'failed') {
    await save(deps, id, { status: 'FAILED', errorCode: `validacion_${validated.code}` });
    return true;
  }

  const create = (token: string) =>
    provider.createOrder({
      game: row.gameCode,
      validationToken: token,
      referenceNo: row.referenceNo,
      denominationId: row.denominationId,
    });
  let result = await create(validated.token);
  if (result.kind === 'token_expired') {
    // 726 = token caducado o ya procesado: se valida otra vez y se repite la MISMA referencia.
    const again = await validate();
    result = again.kind === 'ok' ? await create(again.token) : result;
  }
  switch (result.kind) {
    case 'success':
      await save(deps, id, {
        status: 'SUCCESS',
        providerTransaction: result.transaction,
        errorCode: null,
      });
      return true;
    case 'failed':
      await save(deps, id, { status: 'FAILED', errorCode: result.code });
      return true;
    case 'duplicate':
      // La referencia ya existe en UniPin: se consulta su estado ahora mismo.
      await save(deps, id, { status: 'UNCERTAIN', errorCode: 'duplicada', nextCheckAt: now() });
      return checkTopup(deps, id);
    case 'uncertain':
    case 'token_expired':
      // «Ya procesado» puede significar que la recarga se hizo: se aclara consultando.
      await save(deps, id, {
        status: 'UNCERTAIN',
        errorCode: result.kind === 'uncertain' ? result.reason : 'token_caducado',
        nextCheckAt: addMinutes(now(), 1),
      });
      return false;
  }
}

/** SENT/UNCERTAIN → consulta. Solo una confirmación explícita la da por recargada. */
async function checkTopup(deps: ServiceDeps, id: string): Promise<boolean> {
  const provider = deps.topup;
  const claimed = await claim(deps, id, ['SENT', 'UNCERTAIN']);
  if (!provider || !claimed) return false;
  const { row } = claimed;
  const result = await provider.inquiry(row.referenceNo);
  if (result.kind === 'success') {
    await save(deps, id, {
      status: 'SUCCESS',
      providerTransaction: result.transaction,
      errorCode: null,
    });
    return true;
  }
  const checks = row.checks + 1;
  const reason = result.kind === 'uncertain' ? result.reason : result.kind;
  await save(deps, id, {
    status: 'UNCERTAIN',
    checks,
    errorCode: checks >= MAX_CHECKS ? 'sin_confirmar' : reason,
    nextCheckAt: addMinutes(deps.now(), checks >= MAX_CHECKS ? 60 * 24 * 365 : backoff(checks)),
  });
  return checks >= MAX_CHECKS;
}

/**
 * Cierra el pedido según sus recargas (la última por unidad):
 * - todas SUCCESS → ENTREGADO (evidencia: transacciones de UniPin) y aviso al cliente;
 * - alguna FAILED o dudosa sin confirmar, y nada en curso → revisión y aviso al dueño;
 * - si no, sigue entregándose.
 */
export async function finalizeOrder(deps: ServiceDeps, orderId: string): Promise<boolean> {
  const actor = SYSTEM_ACTOR;
  const outcome = await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    const [fulfillment] = await tx
      .select()
      .from(fulfillments)
      .where(eq(fulfillments.orderId, orderId))
      .for('update');
    if (!order || !fulfillment || fulfillment.mode !== 'provider') return undefined;
    if (fulfillment.status !== 'DELIVERING' || order.status !== 'DELIVERING') return undefined;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const rows = await tx.select().from(topups).where(eq(topups.orderId, orderId));
    const latest = new Map<string, typeof topups.$inferSelect>();
    for (const row of rows) {
      const key = `${row.orderItemId}:${row.unitIndex}`;
      const current = latest.get(key);
      if (!current || current.attempt < row.attempt) latest.set(key, row);
    }
    const last = [...latest.values()];
    const now = deps.now();

    if (last.length === units && last.every((row) => row.status === 'SUCCESS')) {
      const transactions = last.map((row) => row.providerTransaction).join(', ');
      await tx
        .update(fulfillments)
        .set({
          status: 'DELIVERED',
          deliveredAt: now,
          evidence: `Recarga directa confirmada por UniPin (transacciones: ${transactions}).`.slice(
            0,
            500,
          ),
          updatedAt: sql`now()`,
        })
        .where(eq(fulfillments.id, fulfillment.id));
      await audit(tx, actor, {
        entityType: 'fulfillment',
        entityId: fulfillment.id,
        action: 'fulfillment.topup_delivered',
        fromStatus: 'DELIVERING',
        toStatus: 'DELIVERED',
        data: { orderId, units },
      });
      await transitionOrder(tx, actor, order, 'DELIVERED', {}, { method: 'topup' });
      await enqueueOrderNotifications(deps, tx, orderId, 'delivered');
      return 'delivered' as const;
    }

    const inFlight = last.some(
      (row) =>
        row.status === 'PENDING' ||
        row.status === 'SENT' ||
        (row.status === 'UNCERTAIN' && row.checks < MAX_CHECKS),
    );
    const failed = last.filter(
      (row) => row.status === 'FAILED' || (row.status === 'UNCERTAIN' && row.checks >= MAX_CHECKS),
    );
    if (inFlight || !failed.length) return undefined;

    const reason = failed.some((row) => row.status === 'UNCERTAIN')
      ? 'topup_unconfirmed'
      : 'topup_failed';
    const codes = [...new Set(failed.map((row) => row.errorCode ?? 'sin_codigo'))].join(', ');
    const delivered = last.filter((row) => row.status === 'SUCCESS').length;
    await tx
      .update(fulfillments)
      .set({
        status: 'FAILED',
        failureReason:
          `${reason === 'topup_failed' ? 'UniPin rechazó la recarga' : 'UniPin no confirmó la recarga'} (${codes}); recargadas ${delivered} de ${units}.`.slice(
            0,
            300,
          ),
        updatedAt: sql`now()`,
      })
      .where(eq(fulfillments.id, fulfillment.id));
    await audit(tx, actor, {
      entityType: 'fulfillment',
      entityId: fulfillment.id,
      action: `fulfillment.${reason}`,
      fromStatus: 'DELIVERING',
      toStatus: 'FAILED',
      data: { orderId, delivered, units, codes, alert: true },
    });
    await transitionOrder(tx, actor, order, 'NEEDS_REVIEW', {}, { reason });
    await enqueueTopupAlert(deps, tx, orderId);
    return 'review' as const;
  });
  if (outcome) await deliverNotifications(deps, { orderId });
  return outcome !== undefined;
}
