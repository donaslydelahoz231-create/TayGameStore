import type {
  OrderEventPayload,
  OrderEventSink,
} from '../../src/server/integrations/notify/events.js';

/** Doble de pruebas del webhook de eventos (n8n): guarda los eventos y puede simular caídas. */
export class RecordingEventSink implements OrderEventSink {
  readonly sent: OrderEventPayload[] = [];
  /** Próximos envíos que fallarán. */
  failNext = 0;

  async send(payload: OrderEventPayload): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('El webhook de eventos rechazó el evento (HTTP 503)');
    }
    this.sent.push(payload);
  }
}
