import { randomUUID } from 'node:crypto';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Fuzzing de la API: miles de entradas malformadas y maliciosas contra TODAS las rutas.
 * Reproducible: FUZZ_SEED fija la secuencia y FUZZ_RUNS el número de casos por ruta.
 * Garantías comprobadas en cada respuesta:
 *  - nunca un 5xx inesperado (solo los 503 documentados de servicios externos no configurados);
 *  - los errores JSON tienen siempre { error: { code, message, requestId } };
 *  - ninguna respuesta filtra trazas, rutas de archivos ni detalles internos;
 *  - el prototipo de Object no queda contaminado.
 */
const SEED = Number(process.env.FUZZ_SEED ?? 20261005);
const RUNS = Number(process.env.FUZZ_RUNS ?? 25);
const ALLOWED_503 = new Set([
  'PLAYER_LOOKUP_UNAVAILABLE',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'AUTH_NOT_CONFIGURED',
  'SERVICE_UNAVAILABLE',
]);

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

const NASTY_STRINGS = [
  '',
  ' ',
  'A'.repeat(5000),
  '💎'.repeat(300),
  'a\u0000b',
  "' OR '1'='1' --",
  '1; DROP TABLE orders; --',
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  '../../../../etc/passwd',
  '%2e%2e%2f%2e%2e%2f',
  '${7*7}',
  '{{7*7}}',
  '{"$gt":""}',
  'TGS-AAAAAAAAAA',
  '00000000-0000-0000-0000-000000000000',
  'freefire',
  'ff-110',
  '‮evil',
  '\r\nSet-Cookie: x=1',
];
const NASTY_NUMBERS = [0, -1, 1, 1.5, 1e308, -1e308, 2 ** 53 + 1, 999_999_999_999];
const PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];

function randomValue(depth = 0): unknown {
  const r = random();
  if (r < 0.35) return pick(NASTY_STRINGS);
  if (r < 0.55) return pick(NASTY_NUMBERS);
  if (r < 0.62) return pick([true, false, null]);
  if (r < 0.8 && depth < 3)
    return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(depth + 1));
  if (depth < 3) return randomObject(depth + 1);
  return null;
}

function randomObject(depth = 0): Record<string, unknown> {
  // Sin prototipo: así "__proto__" es una clave propia y llega tal cual al JSON.
  const obj = Object.create(null) as Record<string, unknown>;
  const keys = Math.floor(random() * 5);
  for (let i = 0; i < keys; i += 1) {
    const key = random() < 0.15 ? pick(PROTO_KEYS) : pick(['a', 'items', 'uid', 'code', 'x']);
    obj[key] = key === '__proto__' ? { polluted: 'si' } : randomValue(depth);
  }
  return obj;
}

/** Cuerpos válidos de cada ruta: se mutan campo a campo para llegar a la lógica profunda. */
const TEMPLATES: Record<string, () => Record<string, unknown>> = {
  '/api/checkout': () => ({
    checkoutKey: randomUUID(),
    game: 'freefire',
    playerUid: '123456789',
    customerName: 'Cliente Fuzz',
    customerEmail: 'fuzz@example.com',
    acceptTerms: true,
    termsVersion: '2026-10-05',
    items: [{ sku: 'ff-110', quantity: 1 }],
  }),
  '/api/player/lookup': () => ({ game: 'freefire', uid: '912345678' }),
  '/api/orders/:ref/confirm-player': () => ({ confirm: true, nickname: 'Jugador' }),
  '/api/admin/products': () => ({
    sku: `fuzz-${Math.floor(random() * 1e9)}`,
    game: 'freefire',
    name: 'Producto fuzz',
    units: 10,
    priceCop: 1000,
  }),
  '/api/admin/products/:id': () => ({
    sku: 'ff-110',
    game: 'freefire',
    name: 'Producto fuzz',
    units: 10,
    priceCop: 1000,
  }),
  '/api/admin/blocklist': () => ({ kind: 'email', value: 'x@example.com', reason: 'fuzz' }),
  '/api/admin/orders/:id/verification': () => ({
    result: 'VERIFIED',
    nickname: 'Jugador',
    region: 'Colombia',
  }),
  '/api/admin/orders/:id/fulfillment': () => ({ action: 'claim' }),
  '/api/admin/orders/:id/review': () => ({ note: 'revisión fuzz' }),
  '/api/admin/mfa/verify': () => ({ code: '000000' }),
  '/api/admin/mfa/enable': () => ({ code: '000000' }),
  '/api/webhooks/mercadopago': () => ({ type: 'payment', data: { id: '123' } }),
};

