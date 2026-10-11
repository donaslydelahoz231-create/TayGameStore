import type { AppConfig, TopupRegion } from '../config/env.js';
import type { FreeFireServer } from '../db/schema.js';

/**
 * Qué cubre la recarga directa (UNIPIN_CATALOG): por servidor de Free Fire, los paquetes que el
 * distribuidor recarga. Sin dependencias de los servicios de pedidos (los usan checkout y
 * catálogo).
 */
type WithConfig = { config: Pick<AppConfig, 'topup'> };

export function topupRegion(
  deps: WithConfig,
  server: FreeFireServer | null,
): TopupRegion | undefined {
  const topup = deps.config.topup;
  if (!topup || !server || server === 'no_seguro') return undefined;
  return topup.catalog[server];
}

/** ¿El proveedor puede recargar todos estos paquetes en ese servidor? */
export function providerCovers(
  deps: WithConfig,
  server: FreeFireServer | null,
  skus: readonly string[],
): boolean {
  const region = topupRegion(deps, server);
  return Boolean(region && skus.length && skus.every((sku) => region.skus[sku]));
}

/** Paquetes que el proveedor recarga en algún servidor (el catálogo no los muestra agotados). */
export function providerSkus(deps: WithConfig): Set<string> {
  const skus = new Set<string>();
  for (const region of Object.values(deps.config.topup?.catalog ?? {})) {
    for (const sku of Object.keys(region.skus)) skus.add(sku);
  }
  return skus;
}
