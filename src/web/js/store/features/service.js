import { api } from '../api.js';
import { $, setText } from '../dom.js';
import { state } from '../state.js';
import { updateOAuthUI } from './account.js';
import { supportChannels } from './support.js';

/** Estado del servicio (cabecera, panel del hero y sección de jugador) según /api/config. */
export function renderService() {
  const cfg = state.serverConfig;
  // Cada método por su lado: la tienda opera si al menos uno está activo (Mercado Pago o Nequi).
  const methods = cfg?.paymentMethods ?? { mercadopago: !!cfg?.paymentsEnabled };
  const anyMethod = !!methods.mercadopago || !!methods.nequiManual;
  const live = !!cfg && cfg.checkoutEnabled && anyMethod && !cfg.maintenanceMode;
  // Cuenta de prueba de Mercado Pago (sin Nequi real): no se cobra dinero real.
  const sandbox = live && cfg.paymentsMode === 'sandbox' && !methods.nequiManual;
  const methodNames = [methods.mercadopago && 'Mercado Pago', methods.nequiManual && 'Nequi']
    .filter(Boolean)
    .join(' y ');
  const e = $('serverState');
  let label;
  if (state.previewOnly) label = 'Vista previa visual';
  else if (!cfg)
    label =
      state.serverReachable === false ? 'Sin conexión con el servidor' : 'Comprobando servicio';
  else if (cfg.maintenanceMode) label = 'Mantenimiento · solo consulta';
  else if (sandbox) label = 'Modo prueba · sin cobros reales';
  else if (live) label = 'Tienda operativa · ' + methodNames;
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
  renderOperationPanel(cfg, { live, sandbox, label, methodNames });
}

/** Fila del panel del inicio: `ok` activo, `partial` limitado o cargando, `off` no disponible. */
function setMeter(id, stateName, text, detail = '') {
  const row = $(id);
  if (!row) return;
  row.dataset.state = stateName;
  const value = row.querySelector('b');
  if (value) value.textContent = text;
  const note = row.querySelector('small');
  if (note) note.textContent = detail;
}

/**
 * Panel «Estado de la tienda»: lo que el cliente necesita saber antes de comprar, según
 * /api/config y el catálogo. Nunca cifras inventadas: lo que no se sabe se dice.
 */
function renderOperationPanel(cfg, { live, sandbox, label, methodNames }) {
  const tag = $('liveTag');
  if (tag) {
    tag.dataset.state = live ? (sandbox ? 'partial' : 'ok') : cfg ? 'off' : 'partial';
    tag.querySelector('span').textContent = state.previewOnly
      ? 'Vista previa'
      : !cfg
        ? state.serverReachable === false
          ? 'Sin conexión'
          : 'Conectando…'
        : sandbox
          ? 'Modo prueba'
          : live
            ? 'Tienda abierta'
            : cfg.maintenanceMode
              ? 'Mantenimiento'
              : 'Compras pausadas';
  }
  setText(
    'operationTitle',
    live
      ? 'Lista para tu próxima recarga'
      : cfg
        ? 'Compras pausadas por ahora'
        : 'Estado de la tienda',
  );
  setText(
    'operationText',
    state.previewOnly
      ? 'Modo visual · las acciones reales requieren servidor'
      : sandbox
        ? 'Pagos de prueba: no se cobra dinero real'
        : live
          ? 'Elige tu paquete, escribe tu ID y paga con ' + methodNames + '.'
          : label,
  );

  const count = state.products[state.game]?.length || 0;
  const catalog = {
    ready: ['ok', 'Activo', count === 1 ? '1 paquete disponible' : count + ' paquetes disponibles'],
    loading: ['partial', 'Cargando', 'Consultando precios…'],
    empty: ['off', 'Sin paquetes', 'No hay paquetes a la venta ahora'],
    error: ['off', 'No disponible', 'No se pudieron cargar los precios'],
  }[state.catalogStatus] || ['off', 'No disponible', ''];
  setMeter('meterCatalog', ...catalog);

  const { whatsapp, email } = supportChannels();
  const channels = [whatsapp && 'WhatsApp', email && 'correo'].filter(Boolean).join(' y ');
  setMeter(
    'meterSupport',
    ...(channels
      ? [
          'ok',
          channels.charAt(0).toUpperCase() + channels.slice(1),
          'Escríbenos con tu ID o tu pedido',
        ]
      : ['off', 'No disponible', 'Aún sin canales oficiales']),
  );

  if (!cfg) {
    const pending =
      state.serverReachable === false ? ['off', 'Sin conexión', ''] : ['partial', 'Cargando', ''];
    setMeter('meterPlayer', ...pending);
    setMeter('meterPayment', ...pending);
    setMeter('meterDelivery', ...pending);
    return;
  }
  // Sin proveedor de consulta, el equipo verifica el jugador a mano tras crear el pedido.
  setMeter(
    'meterPlayer',
    ...(cfg.playerLookup
      ? ['ok', 'Al instante', 'Confirmas tu nick antes de pagar']
      : ['partial', 'Manual', 'El equipo revisa tu ID antes del cobro']),
  );
  setMeter(
    'meterPayment',
    ...(sandbox
      ? ['partial', 'Prueba', 'Sin cobros reales']
      : live
        ? ['ok', 'Activo', methodNames]
        : ['off', 'Pausado', 'No se reciben pagos ahora']),
  );
  setMeter(
    'meterDelivery',
    ...(cfg.deliveryTime
      ? ['ok', cfg.deliveryTime, 'Con el pago confirmado']
      : ['partial', 'Ver términos', 'Plazo indicado en los términos']),
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
