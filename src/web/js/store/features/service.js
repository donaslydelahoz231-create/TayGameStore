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
  renderOperationMeters(cfg, live, sandbox);
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

/** Fila del panel del inicio: `ok` activo, `partial` limitado o cargando, `off` no disponible. */
function setMeter(id, stateName, text) {
  const row = $(id);
  if (!row) return;
  row.dataset.state = stateName;
  const value = row.querySelector('b');
  if (value) value.textContent = text;
}

/** Panel "Estado de operación": refleja /api/config y el catálogo, nunca cifras inventadas. */
function renderOperationMeters(cfg, live, sandbox) {
  const catalog = {
    ready: ['ok', 'Activo'],
    loading: ['partial', 'Cargando'],
    empty: ['off', 'Sin paquetes'],
    error: ['off', 'No disponible'],
  }[state.catalogStatus] || ['off', 'No disponible'];
  setMeter('meterCatalog', ...catalog);
  if (!cfg) {
    const pending =
      state.serverReachable === false ? ['off', 'Sin conexión'] : ['partial', 'Cargando'];
    setMeter('meterPlayer', ...pending);
    setMeter('meterPayment', ...pending);
    return;
  }
  // Sin proveedor de consulta, el equipo verifica el jugador a mano tras crear el pedido.
  setMeter('meterPlayer', ...(cfg.playerLookup ? ['ok', 'Al instante'] : ['partial', 'Manual']));
  setMeter(
    'meterPayment',
    ...(sandbox ? ['partial', 'Prueba'] : live ? ['ok', 'Activo'] : ['off', 'Pausado']),
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
  // Solo se promete el correo si el servidor de verdad lo envía.
  const emailHint = document.getElementById('emailUpdatesHint');
  if (emailHint) emailHint.hidden = !state.serverConfig?.emailUpdates;
}
