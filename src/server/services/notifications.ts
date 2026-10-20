import { and, desc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import {
  FREE_FIRE_SERVER_LABELS,
  fulfillments,
  notifications,
  nequiTransfers,
  orderItems,
  orders,
  payments,
  type NequiTransferStatus,
  type NotificationChannel,
  type NotificationKind,
  type OrderStatus,
  type VerificationStatus,
} from '../db/schema.js';
import { paidOrderText } from '../integrations/notify/owner.js';
import type { MailMessage } from '../integrations/notify/email.js';
import type { OrderEventName, OrderEventPayload } from '../integrations/notify/events.js';
import { SheetsError } from '../integrations/sheets/google-sheets.js';
import {
  orderStates,
  PAYMENT_STATE_LABELS,
  RECHARGE_STATE_LABELS,
  type PaymentState,
  type RechargeState,
} from '../domain/order-states.js';
import type { ServiceDeps } from './context.js';
import { deliveredPinCounts, deliveredPins } from './inventory.js';
import { nequiTransfersFor, type NequiTransferView } from './nequi-view.js';
import { receiptVerificationCode } from './receipts.js';

/**
 * Avisos de un pedido (cola `notifications`):
 * - pagado → al dueño y al cliente (correo); Telegram no se usa (decisión del dueño);
 * - entregado → al cliente; reembolsado → al cliente;
 * - y, si está configurado, cada uno de esos eventos a la automatización del dueño (n8n), más
 *   "pedido por verificar" (nuevo pedido esperando que el operador verifique ID y nickname).
 *   Ese evento solo va a la automatización del dueño, nunca al correo del cliente;
 * - y, si hay hoja de Google: pagado/entregado/reembolsado como filas nuevas de «Pedidos» (historial
 *   sin datos personales) y la fila única del pedido en «Entregas» (con ID, nickname, servidor y
 *   región del jugador), que se reescribe con el estado actual en cada cambio: tomado, en curso,
 *   entregado con éxito, fallido, en revisión o reembolsado.
 * Se encolan en la misma transacción que el cambio de estado, se envían justo después de
 * confirmarla y, si un envío falla, el scheduler lo reintenta con espera creciente.
 *
 * Al cliente solo se le escribe después de un pago confirmado por el proveedor de su pedido
 * (Mercado Pago, o el dueño al verificar una transferencia Nequi): nadie puede usar la tienda para
 * enviar correos a una dirección ajena escribiéndola en un pedido sin pagar. Además, si un cliente
 * avisa una transferencia Nequi, el dueño recibe un correo para verificarla en su app Nequi.
 */

export type OrderEvent = 'awaiting_verification' | 'paid' | 'delivered' | 'refunded';

type EventKind = Extract<NotificationKind, `${string}_event`>;
type EmailKind = Exclude<NotificationKind, EventKind | 'order_sheet_sync'>;

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
/**
 * Google respondió 429 (cuota de escrituras por minuto): la fila vuelve a la cola en 1 a 3 min,
 * repartidas para no chocar otra vez con la cuota, y sin gastar un intento.
 */
const RATE_LIMIT_WAIT_MS = 60_000;
const RATE_LIMIT_JITTER_MS = 120_000;
/**
 * Tope de una pasada para las filas de la hoja (van de a una): muy por debajo de la reserva de
 * LEASE_MINUTES, así otra pasada nunca toma una fila que todavía se está enviando. Lo que no
 * alcanza queda para la pasada siguiente, sin gastar un intento.
 */
const SHEET_PASS_BUDGET_MS = 40_000;

const isSheetChannel = (channel: NotificationChannel) =>
  channel === 'sheets' || channel === 'sheets_delivery' || channel === 'sheets_pending';
const isRateLimited = (reason: unknown) => reason instanceof SheetsError && reason.status === 429;

function plannedFor(deps: ServiceDeps, event: OrderEvent) {
  const planned: { kind: NotificationKind; channel: NotificationChannel }[] = [];
  const email = Boolean(deps.mailer);
  if (event === 'paid') {
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
  // Historial en la pestaña «Pedidos» de Google Sheets: solo pedidos pagados y sus cambios, sin
  // datos personales. La fila de «Entregas» va aparte (`enqueueSheetSync`).
  if (deps.sheets && event !== 'awaiting_verification') {
    planned.push({ kind: EVENT_KINDS[event], channel: 'sheets' });
  }
  return planned;
}

/**
 * Pide reescribir la fila del pedido en «Entregas» con su estado actual. Llamar dentro de la
 * transacción de cada cambio de estado de un pedido pagado (pago, entrega tomada, en curso,
 * entregada, fallida, revisión, reembolso).
 */
export async function enqueueSheetSync(deps: ServiceDeps, tx: Tx, orderId: string): Promise<void> {
  await enqueueSheetRow(deps, tx, orderId, 'sheets_delivery');
}

/**
 * Pide reescribir la fila del pedido Nequi en «Pagos pendientes» (lo que el cliente debe al dueño
 * y lo que avisó al transferir). Llamar dentro de la transacción de cada paso del pago Nequi:
 * elegir Nequi, «Ya transferí», confirmar, rechazar, devolver y vencer.
 */
export async function enqueuePendingPaymentSync(
  deps: ServiceDeps,
  tx: Tx,
  orderId: string,
): Promise<void> {
  await enqueueSheetRow(deps, tx, orderId, 'sheets_pending');
}

/**
 * Hay una sola fila de cola por pedido y pestaña: se vuelve a poner pendiente y, si justo se está
 * enviando, conserva la reserva para que nunca haya dos envíos a la vez (el que está en curso la
 * reenvía al terminar, ver `deliverNotifications`).
 */
async function enqueueSheetRow(
  deps: ServiceDeps,
  tx: Tx,
  orderId: string,
  channel: 'sheets_delivery' | 'sheets_pending',
): Promise<void> {
  if (!deps.sheets) return;
  const now = deps.now();
  await tx
    .insert(notifications)
    .values({ kind: 'order_sheet_sync', channel, orderId, nextAttemptAt: now })
    .onConflictDoUpdate({
      target: [notifications.orderId, notifications.kind, notifications.channel],
      set: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        sentAt: null,
        // Las expresiones leen la fila anterior. Pendiente con fecha futura = reservada (se está
        // enviando) o esperando un reintento: conserva esa fecha, aunque se reencole varias veces.
        nextAttemptAt: sql`case when ${notifications.status} = 'PENDING' and ${notifications.nextAttemptAt} > ${now} then ${notifications.nextAttemptAt} else ${now} end`,
      },
    });
}

/**
 * Aviso al dueño: una recarga directa falló, quedó sin confirmar o el proveedor no cubre el
 * pedido. Si ya hubo uno para este pedido (p. ej. tras un reintento), se vuelve a enviar.
 */
export async function enqueueTopupAlert(deps: ServiceDeps, tx: Tx, orderId: string): Promise<void> {
  deps.log.warn({ orderId, alert: 'topup_problem' }, 'recarga directa necesita revisión');
  await enqueueSheetSync(deps, tx, orderId);
  if (!deps.mailer || !deps.config.adminEmails.length) return;
  const now = deps.now();
  await tx
    .insert(notifications)
    .values({ kind: 'topup_problem_owner', channel: 'email', orderId, nextAttemptAt: now })
    .onConflictDoUpdate({
      target: [notifications.orderId, notifications.kind, notifications.channel],
      set: { status: 'PENDING', attempts: 0, lastError: null, sentAt: null, nextAttemptAt: now },
    });
}

/** Encola los avisos del evento. Llamar dentro de la transacción que cambia el pedido. */
export async function enqueueOrderNotifications(
  deps: ServiceDeps,
  tx: Tx,
  orderId: string,
  event: OrderEvent,
): Promise<void> {
  if (event !== 'awaiting_verification') await enqueueSheetSync(deps, tx, orderId);
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
  verificationStatus: VerificationStatus;
  /** Origen de la confirmación (`proveedor:…`, `cliente` o nota del operador): nunca se copia. */
  verificationNote: string | null;
  /** El dueño verificó el jugador desde el panel. */
  verifiedByOwner: boolean;
  customerEmail: string;
  receiptCode: string;
  items: { name: string; quantity: number; unitPriceCop: number; lineTotalCop: number }[];
  /** El pago que pagó el pedido (si ya existe) y su proveedor (Mercado Pago o Nequi). */
  payment: { provider: string; providerPaymentId: string; approvedAt: Date | null } | null;
  /** Comprobante verificable: número consecutivo y código (si el pedido ya está pagado). */
  receipt: { number: number; verificationCode: string } | null;
  /** PIN entregados (entrega automática): solo se cargan para el correo de entrega. */
  pins?: { name: string; code: string }[];
  /** Cantidad de PIN entregados (aviso al dueño). */
  pinCount?: number;
  /** La recarga directa (UniPin) se encarga del pedido (aviso al dueño). */
  topup?: boolean;
  /** Motivo de la recarga directa fallida (aviso al dueño). */
  topupProblem?: string | null;
  /** Transferencia Nequi que avisó el cliente (aviso al dueño para verificarla). */
  nequiReport?: { senderLast4: string | null; customerReference: string | null } | null;
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

const isNequi = (order: Pick<OrderSnapshot, 'payment'>) =>
  order.payment?.provider === 'nequi_manual';
/** Medio con el que se pagó, según el proveedor del pago (nunca se mezclan). */
const paymentLabel = (order: Pick<OrderSnapshot, 'payment'>) =>
  isNequi(order) ? 'Nequi (transferencia)' : 'Mercado Pago';
const operationLabel = (order: Pick<OrderSnapshot, 'payment'>) =>
  isNequi(order) ? 'Referencia de Nequi' : 'Operación de Mercado Pago';

function paymentReceipt(order: OrderSnapshot): Receipt {
  const player = [order.playerUid, order.nickname, order.region ?? order.server]
    .filter(Boolean)
    .join(' · ');
  return {
    rows: [
      ...(order.receipt
        ? [
            ['Comprobante N.º', String(order.receipt.number).padStart(6, '0')] as [string, string],
            ['Código de verificación', order.receipt.verificationCode] as [string, string],
          ]
        : [['Comprobante', order.receiptCode] as [string, string]]),
      ['Pedido', order.reference],
      ...(order.payment?.approvedAt
        ? [
            ['Fecha de pago', `${bogota.format(order.payment.approvedAt)} (hora de Colombia)`] as [
              string,
              string,
            ],
          ]
        : []),
      ['Medio', paymentLabel(order)],
      ...(order.payment
        ? [[operationLabel(order), order.payment.providerPaymentId] as [string, string]]
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
    note: 'Este comprobante confirma tu pago a TayGameStore. No reemplaza una factura electrónica. Guárdalo: con la referencia del pedido te atendemos en soporte. TayGameStore puede comprobar con el código de verificación que es auténtico y que nadie lo alteró.',
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
          : order.topup
            ? `Pedido pagado, recarga automática en curso · ${order.reference}`
            : `Pedido pagado por entregar · ${order.reference}`,
        `Pedido pagado ${order.reference}`,
        [
          paidOrderText(order),
          order.pinCount
            ? 'No tienes que hacer nada. Repón el inventario cuando el panel lo pida.'
            : order.topup
              ? 'No tienes que hacer nada: el cliente recibe la confirmación cuando UniPin la confirme.'
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
          isNequi(order)
            ? `Verificamos tu transferencia Nequi de ${cop.format(order.totalCop)} para el pedido ${order.reference}.`
            : `Mercado Pago confirmó tu pago de ${cop.format(order.totalCop)} para el pedido ${order.reference}.`,
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
        `¡Envío exitoso! · Pedido ${order.reference}`,
        '¡Envío exitoso!',
        [
          hello,
          `Entregamos tu pedido ${order.reference} en el ID de jugador ${playerText(order)}:\n${itemsText(order)}`,
          `Comprobante de pago: ${order.receiptCode}.`,
          'Si todavía no ves los diamantes, cierra y vuelve a abrir el juego.',
          `¿Algo no cuadra? Responde a este correo o escríbenos con la referencia ${order.reference}.`,
        ],
      );
    case 'topup_problem_owner':
      return compose(
        deps,
        [...deps.config.adminEmails],
        `Recarga por revisar · ${order.reference}`,
        `La recarga del pedido ${order.reference} necesita tu revisión`,
        [
          paidOrderText(order),
          order.topupProblem ??
            'La recarga directa no cubre este pedido (servidor o paquete fuera del catálogo de UniPin).',
          `El cliente ya pagó. En tu panel puedes «Reanudar la entrega» (reintenta solo las unidades que no se recargaron) o entregarla a mano. Si no se puede entregar, ${isNequi(order) ? 'devuélvele el dinero por Nequi y regístralo en el panel' : 'reembolsa en Mercado Pago'}.`,
          'Antes de reintentar una recarga «sin confirmar», revisa la transacción en tu panel de UniPin: así nunca se recarga dos veces.',
        ],
      );
    case 'nequi_reported_owner':
      return compose(
        deps,
        [...deps.config.adminEmails],
        `Transferencia Nequi por verificar · ${order.reference}`,
        `Verifica la transferencia Nequi del pedido ${order.reference}`,
        [
          `El cliente avisa que transfirió ${cop.format(order.totalCop)} a tu Nequi${order.nequiReport?.senderLast4 ? ` desde una cuenta terminada en ${order.nequiReport.senderLast4}` : ''}${order.nequiReport?.customerReference ? ` (referencia que vio: ${order.nequiReport.customerReference})` : ''}.`,
          `Pedido:\n${itemsText(order)}`,
          'Abre tu app Nequi y busca ese movimiento. El aviso del cliente NO es un pago: solo cuenta lo que veas en tu app.',
          'Si llegó el total exacto, confírmalo en el panel con la referencia del movimiento. Si no llegó, recházalo con el motivo; el pedido sigue esperando pago.',
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
          ...(isNequi(order)
            ? [
                `Te devolvimos por Nequi los ${cop.format(order.totalCop)} del pedido ${order.reference}.`,
                'Lo ves en los movimientos de tu app Nequi.',
              ]
            : [
                `Mercado Pago registró el reembolso de tu pago de ${cop.format(order.totalCop)} del pedido ${order.reference}.`,
                'El tiempo en que lo ves reflejado depende de tu medio de pago y de Mercado Pago.',
              ]),
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
      verificationStatus: orders.verificationStatus,
      verificationNote: orders.verificationNote,
      verifiedBy: orders.verifiedBy,
      customerEmail: orders.customerEmail,
      receiptCode: orders.receiptCode,
      receiptNumber: orders.receiptNumber,
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
    .select({
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      approvedAt: payments.approvedAt,
    })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.isOrderPayment, true)));
  const { playerServer, receiptNumber, verifiedBy, ...rest } = order;
  return {
    ...rest,
    verifiedByOwner: verifiedBy !== null,
    server: playerServer ? FREE_FIRE_SERVER_LABELS[playerServer] : null,
    items,
    payment: payment ?? null,
    receipt:
      receiptNumber !== null && payment
        ? {
            number: receiptNumber,
            verificationCode: receiptVerificationCode(deps.config.secrets.orderTokenKeys, {
              number: receiptNumber,
              reference: order.reference,
              totalCop: order.totalCop,
              paymentId: payment.providerPaymentId,
            }),
          }
        : null,
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

const SHEET_EVENT_LABELS: Record<EventKind, string> = {
  order_verification_event: 'Pedido por verificar',
  order_paid_event: 'Pago confirmado',
  order_delivered_event: 'Recarga entregada',
  order_refunded_event: 'Reembolso',
};

const bogotaTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Bogota',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Encabezados de la hoja (fila 1, la escribe el dueño una vez; ver docs/google-sheets.md). */
export const SHEET_COLUMNS = [
  'Fecha (Colombia)',
  'Referencia',
  'Evento',
  'Paquete',
  'Total',
  'Moneda',
  'Estado del pago',
  'Estado de la recarga',
  'Comprobante',
  'Id del registro',
] as const;

type SheetOrder = Pick<OrderSnapshot, 'reference' | 'totalCop' | 'items'> & {
  receipt: { number: number } | null;
};
type SheetStates = { payment: PaymentState; recharge: RechargeState };

/**
 * Texto libre en la hoja (nickname, región, evidencia, paquete): si empieza por = + - @ o un
 * salto, lleva un apóstrofo delante. En Google Sheets (RAW) ya es texto, pero si la hoja se
 * exporta a CSV y se abre en Excel se ejecutaría como fórmula (OWASP: inyección CSV).
 */
export const sheetText = (value: string) => (/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value);

const sheetItems = (order: Pick<OrderSnapshot, 'items'>) =>
  sheetText(order.items.map((item) => `${item.quantity}× ${item.name}`).join('; '));
const sheetReceipt = (order: SheetOrder) =>
  order.receipt ? String(order.receipt.number).padStart(6, '0') : '';

/**
 * Fila del registro auxiliar. Solo datos de la operación: nunca correo, nombre, UID, nickname
 * ni PIN (la hoja sale de la base y puede compartirse por error). El «Id del registro» permite
 * detectar una fila repetida si Google respondió tarde y se reintentó.
 */
export function sheetRow(
  row: { id: string; createdAt: Date },
  kind: EventKind,
  order: SheetOrder,
  states: SheetStates,
): (string | number)[] {
  return [
    bogotaTime.format(row.createdAt),
    order.reference,
    SHEET_EVENT_LABELS[kind],
    sheetItems(order),
    order.totalCop,
    'COP',
    PAYMENT_STATE_LABELS[states.payment],
    RECHARGE_STATE_LABELS[states.recharge],
    sheetReceipt(order),
    row.id,
  ];
}

/**
 * Encabezados de la pestaña «Pagos pendientes» (misma hoja; ver docs/google-sheets.md): una fila
 * por pedido Nequi, desde que el cliente elige Nequi hasta que el dueño confirma o rechaza el pago
 * o el pedido vence. La columna A (referencia) es la clave de la fila.
 */
export const PENDING_PAYMENT_COLUMNS = [
  'Referencia',
  'Estado del pago',
  'Total a recibir',
  'Paquete',
  'Pedido creado (Colombia)',
  'Vence (Colombia)',
  'Cliente avisó el pago (Colombia)',
  '4 últimos dígitos de la cuenta que pagó',
  'Referencia del comprobante (cliente)',
  'Confirmado (Colombia)',
  'Referencia Nequi confirmada',
  'Motivo del rechazo',
  'Actualizado (Colombia)',
] as const;

type PendingOrder = Pick<OrderSnapshot, 'reference' | 'status' | 'totalCop' | 'items'> & {
  expiresAt: Date | null;
  createdAt: Date;
};
type PendingTransfer = Pick<
  NequiTransferView,
  | 'status'
  | 'senderLast4'
  | 'customerReference'
  | 'reportedAt'
  | 'nequiReference'
  | 'reviewedAt'
  | 'rejectionReason'
>;

/**
 * Estado del pago Nequi en una frase (lo primero que mira el dueño). Sale del pedido y de la última
 * transferencia: el aviso del cliente nunca cuenta como pago; solo la confirmación del dueño.
 */
export function pendingPaymentStatus(
  order: Pick<PendingOrder, 'status'>,
  latest: { status: NequiTransferStatus } | undefined,
): string {
  if (order.status === 'REFUNDED') return '↩️ Devuelto al cliente';
  if (latest?.status === 'CONFIRMED') return '✅ Pago confirmado';
  if (order.status === 'AWAITING_PAYMENT') {
    if (latest?.status === 'REPORTED')
      return '💰 El cliente avisó que pagó: verifícalo en tu Nequi';
    if (latest?.status === 'REJECTED') return '✖️ Aviso rechazado: esperando otra transferencia';
    return '⏳ Esperando la transferencia';
  }
  if (order.status === 'EXPIRED') {
    return latest?.status === 'REPORTED'
      ? '⚠️ Venció con un aviso sin verificar: revisa tu Nequi'
      : '⌛ Venció sin pago';
  }
  return '✖️ Cerrado sin pago';
}

/**
 * Fila de «Pagos pendientes»: lo que el cliente debe (total y paquete), hasta cuándo, y lo que
 * avisó al transferir (4 últimos dígitos de su cuenta y referencia de su comprobante), para
 * buscarlo en la app Nequi. Nunca correo, nombre, celular completo ni datos del jugador.
 */
export function pendingPaymentRow(
  order: PendingOrder,
  latest: PendingTransfer | undefined,
  updatedAt: Date,
): (string | number)[] {
  const confirmed = latest?.status === 'CONFIRMED';
  return [
    order.reference,
    pendingPaymentStatus(order, latest),
    order.totalCop,
    sheetItems(order),
    bogotaTime.format(order.createdAt),
    order.status === 'AWAITING_PAYMENT' && order.expiresAt
      ? bogotaTime.format(order.expiresAt)
      : '',
    latest?.reportedAt ? bogotaTime.format(latest.reportedAt) : '',
    latest?.senderLast4 ?? '',
    sheetText(latest?.customerReference ?? ''),
    confirmed && latest.reviewedAt ? bogotaTime.format(latest.reviewedAt) : '',
    confirmed ? sheetText(latest.nequiReference ?? '') : '',
    latest?.status === 'REJECTED' ? sheetText(latest.rejectionReason ?? '') : '',
    bogotaTime.format(updatedAt),
  ];
}

/**
 * Encabezados de la pestaña «Entregas» (misma hoja; ver docs/google-sheets.md): una fila por
 * pedido. La columna A (referencia) es la clave con la que la tienda encuentra la fila.
 */
export const DELIVERY_COLUMNS = [
  'Referencia',
  'Estado',
  'Pagado (Colombia)',
  'Entregado (Colombia)',
  'Minutos hasta la entrega',
  'ID del jugador',
  'Nickname confirmado',
  'Confirmación del jugador',
  'Servidor elegido',
  'Región detectada',
  'Paquete',
  'Total',
  'Estado del pago',
  'Estado de la recarga',
  'Comprobante',
  'Código de verificación',
  'Operación de pago',
  'Evidencia o motivo',
  'Actualizado (Colombia)',
] as const;

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  PENDING: 'Pendiente de verificar',
  VERIFIED: 'Verificado por el dueño (falta que el cliente acepte)',
  NOT_FOUND: 'ID no encontrado',
  AMBIGUOUS: 'Verificación dudosa',
  BLOCKED_ACCOUNT: 'Cuenta bloqueada',
  CONFIRMED: 'Confirmado',
  DECLINED_BY_CUSTOMER: 'Rechazado por el cliente',
};

/** Cómo se confirmó que el ID es del cliente. La nota libre del operador nunca se copia. */
export function playerConfirmationLabel(
  order: Pick<OrderSnapshot, 'verificationStatus' | 'verificationNote' | 'verifiedByOwner'>,
): string {
  if (order.verificationStatus !== 'CONFIRMED')
    return VERIFICATION_LABELS[order.verificationStatus];
  if (order.verifiedByOwner) return 'Verificado por el dueño y aceptado por el cliente';
  if (order.verificationNote?.startsWith('proveedor:')) return 'Confirmado con la búsqueda de ID';
  return 'Confirmado por el cliente (escribió su ID dos veces)';
}

/**
 * Estado de la fila de «Entregas» en una palabra (lo que el dueño mira primero). Sale de los
 * estados derivados del pedido: nunca de lo que diga la hoja.
 */
export function deliveryStatusLabel(states: SheetStates): string {
  if (states.payment === 'REFUNDED') return '↩️ Reembolsado';
  if (states.payment === 'IN_REVIEW' || states.recharge === 'NEEDS_REVIEW')
    return '⚠️ Requiere revisión';
  if (states.recharge === 'COMPLETED') return '✅ Entregado con éxito';
  if (states.recharge === 'CANCELLED') return '✖️ Cancelado';
  if (states.recharge === 'IN_PROGRESS') return '🔄 En proceso';
  if (states.payment === 'CONFIRMED') return '⏳ Por entregar';
  return `Pago ${PAYMENT_STATE_LABELS[states.payment].toLowerCase()}`;
}

/** Datos de la entrega (tabla `fulfillments`) que van en la fila. */
export interface DeliveryFacts {
  deliveredAt: Date | null;
  /** Evidencia que escribió quien entregó (o la de la entrega automática). */
  evidence: string | null;
  failureReason: string | null;
}

type DeliveryOrder = Pick<
  OrderSnapshot,
  | 'reference'
  | 'totalCop'
  | 'items'
  | 'receipt'
  | 'payment'
  | 'playerUid'
  | 'nickname'
  | 'region'
  | 'server'
  | 'verificationStatus'
  | 'verificationNote'
  | 'verifiedByOwner'
>;

/**
 * Fila de «Entregas»: el estado actual del pedido, con lo que hace falta para recargar (ID,
 * nickname, cómo se confirmó, servidor y región) y sus referencias (comprobante, código de
 * verificación, operación de pago con su medio, evidencia). Nunca correo, nombre ni PIN. Con
 * `valueInputOption=RAW` el ID queda como texto y nada se toma como fórmula.
 */
export function deliveryRow(
  order: DeliveryOrder,
  states: SheetStates,
  delivery: DeliveryFacts | undefined,
  updatedAt: Date,
): (string | number)[] {
  const paidAt = order.payment?.approvedAt ?? null;
  const done = states.recharge === 'COMPLETED';
  const deliveredAt = done ? (delivery?.deliveredAt ?? null) : null;
  const minutes =
    paidAt && deliveredAt
      ? Math.max(0, Math.round((deliveredAt.getTime() - paidAt.getTime()) / 60_000))
      : '';
  const note = done
    ? (delivery?.evidence ?? '')
    : states.recharge === 'NEEDS_REVIEW'
      ? (delivery?.failureReason ?? '')
      : '';
  return [
    order.reference,
    deliveryStatusLabel(states),
    paidAt ? bogotaTime.format(paidAt) : '',
    deliveredAt ? bogotaTime.format(deliveredAt) : '',
    minutes,
    order.playerUid,
    sheetText(order.nickname ?? ''),
    playerConfirmationLabel(order),
    order.server ?? '',
    sheetText(order.region ?? ''),
    sheetItems(order),
    order.totalCop,
    PAYMENT_STATE_LABELS[states.payment],
    RECHARGE_STATE_LABELS[states.recharge],
    sheetReceipt(order),
    order.receipt?.verificationCode ?? '',
    order.payment ? `${paymentLabel(order)} · ${order.payment.providerPaymentId}` : '',
    sheetText(note),
    bogotaTime.format(updatedAt),
  ];
}

async function currentStates(deps: ServiceDeps, orderId: string, status: OrderStatus) {
  const [paymentRows, [fulfillment]] = await Promise.all([
    deps.db
      .select({
        status: payments.status,
        isOrderPayment: payments.isOrderPayment,
        providerStatusDetail: payments.providerStatusDetail,
      })
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.updatedAt)),
    deps.db
      .select({ status: fulfillments.status })
      .from(fulfillments)
      .where(eq(fulfillments.orderId, orderId)),
  ]);
  return orderStates({ status, payments: paymentRows, fulfillment: fulfillment?.status });
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
  if (row.channel === 'sheets_pending') {
    if (!deps.sheets) throw new Error('Google Sheets no está configurado');
    const [meta] = await deps.db
      .select({ paymentMethod: orders.paymentMethod, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.id, row.orderId));
    // Solo pedidos Nequi: a los de Mercado Pago los confirma Mercado Pago, no el dueño.
    if (meta?.paymentMethod !== 'nequi_manual') return;
    const latest = (await nequiTransfersFor(deps.db, [row.orderId])).get(row.orderId)?.[0];
    await deps.sheets.upsertRow(
      'pending',
      pendingPaymentRow({ ...order, createdAt: meta.createdAt }, latest, deps.now()),
    );
    return;
  }
  if (row.channel === 'sheets_delivery') {
    if (!deps.sheets) throw new Error('Google Sheets no está configurado');
    // Solo pedidos que llegaron a pagados (tienen comprobante): los demás no van a «Entregas».
    if (!order.receipt) return;
    const [states, [delivery]] = await Promise.all([
      currentStates(deps, row.orderId, order.status as OrderStatus),
      deps.db
        .select({
          deliveredAt: fulfillments.deliveredAt,
          evidence: fulfillments.evidence,
          failureReason: fulfillments.failureReason,
        })
        .from(fulfillments)
        .where(eq(fulfillments.orderId, row.orderId)),
    ]);
    await deps.sheets.upsertRow('deliveries', deliveryRow(order, states, delivery, deps.now()));
    return;
  }
  if (isEventKind(row.kind) && row.channel === 'sheets') {
    if (!deps.sheets) throw new Error('Google Sheets no está configurado');
    const states = await currentStates(deps, row.orderId, order.status as OrderStatus);
    await deps.sheets.appendRow('orders', sheetRow(row, row.kind, order, states));
    return;
  }
  if (row.kind === 'order_sheet_sync') throw new Error('canal inválido para la fila de entregas');
  if (isEventKind(row.kind)) {
    if (row.channel !== 'webhook') throw new Error('canal inválido para un evento');
    if (!deps.events) throw new Error('el webhook de eventos no está configurado');
    await deps.events.send(eventPayload(row, row.kind, order));
    return;
  }
  if (row.kind === 'order_delivered_customer') order.pins = await deliveredPins(deps, row.orderId);
  if (row.kind === 'topup_problem_owner') {
    const [fulfillment] = await deps.db
      .select({ failureReason: fulfillments.failureReason })
      .from(fulfillments)
      .where(eq(fulfillments.orderId, row.orderId));
    order.topupProblem = fulfillment?.failureReason ?? null;
  }
  if (row.kind === 'nequi_reported_owner') {
    const [report] = await deps.db
      .select({
        senderLast4: nequiTransfers.senderLast4,
        customerReference: nequiTransfers.customerReference,
      })
      .from(nequiTransfers)
      .where(and(eq(nequiTransfers.orderId, row.orderId), eq(nequiTransfers.status, 'REPORTED')));
    // Ya se revisó (confirmada o rechazada): no hay nada que verificar.
    if (!report) return;
    order.nequiReport = report;
  }
  if (row.kind === 'order_paid_owner') {
    order.pinCount = (await deliveredPinCounts(deps.db, [row.orderId])).get(row.orderId) ?? 0;
    const [fulfillment] = await deps.db
      .select({ mode: fulfillments.mode })
      .from(fulfillments)
      .where(eq(fulfillments.orderId, row.orderId));
    order.topup = fulfillment?.mode === 'provider';
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
 * Envía los avisos de un pedido justo después de confirmar su transacción, sin que la petición
 * espere de más a un correo o a Google lentos: espera como mucho `notifyInlineWaitMs` y el resto
 * sigue en segundo plano. Nunca lanza; lo que no salga lo reenvía la tarea programada.
 */
export async function deliverSoon(deps: ServiceDeps, orderId: string): Promise<void> {
  const task = deliverNotifications(deps, { orderId }).catch((error: unknown) => {
    deps.log.error({ err: error, orderId }, 'notifications: envío inmediato falló');
  });
  deps.background?.(task);
  const budget = deps.config.notifyInlineWaitMs;
  if (budget <= 0) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    task,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budget);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Envía los avisos pendientes y vencidos (de un pedido o de todos). Nunca lanza: un aviso que
 * falla queda para reintento y, tras el último intento, como FAILED con alerta en el panel.
 * Devuelve cuántos se enviaron.
 */
export async function deliverNotifications(
  deps: ServiceDeps,
  options: { orderId?: string; limit?: number } = {},
): Promise<number> {
  const { sent, rearmed } = await deliverPass(deps, options);
  // Una fila que se volvió a encolar mientras se enviaba (p. ej. la de «Entregas» tras otro cambio
  // de estado) se reenvía enseguida con el estado nuevo. Una sola pasada extra: nunca un bucle.
  return rearmed ? sent + (await deliverPass(deps, options)).sent : sent;
}

async function deliverPass(
  deps: ServiceDeps,
  options: { orderId?: string; limit?: number },
): Promise<{ sent: number; rearmed: boolean }> {
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
    return { sent: 0, rearmed: false };
  }

  const send = (row: ClaimedRow) =>
    sendOne(deps, {
      id: row.id,
      orderId: row.order_id,
      kind: row.kind,
      channel: row.channel,
      createdAt: new Date(row.created_at),
    });
  // Correo y webhook, en paralelo. La hoja, de a una fila y en orden (cuota de Google por minuto
  // y orden de los eventos en «Pedidos»); si Google pide esperar, el resto de filas de la hoja de
  // esta pasada se aplaza sin llamarlo.
  const others = Promise.allSettled(claimed.filter((r) => !isSheetChannel(r.channel)).map(send));
  const outcome = new Map<string, PromiseSettledResult<void> | 'rate_limited' | 'later'>();
  let throttled = false;
  const sheetsStarted = Date.now();
  for (const row of claimed.filter((r) => isSheetChannel(r.channel))) {
    if (throttled) {
      outcome.set(row.id, 'rate_limited');
      continue;
    }
    if (Date.now() - sheetsStarted > SHEET_PASS_BUDGET_MS) {
      outcome.set(row.id, 'later');
      continue;
    }
    const [result] = await Promise.allSettled([send(row)]);
    throttled = result?.status === 'rejected' && isRateLimited(result.reason);
    outcome.set(row.id, throttled || !result ? 'rate_limited' : result);
  }
  const parallel = claimed.filter((r) => !isSheetChannel(r.channel));
  for (const [index, result] of (await others).entries()) {
    const row = parallel[index];
    if (row) outcome.set(row.id, result);
  }
  if (throttled) {
    deps.log.warn(
      { alert: 'sheets_rate_limited' },
      'Google Sheets pidió esperar (cuota por minuto): filas aplazadas',
    );
  }
  let sent = 0;
  let rearmed = false;
  // Solo si nadie volvió a encolar la fila mientras se enviaba (eso reinicia `attempts`); si lo
  // hicieron, queda pendiente y vencida para reenviarla con el estado nuevo.
  const stillClaimed = (row: ClaimedRow) =>
    and(
      eq(notifications.id, row.id),
      eq(notifications.status, 'PENDING'),
      eq(notifications.attempts, row.attempts),
    );
  const releaseIfRearmed = async (row: ClaimedRow, saved: { id: string }[]) => {
    if (saved.length) return;
    const due = await deps.db
      .update(notifications)
      .set({ nextAttemptAt: deps.now() })
      .where(and(eq(notifications.id, row.id), eq(notifications.status, 'PENDING')))
      .returning({ id: notifications.id });
    if (due.length) rearmed = true;
  };
  for (const row of claimed) {
    const result = outcome.get(row.id);
    if (!result) continue;
    try {
      if (result === 'rate_limited' || result === 'later') {
        // No cuenta como intento: la cuota de Google se renueva cada minuto, y una fila que no
        // alcanzó a salir en esta pasada sale en la siguiente.
        const wait =
          result === 'later'
            ? 0
            : RATE_LIMIT_WAIT_MS + Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
        const saved = await deps.db
          .update(notifications)
          .set({
            attempts: row.attempts - 1,
            ...(result === 'rate_limited'
              ? { lastError: 'Google Sheets pidió esperar (cuota por minuto)' }
              : {}),
            nextAttemptAt: new Date(deps.now().getTime() + wait),
          })
          .where(stillClaimed(row))
          .returning({ id: notifications.id });
        await releaseIfRearmed(row, saved);
        continue;
      }
      if (result.status === 'fulfilled') {
        sent += 1;
        const saved = await deps.db
          .update(notifications)
          .set({ status: 'SENT', sentAt: deps.now(), lastError: null })
          .where(stillClaimed(row))
          .returning({ id: notifications.id });
        await releaseIfRearmed(row, saved);
        continue;
      }
      // Solo el mensaje propio del adaptador: nunca credenciales ni URLs con tokens.
      const reason = result.reason instanceof Error ? result.reason.message.slice(0, 300) : 'error';
      const final = row.attempts >= MAX_ATTEMPTS;
      const waitMinutes = BACKOFF_MINUTES[row.attempts - 1] ?? 60;
      const saved = await deps.db
        .update(notifications)
        .set({
          status: final ? 'FAILED' : 'PENDING',
          lastError: reason,
          nextAttemptAt: new Date(deps.now().getTime() + waitMinutes * 60_000),
        })
        .where(stillClaimed(row))
        .returning({ id: notifications.id });
      await releaseIfRearmed(row, saved);
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
  return { sent, rearmed };
}
