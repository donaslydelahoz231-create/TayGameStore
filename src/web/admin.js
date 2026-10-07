// Panel de administración de TayGameStore. Toda la autorización ocurre en el servidor:
// ocultar o mostrar un botón aquí no concede ningún permiso.
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import qrcode from 'qrcode-generator';
import { api, ApiError, errorMessage } from './js/store/api.js';
import { $, esc } from './js/store/dom.js';
import { money } from './js/store/format.js';

const STATUS_LABEL = {
  AWAITING_VERIFICATION: 'Verificar jugador',
  AWAITING_PAYMENT: 'Esperando pago',
  PAID: 'Pagado',
  DELIVERING: 'Entregando',
  DELIVERED: 'Entregado',
  NEEDS_REVIEW: 'En revisión',
  EXPIRED: 'Vencido',
  REJECTED: 'Rechazado',
  REFUNDED: 'Reembolsado',
};
const pillClass = (s) =>
  ['PAID', 'DELIVERED', 'APPROVED'].includes(s)
    ? 'ok'
    : [
          'NEEDS_REVIEW',
          'NEEDS_REFUND',
          'DISPUTED',
          'UNKNOWN',
          'REJECTED',
          'EXPIRED',
          'REFUNDED',
        ].includes(s)
      ? 'bad'
      : 'warn';
const pill = (s, label) => `<span class="adm-pill ${pillClass(s)}">${esc(label || s)}</span>`;
const fmtDate = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';

let selectedOrderId = null;

function message(text, type = '') {
  const el = $('admMessage');
  el.textContent = text;
  el.className = 'adm-message ' + type;
}

function show(id) {
  for (const section of ['admLogin', 'admMfaSetup', 'admMfaVerify', 'admApp'])
    $(section).hidden = section !== id;
}

async function call(path, options) {
  try {
    return await api(path, options);
  } catch (err) {
    // Sin sesión de administrador el servidor responde 404 (el panel no existe para otros):
    // si la sesión caducó, se vuelve a la pantalla de acceso.
    if (
      err instanceof ApiError &&
      (err.code === 'UNAUTHORIZED' || err.code === 'MFA_REQUIRED' || err.code === 'NOT_FOUND')
    ) {
      await boot();
    }
    throw err;
  }
}

async function run(action, success) {
  try {
    const result = await action();
    if (success) message(success, 'good');
    return result;
  } catch (err) {
    message(errorMessage(err), 'bad');
    return undefined;
  }
}

/** Evita el doble clic: el botón queda inactivo mientras su acción está en curso. */
async function busy(button, task) {
  if (!button || button.disabled) return undefined;
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.disabled = false;
  }
}

/** Los códigos de la app se leen con espacios («123 456»): solo cuentan los dígitos. */
const digits = (value) => value.replace(/\D/g, '');

// ── Sesión y MFA ──

/** Modo de la cuenta de Mercado Pago, visible siempre para el operador. */
async function showPaymentsMode() {
  try {
    const cfg = await api('/api/config');
    // Google solo se ofrece si el servidor lo tiene configurado.
    $('admGoogleLogin').hidden = !cfg.auth?.google;
    const mode = $('admMode');
    if (!cfg.paymentsMode) return;
    mode.hidden = false;
    mode.textContent =
      cfg.paymentsMode === 'sandbox' ? 'Mercado Pago: MODO PRUEBA' : 'Mercado Pago: PRODUCCIÓN';
    mode.classList.toggle('sandbox', cfg.paymentsMode === 'sandbox');
  } catch {
    // Informativo: si falla, el resto del panel sigue funcionando.
  }
}

async function boot() {
  void showPaymentsMode();
  let me;
  try {
    me = await api('/api/auth/me');
  } catch (err) {
    message(errorMessage(err, 'No se pudo contactar al servidor.'), 'bad');
    show('admLogin');
    return;
  }
  $('admLogout').hidden = !me.authenticated;
  $('admAsCustomer').hidden = !(me.admin && me.admin.mfaVerified);
  $('admPasskeyAdd').hidden = !(me.admin && me.admin.mfaVerified && passkeySupported());
  $('admWho').textContent = me.authenticated ? me.user.email : 'Sin sesión';
  if (!me.authenticated || !me.admin) return show('admLogin');
  // Entrar con huella o llave ya es verificación en dos pasos (dispositivo + huella/PIN).
  if (!me.admin.mfaVerified) return show(me.admin.mfaEnabled ? 'admMfaVerify' : 'admMfaSetup');
  show('admApp');
  updateNotifyButton();
  await loadOrdersTab();
}

