import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config/env.js';
import {
  WebhookEventSink,
  type OrderEventPayload,
} from '../../src/server/integrations/notify/events.js';

/** Servidor HTTP local real: comprueba lo que de verdad sale por la red. */
const SECRET = 's'.repeat(40);
const received: { headers: IncomingMessage['headers']; body: string; url: string }[] = [];
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ headers: req.headers, body, url: req.url ?? '' });
      if (req.url === '/caido') return res.writeHead(503).end('down');
      if (req.url === '/redirige') return res.writeHead(307, { location: '/ok' }).end();
      if (req.url === '/lento') return; // nunca responde
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const payload: OrderEventPayload = {
  id: '0b7f9c1e-1111-4222-8333-944455556666',
  event: 'order.paid',
  occurredAt: '2026-10-06T17:00:00.000Z',
  order: {
    reference: 'TGS-ABC123',
    status: 'PAID',
    totalCop: 25_900,
    currency: 'COP',
    playerUid: '765432100',
    nickname: 'Jugador',
    items: [{ name: '100 + 10 Diamantes', quantity: 2 }],
  },
};

describe('webhook de eventos (n8n)', () => {
  it('hace POST del JSON con la llave Bearer y el id del evento', async () => {
    await new WebhookEventSink({ url: `${base}/ok`, secret: SECRET }).send(payload);
    const last = received.at(-1);
    expect(last?.url).toBe('/ok');
    expect(last?.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(last?.headers['x-tgs-event-id']).toBe(payload.id);
    expect(last?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(last?.body ?? '')).toEqual(payload);
  });

  it('una respuesta que no es 2xx es un fallo (se reintenta), sin la llave en el mensaje', async () => {
    const sink = new WebhookEventSink({ url: `${base}/caido`, secret: SECRET });
    await expect(sink.send(payload)).rejects.toThrow(
      'El webhook de eventos rechazó el evento (HTTP 503)',
    );
  });

  it('no sigue redirecciones: la llave nunca viaja a otra dirección', async () => {
    const before = received.length;
    const sink = new WebhookEventSink({ url: `${base}/redirige`, secret: SECRET });
    const error = await sink.send(payload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^El webhook de eventos no respondió/);
    expect((error as Error).message).not.toContain(SECRET);
    expect(received.slice(before).map((r) => r.url)).toEqual(['/redirige']);
  });

  it('se rinde a tiempo si n8n no contesta', async () => {
    const sink = new WebhookEventSink({ url: `${base}/lento`, secret: SECRET, timeoutMs: 200 });
    await expect(sink.send(payload)).rejects.toThrow(
      'El webhook de eventos no respondió (TimeoutError)',
    );
  });
});

describe('configuración del webhook de eventos', () => {
  const PRODUCTION = {
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://tienda.example',
    DATABASE_URL: 'postgres://user:pass@db.example:5432/app',
    ORDER_TOKEN_KEYS: `1:${Buffer.alloc(32, 7).toString('base64')}`,
    IP_HASH_PEPPER: 'p'.repeat(40),
  };
  const issues = (env: Record<string, string>) => {
    try {
      loadConfig(env);
      return [];
    } catch (error) {
      if (error instanceof ConfigError) return error.issues;
      throw error;
    }
  };

  it('URL y llave van juntas; la llave tiene al menos 32 caracteres', () => {
    expect(issues({ EVENTS_WEBHOOK_URL: 'https://n8n.example/webhook/x' }).join()).toContain(
      'EVENTS_WEBHOOK_SECRET',
    );
    expect(
      issues({ EVENTS_WEBHOOK_URL: 'https://n8n.example/webhook/x', EVENTS_WEBHOOK_SECRET: 'x' })
        .length,
    ).toBeGreaterThan(0);
    expect(loadConfig({}).eventsWebhook).toBeUndefined();
  });

  it('en producción exige https', () => {
    const env = { ...PRODUCTION, EVENTS_WEBHOOK_SECRET: SECRET };
    expect(issues({ ...env, EVENTS_WEBHOOK_URL: 'http://n8n.example/webhook/x' }).join()).toContain(
      'EVENTS_WEBHOOK_URL',
    );
    expect(
      loadConfig({ ...env, EVENTS_WEBHOOK_URL: 'https://n8n.example/webhook/x' }),
    ).toMatchObject({ eventsWebhook: { url: 'https://n8n.example/webhook/x', secret: SECRET } });
  });
});
