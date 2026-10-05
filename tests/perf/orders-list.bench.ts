import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
} from '../support/integration.js';

/**
 * Medición reproducible del listado de pedidos de un cliente con muchas órdenes.
 * Uso: TEST_DATABASE_URL=… npm run perf:orders   (base desechable terminada en _test)
 */
const ORDERS = 50;
const RUNS = 40;

// Cuenta las consultas SQL reales (todas pasan por pg.Client#query).
let queries = 0;
const descriptor = Object.getOwnPropertyDescriptor(pg.Client.prototype, 'query');
const originalQuery = descriptor?.value as (this: pg.Client, ...args: unknown[]) => unknown;
Object.defineProperty(pg.Client.prototype, 'query', {
  ...descriptor,
  value(this: pg.Client, ...args: unknown[]) {
    queries += 1;
    return originalQuery.apply(this, args);
  },
});

await resetDatabase(testDatabaseUrl());
const h = await createHarness({
  LIMIT_MAX_OPEN_ORDERS_PER_EMAIL: '50',
  LIMIT_MAX_OPEN_ORDERS_PER_UID: '50',
});
await seedProducts(h);

let cookie: Record<string, string> = {};
for (let i = 0; i < ORDERS; i += 1) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    cookies: cookie,
    remoteAddress: `10.9.${Math.floor(i / 200)}.${(i % 200) + 1}`,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String(300000000 + i),
      customerName: 'Cliente Carga',
      customerEmail: `carga${i}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [
        { sku: 'ff-110', quantity: 1 },
        { sku: 'ff-341', quantity: 2 },
      ],
    },
  });
  if (res.statusCode !== 201) throw new Error(`checkout ${res.statusCode}: ${res.body}`);
  const guest = res.cookies.find((c) => c.name === 'tgs_guest');
  if (guest) cookie = { tgs_guest: guest.value };
}

const times: number[] = [];
let perRequest = 0;
for (let i = 0; i < RUNS; i += 1) {
  const before = queries;
  const start = performance.now();
  const res = await h.app.inject({ method: 'GET', url: '/api/orders', cookies: cookie });
  times.push(performance.now() - start);
  perRequest = queries - before;
  const count = res.json<{ orders: unknown[] }>().orders.length;
  if (count !== ORDERS) throw new Error(`se esperaban ${ORDERS} pedidos, llegaron ${count}`);
}
times.sort((a, b) => a - b);
const pct = (p: number) =>
  times[Math.min(times.length - 1, Math.floor(times.length * p))]!.toFixed(1);
console.warn(
  `GET /api/orders con ${ORDERS} pedidos: consultas SQL por petición=${perRequest} · p50=${pct(0.5)} ms · p95=${pct(0.95)} ms`,
);
await h.close();
