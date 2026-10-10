import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import {
  FREE_FIRE_SERVER_LABELS,
  notifications,
  orderItems,
  orders,
  payments,
  type NotificationChannel,
  type NotificationKind,
} from '../db/schema.js';
import { paidOrderText } from '../integrations/notify/owner.js';
import type { MailMessage } from '../integrations/notify/email.js';
import type { OrderEventName, OrderEventPayload } from '../integrations/notify/events.js';
import type { ServiceDeps } from './context.js';
import { deliveredPinCounts, deliveredPins } from './inventory.js';

/**
 * Avisos de un pedido (cola `notifications`):
 * - pagado → al dueño (Telegram y/o correo) y al cliente (correo);
 * - entregado → al cliente; reembolsado → al cliente;
 * - y, si está configurado, cada uno de esos eventos a la automatización del dueño (n8n), más
 *   "pedido por verificar" (nuevo pedido esperando que el operador verifique ID y nickname).
 *   Ese evento solo va a la automatización del dueño, nunca al correo del cliente.
 * Se encolan en la misma transacción que el cambio de estado, se envían justo después de
 * confirmarla y, si un envío falla, el scheduler lo reintenta con espera creciente.
 *
 * Al cliente solo se le escribe después de un pago confirmado por Mercado Pago: nadie puede
 * usar la tienda para enviar correos a una dirección ajena escribiéndola en un pedido sin pagar.
 */

export type OrderEvent = 'awaiting_verification' | 'paid' | 'delivered' | 'refunded';

type EventKind = Extract<NotificationKind, `${string}_event`>;
type EmailKind = Exclude<NotificationKind, EventKind>;

const EVENT_KINDS: Record<OrderEvent, EventKind> = {
  awaiting_verification: 'order_verification_event',
  paid: 'order_paid_event',
  delivered: 'order_delivered_event',
  refunded: 'order_refunded_event',
};
const EVENT_NAMES: Record<EventKind, OrderEventName> = {
  order_verification_event: 'order.awaiting_verification',
  order_paid_event: 'order.paid',
  order_delivered_event: 'order.delivered',
  order_refunded_event: 'order.refunded',
};
const isEventKind = (kind: NotificationKind): kind is EventKind => kind in EVENT_NAMES;

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
  if (deps.events) planned.push({ kind: EVENT_KINDS[event], channel: 'webhook' });
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
  status: string;
  expiresAt: Date | null;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  playerUid: string;
  nickname: string | null;
  region: string | null;
  /** Servidor de Free Fire declarado por el cliente (nombre legible). */
  server: string | null;
  customerEmail: string;
  receiptCode: string;
  items: { name: string; quantity: number; unitPriceCop: number; lineTotalCop: number }[];
  /** El pago de Mercado Pago que pagó el pedido (si ya existe). */
  payment: { providerPaymentId: string; approvedAt: Date | null } | null;
  /** PIN entregados (entrega automática): solo se cargan para el correo de entrega. */
  pins?: { name: string; code: string }[];
  /** Cantidad de PIN entregados (aviso al dueño). */
  pinCount?: number;
}