// Cambiar a cliente: misma cuenta, sin permisos de panel. Volver pide Google + código otra vez.
$('admAsCustomer').onclick = async () => {
  const done = await run(() => api('/api/admin/sesion/cliente', { method: 'POST' }));
  if (done) location.assign(done.redirect || '/');
};

// ── Huella o llave de acceso (solo administrador) ──

function passkeySupported() {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/** Cancelar en el diálogo del sistema no es un error. */
const cancelled = (err) => err && (err.name === 'NotAllowedError' || err.name === 'AbortError');

async function passkeyRun(task, success) {
  if (!passkeySupported()) {
    message('Este navegador no admite huella o llave de acceso.', 'bad');
    return;
  }
  try {
    await task();
    if (success) message(success, 'good');
  } catch (err) {
    if (cancelled(err)) return message('Operación cancelada.', '');
    if (err?.name === 'InvalidStateError') {
      return message('Este dispositivo ya tiene una llave de esta cuenta.', 'bad');
    }
    // Frase incorrecta o huella ya activada: el servidor responde como si no existiera (404).
    if (err instanceof ApiError && err.code === 'NOT_FOUND') {
      return message('Frase de activación incorrecta, o la huella ya estaba activada.', 'bad');
    }
    message(errorMessage(err, 'No se pudo usar la llave de acceso.'), 'bad');
  }
}

$('admPasskeyLogin').onclick = (e) =>
  busy(e.currentTarget, () =>
    passkeyRun(async () => {
      const { options } = await api('/api/auth/admin/passkey/login/options', {
        method: 'POST',
        body: {},
      });
      const response = await startAuthentication({ optionsJSON: options });
      await api('/api/auth/admin/passkey/login/verify', { method: 'POST', body: { response } });
      await boot();
    }),
  );

$('admPasswordForm').onsubmit = (e) => {
  e.preventDefault();
  busy(e.currentTarget.querySelector('button[type="submit"]'), () =>
    run(async () => {
      await api('/api/auth/admin/password/login', {
        method: 'POST',
        body: { email: $('admEmail').value.trim(), password: $('admPassword').value },
      });
      $('admPassword').value = '';
      await boot();
    }),
  );
};

$('admPasswordSetupBtn').onclick = (e) => {
  const button = e.currentTarget;
  if (!$('admSetupCode').value.trim()) return message('Escribe la frase de activación.', 'bad');
  const password = $('admNewPassword').value;
  if (password.length < 12)
    return message('La contraseña debe tener al menos 12 caracteres.', 'bad');
  if (password !== $('admNewPassword2').value) {
    return message('Las contraseñas no coinciden.', 'bad');
  }
  busy(button, () =>
    run(async () => {
      try {
        await api('/api/auth/admin/password/setup', {
          method: 'POST',
          body: { code: $('admSetupCode').value.trim(), password },
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          throw new ApiError(
            'SETUP_REJECTED',
            'Frase de activación incorrecta, o la contraseña ya estaba creada.',
          );
        }
        throw err;
      }
      $('admNewPassword').value = '';
      $('admNewPassword2').value = '';
      await boot();
    }, 'Contraseña creada. Ahora configura Google Authenticator.'),
  );
};

$('admChangePassword').onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await call('/api/admin/password', {
      method: 'POST',
      body: { current: $('admCurrentPassword').value, password: $('admNextPassword').value },
    });
    $('admCurrentPassword').value = '';
    $('admNextPassword').value = '';
  }, 'Contraseña cambiada.');
};

$('admPasskeySetupBtn').onclick = (e) => {
  const code = $('admSetupCode').value.trim();
  if (!code) return message('Escribe la frase de activación.', 'bad');
  busy(e.currentTarget, () =>
    passkeyRun(async () => {
      const { options } = await api('/api/auth/admin/passkey/setup/options', {
        method: 'POST',
        body: { code },
      });
      const response = await startRegistration({ optionsJSON: options });
      await api('/api/auth/admin/passkey/register/verify', { method: 'POST', body: { response } });
      $('admSetupCode').value = '';
      await boot();
    }, 'Huella activada. La próxima vez entra con «Entrar con huella o llave».'),
  );
};

