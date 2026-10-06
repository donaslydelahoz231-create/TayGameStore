import type { Mailer, MailMessage } from '../../src/server/integrations/notify/email.js';

/** Doble de pruebas del correo: guarda los mensajes y puede simular un SMTP caído. */
export class RecordingMailer implements Mailer {
  readonly channel = 'email' as const;
  readonly sent: MailMessage[] = [];
  /** Próximos envíos que fallarán. */
  failNext = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('SMTP rechazó o no respondió (simulado)');
    }
    this.sent.push(message);
  }
}
