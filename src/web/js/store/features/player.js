import { api, errorMessage } from '../api.js';
import { $, esc, setHtml } from '../dom.js';
import { cleanUid, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { modal, toast } from '../ui.js';
import { setCurrentOrder } from './orders.js';

// Verificación del jugador. No existe una API oficial pública para consultar nicknames: NO se
// hace scraping ni se usan fuentes no oficiales. El flujo es:
//   UID válido → pedido creado → el equipo verifica nickname y región con una fuente legítima
//   → el cliente confirma "Sí, es mi cuenta" → pago.

const PENDING_TEXT =
  'Nuestro equipo verificará el nickname y la región después de crear tu pedido. No pagarás nada hasta que confirmes que es tu cuenta.';

function renderUidAccepted() {
  setHtml(
    'playerResult',
    `<div class="player-main"><span class="player-bubble"><svg><use href="#icon-user"></use></svg></span><div><b>UID ${esc(state.playerUid)} listo ✓</b><small>${esc(PENDING_TEXT)}</small></div></div><div class="player-buttons"><button class="btn glass" id="changePlayer" type="button">Cambiar</button></div>`,
  );
  $('playerResult').hidden = false;
  $('changePlayer').onclick = () => resetPlayer(true);
}

/** Muestra el resultado del operador para que el cliente lo confirme explícitamente. */
function renderVerification(order) {
  const v = order.verification;
  setHtml(
    'playerResult',
    `<div class="player-main"><span class="player-bubble"><svg><use href="#icon-user"></use></svg></span><div><b>Vas a recargar a: ${esc(v.nickname)}</b><small>ID ${esc(order.playerUid)} · Región: ${esc(v.region)}</small></div></div><div class="player-buttons"><button class="btn primary" id="confirmPlayer" type="button">Sí, es mi cuenta</button><button class="btn glass" id="changePlayer" type="button">No es mi cuenta</button></div><div class="player-source-line">Verificado por el equipo de TayGameStore</div>`,
  );
  $('playerResult').hidden = false;
  $('confirmPlayer').onclick = () => confirmPlayer(true);
  $('changePlayer').onclick = () => confirmPlayer(false);
}

function renderMessage(text) {
  setHtml('playerResult', `<div class="finder-error">${esc(text)}</div>`);
  $('playerResult').hidden = false;
}

/** Sincroniza la sección de jugador con la orden actual (si existe). */
export function renderPlayer() {
  const order = state.currentOrder;
  if (!order) return;
  const v = order.verification || {};
  if (order.status === 'AWAITING_VERIFICATION' && v.status === 'VERIFIED')
    renderVerification(order);
  else if (order.status === 'AWAITING_VERIFICATION')
    renderMessage('Pedido creado. Estamos verificando el jugador; te avisaremos aquí.');
  else if (v.status === 'CONFIRMED' && v.nickname)
    setHtml(
      'playerResult',
      `<div class="player-main"><span class="player-bubble"><svg><use href="#icon-user"></use></svg></span><div><b>${esc(v.nickname)} ✓</b><small>ID ${esc(order.playerUid)} · ${esc(v.region || '')}</small></div></div>`,
    );
  else if (order.status === 'REJECTED')
    renderMessage('No pudimos confirmar ese jugador. Revisa el UID y crea un nuevo pedido.');
}

async function confirmPlayer(confirm) {
  const order = state.currentOrder;
  if (!order || runtime.playerBusy) return;
  runtime.playerBusy = true;
  try {
    const j = await api('/api/orders/' + encodeURIComponent(order.reference) + '/confirm-player', {
      method: 'POST',
      body: { confirm, nickname: order.verification.nickname },
    });
    setCurrentOrder(j.order);
    toast(
      confirm ? 'Cuenta confirmada. Ya puedes pagar.' : 'Pedido cancelado: no era tu cuenta.',
      confirm ? 'good' : '',
    );
    if (confirm) $('factura').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    toast(errorMessage(err), 'bad');
  } finally {
    runtime.playerBusy = false;
  }
}

export function resetPlayer(clearUid = true) {
  if (
    state.currentOrder &&
    !['REJECTED', 'EXPIRED', 'DELIVERED', 'REFUNDED'].includes(state.currentOrder.status)
  ) {
    toast(
      'Ya hay un pedido en curso con este jugador. Usa "Nueva factura" para empezar otro.',
      'bad',
    );
    return;
  }
  state.uidAccepted = false;
  if (clearUid) state.playerUid = '';
  if ($('playerUid')) $('playerUid').value = state.playerUid;
  const r = $('playerResult');
  if (r) {
    r.hidden = true;
    r.replaceChildren();
  }
  renderAll();
}

export function verifyPlayer() {
  if (state.game !== 'freefire') return;
  if (
    state.currentOrder &&
    !['REJECTED', 'EXPIRED', 'DELIVERED', 'REFUNDED'].includes(state.currentOrder.status)
  ) {
    toast('Este pedido ya tiene un jugador asignado.', 'bad');
    return;
  }
  const uid = cleanUid($('playerUid').value);
  $('playerUid').value = uid;
  if (!validUid(uid)) {
    renderMessage('El UID debe contener entre 6 y 12 dígitos.');
    state.uidAccepted = false;
    renderAll();
    return;
  }
  state.playerUid = uid;
  state.uidAccepted = true;
  renderUidAccepted();
  renderAll();
}

/** Modal "Buscar jugador por ID": valida el ID y lo usa; sin consultas a fuentes no oficiales. */
export function finderSearch() {
  const id = cleanUid($('finderUid').value);
  $('finderUid').value = id;
  if (!validUid(id)) {
    setHtml(
      'finderResult',
      '<div class="finder-error">El ID debe contener entre 6 y 12 dígitos.</div>',
    );
    return;
  }
  setHtml(
    'finderResult',
    `<div class="finder-live"><span class="finder-avatar"><svg><use href="#icon-user"></use></svg></span><div><small>ID VÁLIDO</small><strong>UID ${esc(id)}</strong><div class="finder-tags"><span class="finder-tag">Verificación por el equipo</span></div></div><div class="finder-source"><button class="btn primary" id="finderUseBtn" type="button">Usar este ID</button><small>El nickname y la región se confirman con una fuente oficial al crear el pedido.</small></div></div>`,
  );
  $('finderUseBtn').onclick = () => {
    $('playerUid').value = id;
    modal('playerFinderModal', false);
    verifyPlayer();
    $('verificacion').scrollIntoView({ behavior: 'smooth' });
  };
}

export { errorMessage as humanPlayerError };
