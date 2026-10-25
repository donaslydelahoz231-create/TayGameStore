import { $, setText } from '../dom.js';
import { state } from '../state.js';
import { msUntilPromoChange, PROMO_RETRY_MS, promoChangeDue } from './promo-timing.js';

// Promo de fin de semana: el servidor decide el horario y el precio (/api/config → promo).
// Aquí solo se muestra, en hora de Colombia, en la hora del visitante y en hora UTC.

const COLOMBIA = 'America/Bogota';

const fmt = (date, timeZone) =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

function visitorZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Información de la promo publicada por el servidor (o null si rige siempre o no hay datos). */
export function weekendPromo() {
  const promo = state.serverConfig?.promo;
  if (!promo || promo.schedule !== 'weekends' || !promo.startsAt || !promo.endsAt) return null;
  return {
    active: !!promo.active,
    startsAt: new Date(promo.startsAt),
    endsAt: new Date(promo.endsAt),
  };
}

// El fin de la ventana es el lunes 00:00: se muestra el último minuto del domingo.
const lastMinuteOf = (promo) => new Date(promo.endsAt.getTime() - 60_000);

/**
 * Vigencia de la promo en una línea, para los avisos breves de la tienda (toda promoción debe
 * indicar su plazo: Ley 1480 de 2011, art. 33).
 */
export function promoValidity(promo) {
  const lastMinute = lastMinuteOf(promo);
  return promo.active
    ? `Válida hasta el ${fmt(lastMinute, COLOMBIA)} (hora de Colombia)`
    : `Del ${fmt(promo.startsAt, COLOMBIA)} al ${fmt(lastMinute, COLOMBIA)} (hora de Colombia)`;
}

/** Rellena la ventana "Radar promo" con el horario vigente. */
export function renderPromo() {
  const promo = weekendPromo();
  if (!promo) return;
  const lastMinute = lastMinuteOf(promo);
  setText(
    'promoLead',
    'Cada sábado y domingo (hora de Colombia) los paquetes marcados bajan de precio. El precio final lo confirma el servidor al crear tu pedido.',
  );
  setText('promoBadge', promo.active ? 'LIVE' : 'PRÓXIMA');
  setText('promoTitle', promo.active ? 'Promo de fin de semana activa' : 'Promo de fin de semana');
  setText(
    'promoStatus',
    promo.active
      ? `Termina el ${fmt(lastMinute, COLOMBIA)} (hora de Colombia).`
      : `Empieza el ${fmt(promo.startsAt, COLOMBIA)} (hora de Colombia).`,
  );
  const zone = visitorZone();
  const lines = [
    `Colombia (UTC−5): ${fmt(promo.startsAt, COLOMBIA)} – ${fmt(lastMinute, COLOMBIA)}`,
    ...(zone && zone !== COLOMBIA
      ? [`Tu hora (${zone}): ${fmt(promo.startsAt)} – ${fmt(lastMinute)}`]
      : []),
    `Hora general (UTC): ${fmt(promo.startsAt, 'UTC')} – ${fmt(lastMinute, 'UTC')}`,
  ];
  const box = $('promoTimes');
  if (box)
    box.replaceChildren(
      ...lines.map((line) => Object.assign(document.createElement('div'), { textContent: line })),
    );
  setText('activatePromo', promo.active ? 'Ver paquetes en promo' : 'Ver paquetes');
}

let promoTimer = null;

/**
 * Con la página abierta, vuelve a pedir el horario y los precios al servidor cuando TAY RADAR
 * empieza o termina (sábado 00:00 y lunes 00:00, hora de Colombia). El precio que se cobra lo
 * decide siempre el servidor; esto solo evita mostrar precios o avisos vencidos.
 */
export function watchPromoChanges(refresh) {
  const arm = (minMs) => {
    clearTimeout(promoTimer);
    const delay = msUntilPromoChange(weekendPromo(), Date.now(), minMs);
    if (delay === null) return;
    promoTimer = setTimeout(run, delay);
  };
  const run = async () => {
    const before = weekendPromo();
    // Espera máxima sin llegar al cambio: solo se recalcula, sin pedir nada al servidor.
    if (!promoChangeDue(before, Date.now())) return arm();
    try {
      await refresh();
    } catch {
      // Sin red: se reintenta más tarde.
    }
    const after = weekendPromo();
    // Si el servidor aún no cambió (reloj del equipo adelantado), se reintenta en un minuto.
    arm(after && before && after.active === before.active ? PROMO_RETRY_MS : undefined);
  };
  // Al volver a la pestaña (equipo suspendido), se revisa enseguida.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (promoChangeDue(weekendPromo(), Date.now())) run();
      else arm();
    }
  });
  arm();
}
