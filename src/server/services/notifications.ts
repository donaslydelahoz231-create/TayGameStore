import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import {
  notifications,
  orderItems,
  orders,
  type NotificationChannel,
  type NotificationKind,
} from '../db/schema.js';
import { paidOrderText } from '../integrations/notify/owner.js';
import type { MailMessage } from '../integrations/notify/email.js';
import type { ServiceDeps } from './context.js';

/**
 * Avisos de un pedido (cola `notifications`):
 * - pagado → al dueño (Telegram y/o correo) y al cliente (correo);
 * - entregado → al cliente; reembolsado → al cliente.
 * Se encolan en la misma transacción que el cambio de estado, se envían justo después de
 * confirmarla y, si un envío falla, el scheduler lo reintenta con espera creciente.
 *
 * Al cliente solo se le escribe después de un pago confirmado por Mercado Pago: nadie puede
 * usar la tienda para enviar correos a una dirección ajena escribiéndola en un pedido sin pagar.
 */

export type OrderEvent = 'paid' | 'delivered' | 'refunded';

const MAX_ATTEMPTS = 5;
/** Espera tras cada intento fallido (minutos). */
const BACKOFF_MINUTES = [1, 5, 15, 60];
/** Mientras se envía, la fila queda reservada: otro proceso no la toma. */
const LEASE_MINUTES = 5;

function plannedFor(deps: ServiceDeps, event: OrderEvent) {
  const planned: { kind: NotificationKind; channel: NotificationChannel }[] = [];
  const email = Boolean(deps.mailer);
  if (event === 'paid') {
    if (deps.notifier) planned.push({ kind: 'order_paid_owner', channel: 'telegram' });
    if (email && deps.config.adminEmails.length) {
      planned.push({ kind: 'order_paid_owner', channel: 'email' });
    }
    if (email) planned.push({ kind: 'order_paid_customer', channel: 'email' });
  }
  if (event === 'delivered' && email) {
    planned.push({ kind: 'order_delivered_customer', channel: 'email' });
  }
  if (event === 'refunded' && email) {
    planned.push({ kind: 'order_refunded_customer', channel: 'email' });
  }
  return planned;
}

/** Encola los avisos del evento. Llamar dentro de la transacción que cambia el pedido. */
export async function enqueueOrderNotifications(
  deps: ServiceDeps,
  tx: Tx,
  orderId: string,
  event: OrderEvent,
): Promise<void> {
  const planned = plannedFor(deps, event);
  if (!planned.length) return;
  await tx
    .insert(notifications)
    .values(planned.map((p) => ({ ...p, orderId, nextAttemptAt: deps.now() })))
    .onConflictDoNothing();
}

// ── Contenido ────────────────────────────────────────────────────────────────

interface OrderSnapshot {
  reference: string;
  totalCop: number;
  playerUid: string;
  nickname: string | null;
  customerEmail: string;
  items: { name: string; quantity: number }[];
}

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function supportLines(deps: ServiceDeps): string[] {
  const { whatsapp, email } = deps.config.support;
  return [...(whatsapp ? [`WhatsApp: +${whatsapp}`] : []), ...(email ? [`Correo: ${email}`] : [])];
}

/** Párrafos en texto plano → mismo contenido en HTML (escapado) con el estilo de la tienda. */
function compose(
  deps: ServiceDeps,
  to: string[],
  subject: string,
  title: string,
  paragraphs: string[],
): MailMessage {
  const footer = [
    'TayGameStore nunca te pedirá la contraseña de tu juego ni códigos de verificación.',
    ...supportLines(deps),
  ];
  const text = [title, '', ...paragraphs.flatMap((p) => [p, '']), ...footer].join('\n');
  const block = (p: string) =>
    `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#1b1f3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e5f2">
<tr><td style="background:#0b1030;padding:18px 24px;font-size:18px;font-weight:bold;color:#ffffff">TayGame<span style="color:#a77bff">Store</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1b1f3a">${escapeHtml(title)}</h1>
${paragraphs.map(block).join('\n')}
</td></tr>
<tr><td style="padding:16px 24px;background:#f7f8fc;font-size:12px;line-height:1.5;color:#4a4f6e">${footer.map(escapeHtml).join('<br>')}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html, replyTo: deps.config.support.email };
}

function itemsText(order: OrderSnapshot): string {
  return order.items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
}

function playerText(order: OrderSnapshot): string {
  return order.nickname ? `${order.playerUid} (${order.nickname})` : order.playerUid;
}

export function renderEmail(
  deps: ServiceDeps,
  kind: NotificationKind,
  order: OrderSnapshot,
): MailMessage {
  const base = deps.config.publicBaseUrl ?? '';
  // Sin el nombre que escribió el cliente: es texto libre de un formulario y, si alguien paga
  // un pedido con el correo de otra persona, no puede usar este correo legítimo para colarle
  // un mensaje de engaño. El correo solo lleva datos que la tienda generó o verificó.
  const hello = 'Hola,';
  switch (kind) {
    case 'order_paid_owner':
      return compose(
        deps,
        [...deps.config.adminEmails],
        `Pedido pagado por entregar · ${order.reference}`,
        `Pedido pagado ${order.reference}`,
        [paidOrderText(order), 'Entra a tu panel para tomarlo y entregarlo.'],
      );
    case 'order_paid_customer':
      return compose(
        deps,
        [order.customerEmail],
        `Pago confirmado · Pedido ${order.reference}`,
        'Recibimos tu pago',
        [
          hello,
          `Mercado Pago confirmó tu pago de ${cop.format(order.totalCop)} para el pedido ${order.reference}.`,
          `Tu recarga:\n${itemsText(order)}\nID de jugador: ${playerText(order)}`,
          'Ya la estamos preparando. Te escribiremos de nuevo cuando esté hecha.',
          `Puedes ver el estado en ${base}/#seguimiento desde el navegador con el que compraste.`,
        ],
      );
    case 'order_delivered_customer':
      return compose(
        deps,
        [order.customerEmail],
        `Recarga completada · Pedido ${order.reference}`,
        'Tu recarga está hecha',
        [
          hello,
          `Entregamos tu pedido ${order.reference} en el ID de jugador ${playerText(order)}:\n${itemsText(order)}`,
          'Si todavía no ves los diamantes, cierra y vuelve a abrir el juego.',
          `¿Algo no cuadra? Responde a este correo o escríbenos con la referencia ${order.reference}.`,
        ],
      );
    case 'order_refunded_customer':
      return compose(
        deps,
        [order.customerEmail],
        `Reembolso registrado · Pedido ${order.reference}`,
        'Registramos tu reembolso',
        [
          hello,
          `Mercado Pago registró el reembolso de tu pago de ${cop.format(order.totalCop)} del pedido ${order.reference}.`,
          'El tiempo en que lo ves reflejado depende de tu medio de pago y de Mercado Pago.',
        ],
      );
  }
}

