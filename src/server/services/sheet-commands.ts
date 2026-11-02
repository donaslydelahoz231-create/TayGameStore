import { and, eq } from 'drizzle-orm';
import { fulfillments, orders, users, type FulfillmentStatus } from '../db/schema.js';
import type { SheetCommand } from '../integrations/sheets/google-sheets.js';
import { AppError } from '../plugins/errors.js';
import { fulfillmentAction, type FulfillmentAction } from './admin.js';
import type { Actor, ServiceDeps } from './context.js';
import { confirmNequiTransfer, nequiReference } from './nequi-manual.js';
import { bogotaTime } from './notifications.js';

/**
 * Lo que el dueño marca en la hoja de Google, aplicado con las mismas reglas y el mismo historial
 * que el panel:
 * - «Entregas», casilla «✓ Enviado» (o el texto «En proceso», «Entregado», «No se pudo
 *   entregar»): `fulfillmentAction`. Nunca entrega sin un pago confirmado; el cliente ve el estado
 *   nuevo en su pedido y el aviso de entrega sale igual.
 * - «Pagos pendientes», casilla «✓ Pago verificado» con la referencia del movimiento en su app
 *   Nequi al lado (decisión del dueño, 2026-10-29): `confirmNequiTransfer`, por el total exacto
 *   del pedido. Sin referencia no confirma; una referencia confirma un solo pedido. Rechazar un
 *   aviso sigue siendo del panel.
 */

export type SheetTarget = 'start' | 'deliver' | 'fail';

/** Textos que la tienda aún entiende en la columna T (era una lista; desde 2026-11-02 es casilla). */
export const SHEET_COMMAND_OPTIONS = [
  '🔄 En proceso',
  '✅ Entregado',
  '⚠️ No se pudo entregar',
] as const;

const TARGET_LABELS: Record<SheetTarget, string> = {
  start: 'En proceso',
  deliver: 'Entregado',
  fail: 'No se pudo entregar',
};

/** Sin emojis, tildes, mayúsculas ni espacios de más: «✅ Entregado» = «entregado». */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const TARGETS: Record<string, SheetTarget> = {
  // Casilla «✓ Enviado» marcada (la hoja la entrega como true; en español, «VERDADERO»).
  true: 'deliver',
  verdadero: 'deliver',
  'en proceso': 'start',
  entregado: 'deliver',
  completado: 'deliver',
  'no se pudo entregar': 'fail',
};

/** Casilla marcada (o «sí» escrito a mano). */
const isChecked = (text: string) => ['true', 'verdadero', 'si'].includes(normalize(text));

export function parseSheetCommand(text: string): SheetTarget | undefined {
  return TARGETS[normalize(text)];
}

/**
 * Siguiente acción del panel para llevar la entrega al estado elegido. Se recalcula tras cada
 * paso con el estado real, así que repetir la orden o aplicarla a medias nunca hace daño.
 */
export function nextSheetStep(
  status: FulfillmentStatus,
  target: SheetTarget,
): FulfillmentAction | 'done' | { blocked: string } {
  switch (status) {
    case 'CANCELLED':
      return { blocked: 'el pedido se canceló.' };
    case 'DELIVERED':
      return target === 'deliver'
        ? 'done'
        : { blocked: 'ya está entregado; si hay un problema, revísalo en el panel.' };
    case 'FAILED':
      return target === 'fail' ? 'done' : { blocked: 'está en revisión: resuélvela en el panel.' };
    case 'READY_FOR_FULFILLMENT':
      return 'claim';
    case 'CLAIMED':
      return 'start';
    case 'DELIVERING':
      return target === 'start' ? 'done' : target;
  }
}

const DEFAULT_EVIDENCE = 'Entregado (marcado por el dueño en la hoja de Google)';
const DEFAULT_REASON = 'No se pudo entregar (marcado por el dueño en la hoja de Google)';
/** Una orden pide como mucho tomar, iniciar y terminar la entrega. */
const MAX_STEPS = 4;
/** Órdenes por pasada (el resto queda para la siguiente). */
const MAX_PER_PASS = 20;

