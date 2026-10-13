import { describe, expect, it } from 'vitest';
import { weekendWindow } from '../../src/server/domain/pricing.js';
import {
  msUntilPromoChange,
  PROMO_MAX_WAIT_MS,
  PROMO_RETRY_MS,
  PROMO_SETTLE_MS,
  promoChangeDue,
} from '../../src/web/js/store/features/promo-timing.js';

const at = (iso: string) => new Date(iso).getTime();

describe('TAY RADAR: límites de la ventana (hora de Colombia, UTC−5)', () => {
  it('cambio de año: sábado 31-dic-2033 y domingo 1-ene-2034', () => {
    const window = {
      startsAt: new Date('2033-12-31T05:00:00Z'),
      endsAt: new Date('2034-01-02T05:00:00Z'),
    };
    // Viernes 30-dic 23:59:59 en Colombia: aún no.
    expect(weekendWindow(new Date('2033-12-31T04:59:59Z'))).toEqual({ ...window, active: false });
    // Sábado 00:00:00 y domingo 1-ene 23:59:59: activa.
    expect(weekendWindow(new Date('2033-12-31T05:00:00Z'))).toEqual({ ...window, active: true });
    expect(weekendWindow(new Date('2034-01-02T04:59:59Z'))).toEqual({ ...window, active: true });
    // Lunes 2-ene 00:00:00: terminó; la próxima es el sábado 7 de enero.
    expect(weekendWindow(new Date('2034-01-02T05:00:00Z'))).toMatchObject({
      startsAt: new Date('2034-01-07T05:00:00Z'),
      active: false,
    });
  });

  it('cambio de mes y año bisiesto: sábado 26 y domingo 27 de febrero de 2028', () => {
    expect(weekendWindow(new Date('2028-02-28T04:59:59Z'))).toMatchObject({ active: true });
    expect(weekendWindow(new Date('2028-02-28T05:00:00Z'))).toMatchObject({
      active: false,
      startsAt: new Date('2028-03-04T05:00:00Z'),
    });
  });

  it('el horario del servidor no cambia el resultado: solo cuenta el instante', () => {
    // El mismo instante expresado con otra zona horaria da la misma ventana.
    expect(weekendWindow(new Date('2026-10-10T00:00:00-05:00'))).toEqual(
      weekendWindow(new Date('2026-10-10T05:00:00Z')),
    );
  });
});

describe('la tienda vuelve a pedir precios cuando la promo cambia', () => {
  const upcoming = {
    active: false,
    startsAt: new Date('2026-10-10T05:00:00Z'),
    endsAt: new Date('2026-10-12T05:00:00Z'),
  };
  const live = { ...upcoming, active: true };

  it('espera hasta el inicio (o el fin) más un margen', () => {
    expect(msUntilPromoChange(upcoming, at('2026-10-10T04:59:00Z'))).toBe(60_000 + PROMO_SETTLE_MS);
    expect(msUntilPromoChange(live, at('2026-10-12T04:59:59Z'))).toBe(1000 + PROMO_SETTLE_MS);
  });

  it('nunca espera más de 6 horas sin recalcular, ni menos del mínimo pedido', () => {
    expect(msUntilPromoChange(upcoming, at('2026-10-06T21:00:00Z'))).toBe(PROMO_MAX_WAIT_MS);
    // Reloj del equipo adelantado: el cambio "ya pasó" pero el servidor no cambió aún.
    expect(msUntilPromoChange(upcoming, at('2026-10-10T05:10:00Z'), PROMO_RETRY_MS)).toBe(
      PROMO_RETRY_MS,
    );
  });

  it('sin promo de fin de semana no programa nada', () => {
    expect(msUntilPromoChange(null, Date.now())).toBeNull();
    expect(
      msUntilPromoChange({ active: true, startsAt: null, endsAt: null }, Date.now()),
    ).toBeNull();
    expect(promoChangeDue(null, Date.now())).toBe(false);
  });

  it('sabe si el cambio anunciado ya debió ocurrir', () => {
    expect(promoChangeDue(upcoming, at('2026-10-10T04:59:59Z'))).toBe(false);
    expect(promoChangeDue(upcoming, at('2026-10-10T05:00:00Z'))).toBe(true);
    expect(promoChangeDue(live, at('2026-10-12T05:00:00Z'))).toBe(true);
  });
});
