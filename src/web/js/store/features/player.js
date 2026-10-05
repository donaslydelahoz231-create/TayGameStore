import { api, ApiError, errorMessage } from '../api.js';
import { $, esc, setHtml, setText } from '../dom.js';
import { cleanUid, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { modal, toast } from '../ui.js';
import { setCurrentOrder } from './orders.js';

// Verificación del jugador. Dos caminos, decididos por el servidor (`/api/config`):
//   • Consulta instantánea (como LootBar): solo si hay un proveedor autorizado configurado.
//     UID → nickname y región → "Sí, es mi cuenta" → el pedido nace listo para pagar.
//   • Manual: UID válido → pedido → el equipo verifica → el cliente confirma → pago.
// Si la consulta no está disponible o falla, se pasa al camino manual automáticamente.
// NO se hace scraping ni se consultan fuentes no oficiales desde el navegador.

const PENDING_TEXT =
  'Nuestro equipo verificará el nickname y la región después de crear tu pedido. No pagarás nada hasta que confirmes que es tu cuenta.';

const LOOKUP_TIMEOUT_MS = 12000;
/** Errores con los que se pasa al flujo manual (el operador verifica después). */
const FALLBACK_CODES = new Set([
  'PLAYER_LOOKUP_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK',
]);

const OPEN_ORDER_DONE = ['REJECTED', 'EXPIRED', 'DELIVERED', 'REFUNDED'];

export function lookupEnabled() {
  const cfg = state.serverConfig;
  return Boolean(cfg && cfg.playerLookup && cfg.checkoutEnabled && !cfg.maintenanceMode);
}

function hasOpenOrder() {
  return Boolean(state.currentOrder && !OPEN_ORDER_DONE.includes(state.currentOrder.status));
}

function bubble() {
  return '<span class="player-bubble"><svg><use href="#icon-user"></use></svg></span>';
}

function showResult(html) {
  setHtml('playerResult', html);
  $('playerResult').hidden = false;
}

function renderUidAccepted() {
  showResult(
    `<div class="player-main">${bubble()}<div><b>UID ${esc(state.playerUid)} listo ✓</b><small>${esc(PENDING_TEXT)}</small></div></div><div class="player-buttons"><button class="btn glass" id="changePlayer" type="button">Cambiar</button></div>`,
  );
  $('changePlayer').onclick = () => resetPlayer(true);
}

function renderSearching(uid) {
  showResult(
    `<div class="player-main" aria-busy="true">${bubble()}<div><b>Buscando jugador…</b><small>ID ${esc(uid)}</small></div></div>`,
  );
}

/** Resultado de la consulta instantánea: el cliente debe confirmarlo explícitamente. */
function renderLookup() {
  const found = state.playerLookup;
  if (!found) return;
  if (found.confirmed) {
    showResult(
      `<div class="player-main">${bubble()}<div><b>${esc(found.nickname)} ✓</b><small>ID ${esc(found.uid)} · Región: ${esc(found.region)}</small></div></div><div class="player-buttons"><button class="btn glass" id="changePlayer" type="button">Cambiar</button></div><div class="player-source-line">Cuenta confirmada. Completa tus datos y crea el pedido.</div>`,
    );
    $('changePlayer').onclick = () => resetPlayer(true);
    return;
  }
  showResult(
    `<div class="player-main">${bubble()}<div><b>Vas a recargar a: ${esc(found.nickname)}</b><small>ID ${esc(found.uid)} · Región: ${esc(found.region)}</small></div></div><div class="player-buttons"><button class="btn primary" id="confirmLookup" type="button">Sí, es mi cuenta</button><button class="btn glass" id="changePlayer" type="button">Cambiar</button></div><div class="player-source-line">Revisa el nickname antes de continuar: la recarga no se puede revertir.</div>`,
  );
  $('confirmLookup').onclick = confirmLookup;
  $('changePlayer').onclick = () => resetPlayer(true);
  $('confirmLookup').focus({ preventScroll: true });
}

function confirmLookup() {
  const found = state.playerLookup;
  if (!found || found.uid !== state.playerUid) return;
  found.confirmed = true;
  state.uidAccepted = true;
  renderLookup();
  renderAll();
  toast('Cuenta confirmada.', 'good');
}

/** Muestra el resultado del operador para que el cliente lo confirme explícitamente. */
function renderVerification(order) {
  const v = order.verification;
  showResult(
    `<div class="player-main">${bubble()}<div><b>Vas a recargar a: ${esc(v.nickname)}</b><small>ID ${esc(order.playerUid)} · Región: ${esc(v.region)}</small></div></div><div class="player-buttons"><button class="btn primary" id="confirmPlayer" type="button">Sí, es mi cuenta</button><button class="btn glass" id="changePlayer" type="button">No es mi cuenta</button></div><div class="player-source-line">Verificado por el equipo de TayGameStore</div>`,
  );
  $('confirmPlayer').onclick = () => confirmPlayer(true);
  $('changePlayer').onclick = () => confirmPlayer(false);
}

function renderMessage(text) {
  showResult(`<div class="finder-error">${esc(text)}</div>`);
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
    showResult(
      `<div class="player-main">${bubble()}<div><b>${esc(v.nickname)} ✓</b><small>ID ${esc(order.playerUid)} · ${esc(v.region || '')}</small></div></div>`,
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

/** Olvida la consulta y el UID aceptado (sin tocar el campo de texto). */
function clearPlayerChoice() {
  state.uidAccepted = false;
  state.playerLookup = null;
  const r = $('playerResult');
  if (r) {
    r.hidden = true;
    r.replaceChildren();
  }
}

export function resetPlayer(clearUid = true) {
  if (hasOpenOrder()) {
    toast(
      'Ya hay un pedido en curso con este jugador. Usa "Nueva factura" para empezar otro.',
      'bad',
    );
    return;
  }
  clearPlayerChoice();
  if (clearUid) state.playerUid = '';
  if ($('playerUid')) $('playerUid').value = state.playerUid;
  renderAll();
}

/** Al editar el UID, lo aceptado o consultado antes deja de valer. */
export function onPlayerUidInput(value) {
  if (hasOpenOrder()) return;
  if ((state.uidAccepted || state.playerLookup) && value !== state.playerUid) {
    clearPlayerChoice();
    renderAll();
  }
}

/** La consulta caducó o no coincide (409 en el checkout): hay que volver a buscar. */
export function lookupExpired() {
  clearPlayerChoice();
  renderMessage('La verificación del jugador caducó. Pulsa "Verificar" para consultarlo de nuevo.');
  renderAll();
}

/**
 * Consulta el ID en el servidor. Devuelve el resultado, o `{ fallback: true }` si se debe usar
 * el flujo manual, o `{ error }` con un mensaje para el cliente.
 */
async function lookupUid(uid) {
  try {
    const j = await api('/api/player/lookup', {
      method: 'POST',
      body: { game: 'freefire', uid },
      timeoutMs: LOOKUP_TIMEOUT_MS,
    });
    return {
      found: {
        ref: j.lookupRef,
        nickname: j.nickname,
        region: j.region,
        expiresAt: j.expiresAt,
        uid,
        confirmed: false,
      },
    };
  } catch (err) {
    if (err instanceof ApiError && FALLBACK_CODES.has(err.code)) return { fallback: true };
    return { error: errorMessage(err, 'No pudimos consultar ese ID.') };
  }
}

function acceptManually(uid) {
  state.playerUid = uid;
  state.playerLookup = null;
  state.uidAccepted = true;
  renderUidAccepted();
  renderAll();
}

/** Aplica el resultado de una consulta (botón Verificar o buscador). */
function applyLookupResult(uid, result) {
  if (result.found) {
    state.playerUid = uid;
    state.uidAccepted = false;
    state.playerLookup = result.found;
    renderLookup();
    renderAll();
  } else if (result.fallback) {
    acceptManually(uid);
    toast('No pudimos consultar el ID ahora. Nuestro equipo lo verificará al crear tu pedido.');
  } else {
    clearPlayerChoice();
    state.playerUid = uid;
    renderMessage(result.error);
    renderAll();
  }
}

export async function verifyPlayer() {
  if (state.game !== 'freefire' || runtime.playerBusy) return;
  if (hasOpenOrder()) {
    toast('Este pedido ya tiene un jugador asignado.', 'bad');
    return;
  }
  const uid = cleanUid($('playerUid').value);
  $('playerUid').value = uid;
  if (!validUid(uid)) {
    clearPlayerChoice();
    renderMessage('El UID debe contener entre 6 y 12 dígitos.');
    renderAll();
    return;
  }
  if (!lookupEnabled()) {
    acceptManually(uid);
    return;
  }
  runtime.playerBusy = true;
  $('verifyBtn').disabled = true;
  renderSearching(uid);
  try {
    const result = await lookupUid(uid);
    // El cliente cambió el UID mientras se consultaba: se descarta la respuesta.
    if (cleanUid($('playerUid').value) !== uid) {
      clearPlayerChoice();
      renderAll();
      return;
    }
    applyLookupResult(uid, result);
  } finally {
    runtime.playerBusy = false;
    $('verifyBtn').disabled = false;
  }
}

function useFinderId(id, found) {
  $('playerUid').value = id;
  modal('playerFinderModal', false);
  if (found) applyLookupResult(id, { found });
  else verifyPlayer();
  $('verificacion').scrollIntoView({ behavior: 'smooth' });
}

/** Modal "Buscar jugador por ID": consulta instantánea si está disponible; si no, valida el ID. */
export async function finderSearch() {
  if (runtime.playerBusy) return;
  const id = cleanUid($('finderUid').value);
  $('finderUid').value = id;
  if (!validUid(id)) {
    setHtml(
      'finderResult',
      '<div class="finder-error">El ID debe contener entre 6 y 12 dígitos.</div>',
    );
    return;
  }
  if (hasOpenOrder()) {
    setHtml(
      'finderResult',
      '<div class="finder-error">Ya hay un pedido en curso. Usa "Nueva factura" para buscar otro jugador.</div>',
    );
    return;
  }
  let found = null;
  if (lookupEnabled()) {
    runtime.playerBusy = true;
    $('finderSearchBtn').disabled = true;
    setHtml(
      'finderResult',
      `<div class="finder-empty" aria-busy="true"><b>Buscando jugador…</b><small>ID ${esc(id)}</small></div>`,
    );
    try {
      const result = await lookupUid(id);
      if (result.error) {
        setHtml('finderResult', `<div class="finder-error">${esc(result.error)}</div>`);
        return;
      }
      found = result.found || null;
    } finally {
      runtime.playerBusy = false;
      $('finderSearchBtn').disabled = false;
    }
  }
  const head = found
    ? `<small>JUGADOR ENCONTRADO</small><strong>${esc(found.nickname)}</strong><div class="finder-tags"><span class="finder-tag">ID ${esc(id)}</span><span class="finder-tag">${esc(found.region)}</span></div>`
    : `<small>ID VÁLIDO</small><strong>UID ${esc(id)}</strong><div class="finder-tags"><span class="finder-tag">Verificación por el equipo</span></div>`;
  const note = found
    ? 'Confirmarás que es tu cuenta antes de pagar.'
    : 'El nickname y la región se confirman con una fuente oficial al crear el pedido.';
  setHtml(
    'finderResult',
    `<div class="finder-live"><span class="finder-avatar"><svg><use href="#icon-user"></use></svg></span><div>${head}</div><div class="finder-source"><button class="btn primary" id="finderUseBtn" type="button">Usar este ID</button><small>${esc(note)}</small></div></div>`,
  );
  $('finderUseBtn').onclick = () => useFinderId(id, found);
}

/** Textos de ayuda según el modo de verificación que ofrece el servidor. */
export function renderPlayerMode() {
  if (!lookupEnabled()) return;
  setText(
    'playerHint',
    'Escribe tu ID y pulsa Verificar: verás el nickname y la región al instante para confirmar tu cuenta.',
  );
  setText('finderLead', 'Escribe el ID y verás el nickname y la región antes de comprar.');
  setText(
    'finderNoteText',
    'Consultamos el ID con nuestro proveedor autorizado. Nunca te pediremos la contraseña del juego.',
  );
}

export { errorMessage as humanPlayerError };
