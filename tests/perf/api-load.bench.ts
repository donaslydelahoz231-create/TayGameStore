import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
} from '../support/integration.js';

/**
 * Carga concurrente en proceso (sin red) sobre las rutas principales, con PostgreSQL real.
 * Cada petición usa una IP distinta: se mide el servidor, no el rate limiting.
 * Uso: TEST_DATABASE_URL=… npm run perf:api
 */
const CONCURRENCY = 50;
const PER_ROUTE = 600;

await resetDatabase(testDatabaseUrl());
const h = await createHarness({
  LIMIT_MAX_OPEN_ORDERS_PER_EMAIL: '50',
  LIMIT_MAX_OPEN_ORDERS_PER_UID: '50',
});
await seedProducts(h);

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255 || 1}`;
};

const first = await h.app.inject({
  method: 'POST',
  url: '/api/checkout',
  headers: CSRF,
  remoteAddress: nextIp(),
  payload: {
    checkoutKey: randomUUID(),
    game: 'freefire',
    playerUid: '400000001',
    customerName: 'Cliente Carga',
    customerEmail: 'carga-base@example.com',
    acceptTerms: true,
    termsVersion: '2026-10-05',
    items: [{ sku: 'ff-110', quantity: 1 }],
  },
});
const { order, accessToken } = first.json<{ order: { reference: string }; accessToken: string }>();

let uid = 410000000;
const routes: Record<string, () => Promise<number>> = {
  'GET /api/config': async () =>
    (await h.app.inject({ method: 'GET', url: '/api/config', remoteAddress: nextIp() })).statusCode,
  'GET /api/catalog': async () =>
    (await h.app.inject({ method: 'GET', url: '/api/catalog', remoteAddress: nextIp() }))
      .statusCode,
  'GET /api/orders/:ref': async () =>
    (
      await h.app.inject({
        method: 'GET',
        url: `/api/orders/${order.reference}`,
        headers: { 'x-order-token': accessToken },
        remoteAddress: nextIp(),
      })
    ).statusCode,
  'POST /api/checkout': async () => {
    uid += 1;
    return (
      await h.app.inject({
        method: 'POST',
        url: '/api/checkout',
        headers: CSRF,
        remoteAddress: nextIp(),
        payload: {
          checkoutKey: randomUUID(),
          game: 'freefire',
          playerUid: String(uid),
          customerName: 'Cliente Carga',
          customerEmail: `carga${uid}@example.com`,
          acceptTerms: true,
          termsVersion: '2026-10-05',
          items: [
            { sku: 'ff-110', quantity: 1 },
            { sku: 'ff-341', quantity: 1 },
          ],
        },
      })
    ).statusCode;
  },
};

for (const [name, call] of Object.entries(routes)) {
  const times: number[] = [];
  const statuses = new Map<number, number>();
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < PER_ROUTE) {
        next += 1;
        const t = performance.now();
        const status = await call();
        times.push(performance.now() - t);
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  times.sort((a, b) => a - b);
  const pct = (p: number) =>
    times[Math.min(times.length - 1, Math.floor(times.length * p))]!.toFixed(1);
  console.warn(
    `${name.padEnd(22)} ${String(Math.round(PER_ROUTE / seconds)).padStart(5)} req/s · p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · estados ${JSON.stringify(Object.fromEntries(statuses))}`,
  );
}
await h.close();
