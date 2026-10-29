import { and, eq } from 'drizzle-orm';
import { fulfillments, orders, users, type FulfillmentStatus } from '../db/schema.js';
import type { SheetCommand } from '../integrations/sheets/google-sheets.js';
import { AppError } from '../plugins/errors.js';
import { fulfillmentAction, type FulfillmentAction } from './admin.js';
import type { Actor, ServiceDeps } from './context.js';
import { bogotaTime } from './notifications.js';

/**
 * Cambios de estado de la entrega que el dueño elige en la hoja de Google («Entregas», columna
 * «Cambiar estado (tú)»). La tienda los aplica con las mismas reglas y el mismo historial que el
 * panel (`fulfillmentAction`): nunca entrega sin un pago confirmado, el cliente ve el estado nuevo
 * en su pedido y el aviso de entrega sale igual. Nada de pagos: confirmar o rechazar un pago Nequi
 * sigue siendo solo del panel, con su inicio de sesión y su segundo paso.
 */

export type SheetTarget = 'start' | 'deliver' | 'fail';

/** Opciones de la lista de la columna T, tal como se ven en la hoja. */
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
  'en proceso': 'start',
  entregado: 'deliver',
  completado: 'deliver',
  'no se pudo entregar': 'fail',
};

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

/** Aplica una orden de la hoja y devuelve la respuesta para el dueño (columna V). */
export async function applySheetCommand(
  deps: ServiceDeps,
  command: SheetCommand,
  actor: Actor | undefined,
): Promise<string> {
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
 * Una pasada: lee la columna T de «Entregas» (sin tocar la base de datos si está vacía), aplica
 * cada orden y deja la respuesta en la fila. Si falla la base de datos, la orden sigue escrita y
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
      { ref: command.reference, aplicado: response.startsWith('✔️') },
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
