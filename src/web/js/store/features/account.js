import { api } from '../api.js';
import { countItems } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { closeMenus, toast } from '../ui.js';
import { revealStore } from './entry.js';
import { passkeysAvailable } from './passkey.js';

// Cuenta del cliente: Google (OIDC) o invitado. El acceso con correo y contraseña no está
// habilitado (no hay recuperación segura sin proveedor de correo): el formulario no envía nada.

const OAUTH_PROVIDERS = ['google', 'facebook', 'discord'];
const PROVIDER_NAMES = { google: 'Google', facebook: 'Facebook', discord: 'Discord' };

/** Motivos de error del login (códigos fijos del servidor; nunca se muestra texto de la URL). */
const LOGIN_ERRORS = {
  cancelado: 'Cancelaste el acceso.',
  estado: 'La sesión de acceso caducó. Inténtalo de nuevo.',
  sin_permiso: 'Esta cuenta no puede acceder.',
  bloqueado: 'Esta cuenta no puede acceder. Contacta a soporte.',
  google: 'Google no respondió. Inténtalo de nuevo.',
  facebook: 'Facebook no respondió. Inténtalo de nuevo.',
  discord: 'Discord no respondió. Inténtalo de nuevo.',
  no_configurado: 'Ese acceso no está configurado.',
  en_uso: 'Esa cuenta ya está vinculada a otro usuario de TayGameStore.',
  sesion: 'Inicia sesión para vincular otra cuenta.',
};

export function renderHeader() {
  const name = state.session?.name || 'Invitado';
  setText('accountName', name);
  setText('menuName', name);
  setText('menuMode', state.session ? 'Cuenta TayGameStore' : 'Compra como invitado');
  const items = countItems();
  setText('cartBadge', items);
  // Nombre accesible explícito: Safari/WebKit no lo deriva de los <span> con iconos SVG.
  $('accountBtn')?.setAttribute('aria-label', `Cuenta: ${name}`);
  $('cartBtn')?.setAttribute(
    'aria-label',
    `Carrito, ${items} ${items === 1 ? 'producto' : 'productos'}`,
  );
}

/** "Cuentas vinculadas": solo redes configuradas en el servidor; vincular exige la sesión. */
function renderLinkedAccounts() {
  const box = $('menuLinks'),
    list = $('menuLinksList');
  if (!box || !list) return;
  const auth = state.serverConfig?.auth || {};
  const available = OAUTH_PROVIDERS.filter((p) => auth[p]);
  box.hidden = !state.session || !available.length;
  if (box.hidden) return;
  list.replaceChildren(
    ...available.map((provider) => {
      const linked = state.session.linked?.includes(provider);
      const el = document.createElement(linked ? 'span' : 'a');
      el.className = 'menu-link' + (linked ? ' linked' : '');
      el.textContent = linked
        ? `${PROVIDER_NAMES[provider]} ✓`
        : `Vincular ${PROVIDER_NAMES[provider]}`;
      if (!linked) el.href = `/auth/${provider}?vincular=1`;
      return el;
    }),
  );
}

export function renderAccount() {
  renderLinkedAccounts();
  const guest = !state.session;
  setText('accountName', state.session?.name || 'Invitado');
  setText('menuName', state.session?.name || 'Invitado');
  setText('menuMode', state.session ? 'Cuenta TayGameStore' : 'Compra como invitado');
  $('menuLogin').hidden = !guest;
  const addPasskey = $('menuPasskey');
  if (addPasskey) addPasskey.hidden = guest || !passkeysAvailable();
  const admin = $('menuAdmin');
  if (admin) admin.hidden = !state.session?.adminEntry;
  $('menuLogout').hidden = false;
  const label = $('menuLogout')?.querySelector('[data-logout-label]');
  if (label) label.textContent = state.session ? 'Cerrar sesión' : 'Salir del modo invitado';
}

export function openAccountMenu() {
  const m = $('accountMenu');
  if (!m) return;
  const open = m.hidden;
  m.hidden = !open;
  $('accountBtn').setAttribute('aria-expanded', String(open));
}