$('admPasskeyAdd').onclick = () =>
  passkeyRun(async () => {
    const { options } = await api('/api/auth/admin/passkey/add/options', {
      method: 'POST',
      body: {},
    });
    const response = await startRegistration({ optionsJSON: options });
    await api('/api/auth/admin/passkey/register/verify', { method: 'POST', body: { response } });
  }, 'Huella de este equipo añadida.');

$('admLogout').onclick = async () => {
  await run(() => api('/api/auth/logout', { method: 'POST' }));
  location.reload();
};

/** QR de la clave, generado en el navegador: la clave nunca sale hacia otro servicio. */
function qrDataUrl(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

$('admMfaStart').onclick = (e) =>
  busy(e.currentTarget, () =>
    run(async () => {
      const j = await call('/api/admin/mfa/setup', { method: 'POST' });
      $('admMfaSecret').textContent = j.secret;
      $('admMfaQr').src = qrDataUrl(j.otpauthUri);
      $('admMfaOpen').href = j.otpauthUri;
      $('admMfaSecretBox').hidden = false;
      $('admMfaEnableCode').focus();
    }),
  );

$('admMfaEnable').onclick = (e) =>
  busy(e.currentTarget, async () => {
    const code = digits($('admMfaEnableCode').value);
    if (code.length !== 6) return message('Escribe los 6 dígitos que muestra la app.', 'bad');
    try {
      const j = await call('/api/admin/mfa/enable', { method: 'POST', body: { code } });
      $('admRecoveryCodes').textContent = j.recoveryCodes.join('\n');
      $('admRecovery').hidden = false;
      $('admMfaSecretBox').hidden = true;
      message('Verificación en dos pasos activada.', 'good');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_INVALID') {
        return message(
          'Código incorrecto. Usa la entrada «TayGameStore» de Google Authenticator añadida con ESTA clave, ' +
            'escribe el código antes de que cambie y revisa que la hora del celular sea automática.',
          'bad',
        );
      }
      message(errorMessage(err), 'bad');
    }
  });

$('admRecoveryDone').onclick = () => boot();

$('admMfaVerifyBtn').onclick = (e) =>
  busy(e.currentTarget, () =>
    run(async () => {
      await call('/api/admin/mfa/verify', {
        method: 'POST',
        body: { code: digits($('admMfaCode').value) },
      });
      await boot();
    }),
  );

$('admRecoveryBtn').onclick = (e) =>
  busy(e.currentTarget, () =>
    run(async () => {
      await call('/api/admin/mfa/verify', {
        method: 'POST',
        body: { recoveryCode: $('admRecoveryInput').value.trim() },
      });
      await boot();
    }, 'Código de recuperación usado. Genera nuevos si te quedan pocos.'),
  );

// ── Pestañas ──

document.querySelectorAll('.adm-tabs button').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.adm-tabs button')
      .forEach((b) => b.classList.toggle('active', b === button));
    document
      .querySelectorAll('.adm-tab')
      .forEach((tab) => (tab.hidden = tab.id !== 'tab-' + button.dataset.tab));
    const loaders = {
      orders: loadOrdersTab,
      products: loadProducts,
      inventory: loadInventory,
      blocklist: loadBlocks,
      audit: loadAudit,
    };
    loaders[button.dataset.tab]?.();
  }),
);

// ── Aviso de pedidos pagados ──
// Con el panel abierto (aunque esté en segundo plano), cada pedido que Mercado Pago confirma
// suena, sale como notificación del sistema y queda contado en el título de la pestaña.

const BASE_TITLE = document.title;
const canNotify = 'Notification' in window;
const AudioCtx = window.AudioContext;
let lastPaidToDeliver = null;
let chime = null;

