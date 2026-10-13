/**
 * Ganancia garantizada. Con el costo de un paquete (lo que cobra el proveedor), la comisión del
 * medio de pago y la ganancia mínima que quiere el dueño:
 *
 *   comisión(P) = (P × % + fijo) × (1 + IVA)
 *   neto(P)     = P − comisión(P)
 *   piso        = menor P con neto(P) ≥ costo × (1 + ganancia)   (redondeado hacia arriba a $100)
 *
 * Vendido al piso o más caro, el paquete paga su costo, la comisión y deja al menos esa ganancia.
 * Todo en pesos enteros: los porcentajes se convierten a fracciones solo para el cálculo y el
 * resultado se redondea a favor del dueño (comisión hacia arriba, costos máximos hacia abajo).
 */

export interface MarginPolicy {
  /** Comisión del medio de pago, % del precio cobrado. */
  feePct: number;
  /** Ganancia mínima, % sobre el costo del proveedor. */
  minMarginPct: number;
  /** Cargo fijo por pago, en pesos (Mercado Pago Colombia publica uno por transacción). */
  feeFixedCop?: number | undefined;
  /** IVA sobre la comisión, en % (en Colombia la comisión de Mercado Pago lleva IVA). */
  feeTaxPct?: number | undefined;
}

const ROUND_TO = 100;

/** Multiplicador del IVA sobre la comisión. */
const taxFactor = (policy: MarginPolicy) => 1 + (policy.feeTaxPct ?? 0) / 100;

/** Comisión del medio de pago por un cobro de `priceCop`, IVA incluido, redondeada hacia arriba. */
export function paymentFee(priceCop: number, policy: MarginPolicy): number {
  const raw = ((priceCop * policy.feePct) / 100 + (policy.feeFixedCop ?? 0)) * taxFactor(policy);
  // Tolerancia de coma flotante: 1.100,0000001 no debe volverse 1.101.
  return Math.max(0, Math.ceil(raw - 1e-9));
}

/** Lo que queda de un cobro después de la comisión del medio de pago. */
export function netOfFee(priceCop: number, policy: MarginPolicy): number {
  return priceCop - paymentFee(priceCop, policy);
}

/** Precio mínimo de venta que cubre costo + comisión + ganancia mínima. */
export function floorPrice(costCop: number, policy: MarginPolicy): number {
  const tax = taxFactor(policy);
  const raw =
    (costCop * (1 + policy.minMarginPct / 100) + (policy.feeFixedCop ?? 0) * tax) /
    (1 - (policy.feePct / 100) * tax);
  let floor = Math.ceil(raw / ROUND_TO) * ROUND_TO;
  // El redondeo de la comisión puede dejar el piso a 1 peso de la meta: se sube un escalón.
  while (netOfFee(floor, policy) < costCop * (1 + policy.minMarginPct / 100)) floor += ROUND_TO;
  return floor;
}

/** Costo máximo que puedes pagarle al proveedor vendiendo a `priceCop` sin bajar de la ganancia. */
export function maxCost(priceCop: number, policy: MarginPolicy): number {
  return Math.max(
    0,
    Math.floor(netOfFee(priceCop, policy) / (1 + policy.minMarginPct / 100) + 1e-9),
  );
}

/** Ganancia estimada de una venta: precio menos comisión menos costo. */
export function profit(priceCop: number, costCop: number, policy: MarginPolicy): number {
  return netOfFee(priceCop, policy) - costCop;
}

/**
 * Promoción con piso: si la promo configurada baja del piso, se sube hasta el piso; si el piso ya
 * alcanza el precio normal, no hay promo para ese paquete (null).
 */
export function guardedPromo(
  listPriceCop: number,
  promoPriceCop: number | null,
  floorCop: number | null,
): number | null {
  if (promoPriceCop === null) return null;
  const promo = floorCop === null ? promoPriceCop : Math.max(promoPriceCop, floorCop);
  return promo < listPriceCop ? promo : null;
}
