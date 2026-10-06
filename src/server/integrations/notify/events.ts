/**
 * Eventos de pedidos hacia una automatización externa del dueño (p. ej. un flujo de n8n con
 * nodo Webhook). La tienda hace POST de un JSON por evento con `Authorization: Bearer <llave>`
 * (la misma llave se guarda como credencial "Header Auth" del Webhook en n8n).
 *
 * Solo datos de la operación: nunca el correo ni el nombre del cliente, ni tokens o datos de
 * pago. `id` es estable por evento: si un envío se reintenta, el receptor lo reconoce y no lo
 * duplica (en n8n, `upsert` por `eventId`).
 */

export type OrderEventName = 'order.paid' | 'order.delivered' | 'order.refunded';

export interface OrderEventPayload {
  id: string;
  event: OrderEventName;
  occurredAt: string;
  order: {
    reference: string;
    status: string;
    totalCop: number;
    currency: 'COP';
    playerUid: string;
    nickname: string | null;
    items: { name: string; quantity: number }[];
  };
}

export interface OrderEventSink {
  send(payload: OrderEventPayload): Promise<void>;
}

export interface EventsWebhookOptions {
  url: string;
  secret: string;
  timeoutMs?: number;
}

export class WebhookEventSink implements OrderEventSink {
  constructor(
    private readonly options: EventsWebhookOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(payload: OrderEventPayload): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.secret}`,
          'x-tgs-event-id': payload.id,
        },
        body: JSON.stringify(payload),
        // Una redirección podría llevar la llave a otro sitio: se trata como error.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
      });
    } catch (error) {
      // Sin la URL ni la llave en el mensaje: quien registra el fallo guarda solo `message`.
      const reason = error instanceof Error ? error.name : 'error';
      throw new Error(`El webhook de eventos no respondió (${reason})`, { cause: error });
    }
    // Solo importa el código; el cuerpo se descarta para liberar la conexión.
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new Error(`El webhook de eventos rechazó el evento (HTTP ${response.status})`);
    }
  }
}