function updateNotifyButton() {
  const button = $('admNotify');
  // Sin notificaciones (p. ej. Safari de iPhone fuera de la app) queda el sonido.
  button.hidden = $('admApp').hidden || (!canNotify && !AudioCtx);
  const state = canNotify ? Notification.permission : 'denied';
  const done = state !== 'default' && (chime !== null || !AudioCtx);
  button.textContent = done
    ? state === 'granted'
      ? 'Avisos activados'
      : 'Sonido activado (sin notificaciones en este navegador)'
    : state === 'default'
      ? 'Activar avisos de pedidos pagados'
      : 'Activar sonido de avisos';
  button.disabled = done;
}

$('admNotify').onclick = async () => {
  // El sonido solo puede prepararse tras un gesto del usuario (política de autoplay).
  if (AudioCtx) chime ??= new AudioCtx();
  if (canNotify && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => 'denied');
  }
  updateNotifyButton();
};

function playChime() {
  if (!chime) return;
  const at = chime.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = chime.createOscillator();
    const gain = chime.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.2, at + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.18 + 0.3);
    osc.connect(gain).connect(chime.destination);
    osc.start(at + i * 0.18);
    osc.stop(at + i * 0.18 + 0.32);
  }
}

function announcePaid(total) {
  document.title = total > 0 ? `(${total}) Pagados por entregar · ${BASE_TITLE}` : BASE_TITLE;
  const fresh = lastPaidToDeliver === null ? 0 : total - lastPaidToDeliver;
  lastPaidToDeliver = total;
  if (fresh <= 0) return;
  playChime();
  if (!canNotify || Notification.permission !== 'granted') return;
  try {
    new Notification('Pedido pagado por entregar', {
      body:
        fresh === 1
          ? 'Mercado Pago confirmó un pago. Entrega los diamantes desde el panel.'
          : `Mercado Pago confirmó ${fresh} pagos. Entrega los diamantes desde el panel.`,
      tag: 'tgs-paid',
    });
  } catch {
    // Chrome para Android no permite `new Notification` (exige Service Worker): quedan el
    // sonido, el título y la alerta del panel.
  }
}

// ── Pedidos ──

async function loadAlerts() {
  const a = await call('/api/admin/alerts');
  const items = [
    ['paidToDeliver', 'Pagados por entregar', 'ok'],
    ['awaitingVerification', 'Por verificar', 'warn'],
    ['paidWithoutDelivery', 'Pagados sin entregar (+30 min)', 'bad'],
    ['needsReview', 'En revisión', 'bad'],
    ['needsRefund', 'Pagos por reembolsar', 'bad'],
    ['paymentsPendingTooLong', 'Pagos pendientes (+1 h)', 'warn'],
    ['invalidWebhooks24h', 'Webhooks inválidos (24 h)', 'bad'],
    ['autoBlocks24h', 'Bloqueos automáticos (24 h)', 'warn'],
    ['activeIpBlocks', 'IPs bloqueadas ahora', 'warn'],
    ['mfaLocks24h', 'Cuentas admin con MFA bloqueado (24 h)', 'bad'],
    ['notificationsFailed', 'Avisos sin enviar (correo/Telegram/n8n)', 'bad'],
  ];
  const lowStock = Array.isArray(a.lowStock) ? a.lowStock : [];
  $('admAlerts').innerHTML =
    items
      .map(
        ([key, label, level]) =>
          `<div class="adm-alert ${a[key] ? level : ''}"><b>${Number(a[key])}</b>${esc(label)}</div>`,
      )
      .join('') +
    (lowStock.length
      ? `<div class="adm-alert warn"><b>${lowStock.length}</b>Inventario bajo: ${lowStock.map(esc).join(', ')}</div>`
      : '');
  // Después de pintar: un fallo del aviso nunca deja el panel sin datos.
  announcePaid(Number(a.paidToDeliver) || 0);
}

async function loadOrders() {
  const params = new URLSearchParams();
  if ($('admStatus').value) params.set('status', $('admStatus').value);
  if ($('admSearch').value.trim()) params.set('q', $('admSearch').value.trim());
  const j = await call('/api/admin/orders?' + params);
  const body = $('admOrders');
  body.replaceChildren();
  if (!j.orders.length) body.innerHTML = '<tr><td colspan="5">Sin pedidos.</td></tr>';
  for (const o of j.orders) {
    const tr = document.createElement('tr');
    tr.className = o.id === selectedOrderId ? 'selected' : '';
    tr.innerHTML = `<td>${esc(o.reference)}</td><td>${pill(o.status, STATUS_LABEL[o.status])}</td><td>${esc(o.playerUid)}</td><td>${money(o.totalCop)}</td><td>${fmtDate(o.createdAt)}</td>`;
    tr.onclick = () => selectOrder(o.id);
    body.appendChild(tr);
  }
}

