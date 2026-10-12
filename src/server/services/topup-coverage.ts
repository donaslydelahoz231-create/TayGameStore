import type { AppConfig, TopupRegion } from '../config/env.js';
import type { FreeFireServer } from '../db/schema.js';
import { floorPrice, guardedPromo } from '../domain/margin.js';

/**
 * Qué cubre la recarga directa (UNIPIN_CATALOG): por servidor de Free Fire, los paquetes que el
 * distribuidor recarga y cuánto cobra por cada uno. Sin dependencias de los servicios de pedidos
 * (los usan checkout y catálogo).
 *
 * Ganancia garantizada: con el costo del paquete, el piso (costo + comisión + ganancia mínima)
 * decide si el paquete se puede vender por el proveedor y hasta dónde puede bajar una promo.
 */
type WithConfig = { config: Pick<AppConfig, 'topup' | 'margin'> };

export function topupRegion(
  deps: WithConfig,
  server: FreeFireServer | null,
): TopupRegion | undefined {
  const topup = deps.config.topup;
  if (!topup || !server || server === 'no_seguro') return undefined;
  return topup.catalog[server];
}

/** Piso de un paquete en un servidor, o null si no se conoce su costo. */
function regionFloor(deps: WithConfig, region: TopupRegion, sku: string): number | null {
  const cost = region.skus[sku]?.costCop ?? null;
  return cost === null ? null : floorPrice(cost, deps.config.margin);
}

/**
 * ¿El proveedor puede recargar todos estos paquetes en ese servidor, dejando ganancia al precio
 * normal? `listPrices`: precio normal de cada paquete (sin él no se comprueba la ganancia).
 */
export function providerCovers(
  deps: WithConfig,
  server: FreeFireServer | null,
  skus: readonly string[],
  listPrices?: ReadonlyMap<string, number>,
): boolean {
  const region = topupRegion(deps, server);
  if (!region || !skus.length) return false;
  return skus.every((sku) => {
    if (!region.skus[sku]) return false;
    const floor = regionFloor(deps, region, sku);
    const price = listPrices?.get(sku);
    return floor === null || price === undefined || price >= floor;
  });
}

/** Costo más alto del paquete entre los servidores del proveedor (el caso menos favorable). */
export function providerCost(deps: WithConfig, sku: string): number | null {
  let cost: number | null = null;
  for (const region of Object.values(deps.config.topup?.catalog ?? {})) {
    const value = region.skus[sku]?.costCop;
    if (value !== undefined && value !== null) cost = Math.max(cost ?? 0, value);
  }
  return cost;
}

/** Piso de precio del paquete (costo más alto + comisión + ganancia), o null sin costo conocido. */
export function providerFloor(deps: WithConfig, sku: string): number | null {
  const cost = providerCost(deps, sku);
  return cost === null ? null : floorPrice(cost, deps.config.margin);
}

/**
 * Paquetes que el proveedor recarga con ganancia en algún servidor (el catálogo no los muestra
 * agotados). Con `listPrices`, excluye los que al precio normal no llegan al piso.
 */
export function providerSkus(
  deps: WithConfig,
  listPrices?: ReadonlyMap<string, number>,
): Set<string> {
  const skus = new Set<string>();
  for (const region of Object.values(deps.config.topup?.catalog ?? {})) {
    for (const sku of Object.keys(region.skus)) {
      const floor = regionFloor(deps, region, sku);
      const price = listPrices?.get(sku);
      if (floor === null || price === undefined || price >= floor) skus.add(sku);
    }
  }
  return skus;
}

/**
 * El producto con su promoción ajustada al piso: ninguna promo vende por debajo del costo del
 * proveedor más comisión y ganancia. Sin costo conocido, la promo queda como la configuró el dueño.
 */
export function withPromoFloor<
  T extends { sku: string; priceCop: number; promoPriceCop: number | null },
>(deps: WithConfig, product: T): T {
  return {
    ...product,
    promoPriceCop: guardedPromo(
      product.priceCop,
      product.promoPriceCop,
      providerFloor(deps, product.sku),
    ),
  };
}
