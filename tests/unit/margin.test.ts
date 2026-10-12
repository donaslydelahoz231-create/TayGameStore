import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config/env.js';
import { floorPrice, guardedPromo, maxCost, profit } from '../../src/server/domain/margin.js';

const policy = { feePct: 4, minMarginPct: 5 };

describe('ganancia garantizada', () => {
  it('piso = costo + ganancia + comisión, redondeado hacia arriba a $100', () => {
    // 3.500 × 1,05 ÷ 0,96 = 3.828,1 → 3.900
    expect(floorPrice(3500, policy)).toBe(3900);
    expect(floorPrice(149_000, policy)).toBe(163_000);
    // Sin comisión ni ganancia, el piso es el costo (redondeado).
    expect(floorPrice(3500, { feePct: 0, minMarginPct: 0 })).toBe(3500);
  });

  it('vender al piso nunca deja menos de la ganancia mínima', () => {
    for (const cost of [1, 999, 3500, 10_123, 149_000, 999_999]) {
      const floor = floorPrice(cost, policy);
      expect(profit(floor, cost, policy)).toBeGreaterThanOrEqual(Math.floor(cost * 0.05));
    }
  });

  it('costo máximo: lo más que se le puede pagar al proveedor a ese precio', () => {
    // 4.000 × 0,96 ÷ 1,05 = 3.657,1
    expect(maxCost(4000, policy)).toBe(3657);
    expect(floorPrice(maxCost(4000, policy), policy)).toBeLessThanOrEqual(4000);
  });

  it('la promo sube al piso; si el piso alcanza el precio normal, no hay promo', () => {
    expect(guardedPromo(4000, 3800, 3900)).toBe(3900);
    expect(guardedPromo(4000, 3950, 3900)).toBe(3950);
    expect(guardedPromo(4000, 3800, 4000)).toBeNull();
    expect(guardedPromo(4000, 3800, null)).toBe(3800);
    expect(guardedPromo(4000, null, 3900)).toBeNull();
  });
});

describe('configuración del costo del proveedor', () => {
  const base = {
    TOPUP_PROVIDER: 'unipin',
    UNIPIN_PARTNER_ID: 'socio-ficticio-0001',
    UNIPIN_SECRET_KEY: 'llave-ficticia-de-prueba',
  };

  it('acepta el código solo (sin costo) o con su costo en pesos', () => {
    const config = loadConfig({
      ...base,
      UNIPIN_CATALOG:
        '{"latam":{"game":"FF","skus":{"ff-110":"D110","ff-341":{"denomination":"D341","costCop":9000}}}}',
    });
    expect(config.topup?.catalog.latam?.skus).toEqual({
      'ff-110': { denomination: 'D110', costCop: null },
      'ff-341': { denomination: 'D341', costCop: 9000 },
    });
    expect(config.margin).toEqual({ feePct: 4, minMarginPct: 5 });
  });

  it('rechaza costos inválidos y porcentajes fuera de rango', () => {
    expect(() =>
      loadConfig({
        ...base,
        UNIPIN_CATALOG:
          '{"latam":{"game":"FF","skus":{"ff-110":{"denomination":"D","costCop":-1}}}}',
      }),
    ).toThrow(/UNIPIN_CATALOG/);
    expect(() => loadConfig({ PAYMENT_FEE_PCT: '50' })).toThrow(/PAYMENT_FEE_PCT/);
  });
});
