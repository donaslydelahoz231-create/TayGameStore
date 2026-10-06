import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHarness,
  CSRF,
  resetDatabase,
  seedProducts,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Promo de fin de semana (PROMO_SCHEDULE=weekends, valor por defecto en producción): el precio
 * promocional rige de sábado 00:00 a domingo 23:59 en Colombia, en el catálogo y en lo que el
 * servidor cobra al crear el pedido.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ PROMO_SCHEDULE: 'weekends' });
  await seedProducts(h);
});
afterAll(async () => {
  await h?.close();
});

type Product = { sku: string; listPriceCop: number; priceCop: number; promoEndsAt: string | null };
const catalog = async () =>
  (await h.app.inject({ method: 'GET', url: '/api/catalog?game=freefire' })).json<{
    products: Product[];
  }>().products;
const promo = async () =>
  (await h.app.inject({ method: 'GET', url: '/api/config' })).json<{
    promo: { schedule: string; active: boolean; startsAt: string; endsAt: string };
  }>().promo;
let uid = 700000000;
const orderTotal = async () => {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/checkout',
    remoteAddress: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid: String((uid += 1)),
      customerName: 'Cliente Promo',
      customerEmail: `promo-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku: 'ff-110', quantity: 1 }],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ order: { totalCop: number } }>().order.totalCop;
};

describe('promo de fin de semana', () => {
  it('entre semana se cobra el precio normal y se anuncia el próximo sábado', async () => {
    h.clock.now = new Date('2026-10-06T21:00:00Z'); // martes 4:00 p. m. en Colombia
    const product = (await catalog()).find((p) => p.sku === 'ff-110');
    expect(product).toMatchObject({ listPriceCop: 4000, priceCop: 4000, promoEndsAt: null });
    expect(await promo()).toEqual({
      schedule: 'weekends',
      timeZone: 'America/Bogota',
      active: false,
      startsAt: '2026-10-10T05:00:00.000Z',
      endsAt: '2026-10-12T05:00:00.000Z',
    });
    expect(await orderTotal()).toBe(4000);
  });

  it('el sábado y el domingo (hora de Colombia) rige el precio promocional', async () => {
    h.clock.now = new Date('2026-10-11T23:00:00Z'); // domingo 6:00 p. m. en Colombia
    const product = (await catalog()).find((p) => p.sku === 'ff-110');
    expect(product).toMatchObject({
      listPriceCop: 4000,
      priceCop: 3800,
      promoEndsAt: '2026-10-12T05:00:00.000Z',
    });
    expect((await promo()).active).toBe(true);
    expect(await orderTotal()).toBe(3800);
  });
});
