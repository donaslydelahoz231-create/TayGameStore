/**
 * Ganancia garantizada. Con el costo de un paquete (lo que cobra el proveedor), la comisión del
 * medio de pago y la ganancia mínima que quiere el dueño:
 *
 *   piso = costo × (1 + ganancia) ÷ (1 − comisión)      (redondeado hacia arriba a $100)
 *
 * Vendido al piso o más caro, el paquete paga su costo, la comisión y deja al menos esa ganancia.
 * Todo en pesos enteros: los porcentajes se convierten a fracciones solo para el cálculo y el
 * resultado se redondea a favor del dueño.
 */

export interface MarginPolicy {
  /** Comisión del medio de pago, % del precio cobrado. */
  feePct: number;
  /** Ganancia mínima, % sobre el costo del proveedor. */
  minMarginPct: number;
}

const ROUND_TO = 100;

/** Precio mínimo de venta que cubre costo + comisión + ganancia mínima. */
export function floorPrice(costCop: number, policy: MarginPolicy): number {
  const raw = (costCop * (1 + policy.minMarginPct / 100)) / (1 - policy.feePct / 100);
  return Math.ceil(raw / ROUND_TO) * ROUND_TO;
}

/** Costo máximo que puedes pagarle al proveedor vendiendo a `priceCop` sin bajar de la ganancia. */
export function maxCost(priceCop: number, policy: MarginPolicy): number {
  return Math.floor((priceCop * (1 - policy.feePct / 100)) / (1 + policy.minMarginPct / 100));
}

/** Ganancia estimada de una venta: precio menos comisión menos costo. */
export function profit(priceCop: number, costCop: number, policy: MarginPolicy): number {
  return Math.round(priceCop * (1 - policy.feePct / 100) - costCop);
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
