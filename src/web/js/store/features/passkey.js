import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { api, errorMessage } from '../api.js';
import { $ } from '../dom.js';
import { state } from '../state.js';
import { modal, toast } from '../ui.js';
import { bootstrapSession } from './account.js';
import { revealStore } from './entry.js';

// Llaves de acceso (passkeys): la cuenta se crea y se abre con la huella, el rostro o el PIN
// del dispositivo. El navegador firma un reto del servidor; la tienda nunca ve una contraseña.

let busy = false;

/** El servidor las ofrece y este navegador sabe usarlas. */
export function passkeysAvailable() {
  const cfg = state.serverConfig;
  if (state.previewOnly || !cfg?.auth?.passkey) return false;
  // Una llave solo vale en la dirección para la que se creó.
  if (cfg.passkeyOrigin && cfg.passkeyOrigin !== location.origin) return false;
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Cancelar en el diálogo del sistema no es un error que haya que explicar. */
function cancelled(error) {
  return error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}

function passkeyMessage(error, fallback) {
  if (error?.name === 'InvalidStateError')
    return 'Este dispositivo ya tiene una llave de esta cuenta.';
  return error?.code ? errorMessage(error) : fallback;
}

async function withBusy(buttons, task) {
  if (busy) return;
  busy = true;
  buttons.forEach((b) => b && (b.disabled = true));
  try {
    await task();
  } finally {
    busy = false;
    buttons.forEach((b) => b && (b.disabled = false));
  }
}

async function afterLogin(message) {
  await bootstrapSession();
  modal('loginModal', false);
  revealStore();
  toast(message, 'good');
}

export function loginWithPasskey() {
  return withBusy([$('passkeyLoginBtn'), $('passkeyCreateBtn')], async () => {
    try {
      const { options } = await api('/api/auth/passkey/login/options', {
        method: 'POST',
        body: {},
      });
      const response = await startAuthentication({ optionsJSON: options });
      await api('/api/auth/passkey/login/verify', { method: 'POST', body: { response } });
      await afterLogin('Entraste con tu llave de acceso.');
    } catch (error) {
      if (cancelled(error)) return toast('Inicio de sesión cancelado.');
      toast(
        passkeyMessage(error, 'No pudimos usar tu llave. Si no tienes una aquí, crea tu cuenta.'),
        'bad',
      );
    }
  });
}

/** Crea la cuenta (sin sesión) o añade una llave de este dispositivo (con sesión). */
export function createPasskey() {
  const adding = Boolean(state.session);
  return withBusy([$('passkeyLoginBtn'), $('passkeyCreateBtn'), $('menuPasskey')], async () => {
    try {
      const name = adding ? '' : ($('passkeyName')?.value || '').trim();
      const { options } = await api('/api/auth/passkey/register/options', {
        method: 'POST',
        body: name ? { name } : {},
      });
      const response = await startRegistration({ optionsJSON: options });
      await api('/api/auth/passkey/register/verify', { method: 'POST', body: { response } });
      if (adding) {
        toast('Llave de este dispositivo añadida a tu cuenta.', 'good');
        return;
      }
      await afterLogin('Cuenta creada: la próxima vez entra con tu llave de acceso.');
    } catch (error) {
      if (cancelled(error)) return toast('Creación de la llave cancelada.');
      toast(
        passkeyMessage(error, 'No pudimos crear la llave de acceso. Inténtalo de nuevo.'),
        'bad',
      );
    }
  });
}
