import { api } from '../api.js';
import { $, setText } from '../dom.js';
import { state } from '../state.js';
import { updateOAuthUI } from './account.js';

/** Textos de estado del servicio (cabecera, panel del hero y sección de jugador). */
export function renderService() {
  const cfg = state.serverConfig || {};
  const live = !!cfg.wompi?.configured && !!cfg.provider?.configured;
  const e = $('serverState');
  if (e) {
    e.className = 'service-state ' + (live ? ' ok' : '');
    e.querySelector('span').textContent = state.previewOnly
      ? 'Vista previa visual'
      : live
        ? 'Backend + pagos + proveedor listos'
        : cfg.ok
          ? 'Backend conectado · configuración pendiente'
          : 'Backend no configurado';
  }
  const heroStatus = state.localDemo
    ? 'Modo demo local · interfaz interactiva'
    : live
      ? 'Sistemas listos para operar'
      : cfg.ok
        ? 'Backend conectado · revisión pendiente'
        : 'Interfaz lista · backend pendiente';
  setText('serviceText', heroStatus);
  const op = state.previewOnly
    ? 'Modo visual · las acciones reales requieren servidor'
    : live
      ? 'Catálogo, verificación y checkout conectados'
      : cfg.ok
        ? 'Backend conectado, faltan integraciones'
        : 'Abre el proyecto con npm start para funciones reales';
  setText('operationText', op);
}

export async function bootstrapConfig() {
  if (state.localDemo) {
    renderService();
    updateOAuthUI();
    return;
  }
  try {
    state.serverConfig = await api('/api/config');
    renderService();
    updateOAuthUI();
  } catch {
    state.serverConfig = null;
    renderService();
    updateOAuthUI();
  }
}

export async function checkHealth() {
  if (state.previewOnly) return;
  try {
    const j = await api('/api/health');
    state.serverConfig = state.serverConfig || {};
    state.serverConfig.ok = true;
    state.serverConfig.wompi = { configured: j.wompi === 'configured' };
    state.serverConfig.provider = { configured: j.provider === 'online' };
    state.serverConfig.player = j.player || {};
    renderService();
  } catch {
    renderService();
  }
}