// ── Envío ────────────────────────────────────────────────────────────────────

async function loadSnapshot(deps: ServiceDeps, orderId: string): Promise<OrderSnapshot | null> {
  const [order] = await deps.db
    .select({
      reference: orders.publicRef,
      totalCop: orders.totalCop,
      playerUid: orders.playerUid,
      nickname: orders.verifiedNickname,
      customerEmail: orders.customerEmail,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await deps.db
    .select({ name: orderItems.name, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return { ...order, items };
}

async function sendOne(
  deps: ServiceDeps,
  row: { orderId: string; kind: NotificationKind; channel: NotificationChannel },
): Promise<void> {
  const order = await loadSnapshot(deps, row.orderId);
  if (!order) throw new Error('pedido no encontrado');
  if (row.channel === 'telegram') {
    if (!deps.notifier) throw new Error('Telegram no está configurado');
    await deps.notifier.orderPaid(order);
    return;
  }
  if (!deps.mailer) throw new Error('el correo no está configurado');
  const message = renderEmail(deps, row.kind, order);
  if (!message.to.length) throw new Error('sin destinatarios');
  await deps.mailer.send(message);
}

type ClaimedRow = {
  id: string;
  order_id: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  attempts: number;
};

/**
 * Envía los avisos pendientes y vencidos (de un pedido o de todos). Nunca lanza: un aviso que
 * falla queda para reintento y, tras el último intento, como FAILED con alerta en el panel.
 * Devuelve cuántos se enviaron.
 */
export async function deliverNotifications(
  deps: ServiceDeps,
  options: { orderId?: string; limit?: number } = {},
): Promise<number> {
  const now = deps.now();
  const lease = new Date(now.getTime() + LEASE_MINUTES * 60_000);
  const byOrder = options.orderId ? sql`and order_id = ${options.orderId}` : sql``;
  let claimed: ClaimedRow[];
  try {
    const result = await deps.db.execute<ClaimedRow>(sql`
      update notifications
         set attempts = attempts + 1, next_attempt_at = ${lease}
       where id in (
         select id from notifications
          where status = 'PENDING' and next_attempt_at <= ${now} ${byOrder}
          order by created_at
          limit ${options.limit ?? 20}
          for update skip locked)
      returning id, order_id, kind, channel, attempts`);
    claimed = result.rows;
  } catch (error) {
    deps.log.error({ err: error }, 'notifications: no se pudo reservar la cola');
    return 0;
  }

  const results = await Promise.allSettled(
    claimed.map((row) =>
      sendOne(deps, { orderId: row.order_id, kind: row.kind, channel: row.channel }),
    ),
  );
  let sent = 0;
  for (const [index, result] of results.entries()) {
    const row = claimed[index];
    if (!row) continue;
    try {
      if (result.status === 'fulfilled') {
        sent += 1;
        await deps.db
          .update(notifications)
          .set({ status: 'SENT', sentAt: deps.now(), lastError: null })
          .where(and(eq(notifications.id, row.id), eq(notifications.status, 'PENDING')));
        continue;
      }
      // Solo el mensaje propio del adaptador: nunca credenciales ni URLs con tokens.
      const reason = result.reason instanceof Error ? result.reason.message.slice(0, 300) : 'error';
      const final = row.attempts >= MAX_ATTEMPTS;
      const waitMinutes = BACKOFF_MINUTES[row.attempts - 1] ?? 60;
      await deps.db
        .update(notifications)
        .set({
          status: final ? 'FAILED' : 'PENDING',
          lastError: reason,
          nextAttemptAt: new Date(deps.now().getTime() + waitMinutes * 60_000),
        })
        .where(and(eq(notifications.id, row.id), eq(notifications.status, 'PENDING')));
      deps.log.warn(
        {
          notificationId: row.id,
          kind: row.kind,
          channel: row.channel,
          attempt: row.attempts,
          reason,
          ...(final ? { alert: 'notification_failed' } : {}),
        },
        final ? 'notification failed for good' : 'notification failed, will retry',
      );
    } catch (error) {
      deps.log.error({ err: error, notificationId: row.id }, 'notifications: estado no guardado');
    }
  }
  return sent;
}
