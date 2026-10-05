/** Precio efectivo de un producto: el promocional solo si existe y sigue vigente. */
export interface PricedProduct {
  priceCop: number;
  promoPriceCop: number | null;
  promoEndsAt: Date | null;
}

export function effectivePrice(product: PricedProduct, now: Date): number {
  const promoActive =
    product.promoPriceCop !== null &&
    product.promoPriceCop < product.priceCop &&
    (product.promoEndsAt === null || product.promoEndsAt.getTime() > now.getTime());
  return promoActive && product.promoPriceCop !== null ? product.promoPriceCop : product.priceCop;
}

export interface LineInput {
  listPriceCop: number;
  unitPriceCop: number;
  quantity: number;
}

/** Totales en enteros COP. Nunca coma flotante. */
export function computeTotals(lines: readonly LineInput[]): {
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
} {
  let subtotalCop = 0;
  let totalCop = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.unitPriceCop) || !Number.isSafeInteger(line.quantity)) {
      throw new Error('importe o cantidad no enteros');
    }
    subtotalCop += line.listPriceCop * line.quantity;
    totalCop += line.unitPriceCop * line.quantity;
  }
  return { subtotalCop, discountCop: subtotalCop - totalCop, totalCop };
}