async function loadOrdersTab() {
  await run(async () => {
    await Promise.all([loadAlerts(), loadOrders()]);
    if (selectedOrderId) await selectOrder(selectedOrderId);
  });
}

$('admReload').onclick = loadOrdersTab;
$('admStatus').onchange = loadOrdersTab;
$('admSearch').onkeydown = (e) => {
  if (e.key === 'Enter') loadOrdersTab();
};

async function orderAction(path, body, success) {
  const detail = await run(
    () => call(`/api/admin/orders/${selectedOrderId}/${path}`, { method: 'POST', body }),
    success,
  );
  if (detail) {
    renderDetail(detail);
    await run(() => Promise.all([loadAlerts(), loadOrders()]));
  }
}

async function selectOrder(id) {
  selectedOrderId = id;
  const detail = await run(() => call('/api/admin/orders/' + id));
  if (detail) renderDetail(detail);
}

function renderDetail(d) {
  const o = d.order;
  const v = d.verification;
  const f = d.fulfillment;
  const box = $('admDetail');
  box.innerHTML = `<h2>${esc(o.reference)} ${pill(o.status, STATUS_LABEL[o.status])}</h2>
    <dl>
      <dt>Cliente</dt><dd>${esc(o.customerName)} · ${esc(o.customerEmail)}</dd>
      <dt>UID</dt><dd>${esc(o.playerUid)}</dd>
      <dt>Jugador</dt><dd>${pill(v.status)} ${esc(v.nickname || '')} ${esc(v.region || '')}${v.note === 'cliente' ? ' · ID confirmado por el cliente (escrito dos veces): entrégalo a este UID' : ''}</dd>
      <dt>Productos</dt><dd>${o.items.map((i) => `${i.quantity}× ${esc(i.name)} (${money(i.lineTotalCop)})`).join('<br>')}</dd>
      <dt>Total</dt><dd>${money(o.totalCop)}</dd>
      <dt>Vence</dt><dd>${fmtDate(o.expiresAt)}</dd>
      <dt>Entrega</dt><dd>${f ? pill(f.status) + (f.evidence ? ' · ' + esc(f.evidence) : '') : '—'}</dd>
    </dl>
    <div id="admDetailActions"></div>
    ${inventoryBlock(d)}
    <h3>Pagos (Mercado Pago)</h3>
    <div class="adm-table-wrap" tabindex="0" role="region" aria-label="Tabla: pagos de Mercado Pago"><table class="adm-table"><thead><tr><th>ID MP</th><th>Estado</th><th>MP</th><th>Importe</th><th>Correcto</th></tr></thead><tbody>${
      d.payments
        .map(
          (p) =>
            `<tr><td>${esc(p.providerPaymentId)}</td><td>${pill(p.status)}${p.isOrderPayment ? ' ★' : ''}</td><td>${esc(p.providerStatus)} ${esc(p.providerStatusDetail || '')}</td><td>${money(p.amountCop)} ${esc(p.currency)}</td><td>${p.amountMatches ? 'Sí' : 'NO'}</td></tr>`,
        )
        .join('') || '<tr><td colspan="5">Sin pagos.</td></tr>'
    }</tbody></table></div>
    <h3>Historial</h3>
    <div class="adm-table-wrap" tabindex="0" role="region" aria-label="Tabla: historial del pedido"><table class="adm-table"><tbody>${d.history
      .map(
        (h) =>
          `<tr><td>${fmtDate(h.createdAt)}</td><td>${esc(h.action)}</td><td>${esc(h.fromStatus || '')} → ${esc(h.toStatus || '')}</td><td>${esc(h.actorType)}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  renderActions(d);
  bindInventoryBlock();
}

