/** Tipos de promo-timing.js (para las pruebas en TypeScript). */
interface PromoWindowLike {
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}
export const PROMO_SETTLE_MS: number;
export const PROMO_RETRY_MS: number;
export const PROMO_MAX_WAIT_MS: number;
export function msUntilPromoChange(
  promo: PromoWindowLike | null | undefined,
  nowMs: number,
  minMs?: number,
): number | null;
export function promoChangeDue(promo: PromoWindowLike | null | undefined, nowMs: number): boolean;
