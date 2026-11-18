import type { OwnerWhatsApp } from '../../src/server/integrations/notify/whatsapp-owner.js';

/** WhatsApp del dueño simulado: guarda cada texto en lugar de llamar a CallMeBot. */
export class RecordingOwnerWhatsApp implements OwnerWhatsApp {
  readonly channel = 'whatsapp' as const;
  readonly sent: string[] = [];
  /** Próximos envíos que fallarán. */
  failNext = 0;

  async send(text: string): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('CallMeBot no confirmó el aviso');
    }
    this.sent.push(text);
  }
}
