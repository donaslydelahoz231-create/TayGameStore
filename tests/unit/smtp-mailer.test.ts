import type { AddressInfo } from 'node:net';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmtpMailer, smtpTransportOptions } from '../../src/server/integrations/notify/email.js';

/**
 * El adaptador de correo contra un servidor SMTP real (smtp-server) en localhost: conexión,
 * STARTTLS obligatorio, autenticación y entrega del mensaje, igual que con Gmail pero sin salir
 * a internet. El único ajuste de prueba es aceptar el certificado autofirmado de localhost.
 */
interface Received {
  from: string | undefined;
  to: string[];
  raw: string;
  secure: boolean;
  user: string | undefined;
}

const received: Received[] = [];

/** Asunto decodificado (palabras codificadas RFC 2047, Q o B, en UTF-8, con plegado). */
function subjectOf(raw: string): string {
  const header = /^Subject: (.*(?:\r?\n[ \t].*)*)/m.exec(raw)?.[1] ?? '';
  return header
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?([QB])\?([^?]*)\?=/gi, (_m, enc: string, text: string) =>
      enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString('utf8')
        : Buffer.from(
            text
              .replace(/_/g, ' ')
              .replace(/=([0-9A-F]{2})/gi, (_h, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
            'latin1',
          ).toString('utf8'),
    )
    .replace(/\s+/g, ' ')
    .trim();
}
let server: SMTPServer;
let port = 0;

beforeAll(async () => {
  server = new SMTPServer({
    // Sin TLS no se aceptan credenciales (comportamiento de Gmail y de cualquier SMTP serio).
    allowInsecureAuth: false,
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, callback) {
      if (auth.username === 'tienda@example.com' && auth.password === 'clave-app-de-prueba') {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid login: 535 5.7.8 credenciales incorrectas'));
      }
    },
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined,
          to: session.envelope.rcptTo.map((r) => r.address),
          raw,
          secure: session.secure,
          user: typeof session.user === 'string' ? session.user : undefined,
        });
        callback();
      });
    },
    logger: false,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function mailer(pass = 'clave-app-de-prueba') {
  return new SmtpMailer(
    {
      host: '127.0.0.1',
      port,
      user: 'tienda@example.com',
      pass,
      fromAddress: 'tienda@example.com',
      fromName: 'TayGameStore',
    },
    (options) =>
      nodemailer.createTransport({
        ...(options as object),
        tls: { rejectUnauthorized: false },
      }),
  );
}

describe('SmtpMailer contra un servidor SMTP real', () => {
  it('se autentica por un canal cifrado y entrega el correo con remitente y respuesta', async () => {
    await mailer().send({
      to: ['cliente@example.com'],
      subject: 'Pago confirmado · Pedido TGS-PRUEBA1',
      text: 'Mercado Pago confirmó tu pago.',
      html: '<p>Mercado Pago confirmó tu pago.</p>',
      replyTo: 'soporte@example.com',
    });
    const [mail] = received;
    expect(mail?.secure).toBe(true); // STARTTLS antes de enviar credenciales
    expect(mail?.user).toBe('tienda@example.com');
    expect(mail?.from).toBe('tienda@example.com');
    expect(mail?.to).toEqual(['cliente@example.com']);
    expect(mail?.raw).toMatch(/^From: TayGameStore <tienda@example\.com>/m);
    expect(mail?.raw).toMatch(/^Reply-To: soporte@example\.com/m);
    expect(subjectOf(mail?.raw ?? '')).toBe('Pago confirmado · Pedido TGS-PRUEBA1');
    expect(mail?.raw).toContain('Content-Type: text/html');
  });

  it('con una contraseña incorrecta falla sin revelar la contraseña en el error', async () => {
    const error = await mailer('clave-equivocada-123')
      .send({ to: ['cliente@example.com'], subject: 'x', text: 'x', html: '<p>x</p>' })
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(error?.message).toMatch(/^SMTP rechazó o no respondió/);
    expect(error?.message).not.toContain('clave-equivocada-123');
  });

  it('configuración: 465 usa TLS directo; cualquier otro puerto exige STARTTLS', () => {
    const base = {
      host: 'smtp.gmail.com',
      user: 'u@example.com',
      pass: 'p'.repeat(16),
      fromAddress: 'u@example.com',
      fromName: 'TayGameStore',
    };
    expect(smtpTransportOptions({ ...base, port: 465 })).toMatchObject({
      secure: true,
      requireTLS: false,
    });
    expect(smtpTransportOptions({ ...base, port: 587 })).toMatchObject({
      secure: false,
      requireTLS: true,
    });
  });
});
