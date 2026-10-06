import type { OwnerNotifier, PaidOrderNotice } from '../../src/server/integrations/notify/owner.js';

/** Doble de pruebas del aviso al dueño: guarda los avisos y puede simular un canal caído. */
export class RecordingOwnerNotifier implements OwnerNotifier {
  readonly channel = 'prueba';
  readonly sent: PaidOrderNotice[] = [];
  failNext = false;

  async orderPaid(notice: PaidOrderNotice): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('canal caído simulado');
    }
    this.sent.push(notice);
  }
}
