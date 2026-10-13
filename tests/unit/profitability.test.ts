import { describe, expect, it } from 'vitest';
import { FEE_SCENARIOS, profitabilityReport, quoteSchema } from '../../src/server/cli/finanzas.js';
import { floorPrice, maxCost, paymentFee, profit } from '../../src/server/domain/margin.js';
import {
  breakEvenPrice,
  feeFor,
  maxProviderBase,
  maxProviderCost,
  unitEconomics,
  usdToCop,
} from '../../src/server/domain/profitability.js';

// Comisión publicada por Mercado Pago Colombia con el dinero al instante (escenario, no tarifa
// confirmada de la cuenta): 3,29 % + $800 + IVA 19 %.
const mp = { pct: 3.29, fixedCop: 800, taxPct: 19 };
const none = { pct: 0, fixedCop: 0, taxPct: 0 };

describe('comisión del pago con cargo fijo e IVA', () => {
  it('(P × % + fijo) × (1 + IVA), redondeada hacia arriba', () => {
    // (3.800 × 3,29 % + 800) × 1,19 = 1.100,77
    expect(feeFor(3800, mp)).toBe(1101);
    // (150.000 × 3,29 % + 800) × 1,19 = 6.824,65
    expect(feeFor(150_000, mp)).toBe(6825);
    expect(feeFor(3800, none)).toBe(0);
  });

  it('la política de ganancia sobre el costo incluye el cargo fijo y el IVA', () => {
    const policy = { feePct: 3.29, minMarginPct: 5, feeFixedCop: 800, feeTaxPct: 19 };
    expect(paymentFee(4000, policy)).toBe(1109);
    // Lo más que se puede pagar por 110 💎 a $4.000 con 5 % sobre el costo: (4.000 − 1.109) ÷ 1,05
    expect(maxCost(4000, policy)).toBe(2753);
    for (const cost of [1, 999, 2500, 10_123, 149_000]) {
      const floor = floorPrice(cost, policy);
      expect(profit(floor, cost, policy)).toBeGreaterThanOrEqual(cost * 0.05);
      expect(profit(floor - 100, cost, policy)).toBeLessThan(cost * 0.05);
    }
  });

  it('sin cargo fijo ni IVA da lo mismo que antes', () => {
    const policy = { feePct: 4, minMarginPct: 5 };
    expect(maxCost(4000, policy)).toBe(3657);
    expect(floorPrice(3500, policy)).toBe(3900);
  });
});

describe('rentabilidad sobre el precio (P − C − F − O)', () => {
  it('ejemplo de TAY RADAR: 110 💎 a $3.800 con 15 % bruto → $3.230; base con 5 % de recargo $3.076', () => {
    expect(maxProviderCost(3800, 15, none, 0)).toBe(3230);
    expect(maxProviderBase(3230, 5)).toBe(3076);
  });

  it('el margen neto descuenta la comisión y los otros costos', () => {
    // 3.800 × 0,85 − 1.101 − 100 = 2.029
    expect(maxProviderCost(3800, 15, mp, 100)).toBe(2029);
    // Un margen imposible a ese precio da un costo máximo negativo (no se oculta).
    expect(maxProviderCost(1000, 15, mp, 0)).toBeLessThan(0);
  });

  it('beneficio, margen y precio de equilibrio son coherentes', () => {
    const unit = unitEconomics({
      priceCop: 18_000,
      providerBaseCop: 12_000,
      providerSurchargePct: 2,
      fee: mp,
      otherCop: 150,
    });
    expect(unit).toEqual({
      feeCop: 1657,
      providerTotalCop: 12_240,
      profitCop: 3953,
      marginPct: 21.96,
    });
    const breakEven = breakEvenPrice(unit.providerTotalCop, mp, 150);
    const at = (p: number) => p - feeFor(p, mp) - unit.providerTotalCop - 150;
    expect(at(breakEven)).toBeGreaterThanOrEqual(0);
    expect(at(breakEven - 1)).toBeLessThan(0);
  });

  it('convierte dólares a pesos con la tasa y el sobrecosto de conversión', () => {
    expect(usdToCop(0.79, 3218.75, 0)).toBe(2543);
    expect(usdToCop(1, 4000, 3)).toBe(4120);
  });
});

describe('informe financiero', () => {
  const packages = [{ sku: 'ff-110', units: 110, priceCop: 4000, promoPriceCop: 3800 }];

  it('sin cotización solo muestra costos máximos, nunca beneficios inventados', () => {
    const md = profitabilityReport({ packages, scenarios: FEE_SCENARIOS, otherCop: 0 });
    expect(md).toContain('| 110 💎 | $3.800 | TAY RADAR | $3.610 | $3.420 | $3.230 |');
    expect(md).toContain('$1.101 (28,97 %)');
    expect(md).not.toContain('Beneficio');
  });

  it('con una cotización indicativa la marca como no confirmada y calcula el margen', () => {
    const quote = quoteSchema.parse({
      provider: 'Proveedor ficticio',
      source: 'prueba',
      confirmed: false,
      trmCop: 4000,
      costs: { 'ff-110': { usd: 0.6 } },
    });
    const md = profitabilityReport({
      packages,
      scenarios: [FEE_SCENARIOS[0]!],
      otherCop: 0,
      quote,
    });
    expect(md).toContain('INDICATIVOS, sin confirmar');
    // 3.800 − 2.400 − 1.101 = 299 → 7,87 %
    expect(md).toContain('| 110 💎 | TAY RADAR | $3.800 | $2.400 | $1.101 | $299 | 7,87 % |');
  });

  it('rechaza cotizaciones con campos desconocidos o costos no positivos', () => {
    expect(() =>
      quoteSchema.parse({ provider: 'x', source: 'y', confirmed: true, costs: { a: { usd: -1 } } }),
    ).toThrow();
    expect(() =>
      quoteSchema.parse({ provider: 'x', source: 'y', confirmed: true, costs: {}, extra: 1 }),
    ).toThrow();
  });
});
