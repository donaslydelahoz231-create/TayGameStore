import { api } from '../api.js';
import { countItems } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { EMAIL_PATTERN } from '../format.js';
import { renderAll } from '../render.js';
import { state } from '../state.js';
import { closeMenus, modal, toast } from '../ui.js';
import { revealStore } from './entry.js';

// Cuenta del cliente. El acceso con contraseña y OAuth dependen del backend
// (no implementado todavía: ver docs/PLAN-ARQUITECTURA.md).

const OAUTH_PROVIDERS = ['google', 'facebook', 'discord', 'vk'];

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
      el.textContent = state.localDemo
        ? 'Servidor requerido'
        : ok
          ? 'Disponible'
          : 'No configurado';
    if (link) {
      link.classList.toggle('disabled', !ok && !state.localDemo);
      link.setAttribute('aria-disabled', String(!ok && !state.localDemo));
    }
  }
}

export async function login(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim().toLowerCase(),
    password = $('loginPassword').value,
    name = $('registerName').value.trim(),
    reg = state.authMode === 'register';
  if (!EMAIL_PATTERN.test(email) || password.length < 8 || (reg && name.length < 2)) {
    setText(
      'loginError',
      reg
        ? 'Completa nombre, correo y contraseña de mínimo 8 caracteres.'
        : 'Escribe un correo válido y una contraseña de mínimo 8 caracteres.',
    );
    $('loginError').classList.add('show');
    return;
  }
  $('loginSubmit').disabled = true;
  setText('loginSubmit', reg ? 'Creando…' : 'Entrando…');
  $('loginError').classList.remove('show');
  try {
    if (state.localDemo) {
      state.session = {
        name: reg ? name || email.split('@')[0] : email.split('@')[0],
        email,
        id: 'demo-user',
      };
      modal('loginModal', false);
      revealStore();
      renderAll();
      toast(reg ? 'Cuenta demo creada.' : 'Sesión demo iniciada.', 'good');
      return;
    }
    const j = await api(reg ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(reg ? { name, email, password } : { email, password }),
    });
    state.session = {
      name: j.user?.name || email,
      email: j.user?.email || email,
      id: j.user?.id,
    };
    modal('loginModal', false);
    revealStore();
    renderAll();
    toast(reg ? 'Cuenta creada.' : 'Sesión iniciada.', 'good');
  } catch (err) {
    setText('loginError', err.message || 'No se pudo completar el acceso.');
    $('loginError').classList.add('show');
  } finally {
    $('loginSubmit').disabled = false;
    setText('loginSubmit', reg ? 'Crear cuenta' : 'Entrar');
  }
}

export async function bootstrapSession() {
  if (state.localDemo) return;
  try {
    const j = await api('/api/auth/me');
    state.session = j.authenticated
      ? { name: j.user.name, email: j.user.email, id: j.user.id }
      : null;
    renderAccount();
    if (state.session) revealStore();
    const q = new URLSearchParams(location.search);
    if (q.get('auth') === 'success') toast('Acceso completado.', 'good');
    if (q.get('auth') === 'error')
      toast(q.get('message') || 'No se pudo completar el acceso.', 'bad');
    if (q.has('auth')) history.replaceState({}, '', location.pathname + location.hash);
  } catch {
    // Sin backend o sin sesión: se continúa como invitado.
  }
}

export async function logout() {
  if (!state.localDemo) {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // El cierre local se completa aunque el backend no responda.
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
    ? 'Crea tu cuenta TayGameStore para consultar tus pedidos.'
    : 'Usa tu cuenta para consultar tus pedidos y conservar el historial.';
  $('switchAuthMode').textContent = r ? 'Iniciar sesión' : 'Crear cuenta';
  $('loginSubmit').textContent = r ? 'Crear cuenta' : 'Entrar';
  $('loginError').classList.remove('show');
}
