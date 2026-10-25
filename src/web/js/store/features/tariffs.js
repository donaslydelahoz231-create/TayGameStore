import { currentProducts } from '../cart-model.js';
import { $, esc } from '../dom.js';
import { money } from '../format.js';
import { state } from '../state.js';
import { promoValidity, weekendPromo } from './promo.js';

/**
 * Tabla de tarifas de TayGameStore: precio normal, precio promo y ahorro REAL de cada paquete,
 * todo calculado con los precios que publica el servidor (nunca precios «antes» inflados).
 * Lo que se cobra lo decide el servidor al crear el pedido.
 */

/** Paquetes con promo configurada: { p, normal, promo, saving }. */
export function tariffRows() {
  if (state.game !== 'freefire') return [];
  return currentProducts().map((p) => {
    const normal = Number(p.normal || 0);
    const promo = p.scheduledPromo !== null && p.scheduledPromo < normal ? p.scheduledPromo : null;
    return { p, normal, promo, saving: promo === null ? 0 : normal - promo };
  });
}

/** Mayor ahorro real disponible (0 si no hay promos). */
export function maxSaving() {
  return tariffRows().reduce((max, row) => Math.max(max, row.saving), 0);
}

/** «$4.000»: compacto para que la tabla quepa en un teléfono de 360 px. */
const short = (value) => money(value).replace(' COP', '').replace('$ ', '$');

/** Franja sobre el catálogo: «Promo fin de semana · ahorra hasta $X · Ver tarifas». */
export function renderPromoStrip() {
  const strip = $('promoStrip');
  if (!strip) return;
  const best = maxSaving();
  strip.hidden = best <= 0;
  if (best <= 0) return;
  const weekend = weekendPromo();
  const when = !weekend
    ? 'Promo vigente'
    : weekend.active
      ? 'Promo activa hoy'
      : 'Promo sáb. y dom.';
  const validity = weekend
    ? `<span class="promo-validity">${esc(promoValidity(weekend))}</span>`
    : '';
  strip.innerHTML = `<b>${esc(when)}</b><span>Ahorra hasta ${esc(short(best))} por paquete</span>${validity}<em>Ver tarifas</em>`;
}

/** Tabla en «Radar promo». */
export function renderTariffBoard() {
  const board = $('tariffBoard');
  if (!board) return;
  const rows = tariffRows();
  if (!rows.length) {
    board.innerHTML = '<p class="tariff-empty">Las tarifas aparecen cuando carga el catálogo.</p>';
    return;
  }
  const weekend = weekendPromo();
  const promoHead = weekend ? 'Sáb. y dom.' : 'Promo';
  const today = !weekend || weekend.active ? 'promo' : 'normal';
  const cell = (value, cls) => `<td${cls ? ` class="${cls}"` : ''}>${value}</td>`;
  const body = rows
    .map(
      ({ p, normal, promo, saving }) =>
        `<tr><th scope="row">${esc(p.name.replace(/\s*Diamantes$/i, ''))}</th>${cell(
          esc(short(normal)),
          today === 'normal' || promo === null ? 'now' : '',
        )}${cell(promo === null ? '—' : esc(short(promo)), today === 'promo' && promo !== null ? 'promo now' : 'promo')}${cell(
          saving ? esc(short(saving)) : '—',
          'saving',
        )}</tr>`,
    )
    .join('');
  board.innerHTML = `<table class="tariff-table"><caption>Tarifas de diamantes Free Fire (diamantes = base + bono)</caption><thead><tr><th scope="col">Paquete</th><th scope="col">Normal</th><th scope="col">${esc(promoHead)}</th><th scope="col">Ahorro</th></tr></thead><tbody>${body}</tbody></table><p class="tariff-foot">Precios en pesos colombianos (COP). El total final lo confirma el servidor al crear tu pedido.</p>`;
}