function mutate(template: Record<string, unknown>): unknown {
  const r = random();
  if (r < 0.15) return randomValue();
  if (r < 0.25) return randomObject();
  const copy = Object.assign(Object.create(null) as Record<string, unknown>, template);
  const keys = Object.keys(copy);
  const changes = 1 + Math.floor(random() * 2);
  for (let i = 0; i < changes; i += 1) {
    const key = pick([...keys, '__proto__', 'extra']);
    if (random() < 0.15) delete copy[key];
    else copy[key] = key === '__proto__' ? { polluted: 'si' } : randomValue(1);
  }
  return copy;
}

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  admin?: boolean;
}

const ROUTES: Route[] = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/ready' },
  { method: 'GET', path: '/api/config' },
  { method: 'GET', path: '/api/catalog' },
  { method: 'POST', path: '/api/checkout' },
  { method: 'POST', path: '/api/player/lookup' },
  { method: 'GET', path: '/api/orders' },
  { method: 'GET', path: '/api/orders/:ref' },
  { method: 'POST', path: '/api/orders/:ref/confirm-player' },
  { method: 'POST', path: '/api/orders/:ref/pay' },
  { method: 'POST', path: '/api/orders/:ref/sync' },
  { method: 'POST', path: '/api/webhooks/mercadopago' },
  { method: 'GET', path: '/api/auth/me' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'GET', path: '/auth/google' },
  { method: 'GET', path: '/auth/google/callback' },
  { method: 'GET', path: '/auth/discord' },
  { method: 'GET', path: '/auth/discord/callback' },
  { method: 'GET', path: '/auth/facebook' },
  { method: 'GET', path: '/auth/facebook/callback' },
  { method: 'POST', path: '/api/admin/mfa/setup', admin: true },
  { method: 'POST', path: '/api/admin/mfa/enable', admin: true },
  { method: 'POST', path: '/api/admin/mfa/verify', admin: true },
  { method: 'GET', path: '/api/admin/alerts', admin: true },
  { method: 'GET', path: '/api/admin/orders', admin: true },
  { method: 'GET', path: '/api/admin/orders/:id', admin: true },
  { method: 'POST', path: '/api/admin/orders/:id/verification', admin: true },
  { method: 'POST', path: '/api/admin/orders/:id/fulfillment', admin: true },
  { method: 'POST', path: '/api/admin/orders/:id/review', admin: true },
  { method: 'POST', path: '/api/admin/orders/:id/reconcile', admin: true },
  { method: 'GET', path: '/api/admin/products', admin: true },
  { method: 'POST', path: '/api/admin/products', admin: true },
  { method: 'PUT', path: '/api/admin/products/:id', admin: true },
  { method: 'GET', path: '/api/admin/blocklist', admin: true },
  { method: 'POST', path: '/api/admin/blocklist', admin: true },
  { method: 'DELETE', path: '/api/admin/blocklist/:id', admin: true },
  { method: 'GET', path: '/api/admin/audit', admin: true },
];

let h: Harness;
let admin: Record<string, string>;
let realRef = '';
let realOrderId = '';
let ipCounter = 0;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'fuzz-admin' }))
    .cookie;
  const order = await h.app.inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    remoteAddress: '10.77.0.1',
    payload: TEMPLATES['/api/checkout']?.(),
  });
  const created = order.json<{ order: { reference: string } }>().order;
  realRef = created.reference;
  const list = await h.app.inject({ method: 'GET', url: '/api/admin/orders', cookies: admin });
  realOrderId = list.json<{ orders: { id: string }[] }>().orders[0]?.id ?? randomUUID();
});
afterAll(async () => {
  await h?.close();
});

