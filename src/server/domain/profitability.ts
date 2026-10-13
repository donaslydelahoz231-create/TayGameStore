import { paymentFee, type MarginPolicy } from './margin.js';

/**
 * Rentabilidad por paquete con margen sobre el PRECIO (informe financiero,
 * docs/proveedor-recargas/FINANZAS.md). Complementa `margin.ts`, cuyo MIN_MARGIN_PCT es una
 * ganancia sobre el COSTO del proveedor.
 *
 *   P = precio cobrado · C = costo total del proveedor · F = comisión del pago · O = otros costos
 *   Beneficio = P − C − F − O        Margen = Beneficio ÷ P × 100
 *   C máximo para un margen r:  P × (1 − r) − F − O
 *
 * Todo en pesos enteros. La comisión se redondea hacia arriba y los costos máximos hacia abajo,
 * siempre a favor de la tienda.
 */

/** Comisión del medio de pago: % del precio + cargo fijo, más IVA sobre la comisión. */
export interface FeeModel {
  pct: number;
  fixedCop: number;
  taxPct: number;
}

const asPolicy = (fee: FeeModel): MarginPolicy => ({
  feePct: fee.pct,
  minMarginPct: 0,
  feeFixedCop: fee.fixedCop,
  feeTaxPct: fee.taxPct,
});

export function feeFor(priceCop: number, fee: FeeModel): number {
  return paymentFee(priceCop, asPolicy(fee));
}

export interface UnitInput {
  priceCop: number;
  /** Costo base del proveedor en pesos (ya convertido si cotiza en dólares). */
  providerBaseCop: number;
  /** Recargo del proveedor sobre su tarifa base, en %. */
  providerSurchargePct: number;
  fee: FeeModel;
  /** Otros costos atribuibles al pedido (conversión, reintentos, soporte…), en pesos. */
  otherCop: number;
}

export interface UnitResult {
  feeCop: number;
  providerTotalCop: number;
  /** Beneficio después de los costos identificados (P − C − F − O). */
  profitCop: number;
  /** Margen sobre el precio, en %, con dos decimales. */
  marginPct: number;
}

export function unitEconomics(input: UnitInput): UnitResult {
  const feeCop = feeFor(input.priceCop, input.fee);
  const providerTotalCop = Math.ceil(
    input.providerBaseCop * (1 + input.providerSurchargePct / 100) - 1e-9,
  );
  const profitCop = input.priceCop - providerTotalCop - feeCop - input.otherCop;
  return {
    feeCop,
    providerTotalCop,
    profitCop,
    marginPct: Math.round((profitCop / input.priceCop) * 10_000) / 100,
  };
}

/** C máximo = P × (1 − r) − F − O. Negativo si ese margen es imposible a ese precio. */
export function maxProviderCost(
  priceCop: number,
  targetMarginPct: number,
  fee: FeeModel,
  otherCop: number,
): number {
  return Math.floor(
    priceCop * (1 - targetMarginPct / 100) - feeFor(priceCop, fee) - otherCop + 1e-9,
  );
}

/** Tarifa base máxima si el proveedor cobra un recargo sobre ella. */
export function maxProviderBase(maxTotalCop: number, surchargePct: number): number {
  return Math.floor(maxTotalCop / (1 + surchargePct / 100) + 1e-9);
}

/** Precio mínimo que cubre costo + comisión + otros costos (beneficio ≥ 0). */
export function breakEvenPrice(providerTotalCop: number, fee: FeeModel, otherCop: number): number {
  const tax = 1 + fee.taxPct / 100;
  let price = Math.ceil(
    (providerTotalCop + otherCop + fee.fixedCop * tax) / (1 - (fee.pct / 100) * tax) - 1e-9,
  );
  // La comisión se redondea hacia arriba: se corrige el último peso si hace falta.
  while (price - feeFor(price, fee) - providerTotalCop - otherCop < 0) price += 1;
  return price;
}

/** Costo en pesos de una tarifa en dólares, con la tasa y el sobrecosto de conversión. */
export function usdToCop(usd: number, trmCop: number, fxSpreadPct: number): number {
  return Math.ceil(usd * trmCop * (1 + fxSpreadPct / 100) - 1e-9);
}
