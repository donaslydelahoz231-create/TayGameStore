/**
 * Texto del aviso al dueño cuando Mercado Pago confirma un pago: es la señal para entregar los
 * diamantes. Lo envía el correo (SMTP); sin correo configurado, solo avisa el panel abierto.
 * La entrega sigue siendo manual (FULFILLMENT_MODE=manual); este aviso solo acorta la espera.
 * Telegram no se usa por decisión del dueño (2026-10-18).
 */

export interface PaidOrderNotice {
  reference: string;
  totalCop: number;
  playerUid: string;
  nickname: string | null;
  /** Servidor de Free Fire declarado por el cliente, ya con su nombre legible. */
  server?: string | null;
  items: readonly { name: string; quantity: number }[];
  /** PIN del inventario ya entregados automáticamente (0: hay que entregarlo a mano). */
  pinCount?: number;
  /** true si la recarga directa (UniPin) se encarga del pedido. */
  topup?: boolean;
}

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Texto plano: un nombre de jugador nunca se interpreta como formato. */
export function paidOrderText(notice: PaidOrderNotice): string {
  const items = notice.items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
  const player = notice.nickname ? `${notice.playerUid} (${notice.nickname})` : notice.playerUid;
  return [
    `Pedido pagado ${notice.reference}`,
    `Total: ${cop.format(notice.totalCop)}`,
    `ID de jugador: ${player}`,
    ...(notice.server ? [`Servidor: ${notice.server}`] : []),
    items,
    notice.pinCount
      ? `Mercado Pago confirmó el pago y se entregó automáticamente con ${notice.pinCount} PIN de tu inventario.`
      : notice.topup
        ? 'Mercado Pago confirmó el pago y la recarga directa (UniPin) va en camino al ID. Solo te escribo otra vez si algo falla.'
        : 'Mercado Pago confirmó el pago. Entrégalo desde el panel.',
  ].join('\n');
}