function fillPath(path: string): string {
  return path
    .replace(':ref', () =>
      pick([realRef, 'TGS-ZZZZZZZZZZ', '..%2F..%2Fadmin', 'x'.repeat(300), '%00']),
    )
    .replace(':id', () =>
      pick([realOrderId, randomUUID(), 'no-es-uuid', '../../etc', "1' OR '1'='1"]),
    );
}

function randomQuery(): string {
  if (random() < 0.5) return '';
  const params = new URLSearchParams();
  for (let i = 0; i < 1 + Math.floor(random() * 3); i += 1) {
    params.append(
      pick([
        'game',
        'modo',
        'vincular',
        'code',
        'state',
        'error',
        'q',
        'status',
        'data.id',
        'type',
      ]),
      JSON.stringify(randomValue(2)) ?? '',
    );
  }
  return `?${params.toString()}`;
}

function checkResponse(res: LightMyRequestResponse, context: string) {
  const body = res.body;
  let parsed: { error?: { code?: unknown; message?: unknown; requestId?: unknown } } | undefined;
  if ((res.headers['content-type'] ?? '').toString().includes('application/json')) {
    parsed = res.json();
  }
  if (res.statusCode >= 500) {
    const code = parsed?.error?.code;
    expect(
      res.statusCode === 503 && typeof code === 'string' && ALLOWED_503.has(code),
      `${context} → ${res.statusCode} ${body.slice(0, 300)}`,
    ).toBe(true);
  }
  // El webhook responde a Mercado Pago (no a personas) con { received }: contrato propio.
  const providerFacing = context.includes('/api/webhooks/');
  if (res.statusCode >= 400 && parsed && !providerFacing) {
    expect(typeof parsed.error?.code, context).toBe('string');
    expect(typeof parsed.error?.message, context).toBe('string');
    expect(typeof parsed.error?.requestId, context).toBe('string');
  }
  expect(body, context).not.toMatch(
    /node_modules|\/src\/server|at [\w.<>]+ \(|stack|SQLSTATE|syntax error at/i,
  );
  expect(res.headers['x-request-id'], context).toBeTruthy();
}

describe(`fuzzing de la API (semilla ${SEED}, ${RUNS} casos por ruta)`, () => {
  it.each(ROUTES.map((route) => [`${route.method} ${route.path}`, route] as const))(
    '%s resiste entradas malformadas y maliciosas',
    async (_name, route) => {
      for (let i = 0; i < RUNS; i += 1) {
        const url = fillPath(route.path) + randomQuery();
        const template = TEMPLATES[route.path];
        const hasBody = route.method === 'POST' || route.method === 'PUT';
        const payload = hasBody
          ? template && random() < 0.7
            ? mutate(template())
            : randomValue()
          : undefined;
        const contentType = pick([
          'application/json',
          'application/json',
          'application/json',
          'text/plain',
          'application/x-www-form-urlencoded',
        ]);
        const headers: Record<string, string> = {
          ...(random() < 0.9 ? CSRF : {}),
          ...(hasBody ? { 'content-type': contentType } : {}),
          ...(random() < 0.2 ? { 'x-order-token': pick(NASTY_STRINGS).slice(0, 120) } : {}),
          ...(route.path.includes('webhooks')
            ? { 'x-signature': pick(NASTY_STRINGS).slice(0, 200), 'x-request-id': randomUUID() }
            : {}),
        };
        const rawBody = hasBody
          ? random() < 0.05
            ? '{"a":' + '['.repeat(2000)
            : random() < 0.03
              ? 'x'.repeat(70 * 1024)
              : JSON.stringify(payload)
          : undefined;
        const context = `[semilla ${SEED}, caso ${i}] ${route.method} ${url} ${String(rawBody).slice(0, 200)}`;
        const res = await h.app.inject({
          method: route.method,
          url,
          headers,
          cookies: route.admin ? admin : {},
          remoteAddress: `10.78.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`,
          ...(rawBody === undefined ? {} : { payload: rawBody }),
        });
        checkResponse(res, context);
      }
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('polluted');
    },
  );

  it('el servidor sigue sano después del fuzzing', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/api/ready' })).statusCode).toBe(200);
    const catalog = await h.app.inject({
      method: 'GET',
      url: '/api/catalog',
      remoteAddress: '10.79.0.1',
    });
    expect(catalog.statusCode).toBe(200);
  });
});
