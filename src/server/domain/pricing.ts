/**
 * Cuándo rige el precio promocional de los productos:
 * - `always`: mientras el producto tenga promoción vigente;
 * - `weekends`: solo de sábado 00:00 a domingo 23:59, hora de Colombia.
 */
export type PromoSchedule = 'always' | 'weekends';

/** Colombia no usa horario de verano: UTC−5 todo el año. */
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fin de semana de promo que contiene `now` o, si no, el siguiente: sábado 00:00 a lunes 00:00
 * (fin exclusivo), hora de Colombia.
 */
export function weekendWindow(now: Date): { startsAt: Date; endsAt: Date; active: boolean } {
  // Campos UTC de esta fecha = reloj de pared en Colombia.
  const local = new Date(now.getTime() + COLOMBIA_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const daysSinceSaturday = (local.getUTCDay() + 1) % 7; // sábado 0, domingo 1, lunes 2…
  let start = midnight - daysSinceSaturday * DAY_MS;
  if (daysSinceSaturday >= 2) start += 7 * DAY_MS; // ya pasó: el próximo sábado
  const startsAt = new Date(start - COLOMBIA_OFFSET_MS);
  const endsAt = new Date(startsAt.getTime() + 2 * DAY_MS);
  return { startsAt, endsAt, active: now >= startsAt && now < endsAt };
}

export function promoScheduleActive(schedule: PromoSchedule, now: Date): boolean {
  return schedule === 'always' || weekendWindow(now).active;
}

/** Precio efectivo de un producto: el promocional solo si existe y sigue vigente. */
export interface PricedProduct {
  priceCop: number;
  promoPriceCop: number | null;
  promoEndsAt: Date | null;
}

export function effectivePrice(
  product: PricedProduct,
  now: Date,
  schedule: PromoSchedule = 'always',
): number {
  const promoActive =
    promoScheduleActive(schedule, now) &&
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
