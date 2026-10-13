// Cuándo volver a pedir precios al servidor por la promo de fin de semana (TAY RADAR).
// Sin DOM: se prueba en tests/unit/promo-timing.test.ts.

/** Margen tras el cambio para no adelantarse al reloj del servidor. */
export const PROMO_SETTLE_MS = 5_000;
/** Si el servidor aún no cambió (reloj del equipo adelantado), se reintenta con esta espera. */
export const PROMO_RETRY_MS = 60_000;
/** Nunca se espera más que esto sin volver a calcular (equipos que suspenden la pestaña). */
export const PROMO_MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/**
 * Milisegundos hasta el próximo cambio de la promo (empieza o termina) más un margen, o null si
 * la promo no es de fin de semana. `minMs` es la espera mínima (PROMO_RETRY_MS tras un intento
 * en que el servidor todavía no había cambiado).
 */
export function msUntilPromoChange(promo, nowMs, minMs = PROMO_SETTLE_MS) {
  if (!promo || !(promo.startsAt instanceof Date) || !(promo.endsAt instanceof Date)) return null;
  const boundary = (promo.active ? promo.endsAt : promo.startsAt).getTime();
  if (!Number.isFinite(boundary)) return null;
  return Math.min(Math.max(boundary - nowMs + PROMO_SETTLE_MS, minMs), PROMO_MAX_WAIT_MS);
}

/** true si a esta hora ya debió ocurrir el cambio anunciado por el servidor. */
export function promoChangeDue(promo, nowMs) {
  if (!promo) return false;
  return nowMs >= (promo.active ? promo.endsAt : promo.startsAt).getTime();
}