/** PIN del inventario reservados para el pedido: copiar, liberar (sin usar) o anular. */
function inventoryBlock(d) {
  const codes = d.inventory || [];
  if (!codes.length) return '';
  return `<h3>PIN reservados del inventario</h3>
    <p class="adm-note">Canjéalos en el canal oficial al UID del pedido y luego marca «Entregar».</p>
    <div class="adm-table-wrap" tabindex="0" role="region" aria-label="Tabla: PIN del pedido"><table class="adm-table"><tbody>${codes
      .map(
        (c) =>
          `<tr><td>${esc(c.sku)}</td><td><code>${esc(c.code)}</code></td><td>${pill(c.status)}</td><td>${
            c.status === 'ASSIGNED'
              ? `<button class="adm-btn ghost" type="button" data-copy="${esc(c.code)}">Copiar</button> <button class="adm-btn ghost" type="button" data-inv="${esc(c.id)}" data-inv-action="release">Liberar</button> <button class="adm-btn ghost" type="button" data-inv="${esc(c.id)}" data-inv-action="void">Anular</button>`
              : ''
          }</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
}

function bindInventoryBlock() {
  document.querySelectorAll('#admDetail [data-copy]').forEach((button) => {
    button.onclick = () =>
      navigator.clipboard?.writeText(button.dataset.copy).then(
        () => message('PIN copiado.', 'good'),
        () => message('No se pudo copiar; selecciónalo a mano.', 'bad'),
      );
  });
  document.querySelectorAll('#admDetail [data-inv]').forEach((button) => {
    button.onclick = () => {
      const action = button.dataset.invAction;
      const question =
        action === 'void'
          ? '¿Anular este PIN? Úsalo solo si ya no sirve (canjeado o ilegible).'
          : '¿Devolver este PIN al inventario? Solo si NO lo canjeaste.';
      if (!confirm(question)) return;
      run(
        async () => {
          await call('/api/admin/inventory/' + button.dataset.inv, {
            method: 'POST',
            body: { action },
          });
          await selectOrder(selectedOrderId);
        },
        action === 'void' ? 'PIN anulado.' : 'PIN devuelto al inventario.',
      );
    };
  });
}

function input(id, label, attrs = '') {
  return `<label for="${id}">${esc(label)}</label><input id="${id}" ${attrs}>`;
}

function renderActions(d) {
  const o = d.order;
  const f = d.fulfillment;
  const box = $('admDetailActions');
  const parts = [];
  if (
    o.status === 'AWAITING_VERIFICATION' &&
    ['PENDING', 'VERIFIED'].includes(d.verification.status)
  ) {
    parts.push(`<h3>Verificar jugador</h3><p class="adm-small">Consulta el UID en una fuente oficial o legítima. Nunca inventes el nickname.</p>
      <label for="vResult">Resultado</label><select id="vResult"><option value="VERIFIED">Verificado</option><option value="NOT_FOUND">No existe</option><option value="AMBIGUOUS">Ambiguo</option><option value="BLOCKED_ACCOUNT">Cuenta bloqueada</option></select>
      ${input('vNick', 'Nickname', 'maxlength="40"')}${input('vRegion', 'Región', 'maxlength="40"')}${input('vNote', 'Nota (opcional)', 'maxlength="200"')}
      <div class="adm-actions"><button class="adm-btn" id="vSave" type="button">Guardar verificación</button></div>`);
  }
  if (f && f.status === 'READY_FOR_FULFILLMENT')
    parts.push(
      '<div class="adm-actions"><button class="adm-btn" data-f="claim" type="button">Reclamar entrega</button></div>',
    );
  if (f && f.status === 'CLAIMED')
    parts.push(
      '<div class="adm-actions"><button class="adm-btn" data-f="start" type="button">Iniciar entrega</button><button class="adm-btn ghost" data-f="release" type="button">Liberar</button></div>',
    );
  if (f && f.status === 'DELIVERING') {
    parts.push(`${input('fEvidence', 'Evidencia de entrega (ID de transacción del proveedor, captura…)', 'maxlength="500"')}
      <div class="adm-actions"><button class="adm-btn" data-f="deliver" type="button">Marcar entregado</button></div>
      ${input('fReason', 'Motivo del fallo', 'maxlength="300"')}<div class="adm-actions"><button class="adm-btn danger" data-f="fail" type="button">Marcar fallida</button></div>`);
  }
  if (o.status === 'NEEDS_REVIEW') {
    parts.push(`<h3>Resolver revisión</h3><p class="adm-small">Los reembolsos se hacen en el panel de Mercado Pago; después pulsa "Conciliar".</p>
      <label for="rRes">Resolución</label><select id="rRes"><option value="resume_fulfillment">Reanudar entrega (pago válido)</option><option value="close">Cerrar (sin cobro vigente)</option></select>
      ${input('rNote', 'Nota', 'maxlength="300"')}<div class="adm-actions"><button class="adm-btn" id="rSave" type="button">Resolver</button></div>`);
  }
  parts.push(
    '<div class="adm-actions"><button class="adm-btn ghost" id="cRec" type="button">Conciliar con Mercado Pago</button></div>',
  );
  box.innerHTML = parts.join('');
  $('vSave')?.addEventListener('click', () => {
    const result = $('vResult').value;
    const body =
      result === 'VERIFIED'
        ? {
            result,
            nickname: $('vNick').value.trim(),
            region: $('vRegion').value.trim(),
            ...(($('vNote').value.trim() && { note: $('vNote').value.trim() }) || {}),
          }
        : { result, ...(($('vNote').value.trim() && { note: $('vNote').value.trim() }) || {}) };
    orderAction('verification', body, 'Verificación guardada.');
  });
  box.querySelectorAll('[data-f]').forEach((button) =>
    button.addEventListener('click', () => {
      const action = button.dataset.f;
      const body = { action };
      if (action === 'deliver') body.evidence = $('fEvidence').value.trim();
      if (action === 'fail') body.reason = $('fReason').value.trim();
      orderAction('fulfillment', body, 'Entrega actualizada.');
    }),
  );
  $('rSave')?.addEventListener('click', () =>
    orderAction(
      'review',
      { resolution: $('rRes').value, note: $('rNote').value.trim() },
      'Revisión resuelta.',
    ),
  );
  $('cRec')?.addEventListener('click', () =>
    orderAction('reconcile', undefined, 'Conciliado con Mercado Pago.'),
  );
}

