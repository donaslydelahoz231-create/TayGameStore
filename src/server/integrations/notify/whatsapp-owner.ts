/**
 * Aviso al WhatsApp del dueño con CallMeBot (pedido del dueño, 2026-11-18: «que el cliente no
 * tenga que entrar a WhatsApp; que el pedido me llegue solo, mediante mi tienda», sin la API de
 * WhatsApp Business).
 *
 * CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/, revisado el 2026-11-18):
 * el dueño escribe una vez desde su WhatsApp al bot de CallMeBot, recibe una clave (apikey) y la
 * tienda envía con un GET a `api.callmebot.com/whatsapp.php?phone=…&text=…&apikey=…`. Solo llega a
 * su propio número, desde el contacto de CallMeBot. El plan gratuito dice «solo para uso personal».
 *
 * Un solo mensaje: «Pedido pagado», cuando el cliente paga por Nequi y lo confirma en la tienda.
 * Datos mínimos (autorizados por el dueño el 2026-11-18): referencia, ID de Free Fire, servidor,
 * recargas, total y pago. Nunca el nombre ni el correo del cliente: esos quedan en el panel.
 * Texto plano, sin asteriscos ni otras marcas de formato de WhatsApp (pedido del dueño).
 */

export interface OwnerWhatsApp {
  readonly channel: 'whatsapp';
  send(text: string): Promise<void>;
}

export interface CallMeBotOptions {
  /** Número de WhatsApp del dueño, con código de país, solo dígitos (el que activó CallMeBot). */
  phone: string;
  apiKey: string;
  timeoutMs?: number;
}

const ENDPOINT = 'https://api.callmebot.com/whatsapp.php';
/** CallMeBot responde con una página de texto corta; no hace falta leer más. */
const MAX_BODY_CHARS = 4_000;
/** Lo que responde CallMeBot cuando aceptó el mensaje (documentado en ejemplos públicos). */
const QUEUED = /message queued/i;

export class CallMeBotWhatsApp implements OwnerWhatsApp {
  readonly channel = 'whatsapp' as const;

  constructor(
    private readonly options: CallMeBotOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(text: string): Promise<void> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('phone', '+' + this.options.phone);
    url.searchParams.set('text', text);
    url.searchParams.set('apikey', this.options.apiKey);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        // Una redirección podría llevar la clave a otro sitio: se trata como error.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8_000),
      });
    } catch (error) {
      // Sin la URL (lleva la clave) en el mensaje: quien registra el fallo guarda solo `message`.
      const reason = error instanceof Error ? error.name : 'error';
      throw new Error(`CallMeBot no respondió (${reason})`, { cause: error });
    }
    const body = (await response.text().catch(() => '')).slice(0, MAX_BODY_CHARS);
    if (!response.ok) throw new Error(`CallMeBot rechazó el aviso (HTTP ${response.status})`);
    // Un 200 sin «Message queued» (clave inválida, número sin activar, límite) no cuenta como
    // enviado: la cola lo reintenta y, si sigue fallando, el panel lo muestra como fallido.
    if (!QUEUED.test(body)) throw new Error('CallMeBot no confirmó el aviso');
  }
}

/** Datos del pedido que pueden ir en el WhatsApp del dueño (sin nombre ni correo del cliente). */
export interface OwnerWhatsAppOrder {
  reference: string;
  totalCop: number;
  playerUid: string;
  /** Servidor de Free Fire, ya con su nombre legible. */
  server: string | null;
  items: readonly { name: string; quantity: number }[];
}

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const cop = (value: number) => `$ ${COP.format(value)} COP`;

/** Texto de una línea, sin marcas de formato de WhatsApp: el nombre de un paquete nunca formatea. */
function plain(value: string): string {
  return value
    .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El ID de Free Fire va solo en su renglón (pedido del dueño, 2026-11-18: «que el ID lo pueda
 * copiar en WhatsApp»): WhatsApp reconoce un número suelto y deja tocarlo o mantenerlo presionado
 * para copiarlo, sin llevarse el resto del texto.
 */
function orderLines(order: OwnerWhatsAppOrder): string[] {
  return [
    `Pedido: ${plain(order.reference)}`,
    ...(order.server ? [`Servidor: ${plain(order.server)}`] : []),
    '',
    'ID Free Fire:',
    plain(order.playerUid),
    '',
    'Recargas:',
    ...order.items.map((item) => `- ${plain(item.name)} x${item.quantity}`),
    `Total: ${cop(order.totalCop)}`,
  ];
}

/**
 * El cliente pagó por Nequi y lo confirmó en la tienda («Confirmar pago y enviar» o «Ya transferí»):
 * solo entonces se envía (nunca al crear el pedido). Título pedido por el dueño (2026-11-18):
 * «Pedido pagado»; la última línea le dice dónde confirmarlo: su hoja de Google, pestaña «Pagos
 * pendientes», donde la tienda ya escribió la fila del pedido (o el panel, si lo prefiere).
 */
export function nequiReportedWhatsApp(
  order: OwnerWhatsAppOrder,
  report: { senderLast4: string | null; customerReference: string | null },
): string {
  const from = report.senderLast4
    ? `, desde la cuenta terminada en ${plain(report.senderLast4)}`
    : '';
  return [
    'Pedido pagado en TayGameStore',
    '',
    ...orderLines(order),
    '',
    `Pago: Nequi${from}.`,
    ...(report.customerReference ? [`Comprobante: ${plain(report.customerReference)}.`] : []),
    '',
    'Revisa tu app Nequi y marca «✓ Pago verificado» en la hoja, pestaña «Pagos pendientes».',
  ].join('\n');
}
