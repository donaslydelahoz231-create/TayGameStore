import { and, asc, eq } from 'drizzle-orm';
import { products } from '../db/schema.js';
import { floorPrice, guardedPromo, maxCost, profit } from '../domain/margin.js';
import type { ServiceDeps } from './context.js';
import { providerCost } from './topup-coverage.js';

export type MarginStatus = 'sin_costo' | 'rentable' | 'promo_ajustada' | 'no_rentable';

/**
 * Rentabilidad de cada paquete activo, para el dueño (Panel → Catálogo):
 * - costo máximo que puede pagarle al proveedor a su precio normal y en promo;
 * - con el costo de UNIPIN_CATALOG: piso, ganancia por venta y si la promo se ajustó o el paquete
 *   no deja ganancia (en ese caso no se vende por el proveedor).
 */
export async function marginReport(deps: ServiceDeps) {
  const policy = deps.config.margin;
  const rows = await deps.db
    .select()
    .from(products)
    .where(and(eq(products.game, 'freefire'), eq(products.active, true)))
    .orderBy(asc(products.sortOrder), asc(products.priceCop));
  const now = deps.now().getTime();
  return {
    policy,
    providerActive: deps.config.topup !== undefined,
    products: rows.map((row) => {
      const promo =
        row.promoPriceCop !== null &&
        row.promoPriceCop < row.priceCop &&
        (row.promoEndsAt === null || row.promoEndsAt.getTime() > now)
          ? row.promoPriceCop
          : null;
      const costCop = providerCost(deps, row.sku);
      const floorCop = costCop === null ? null : floorPrice(costCop, policy);
      const promoEffectiveCop = guardedPromo(row.priceCop, promo, floorCop);
      let status: MarginStatus = 'rentable';
      if (costCop === null || floorCop === null) status = 'sin_costo';
      else if (row.priceCop < floorCop) status = 'no_rentable';
      else if (promo !== null && promoEffectiveCop !== promo) status = 'promo_ajustada';
      return {
        sku: row.sku,
        name: row.name,
        listPriceCop: row.priceCop,
        promoPriceCop: promo,
        promoEffectiveCop,
        costCop,
        floorCop,
        maxCostListCop: maxCost(row.priceCop, policy),
        maxCostPromoCop: promo === null ? null : maxCost(promo, policy),
        profitListCop: costCop === null ? null : profit(row.priceCop, costCop, policy),
        profitPromoCop:
          costCop === null || promoEffectiveCop === null
            ? null
            : profit(promoEffectiveCop, costCop, policy),
        status,
      };
    }),
  };
}
