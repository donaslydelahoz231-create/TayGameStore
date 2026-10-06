import nodemailer from 'nodemailer';

/**
 * Envío de correo por SMTP con `nodemailer`. Sirve cualquier servidor SMTP estándar: Gmail
 * (smtp.gmail.com, con una "contraseña de aplicación" de la cuenta), Google Workspace o un
 * servicio de correo transaccional. Siempre cifrado: 465 con TLS directo; otro puerto exige
 * STARTTLS. Las credenciales solo llegan por variables de entorno.
 */

export interface MailMessage {
  to: readonly string[];
  subject: string;
  text: string;
  html: string;
  /** Respuestas del cliente al soporte (SUPPORT_EMAIL), no a la cuenta que envía. */
  replyTo?: string | undefined;
}

export interface Mailer {
  readonly channel: 'email';
  send(message: MailMessage): Promise<void>;
}

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
}

type TransportOptions = Parameters<typeof nodemailer.createTransport>[0];
type Transport = Pick<ReturnType<typeof nodemailer.createTransport>, 'sendMail'>;

export function smtpTransportOptions(options: SmtpOptions): TransportOptions {
  return {
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    requireTLS: options.port !== 465,
    auth: { user: options.user, pass: options.pass },
    // Acotado: el aviso nunca bloquea mucho la respuesta; si falla, la cola lo reintenta.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  };
}

export class SmtpMailer implements Mailer {
  readonly channel = 'email' as const;
  private readonly transport: Transport;

  constructor(
    private readonly options: SmtpOptions,
    createTransport: (options: TransportOptions) => Transport = nodemailer.createTransport,
  ) {
    this.transport = createTransport(smtpTransportOptions(options));
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: { name: this.options.fromName, address: this.options.fromAddress },
        to: [...message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      });
    } catch (error) {
      // Solo el tipo y el código SMTP: el mensaje del servidor puede repetir el usuario.
      const code =
        error && typeof error === 'object' && 'responseCode' in error
          ? ` ${String(error.responseCode)}`
          : '';
      const name = error instanceof Error ? error.name : 'error';
      throw new Error(`SMTP rechazó o no respondió (${name}${code})`, { cause: error });
    }
  }
}
