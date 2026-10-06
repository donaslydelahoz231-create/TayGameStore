import { $, setText } from '../dom.js';
import { state } from '../state.js';

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

/** Rellena la ventana "Radar promo" con el horario vigente. */
export function renderPromo() {
  const promo = weekendPromo();
  if (!promo) return;
  // El fin de la ventana es el lunes 00:00: se muestra el último minuto del domingo.
  const lastMinute = new Date(promo.endsAt.getTime() - 60_000);
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
