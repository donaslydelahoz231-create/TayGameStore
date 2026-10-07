/**
 * Aviso al dueño cuando Mercado Pago confirma un pago: es la señal para entregar los diamantes.
 * La entrega sigue siendo manual (FULFILLMENT_MODE=manual); este aviso solo acorta la espera.
 *
 * Canal disponible: Telegram Bot API, método oficial `sendMessage`
 * (https://core.telegram.org/bots/api#sendmessage). El dueño crea el bot con @BotFather y
 * configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en el hosting; nunca van en el código.
 */

export interface PaidOrderNotice {
  reference: string;
  totalCop: number;
  playerUid: string;
  nickname: string | null;
  items: readonly { name: string; quantity: number }[];
  /** PIN del inventario ya entregados automáticamente (0: hay que entregarlo a mano). */
  pinCount?: number;
}

export interface OwnerNotifier {
  readonly channel: string;
  orderPaid(notice: PaidOrderNotice): Promise<void>;
}

export interface TelegramOptions {
  botToken: string;
  chatId: string;
  timeoutMs?: number;
}

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Texto plano (sin parse_mode): un nombre de jugador nunca se interpreta como formato. */
export function paidOrderText(notice: PaidOrderNotice): string {
  const items = notice.items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
  const player = notice.nickname ? `${notice.playerUid} (${notice.nickname})` : notice.playerUid;
  return [
    `Pedido pagado ${notice.reference}`,
    `Total: ${cop.format(notice.totalCop)}`,
    `ID de jugador: ${player}`,
    items,
    notice.pinCount
      ? `Mercado Pago confirmó el pago y se entregó automáticamente con ${notice.pinCount} PIN de tu inventario.`
      : 'Mercado Pago confirmó el pago. Entrégalo desde el panel.',
  ].join('\n');
}

export class TelegramOwnerNotifier implements OwnerNotifier {
  readonly channel = 'telegram';

  constructor(
    private readonly options: TelegramOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async orderPaid(notice: PaidOrderNotice): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.telegram.org/bot${this.options.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.options.chatId,
            text: paidOrderText(notice),
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
        },
      );
    } catch (error) {
      // El mensaje nunca incluye la URL (lleva el token del bot); quien registra el fallo
      // guarda solo `message`, nunca `cause`.
      const reason = error instanceof Error ? error.name : 'error';
      throw new Error(`Telegram no respondió (${reason})`, { cause: error });
    }
    if (!response.ok) throw new Error(`Telegram rechazó el aviso (HTTP ${response.status})`);
  }
}
