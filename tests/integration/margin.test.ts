import { randomUUID } from 'node:crypto';
import type { InjectOptions } from 'fastify';
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
 * Ganancia garantizada con el costo de UniPin (comisión 4 %, ganancia mínima 5 %):
 * - ff-110: costo 3.500 → piso 3.900. Precio 4.000 sí deja ganancia, pero la promo de 3.800 no:
 *   se cobra 3.900.
 * - ff-341: costo 9.000 → piso 9.900. Precio 11.000, sin promo: rentable.
 * - ff-6160: costo 149.000 → piso 163.000 > precio 150.000: no se vende por UniPin (agotado).
 */
let h: Harness;
let admin: Record<string, string>;

const CATALOG = {
  latam: {
    game: 'FF_LATAM',
    skus: {
      'ff-110': { denomination: 'D110', costCop: 3500 },
      'ff-341': { denomination: 'D341', costCop: 9000 },
      'ff-6160': { denomination: 'D6160', costCop: 149_000 },
    },
  },
};

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({
    PLAYER_VERIFICATION: 'customer',
    SELL_ONLY_WITH_STOCK: 'true',
    TOPUP_PROVIDER: 'unipin',
    UNIPIN_PARTNER_ID: 'socio-ficticio-0001',
    UNIPIN_SECRET_KEY: 'llave-ficticia-de-prueba',
    UNIPIN_CATALOG: JSON.stringify(CATALOG),
    PAYMENT_FEE_PCT: '4',
    MIN_MARGIN_PCT: '5',
  });
  await seedProducts(h);
  admin = (await sessionFor(h, { email: ADMIN_EMAIL, admin: true, mfa: true, sub: 'adm-margin' }))
    .cookie;
});
afterAll(async () => {
  await h?.close();
});

let ip = 0;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.66.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
let uid = 950000000;

const checkout = (sku: string) => {
  const playerUid = String((uid += 1));
  return inject({
    method: 'POST',
    url: '/api/checkout',
    headers: CSRF,
    payload: {
      checkoutKey: randomUUID(),
      game: 'freefire',
      playerUid,
      confirmedPlayerUid: playerUid,
      playerServer: 'latam',
      customerName: 'Cliente Margen',
      customerEmail: `margen-${randomUUID().slice(0, 8)}@example.com`,
      acceptTerms: true,
      termsVersion: '2026-10-05',
      items: [{ sku, quantity: 1 }],
    },
  });
};

type Product = {
  sku: string;
  listPriceCop: number;
  priceCop: number;
  promoPriceCop: number | null;
  soldOut: boolean;
};

describe('ganancia garantizada con el costo del proveedor', () => {
  it('el catálogo sube la promo al piso y no vende lo que no deja ganancia', async () => {
    const res = await inject({ method: 'GET', url: '/api/catalog' });
    const bySku = new Map(res.json<{ products: Product[] }>().products.map((p) => [p.sku, p]));
    expect(bySku.get('ff-110')).toMatchObject({
      listPriceCop: 4000,
      priceCop: 3900,
      promoPriceCop: 3900,
      soldOut: false,
    });
    expect(bySku.get('ff-341')).toMatchObject({ priceCop: 11000, soldOut: false });
    expect(bySku.get('ff-6160')).toMatchObject({ soldOut: true });
  });

  it('el checkout cobra el precio con piso y rechaza el paquete sin ganancia', async () => {
    const ok = await checkout('ff-110');
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json<{ order: { totalCop: number } }>().order.totalCop).toBe(3900);

    const rejected = await checkout('ff-6160');
    expect(rejected.statusCode).toBe(409);
  });

  it('el panel muestra costo máximo, piso, ganancia y estado de cada paquete', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/margins', cookies: admin });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      policy: { feePct: number; minMarginPct: number; feeFixedCop: number; feeTaxPct: number };
      providerActive: boolean;
      products: Record<string, unknown>[];
    }>();
    // Sin cargo fijo ni IVA configurados, las cifras son las de siempre.
    expect(body.policy).toEqual({ feePct: 4, minMarginPct: 5, feeFixedCop: 0, feeTaxPct: 0 });
    expect(body.providerActive).toBe(true);
    const bySku = new Map(body.products.map((p) => [p.sku, p]));
    expect(bySku.get('ff-110')).toMatchObject({
      status: 'promo_ajustada',
      costCop: 3500,
      floorCop: 3900,
      promoPriceCop: 3800,
      promoEffectiveCop: 3900,
      maxCostListCop: 3657,
      maxCostPromoCop: 3474,
      profitListCop: 340,
      profitPromoCop: 244,
    });
    expect(bySku.get('ff-341')).toMatchObject({ status: 'rentable', floorCop: 9900 });
    expect(bySku.get('ff-6160')).toMatchObject({ status: 'no_rentable', floorCop: 163_000 });
    // Sin costo cargado: el panel lo dice y da el costo máximo para negociar.
    expect(bySku.get('ff-big')).toMatchObject({
      status: 'sin_costo',
      costCop: null,
      maxCostListCop: 274_285,
    });
  });

  it('el panel de rentabilidad es solo del dueño', async () => {
    const res = await inject({ method: 'GET', url: '/api/admin/margins' });
    expect(res.statusCode).toBe(404);
  });
});