/** "Google, Facebook o Discord" con solo las redes disponibles. */
function providerList(providers) {
  const names = providers.map((p) => PROVIDER_NAMES[p]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names.at(-1)}` : names[0] || '';
}

/**
 * Solo se ofrecen los accesos que el servidor tiene configurados (un cliente no debe ver
 * botones apagados). Si no hay ninguno, la compra como invitado pasa a ser la opción principal.
 */
export function updateOAuthUI() {
  const cfg = state.serverConfig;
  const auth = cfg?.auth || {};
  // Sin respuesta del servidor (o en vista previa) no se sabe qué hay: se muestran todos.
  const known = !!cfg && !state.previewOnly;
  const available = OAUTH_PROVIDERS.filter((p) => auth[p]);
  for (const prov of OAUTH_PROVIDERS) {
    const el = $(prov + 'State'),
      link = document.querySelector(`[data-provider="${prov}"]`);
    const ok = !!auth[prov];
    if (el)
      el.textContent = state.previewOnly
        ? 'Servidor requerido'
        : ok
          ? 'Disponible'
          : 'No disponible';
    if (link) {
      link.classList.toggle('disabled', !ok);
      link.setAttribute('aria-disabled', String(!ok));
      link.hidden = known && !ok;
    }
  }
  const grid = $('oauthGrid');
  if (grid) grid.dataset.count = String(known ? available.length : OAUTH_PROVIDERS.length);
  const passkey = passkeysAvailable();
  const passkeyBox = $('passkeyBox');
  if (passkeyBox) passkeyBox.hidden = !passkey;
  const noOAuth = known && available.length === 0;
  const guestOnly = noOAuth && !passkey;
  const shown = known ? available : OAUTH_PROVIDERS;
  document
    .querySelectorAll('#loginModal [data-oauth-only]')
    .forEach((node) => (node.hidden = noOAuth));
  const divider = $('authDivider');
  if (divider) divider.hidden = guestOnly;
  const guest = $('guestBtn');
  if (guest) guest.className = guestOnly ? 'btn primary full' : 'text-btn inline';
  const mailNote = cfg?.emailUpdates ? ' y te enviamos el comprobante a tu correo' : '';
  setText(
    'authSubtitle',
    guestOnly
      ? `Compra sin crear cuenta: solo necesitas tu ID de jugador y tu correo. Tu pedido queda guardado en este navegador${mailNote}.`
      : noOAuth
        ? 'Entra o crea tu cuenta con tu llave de acceso (huella, rostro o PIN de tu dispositivo) para conservar tu historial, o compra como invitado.'
        : `Entra con ${passkey ? 'tu llave de acceso o con ' : ''}${providerList(shown)} para conservar tu historial de pedidos.`,
  );
  setText(
    'authNote',
    guestOnly
      ? 'No necesitas contraseña. TayGameStore no guarda datos de tarjetas: pagas en Mercado Pago.'
      : passkey
        ? 'Tu llave de acceso queda en tu dispositivo: TayGameStore no guarda contraseñas ni datos de tarjetas (pagas en Mercado Pago).'
        : `Entra con ${providerList(shown)}, o compra como invitado. TayGameStore no guarda contraseñas ni datos de tarjetas: pagas en Mercado Pago.`,
  );
}

export async function bootstrapSession() {
  const q = new URLSearchParams(location.search);
  if (q.has('acceso')) {
    if (q.get('acceso') === 'ok') toast('Acceso completado.', 'good');
    else if (q.get('acceso') === 'vinculado') toast('Cuenta vinculada.', 'good');
    else toast(LOGIN_ERRORS[q.get('motivo')] || 'No se pudo completar el acceso.', 'bad');
    q.delete('acceso');
    q.delete('motivo');
    history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
  if (state.previewOnly) return;
  try {
    const j = await api('/api/auth/me');
    state.session = j.authenticated
      ? {
          name: j.user.name,
          email: j.user.email,
          linked: j.linked || [],
          // Solo llega para la cuenta del dueño: dirección de su panel (entrar pide Google + código).
          adminEntry: typeof j.adminEntry === 'string' ? j.adminEntry : null,
        }
      : null;
    renderAccount();
    if (state.session) revealStore();
  } catch {
    // Sin servidor: se continúa como invitado y la interfaz muestra el estado del servicio.
  }
}

export async function logout() {
  if (state.session) {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      toast('No se pudo cerrar la sesión en el servidor. Inténtalo de nuevo.', 'bad');
      return;
    }
  }
  state.session = null;
  closeMenus();
  renderAll();
  toast('Sesión cerrada.', 'good');
}

/** Ir al panel desde la sesión de cliente del dueño. */
export function openAdminPanel() {
  const entry = state.session?.adminEntry;
  if (entry && /^\/[A-Za-z0-9_.-]+$/.test(entry)) location.assign(entry);
}
