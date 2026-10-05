import { api } from '../api.js';
import { $, setText } from '../dom.js';
import { state } from '../state.js';
import { updateOAuthUI } from './account.js';

/** Estado del servicio (cabecera, panel del hero y sección de jugador) según /api/config. */
export function renderService() {
  const cfg = state.serverConfig;
  const live = !!cfg && cfg.checkoutEnabled && cfg.paymentsEnabled && !cfg.maintenanceMode;
  // Cuenta de prueba de Mercado Pago: se dice en todas partes que no se cobra dinero real.
  const sandbox = live && cfg.paymentsMode === 'sandbox';
  const e = $('serverState');
  let label;
  if (state.previewOnly) label = 'Vista previa visual';
  else if (!cfg)
    label =
      state.serverReachable === false ? 'Sin conexión con el servidor' : 'Comprobando servicio';
  else if (cfg.maintenanceMode) label = 'Mantenimiento · solo consulta';
  else if (sandbox) label = 'Modo prueba · Mercado Pago sandbox';
  else if (live) label = 'Tienda operativa · Mercado Pago';
  else if (cfg.checkoutEnabled) label = 'Pedidos habilitados · pagos pendientes';
  else label = 'Compras pausadas temporalmente';
  if (e) {
    e.className = 'service-state ' + (live ? ' ok' : '');
    e.querySelector('span').textContent = label;
  }
  setText(
    'serviceText',
    sandbox ? 'Modo prueba: sin cobros reales' : live ? 'Sistemas listos para operar' : label,
  );
  setText(
    'operationText',
    state.previewOnly
      ? 'Modo visual · las acciones reales requieren servidor'
      : sandbox
        ? 'Pagos de prueba con Mercado Pago sandbox: no se cobra dinero real'
        : live
          ? 'Catálogo, verificación y pagos con Mercado Pago'
          : label,
  );
}

export async function bootstrapConfig() {
  if (state.previewOnly) {
    renderService();
    updateOAuthUI();
    return;
  }
  try {
    state.serverConfig = await api('/api/config', { timeoutMs: 8000 });
    state.serverReachable = true;
  } catch {
    state.serverConfig = null;
    state.serverReachable = false;
  }
  renderService();
  updateOAuthUI();
}
