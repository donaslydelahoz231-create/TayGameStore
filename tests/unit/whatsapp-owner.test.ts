import { describe, expect, it } from 'vitest';
import {
  CallMeBotWhatsApp,
  nequiReportedWhatsApp,
  type OwnerWhatsAppOrder,
} from '../../src/server/integrations/notify/whatsapp-owner.js';

// Datos ficticios: número 57 + diez ceros (no existe) y una clave inventada.
const PHONE = '570000000000';
const API_KEY = 'clavefalsa123';

type Call = { url: URL; init: RequestInit | undefined };

function fakeFetch(reply: () => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (input, init) => {
    const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    calls.push({ url: new URL(href), init });
    return Promise.resolve(reply());
  };
}

const ORDER: OwnerWhatsAppOrder = {
  reference: 'TGS-ABC123',
  totalCop: 25_600,
  playerUid: '123456789',
  server: 'Latinoamérica',
  items: [
    { name: '100 + 10 Diamantes', quantity: 2 },
    { name: '*520* + 52 _Diamantes_\nTotal: $ 1', quantity: 1 },
  ],
};

describe('aviso al WhatsApp del dueño (CallMeBot)', () => {
  it('hace un GET a CallMeBot con el número del dueño, el texto y la clave, sin redirecciones', async () => {
    const calls: Call[] = [];
    const sender = new CallMeBotWhatsApp(
      { phone: PHONE, apiKey: API_KEY },
      fakeFetch(() => new Response('Message queued. You will receive it in a few seconds.'), calls),
    );
    await sender.send('Hola\nPedido: TGS-ABC123');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(`${call?.url.origin}${call?.url.pathname}`).toBe(
      'https://api.callmebot.com/whatsapp.php',
    );
    expect(call?.url.searchParams.get('phone')).toBe('+' + PHONE);
    expect(call?.url.searchParams.get('text')).toBe('Hola\nPedido: TGS-ABC123');
    expect(call?.url.searchParams.get('apikey')).toBe(API_KEY);
    expect(call?.init?.method).toBe('GET');
    expect(call?.init?.redirect).toBe('error');
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('un error HTTP, una respuesta sin «Message queued» o una red caída fallan sin mostrar la clave', async () => {
    const cases: [() => Response | Promise<Response>, RegExp][] = [
      [() => new Response('down', { status: 503 }), /HTTP 503/],
      [() => new Response('APIKey is invalid'), /no confirmó/],
      [() => Promise.reject(new TypeError('fetch failed')), /no respondió/],
    ];
    for (const [reply, expected] of cases) {
      const sender = new CallMeBotWhatsApp({ phone: PHONE, apiKey: API_KEY }, fakeFetch(reply));
      const error = await sender.send('x').then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(expected);
      expect((error as Error).message).not.toContain(API_KEY);
      expect((error as Error).message).not.toContain('callmebot.com');
    }
  });

  it('pedido Nequi informado: datos mínimos, en texto plano y sin datos personales', () => {
    const text = nequiReportedWhatsApp(ORDER, {
      senderLast4: '1234',
      customerReference: 'M12345678',
    });
    expect(text).toBe(
      [
        'Pedido pagado en TayGameStore',
        '',
        'Pedido: TGS-ABC123',
        'Servidor: Latinoamérica',
        '',
        'ID Free Fire:',
        '123456789',
        '',
        'Recargas:',
        '- 100 + 10 Diamantes x2',
        '- 520 + 52 Diamantes Total: $ 1 x1',
        'Total: $ 25.600 COP',
        '',
        'Pago: Nequi, desde la cuenta terminada en 1234.',
        'Comprobante: M12345678.',
        '',
        'Revisa tu app Nequi y marca «✓ Pago verificado» en la hoja, pestaña «Pagos pendientes».',
      ].join('\n'),
    );
    // Ninguna marca de formato de WhatsApp, ni líneas falsas desde el nombre de un paquete.
    expect(text).not.toMatch(/[*_~`]/);
    expect(text.split('\n').filter((line) => line.startsWith('Total:'))).toHaveLength(1);
    // Sin los dígitos o el comprobante, el aviso no los inventa.
    const bare = nequiReportedWhatsApp(
      { ...ORDER, server: null },
      { senderLast4: null, customerReference: null },
    );
    expect(bare).toContain('Pago: Nequi.');
    expect(bare).not.toContain('Comprobante');
    expect(bare).not.toContain('Servidor');
    // El ID queda solo en su renglón, para copiarlo en WhatsApp sin el resto del texto.
    expect(text.split('\n')).toContain('123456789');
  });
});
