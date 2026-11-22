import { describe, expect, it } from 'vitest';
import {
  GreenApiWhatsApp,
  greenApiOrigin,
  type GreenApiOptions,
} from '../../src/server/integrations/notify/whatsapp-greenapi.js';

// Datos ficticios: número 57 + diez ceros (no existe), id y token inventados.
const OPTIONS: GreenApiOptions = {
  apiUrl: 'https://1103.api.green-api.com',
  idInstance: '1103000000',
  apiToken: 'tokenficticio0000000000000000000000000000000000000',
  phone: '570000000000',
};

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(reply: () => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    calls.push({ url, init });
    return Promise.resolve(reply());
  };
}

const accepted = () => Response.json({ idMessage: '3EB0C767D097B7C7C030' });

describe('aviso al WhatsApp del dueño (Green-API, número de la tienda)', () => {
  it('hace un POST a Green-API con el número del dueño y solo texto, sin vista previa ni redirecciones', async () => {
    const calls: Call[] = [];
    const sender = new GreenApiWhatsApp(OPTIONS, fakeFetch(accepted, calls));
    await sender.send('Pedido pagado en TayGameStore\nPedido: TGS-ABC123');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      `https://1103.api.green-api.com/waInstance${OPTIONS.idInstance}/sendMessage/${OPTIONS.apiToken}`,
    );
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.redirect).toBe('error');
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(call?.init?.headers).get('content-type')).toBe('application/json');
    const body = call?.init?.body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({
      chatId: '570000000000@c.us',
      message: 'Pedido pagado en TayGameStore\nPedido: TGS-ABC123',
      linkPreview: false,
    });
  });

  it('un error HTTP, una respuesta sin idMessage o una red caída fallan sin mostrar el token ni la URL', async () => {
    const cases: [() => Response | Promise<Response>, RegExp][] = [
      [() => new Response('{"message":"Unauthorized"}', { status: 401 }), /HTTP 401/],
      [() => new Response('{"message":"request entity too large"}', { status: 500 }), /HTTP 500/],
      [() => Response.json({}), /no confirmó/],
      [() => Response.json({ idMessage: '' }), /no confirmó/],
      [() => new Response('<html>ok</html>'), /no confirmó/],
      [() => Promise.reject(new TypeError('fetch failed')), /no respondió/],
    ];
    for (const [reply, expected] of cases) {
      const sender = new GreenApiWhatsApp(OPTIONS, fakeFetch(reply));
      const error = await sender.send('hola').then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : '';
      expect(message).toMatch(expected);
      expect(message).not.toContain(OPTIONS.apiToken);
      expect(message).not.toContain('waInstance');
      expect(message).not.toContain(OPTIONS.phone);
    }
  });

  it('una redirección (que podría llevar el token a otro sitio) cuenta como fallo', async () => {
    const sender = new GreenApiWhatsApp(
      OPTIONS,
      fakeFetch(() => Promise.reject(new TypeError('unexpected redirect'))),
    );
    await expect(sender.send('hola')).rejects.toThrow('Green-API no respondió (TypeError)');
  });

  it('el token solo puede viajar a los dominios oficiales de Green-API, por HTTPS', () => {
    for (const ok of [
      'https://api.green-api.com',
      'https://api.greenapi.com',
      'https://1103.api.green-api.com',
      'https://7103.api.greenapi.com/',
    ]) {
      expect(greenApiOrigin(ok), ok).toBeDefined();
    }
    for (const bad of [
      'http://1103.api.green-api.com',
      'https://api.green-api.com.example.com',
      'https://evil.com/api.green-api.com',
      'https://api.green-api.com@evil.com',
      'https://user:pass@api.green-api.com',
      'https://api.green-api.com:8443',
      'https://api.green-api.com/otra/ruta',
      'https://api.green-api.com/?x=1',
      'https://x.y.api.green-api.com',
      'https://green-api.com',
      'no es una url',
    ]) {
      expect(greenApiOrigin(bad), bad).toBeUndefined();
      expect(() => new GreenApiWhatsApp({ ...OPTIONS, apiUrl: bad })).toThrow(/dominio oficial/);
    }
  });

  it('rechaza un id, un token o un número del dueño con forma inválida (nada se envía)', () => {
    expect(() => new GreenApiWhatsApp({ ...OPTIONS, idInstance: '11a3' })).toThrow(/idInstance/);
    expect(() => new GreenApiWhatsApp({ ...OPTIONS, apiToken: 'corto' })).toThrow(/token/);
    expect(() => new GreenApiWhatsApp({ ...OPTIONS, apiToken: `${OPTIONS.apiToken}/x` })).toThrow(
      /token/,
    );
    expect(() => new GreenApiWhatsApp({ ...OPTIONS, phone: '57000@g.us' })).toThrow(/número/);
  });
});