/** Comprobante: datos que la tienda generó o que confirmó Mercado Pago (nada de texto libre). */
interface Receipt {
  rows: [label: string, value: string][];
  lines: { label: string; detail: string; amount: string }[];
  totals: [label: string, value: string][];
  note: string;
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
  paragraphs: (string | Receipt)[],
): MailMessage {
  const footer = [
    'TayGameStore nunca te pedirá la contraseña de tu juego ni códigos de verificación.',
    ...supportLines(deps),
  ];
  const text = [
    title,
    '',
    ...paragraphs.flatMap((p) => [typeof p === 'string' ? p : receiptText(p), '']),
    ...footer,
  ].join('\n');
  const block = (p: string | Receipt) =>
    typeof p === 'string'
      ? `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
      : receiptHtml(p);
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

function receiptText(r: Receipt): string {
  return [
    'COMPROBANTE DE PAGO',
    ...r.rows.map(([label, value]) => `${label}: ${value}`),
    '',
    ...r.lines.map((l) => `${l.label} (${l.detail}) … ${l.amount}`),
    '',
    ...r.totals.map(([label, value]) => `${label}: ${value}`),
    '',
    r.note,
  ].join('\n');
}

function receiptHtml(r: Receipt): string {
  const cell = 'padding:6px 0;border-bottom:1px solid #eceef7;vertical-align:top';
  const rows = r.rows
    .map(
      ([label, value]) =>
        `<tr><td style="${cell};color:#4a4f6e">${escapeHtml(label)}</td><td align="right" style="${cell};font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const lines = r.lines
    .map(
      (l) =>
        `<tr><td style="${cell}">${escapeHtml(l.label)}<br><span style="font-size:12px;color:#4a4f6e">${escapeHtml(l.detail)}</span></td><td align="right" style="${cell}">${escapeHtml(l.amount)}</td></tr>`,
    )
    .join('');
  const totals = r.totals
    .map(
      ([label, value], i, all) =>
        `<tr><td style="padding:6px 0;${i === all.length - 1 ? 'font-size:16px;font-weight:bold' : 'color:#4a4f6e'}">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;${i === all.length - 1 ? 'font-size:16px;font-weight:bold;color:#5b2fd6' : ''}">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e3e5f2;border-radius:12px;padding:14px 16px;font-size:14px">
<tr><td colspan="2" style="padding:0 0 8px;font-size:12px;letter-spacing:1px;font-weight:bold;color:#5b2fd6">COMPROBANTE DE PAGO</td></tr>
${rows}${lines}${totals}
<tr><td colspan="2" style="padding:10px 0 0;font-size:12px;line-height:1.5;color:#4a4f6e">${escapeHtml(r.note)}</td></tr>
</table>`;
}

const bogota = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

function paymentReceipt(order: OrderSnapshot): Receipt {
  const player = [order.playerUid, order.nickname, order.region ?? order.server]
    .filter(Boolean)
    .join(' · ');
  return {
    rows: [
      ['Comprobante', order.receiptCode],
      ['Pedido', order.reference],
      ...(order.payment?.approvedAt
        ? [
            ['Fecha de pago', `${bogota.format(order.payment.approvedAt)} (hora de Colombia)`] as [
              string,
              string,
            ],
          ]
        : []),
      ['Medio', 'Mercado Pago'],
      ...(order.payment
        ? [['Operación de Mercado Pago', order.payment.providerPaymentId] as [string, string]]
        : []),
      ['Jugador', player],
    ],
    lines: order.items.map((item) => ({
      label: `${item.quantity} × ${item.name}`,
      detail: `${cop.format(item.unitPriceCop)} c/u`,
      amount: cop.format(item.lineTotalCop),
    })),
    totals: [
      ['Subtotal', cop.format(order.subtotalCop)],
      ...(order.discountCop > 0
        ? [['Descuento', `− ${cop.format(order.discountCop)}`] as [string, string]]
        : []),
      ['Total pagado', cop.format(order.totalCop)],
    ],
    note: 'Este comprobante confirma tu pago a TayGameStore. No reemplaza una factura electrónica. Guárdalo: con la referencia del pedido te atendemos en soporte.',
  };
}

function itemsText(order: OrderSnapshot): string {
  return order.items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
}

function playerText(order: OrderSnapshot): string {
  return order.nickname ? `${order.playerUid} (${order.nickname})` : order.playerUid;
}

export function renderEmail(deps: ServiceDeps, kind: EmailKind, order: OrderSnapshot): MailMessage {
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
        order.pinCount
          ? `Pedido pagado y entregado con PIN · ${order.reference}`
          : `Pedido pagado por entregar · ${order.reference}`,
        `Pedido pagado ${order.reference}`,
        [
          paidOrderText(order),
          order.pinCount
            ? 'No tienes que hacer nada. Repón el inventario cuando el panel lo pida.'
            : 'Entra a tu panel para tomarlo y entregarlo.',
        ],
      );
    case 'order_paid_customer':
      return compose(
        deps,
        [order.customerEmail],
        `Comprobante de pago · Pedido ${order.reference}`,
        'Recibimos tu pago',
        [
          hello,
          `Mercado Pago confirmó tu pago de ${cop.format(order.totalCop)} para el pedido ${order.reference}.`,
          paymentReceipt(order),
          `Tu recarga va al ID de jugador ${playerText(order)}. Ya la estamos preparando y te escribiremos de nuevo cuando esté hecha.`,
          `Puedes ver el estado en ${base}/#seguimiento desde el navegador con el que compraste.`,
        ],
      );
    case 'order_delivered_customer':
      if (order.pins?.length) {
        return compose(
          deps,
          [order.customerEmail],
          `Tu PIN de diamantes · Pedido ${order.reference}`,
          'Tu PIN de diamantes está listo',
          [
            hello,
            `Estos son los PIN de tu pedido ${order.reference}:\n${order.pins.map((p) => `• ${p.name}: ${p.code}`).join('\n')}`,
            `Cómo canjearlos (sitio oficial de Garena):\n1. Entra a https://www.pagostore.com y elige Free Fire.\n2. Ingresa con tu ID de jugador ${order.playerUid}.\n3. Elige «Tarjetas de Regalo y Pines Digitales» y pega el PIN. Repite con cada PIN.`,
            'Cada PIN se puede canjear una sola vez. No lo compartas con nadie.',
            `Comprobante de pago: ${order.receiptCode}. También los ves en ${base}/#seguimiento con «Ver mi PIN».`,
            `¿Algo no cuadra? Responde a este correo o escríbenos con la referencia ${order.reference}.`,
          ],
        );
      }
      return compose(
        deps,
        [order.customerEmail],
        `Recarga completada · Pedido ${order.reference}`,
        'Tu recarga está hecha',
        [
          hello,
          `Entregamos tu pedido ${order.reference} en el ID de jugador ${playerText(order)}:\n${itemsText(order)}`,
          `Comprobante de pago: ${order.receiptCode}.`,
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
      status: orders.status,
      expiresAt: orders.expiresAt,
      subtotalCop: orders.subtotalCop,
      discountCop: orders.discountCop,
      totalCop: orders.totalCop,
      playerUid: orders.playerUid,
      nickname: orders.verifiedNickname,
      region: orders.verifiedRegion,
      playerServer: orders.playerServer,
      customerEmail: orders.customerEmail,
      receiptCode: orders.receiptCode,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return null;
  const items = await deps.db
    .select({
      name: orderItems.name,
      quantity: orderItems.quantity,
      unitPriceCop: orderItems.unitPriceCop,
      lineTotalCop: orderItems.lineTotalCop,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const [payment] = await deps.db
    .select({ providerPaymentId: payments.providerPaymentId, approvedAt: payments.approvedAt })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.isOrderPayment, true)));
  const { playerServer, ...rest } = order;
  return {
    ...rest,
    server: playerServer ? FREE_FIRE_SERVER_LABELS[playerServer] : null,
    items,
    payment: payment ?? null,
  };
}

/** Solo datos de la operación: ni correo ni nombre del cliente. */
function eventPayload(
  row: { id: string; createdAt: Date },
  kind: EventKind,
  order: OrderSnapshot,
): OrderEventPayload {
  return {
    id: row.id,
    event: EVENT_NAMES[kind],
    occurredAt: row.createdAt.toISOString(),
    order: {
      reference: order.reference,
      status: order.status,
      totalCop: order.totalCop,
      currency: 'COP',
      expiresAt: order.expiresAt?.toISOString() ?? null,
      playerUid: order.playerUid,
      nickname: order.nickname,
      items: order.items.map(({ name, quantity }) => ({ name, quantity })),
    },
  };
}

async function sendOne(
  deps: ServiceDeps,
  row: {
    id: string;
    orderId: string;
    kind: NotificationKind;
    channel: NotificationChannel;
    createdAt: Date;
  },
): Promise<void> {
  const order = await loadSnapshot(deps, row.orderId);
  if (!order) throw new Error('pedido no encontrado');
  if (isEventKind(row.kind)) {
    if (row.channel !== 'webhook') throw new Error('canal inválido para un evento');
    if (!deps.events) throw new Error('el webhook de eventos no está configurado');
    await deps.events.send(eventPayload(row, row.kind, order));
    return;
  }
  if (row.kind === 'order_delivered_customer') order.pins = await deliveredPins(deps, row.orderId);
  if (row.kind === 'order_paid_owner' || row.channel === 'telegram') {
    order.pinCount = (await deliveredPinCounts(deps.db, [row.orderId])).get(row.orderId) ?? 0;
  }
  if (row.channel === 'telegram') {
    if (!deps.notifier) throw new Error('Telegram no está configurado');
    await deps.notifier.orderPaid(order);
    return;
  }
  if (row.channel !== 'email') throw new Error('canal inválido para un correo');
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
  created_at: Date | string;
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
      returning id, order_id, kind, channel, attempts, created_at`);
    claimed = result.rows;
  } catch (error) {
    deps.log.error({ err: error }, 'notifications: no se pudo reservar la cola');
    return 0;
  }

  const results = await Promise.allSettled(
    claimed.map((row) =>
      sendOne(deps, {
        id: row.id,
        orderId: row.order_id,
        kind: row.kind,
        channel: row.channel,
        createdAt: new Date(row.created_at),
      }),
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