/**
 * Quien actúa es el dueño: solo él y la cuenta de servicio de la tienda pueden editar la hoja.
 * Su cuenta de administrador (primer correo de ADMIN_EMAILS) firma el historial, con `via`.
 */
async function ownerActor(deps: ServiceDeps): Promise<Actor | undefined> {
  const email = deps.config.adminEmails[0];
  if (!email) return undefined;
  const [owner] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, 'admin')))
    .limit(1);
  return owner ? { type: 'admin', userId: owner.id, via: 'google_sheet' } : undefined;
}

const receiptLabel = (receiptNumber: number | null) =>
  receiptNumber === null ? '' : ` · Comprobante N.º ${String(receiptNumber).padStart(6, '0')}`;

/**
 * Casilla «✓ Pago verificado» de «Pagos pendientes»: confirma el pago Nequi del pedido por su total
 * exacto con la referencia que el dueño vio en su app Nequi (columna V).
 */
export async function applyPaymentCommand(
  deps: ServiceDeps,
  command: SheetCommand,
  actor: Actor | undefined,
): Promise<string> {
  if (!isChecked(command.command)) return '✖️ No se confirmó: marca la casilla de la columna U.';
  if (!actor) {
    return '✖️ No se confirmó: entra una vez al panel con tu cuenta de dueño y vuelve a marcar.';
  }
  const reference = nequiReference.safeParse(command.note);
  if (!reference.success) {
    return '✖️ No se confirmó: escribe en la columna V la referencia del movimiento que ves en tu app Nequi (4 a 40 letras, números o guiones) y vuelve a marcar.';
  }
  const loadOrder = async () =>
    (
      await deps.db
        .select({
          id: orders.id,
          status: orders.status,
          totalCop: orders.totalCop,
          receiptNumber: orders.receiptNumber,
        })
        .from(orders)
        .where(eq(orders.publicRef, command.reference))
        .limit(1)
    )[0];
  const order = await loadOrder();
  if (!order) return '✖️ No se confirmó: no hay un pedido con esa referencia.';
  if (['PAID', 'DELIVERING', 'DELIVERED'].includes(order.status)) {
    return `✔️ Ya estaba pagado${receiptLabel(order.receiptNumber)}`;
  }
  try {
    await confirmNequiTransfer(
      deps,
      order.id,
      { nequiReference: reference.data, amountCop: order.totalCop },
      actor,
    );
  } catch (error) {
    // Mismos mensajes que ve el dueño en el panel (pedido de Mercado Pago, referencia usada…).
    if (error instanceof AppError) return `✖️ No se confirmó: ${error.message}`;
    throw error;
  }
  const after = await loadOrder();
  if (after?.status === 'NEEDS_REVIEW') {
    return '✔️ Pago registrado, pero el pedido ya había vencido: quedó en revisión. Resuélvelo en el panel antes de entregar.';
  }
  return `✔️ Pago confirmado${receiptLabel(after?.receiptNumber ?? null)} · ya está en «Entregas»`;
}

