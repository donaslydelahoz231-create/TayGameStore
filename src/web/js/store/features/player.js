import { api } from '../api.js';
import { $, esc, setHtml } from '../dom.js';
import { cleanUid, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { toast } from '../ui.js';

// Verificación de jugador. No hay una fuente real configurada: sin backend, la consulta
// falla y la UI lo muestra. El modo demo devuelve un jugador ficticio claramente marcado.

const PLAYER_ERRORS = {
  SERVER_REQUIRED: 'Ejecuta TayGameStore con npm start para consultar jugadores reales.',
  HTTP_404:
    'El backend no tiene publicada la ruta de consulta del jugador (/api/player/lookup ni /api/nickname). El HTML está listo, pero falta esa ruta en el servidor.',
  PLAYER_NOT_FOUND: 'No se encontró el jugador.',
  PLAYER_REGION_UNRESOLVED: 'No fue posible confirmar la región real del jugador.',
  PLAYER_SOURCES_MISMATCH: 'Las fuentes de verificación devolvieron datos distintos.',
  LIOGAMES_NOT_CONFIGURED: 'El servicio de verificación del proveedor no está configurado.',
  USERNAME_API_LIMIT_REACHED: 'Se alcanzó el límite de consultas del servicio de usuario.',
};

export function humanPlayerError(code) {
  return PLAYER_ERRORS[code] || code || 'No fue posible verificar el jugador.';
}

export async function playerLookup(uid) {
  const q = encodeURIComponent(uid);
  const custom = (window.TGS_CONFIG && window.TGS_CONFIG.playerLookupUrl) || '';
  const endpoints = [];
  if (custom)
    endpoints.push(
      custom.includes('{uid}')
        ? custom.replaceAll('{uid}', q)
        : custom + (custom.includes('?') ? '&' : '?') + 'uid=' + q,
    );
  endpoints.push('/api/player/lookup?uid=' + q + '&fresh=1', '/api/nickname?id=' + q);
  let last = null;
  for (const endpoint of endpoints) {
    try {
      return await api(endpoint);
    } catch (err) {
      last = err;
      if (err.message !== 'HTTP_404') throw err;
    }
  }
  throw last || new Error('HTTP_404');
}

export function demoPlayer(uid) {
  return {
    ok: true,
    found: true,
    uid,
    nickname: 'Jugador TGS · Demo',
    region: 'DEMO',
    regionLabel: 'Región de prueba',
    sources: ['Simulación local · conectar backend para datos reales'],
    demo: true,
  };
}

export function resetPlayer(clearUid = true) {
  state.verified = false;
  state.nickname = '';
  state.region = '';
  state.regionLabel = '';
  state.regionSources = [];
  if (clearUid) state.playerUid = '';
  if ($('playerUid')) $('playerUid').value = state.playerUid;
  const r = $('playerResult');
  if (r) {
    r.hidden = true;
    r.replaceChildren();
  }
  renderAll();
}

export async function verifyPlayer() {
  if (runtime.playerBusy || state.game !== 'freefire') return;
  const uid = cleanUid($('playerUid').value);
  $('playerUid').value = uid;
  if (!validUid(uid)) {
    setHtml(
      'playerResult',
      '<div class="finder-error">El UID debe contener entre 6 y 12 dígitos.</div>',
    );
    $('playerResult').hidden = false;
    return;
  }
  runtime.playerBusy = true;
  state.verified = false;
  state.nickname = '';
  state.region = '';
  $('verifyBtn').disabled = true;
  $('playerResult').hidden = false;
  setHtml(
    'playerResult',
    '<div class="player-main"><span class="player-bubble">?</span><div><b style="color:var(--cyan)">Consultando jugador…</b><small>Nickname + región</small></div></div>',
  );
  try {
    const j = state.localDemo ? demoPlayer(uid) : await playerLookup(uid);
    if (!j.ok || !j.nickname) throw new Error(j.error || 'PLAYER_LOOKUP_FAILED');
    state.playerUid = j.uid || uid;
    state.nickname = j.nickname;
    state.region = j.region || '';
    state.regionLabel = j.regionLabel || state.region;
    state.regionSources = j.sources || [];
    $('playerResult').innerHTML =
      `<div class="player-main"><span class="player-bubble"><svg><use href="#icon-user"></use></svg></span><div><b>${esc(j.nickname)} ✓</b><small>ID ${esc(j.uid)}${j.region ? ' · ' + esc(j.regionLabel || j.region) : ''}</small></div></div><div class="player-buttons"><button class="btn primary" id="confirmPlayer" type="button">Confirmar jugador</button><button class="btn glass" id="changePlayer" type="button">Cambiar</button></div><div class="player-source-line">${esc((j.sources || []).join(' · ') || 'fuente live')}</div>`;
    $('confirmPlayer').onclick = () => {
      state.verified = true;
      renderAll();
      toast(
        state.localDemo ? 'Jugador de demostración confirmado.' : 'Jugador confirmado.',
        'good',
      );
    };
    $('changePlayer').onclick = () => resetPlayer(true);
    renderAll();
  } catch (err) {
    state.verified = false;
    setHtml(
      'playerResult',
      '<div class="finder-error">' + esc(humanPlayerError(err.message)) + '</div>',
    );
    $('playerResult').hidden = false;
    renderAll();
  } finally {
    runtime.playerBusy = false;
    $('verifyBtn').disabled = false;
  }
}

/** Modal "Buscar jugador por ID". */
export async function finderSearch() {
  const id = cleanUid($('finderUid').value);
  $('finderUid').value = id;
  if (!validUid(id)) {
    setHtml(
      'finderResult',
      '<div class="finder-error">El ID debe contener entre 6 y 12 dígitos.</div>',
    );
    return;
  }
  $('finderSearchBtn').disabled = true;
  setHtml(
    'finderResult',
    '<div class="finder-empty"><svg><use href="#icon-search"></use></svg><b>Consultando jugador…</b><small>Comprobando nickname y región.</small></div>',
  );
  try {
    const j = state.localDemo ? demoPlayer(id) : await playerLookup(id);
    setHtml(
      'finderResult',
      `<div class="finder-live"><span class="finder-avatar"><svg><use href="#icon-user"></use></svg></span><div><small>${j.demo ? 'MODO DEMO LOCAL' : 'NICKNAME ENCONTRADO'}</small><strong>${esc(j.nickname)}</strong><div class="finder-tags"><span class="finder-tag">UID ${esc(j.uid)}</span><span class="finder-tag region">${esc(j.region || '—')} · ${esc(j.regionLabel || j.region || 'No disponible')}</span></div></div><div class="finder-source"><b>✓ ${j.demo ? 'DEMO' : 'VERIFICADO'}</b><small>${esc((j.sources || []).join(' · ') || 'fuente live')}</small></div></div>`,
    );
  } catch (err) {
    setHtml(
      'finderResult',
      '<div class="finder-error">' + esc(humanPlayerError(err.message)) + '</div>',
    );
  } finally {
    $('finderSearchBtn').disabled = false;
  }
}
