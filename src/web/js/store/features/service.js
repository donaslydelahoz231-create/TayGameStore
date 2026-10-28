import { api } from '../api.js';
import { priceOf } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { money } from '../format.js';
import { state } from '../state.js';
import { updateOAuthUI } from './account.js';

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
function setMeter(id, stateName, text) {
  const row = $(id);
  if (!row) return;
  row.dataset.state = stateName;
  const value = row.querySelector('b');
  if (value) value.textContent = text;
}

// Un plazo corto («24 horas») cabe como valor de la fila; uno largo se lee en la sección «Entrega»
// y en los términos, y la fila dice cómo llega la recarga.
const SHORT_DELIVERY = 16;
const clock = (date) => date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/** Precio más bajo a la venta («$ 3.800»), sin «COP» y sin partirse en dos líneas. */
function lowestPrice() {
  const list = state.products[state.game] || [];
  const prices = list.filter((p) => p.providerAvailable !== false).map(priceOf);
  if (!prices.length) return '';
  return money(Math.min(...prices))
    .replace(' COP', '')
    .replace('$ ', '$\u00a0');
}

/** Línea bajo el título: el precio «desde» resaltado y lo que más importa después. */
function setOperationText(from, rest) {
  const text = $('operationText');
  if (!text) return;
  if (!from) {
    text.textContent = rest;
    return;
  }
  const price = document.createElement('strong');
  price.textContent = 'Desde ' + from;
  text.replaceChildren(price, ' · ' + rest);
}

/**
 * Panel «Estado de operación»: lo justo para decidir la compra, según /api/config y el catálogo.
 * Nunca cifras inventadas: lo que no se sabe no se muestra.
 */
function renderOperationPanel(cfg, { live, sandbox, label, methodNames }) {
  const panelState = live ? (sandbox ? 'partial' : 'ok') : cfg ? 'off' : 'partial';
  const panel = document.querySelector('.hero-panel');
  if (panel) panel.dataset.state = panelState;
  const tag = $('liveTag');
  if (tag) {
    tag.dataset.state = panelState;
    tag.querySelector('span').textContent = state.previewOnly
      ? 'Vista previa'
      : !cfg
        ? state.serverReachable === false
          ? 'Sin conexión'
          : 'Conectando…'
        : sandbox
          ? 'Modo prueba'
          : live
            ? 'Live store'
            : cfg.maintenanceMode
              ? 'Mantenimiento'
              : 'Pausada';
  }
  // Cuándo se comprobó por última vez el estado con el servidor (no un reloj decorativo).
  setText(
    'heroChecked',
    state.configCheckedAt ? 'Actualizado ' + clock(state.configCheckedAt) : 'Comprobando…',
  );
  setText(
    'operationTitle',
    live
      ? 'Listo para tu próxima recarga'
      : cfg
        ? cfg.maintenanceMode
          ? 'Tienda en mantenimiento'
          : 'Compras pausadas por ahora'
        : state.serverReachable === false
          ? 'Sin conexión con la tienda'
          : 'Comprobando la tienda…',
  );
  const from = live && state.catalogStatus === 'ready' ? lowestPrice() : '';
  if (state.previewOnly)
    setOperationText('', 'Modo visual · las acciones reales requieren servidor');
  else if (sandbox) setOperationText(from, 'pagos de prueba, sin cobros reales');
  else if (live) setOperationText(from, methodNames);
  else setOperationText('', label);

  setMeter(
    'meterCatalog',
    ...({
      ready: ['ok', 'Activo'],
      loading: ['partial', 'Cargando'],
      empty: ['off', 'Sin paquetes'],
      error: ['off', 'No disponible'],
    }[state.catalogStatus] || ['off', 'No disponible']),
  );
  if (!cfg) {
    const pending =
      state.serverReachable === false ? ['off', 'Sin conexión'] : ['partial', 'Cargando'];
    setMeter('meterPlayer', ...pending);
    setMeter('meterPayment', ...pending);
    setMeter('meterDelivery', ...pending);
    return;
  }
  // Sin proveedor de consulta, el equipo verifica el jugador a mano tras crear el pedido.
  setMeter('meterPlayer', ...(cfg.playerLookup ? ['ok', 'Al instante'] : ['partial', 'Manual']));
  setMeter(
    'meterPayment',
    ...(sandbox ? ['partial', 'Prueba'] : live ? ['ok', 'Activo'] : ['off', 'Pausado']),
  );
  // Entrega: el plazo publicado si es corto; si no, cómo llega la recarga (a tu ID de jugador).
  const plazo = cfg.deliveryTime;
  const arrives = plazo && plazo.length <= SHORT_DELIVERY ? plazo : 'A tu ID';
  setMeter(
    'meterDelivery',
    ...(sandbox ? ['partial', arrives] : live ? ['ok', arrives] : ['off', 'Pausada']),
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
  state.configCheckedAt = new Date();
  renderService();
  updateOAuthUI();
  // Solo se promete el correo si el servidor de verdad lo envía.
  const emailHint = document.getElementById('emailUpdatesHint');
  if (emailHint) emailHint.hidden = !state.serverConfig?.emailUpdates;
}