/** Aplica lo que el dueño marcó en la hoja y devuelve la respuesta para él (última columna). */
export async function applySheetCommand(
  deps: ServiceDeps,
  command: SheetCommand,
  actor: Actor | undefined,
): Promise<string> {
  if (command.tab === 'pending') return applyPaymentCommand(deps, command, actor);
  const target = parseSheetCommand(command.command);
  if (!target) return '✖️ No entendí la opción: elige una de la lista.';
  if (!actor) {
    return '✖️ No se aplicó: entra una vez al panel con tu cuenta de dueño y vuelve a elegirlo.';
  }
  const [order] = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicRef, command.reference))
    .limit(1);
  if (!order) return '✖️ No se aplicó: no hay un pedido con esa referencia.';
  const note = command.note.slice(0, 300);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const [fulfillment] = await deps.db
      .select({ status: fulfillments.status, mode: fulfillments.mode })
      .from(fulfillments)
      .where(eq(fulfillments.orderId, order.id));
    if (!fulfillment) return '✖️ No se aplicó: el pedido todavía no tiene un pago confirmado.';
    if (fulfillment.mode === 'provider') {
      return '✖️ No se aplicó: la recarga de este pedido es automática.';
    }
    const next = nextSheetStep(fulfillment.status, target);
    if (next === 'done') {
      return step === 0
        ? `✔️ Ya estaba: ${TARGET_LABELS[target]}`
        : `✔️ Aplicado: ${TARGET_LABELS[target]}`;
    }
    if (typeof next === 'object') return `✖️ No se aplicó: ${next.blocked}`;
    const input =
      next === 'deliver'
        ? { action: next, evidence: note.length >= 3 ? note : DEFAULT_EVIDENCE }
        : next === 'fail'
          ? { action: next, reason: note.length >= 3 ? note : DEFAULT_REASON }
          : { action: next };
    try {
      await fulfillmentAction(deps, order.id, input, actor);
    } catch (error) {
      // Mismos mensajes que ve el dueño en el panel (pago sin confirmar, entregas pausadas…).
      if (error instanceof AppError) return `✖️ No se aplicó: ${error.message}`;
      throw error;
    }
  }
  return '✖️ No se aplicó: el pedido cambió mientras se aplicaba; vuelve a elegirlo.';
}

/**
 * Una pasada: lee las casillas de «Entregas» y «Pagos pendientes» (sin tocar la base de datos si
 * están sin marcar), aplica cada una y deja la respuesta en la fila. Si falla la base de datos, la orden sigue escrita y
 * se reintenta en la próxima pasada. Devuelve cuántas órdenes respondió.
 */
export async function processSheetCommands(deps: ServiceDeps): Promise<number> {
  const sheets = deps.sheets;
  if (!sheets?.readCommands || !sheets.finishCommand) return 0;
  const commands = (await sheets.readCommands()).slice(0, MAX_PER_PASS);
  if (!commands.length) return 0;
  const actor = await ownerActor(deps);
  for (const command of commands) {
    const response = await applySheetCommand(deps, command, actor);
    await sheets.finishCommand(command, `${response} · ${bogotaTime.format(deps.now())}`);
    deps.log.info(
      { ref: command.reference, pestaña: command.tab, aplicado: response.startsWith('✔️') },
      'hoja de Google: cambio de estado del dueño',
    );
  }
  return commands.length;
}

export interface SheetCommandPoller {
  stop(): void;
}

/** Aviso de fallo como mucho cada 10 minutos: Google caído no llena el registro. */
const WARN_EVERY_MS = 10 * 60_000;

/**
 * Revisa la hoja cada `intervalMs` (30 s por defecto). Es una lectura de Google por pasada; la
 * base de datos solo se usa cuando hay una orden, así que el modo reposo de Neon no cambia.
 */
export function startSheetCommandPoller(
  deps: ServiceDeps,
  options: { intervalMs?: number; onWork?: () => void } = {},
): SheetCommandPoller {
  let running = false;
  let lastWarn = Number.NEGATIVE_INFINITY;
  const tick = () => {
    if (running) return;
    running = true;
    processSheetCommands(deps)
      .then((handled) => {
        if (handled) options.onWork?.();
      })
      .catch((error: unknown) => {
        const now = Date.now();
        if (now - lastWarn < WARN_EVERY_MS) return;
        lastWarn = now;
        deps.log.warn(
          { err: error, alert: 'sheet_commands_failed' },
          'hoja de Google: no se pudieron leer los cambios del dueño',
        );
      })
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, options.intervalMs ?? 30_000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
