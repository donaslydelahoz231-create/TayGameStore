import { api } from '../api.js';
import { countItems } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { closeMenus, toast } from '../ui.js';
import { revealStore } from './entry.js';

// Cuenta del cliente: Google (OIDC) o invitado. El acceso con correo y contraseña no está
// habilitado (no hay recuperación segura sin proveedor de correo): el formulario no envía nada.

const OAUTH_PROVIDERS = ['google', 'facebook', 'discord', 'vk'];

/** Motivos de error del login (códigos fijos del servidor; nunca se muestra texto de la URL). */
const LOGIN_ERRORS = {
  cancelado: 'Cancelaste el acceso con Google.',
  estado: 'La sesión de acceso caducó. Inténtalo de nuevo.',
  sin_permiso: 'Esta cuenta no tiene acceso de administración.',
  bloqueado: 'Esta cuenta no puede acceder. Contacta a soporte.',
  google: 'Google no respondió. Inténtalo de nuevo.',
  no_configurado: 'El acceso con Google no está configurado.',
};

export function renderHeader() {
  const name = state.session?.name || 'Invitado';
  setText('accountName', name);
  setText('menuName', name);
  setText('menuMode', state.session ? 'Cuenta TayGameStore' : 'Compra como invitado');
  setText('cartBadge', countItems());
}

export function renderAccount() {
  const guest = !state.session;
  setText('accountName', state.session?.name || 'Invitado');
  setText('menuName', state.session?.name || 'Invitado');
  setText('menuMode', state.session ? 'Cuenta TayGameStore' : 'Compra como invitado');
  $('menuLogin').hidden = !guest;
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

export function updateOAuthUI() {
  const auth = state.serverConfig?.auth || {};
  for (const prov of OAUTH_PROVIDERS) {
    const el = $(prov + 'State'),
      link = document.querySelector(`[data-provider="${prov}"]`);
    const ok = !!auth[prov];
    if (el)
      el.textContent = state.previewOnly
        ? 'Servidor requerido'
        : ok
          ? 'Disponible'
          : 'No configurado';
    if (link) {
      link.classList.toggle('disabled', !ok);
      link.setAttribute('aria-disabled', String(!ok));
    }
  }
}

export function login(e) {
  e.preventDefault();
  setText(
    'loginError',
    'El acceso con correo y contraseña no está disponible. Entra con Google o continúa como invitado.',
  );
  $('loginError').classList.add('show');
  $('loginPassword').value = '';
}

export async function bootstrapSession() {
  const q = new URLSearchParams(location.search);
  if (q.has('acceso')) {
    if (q.get('acceso') === 'ok') toast('Acceso completado.', 'good');
    else toast(LOGIN_ERRORS[q.get('motivo')] || 'No se pudo completar el acceso.', 'bad');
    q.delete('acceso');
    q.delete('motivo');
    history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
  if (state.previewOnly) return;
  try {
    const j = await api('/api/auth/me');
    state.session = j.authenticated ? { name: j.user.name, email: j.user.email } : null;
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

export function switchAuthMode() {
  state.authMode = state.authMode === 'login' ? 'register' : 'login';
  const r = state.authMode === 'register';
  $('registerNameWrap').hidden = !r;
  $('authTitle').textContent = r ? 'Crear cuenta' : 'Acceso cliente';
  $('authSubtitle').textContent = r
    ? 'Crea tu cuenta con Google para consultar tus pedidos.'
    : 'Usa tu cuenta de Google para consultar tus pedidos y conservar el historial.';
  $('switchAuthMode').textContent = r ? 'Iniciar sesión' : 'Crear cuenta';
  $('loginSubmit').textContent = r ? 'Crear cuenta' : 'Entrar';
  $('loginError').classList.remove('show');
}