// ── Catálogo ──

const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function fillProduct(p) {
  $('admProductTitle').textContent = p ? 'Editar ' + p.sku : 'Nuevo producto';
  $('pId').value = p?.id || '';
  $('pSku').value = p?.sku || '';
  $('pName').value = p?.name || '';
  $('pDesc').value = p?.description || '';
  $('pTag').value = p?.tag || '';
  $('pUnits').value = p?.units || '';
  $('pPrice').value = p?.priceCop || '';
  $('pPromo').value = p?.promoPriceCop || '';
  $('pPromoEnd').value = toLocalInput(p?.promoEndsAt);
  $('pSort').value = p?.sortOrder ?? 0;
  $('pActive').checked = p ? p.active : true;
}

async function loadProducts() {
  await run(async () => {
    const j = await call('/api/admin/products');
    const body = $('admProducts');
    body.replaceChildren();
    for (const p of j.products) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${money(p.priceCop)}</td><td>${p.promoPriceCop ? money(p.promoPriceCop) : '—'}</td><td>${p.active ? 'Sí' : 'No'}</td><td><button class="adm-btn ghost" type="button">Editar</button></td>`;
      tr.querySelector('button').onclick = () => fillProduct(p);
      body.appendChild(tr);
    }
  });
}

$('pReset').onclick = () => fillProduct(null);
$('admProductForm').onsubmit = (e) => {
  e.preventDefault();
  const promo = $('pPromo').value ? Number($('pPromo').value) : null;
  const body = {
    sku: $('pSku').value.trim(),
    game: 'freefire',
    name: $('pName').value.trim(),
    description: $('pDesc').value.trim(),
    tag: $('pTag').value.trim(),
    units: Number($('pUnits').value),
    priceCop: Number($('pPrice').value),
    promoPriceCop: promo,
    promoEndsAt:
      promo && $('pPromoEnd').value ? new Date($('pPromoEnd').value).toISOString() : null,
    active: $('pActive').checked,
    sortOrder: Number($('pSort').value || 0),
  };
  const id = $('pId').value;
  run(async () => {
    await call(id ? '/api/admin/products/' + id : '/api/admin/products', {
      method: id ? 'PUT' : 'POST',
      body,
    });
    fillProduct(null);
    await loadProducts();
  }, 'Producto guardado.');
};

// ── Inventario ──

async function loadInventory() {
  await run(async () => {
    const j = await call('/api/admin/inventory');
    $('admInventory').innerHTML =
      j.lines
        .map(
          (l) =>
            `<tr><td>${esc(l.name)} <small>${esc(l.sku)}</small></td><td>${l.lowStock ? pill('LOW', `${l.available} · reponer`) : Number(l.available)}</td><td>${Number(l.assigned)}</td><td>${Number(l.used)}</td><td>${Number(l.void)}</td></tr>`,
        )
        .join('') || '<tr><td colspan="5">Sin paquetes activos.</td></tr>';
    const select = $('iProduct');
    const current = select.value;
    select.innerHTML = j.lines
      .map((l) => `<option value="${esc(l.productId)}">${esc(l.name)} (${esc(l.sku)})</option>`)
      .join('');
    if (current) select.value = current;
  });
}

$('admInventoryForm').onsubmit = (e) => {
  e.preventDefault();
  const codes = $('iCodes')
    .value.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cost = Number($('iCost').value);
  const source = $('iSource').value.trim();
  run(async () => {
    const r = await call('/api/admin/inventory', {
      method: 'POST',
      body: {
        productId: $('iProduct').value,
        codes,
        ...(cost > 0 ? { costCop: cost } : {}),
        ...(source ? { source } : {}),
      },
    });
    $('iCodes').value = '';
    message(
      `${r.added} PIN cargados${r.duplicates ? `, ${r.duplicates} repetidos ignorados` : ''}.`,
      'good',
    );
    await loadInventory();
  });
};

// ── Bloqueos ──

async function loadBlocks() {
  await run(async () => {
    const j = await call('/api/admin/blocklist');
    const body = $('admBlocks');
    body.replaceChildren();
    for (const b of j.entries) {
      const tr = document.createElement('tr');
      const expired = b.expiresAt && new Date(b.expiresAt).getTime() <= Date.now();
      const until = !b.expiresAt ? 'Permanente' : (expired ? 'Venció ' : '') + fmtDate(b.expiresAt);
      // Huella de IP abreviada: es un hash irreversible, no la IP.
      const value = b.kind === 'ip_hash' ? `${b.value.slice(0, 16)}…` : b.value;
      tr.innerHTML = `<td>${esc(b.kind)}</td><td title="${esc(b.value)}">${esc(value)}</td><td>${esc(b.reason)}</td><td>${fmtDate(b.createdAt)}</td><td>${esc(until)}</td><td><button class="adm-btn ghost" type="button">Quitar</button></td>`;
      tr.querySelector('button').onclick = () => {
        if (!confirm('¿Quitar este bloqueo?')) return;
        run(async () => {
          await call('/api/admin/blocklist/' + b.id, { method: 'DELETE' });
          await loadBlocks();
        }, 'Bloqueo eliminado.');
      };
      body.appendChild(tr);
    }
  });
}

$('admBlockForm').onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await call('/api/admin/blocklist', {
      method: 'POST',
      body: {
        kind: $('bKind').value,
        value: $('bValue').value.trim(),
        reason: $('bReason').value.trim(),
      },
    });
    $('bValue').value = '';
    $('bReason').value = '';
    await loadBlocks();
  }, 'Bloqueo añadido.');
};

// ── Auditoría ──

async function loadAudit() {
  await run(async () => {
    const j = await call('/api/admin/audit');
    $('admAudit').innerHTML = j.events
      .map(
        (e) =>
          `<tr><td>${fmtDate(e.createdAt)}</td><td>${esc(e.action)}</td><td>${esc(e.entityType)} ${esc(String(e.entityId).slice(0, 8))}</td><td>${esc(e.fromStatus || '')} → ${esc(e.toStatus || '')}</td><td>${esc(e.actorType)}</td></tr>`,
      )
      .join('');
  });
}

boot();
// Refresco automático de alertas y pedidos cada minuto (sin solapamiento).
setInterval(() => {
  if ($('admApp').hidden) return;
  // En segundo plano solo se consultan las alertas: bastan para avisar de pagos nuevos.
  if (document.hidden) void loadAlerts().catch(() => {});
  else loadOrdersTab();
}, 60_000);
