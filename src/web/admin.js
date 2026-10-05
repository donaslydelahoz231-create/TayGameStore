// Panel de administración de TayGameStore. Toda la autorización ocurre en el servidor:
// ocultar o mostrar un botón aquí no concede ningún permiso.
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
    if (err instanceof ApiError && (err.code === 'UNAUTHORIZED' || err.code === 'MFA_REQUIRED')) {
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

// ── Sesión y MFA ──

/** Modo de la cuenta de Mercado Pago, visible siempre para el operador. */
async function showPaymentsMode() {
  try {
    const cfg = await api('/api/config');
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
  $('admWho').textContent = me.authenticated ? me.user.email : 'Sin sesión';
  if (!me.authenticated || !me.admin) return show('admLogin');
  if (!me.admin.mfaEnabled) return show('admMfaSetup');
  if (!me.admin.mfaVerified) return show('admMfaVerify');
  show('admApp');
  await loadOrdersTab();
}

$('admLogout').onclick = async () => {
  await run(() => api('/api/auth/logout', { method: 'POST' }));
  location.reload();
};

$('admMfaStart').onclick = () =>
  run(async () => {
    const j = await call('/api/admin/mfa/setup', { method: 'POST' });
    $('admMfaSecret').textContent = j.secret;
    $('admMfaUri').textContent = j.otpauthUri;
    $('admMfaSecretBox').hidden = false;
  });

$('admMfaEnable').onclick = () =>
  run(async () => {
    const j = await call('/api/admin/mfa/enable', {
      method: 'POST',
      body: { code: $('admMfaEnableCode').value.trim() },
    });
    $('admRecoveryCodes').textContent = j.recoveryCodes.join('\n');
    $('admRecovery').hidden = false;
    $('admMfaSecretBox').hidden = true;
  }, 'Verificación en dos pasos activada.');

$('admRecoveryDone').onclick = () => boot();

$('admMfaVerifyBtn').onclick = () =>
  run(async () => {
    await call('/api/admin/mfa/verify', {
      method: 'POST',
      body: { code: $('admMfaCode').value.trim() },
    });
    await boot();
  });

$('admRecoveryBtn').onclick = () =>
  run(async () => {
    await call('/api/admin/mfa/verify', {
      method: 'POST',
      body: { recoveryCode: $('admRecoveryInput').value.trim() },
    });
    await boot();
  }, 'Código de recuperación usado. Genera nuevos si te quedan pocos.');

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
      blocklist: loadBlocks,
      audit: loadAudit,
    };
    loaders[button.dataset.tab]?.();
  }),
);

// ── Pedidos ──

async function loadAlerts() {
  const a = await call('/api/admin/alerts');
  const items = [
    ['awaitingVerification', 'Por verificar', 'warn'],
    ['paidWithoutDelivery', 'Pagados sin entregar (+30 min)', 'bad'],
    ['needsReview', 'En revisión', 'bad'],
    ['needsRefund', 'Pagos por reembolsar', 'bad'],
    ['paymentsPendingTooLong', 'Pagos pendientes (+1 h)', 'warn'],
    ['invalidWebhooks24h', 'Webhooks inválidos (24 h)', 'bad'],
    ['autoBlocks24h', 'Bloqueos automáticos (24 h)', 'warn'],
    ['activeIpBlocks', 'IPs bloqueadas ahora', 'warn'],
    ['mfaLocks24h', 'Cuentas admin con MFA bloqueado (24 h)', 'bad'],
  ];
  $('admAlerts').innerHTML = items
    .map(
      ([key, label, level]) =>
        `<div class="adm-alert ${a[key] ? level : ''}"><b>${Number(a[key])}</b>${esc(label)}</div>`,
    )
    .join('');
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
      <dt>Jugador</dt><dd>${pill(v.status)} ${esc(v.nickname || '')} ${esc(v.region || '')}</dd>
      <dt>Productos</dt><dd>${o.items.map((i) => `${i.quantity}× ${esc(i.name)} (${money(i.lineTotalCop)})`).join('<br>')}</dd>
      <dt>Total</dt><dd>${money(o.totalCop)} ${esc(o.currency)}</dd>
      <dt>Vence</dt><dd>${fmtDate(o.expiresAt)}</dd>
      <dt>Entrega</dt><dd>${f ? pill(f.status) + (f.evidence ? ' · ' + esc(f.evidence) : '') : '—'}</dd>
    </dl>
    <div id="admDetailActions"></div>
    <h3>Pagos (Mercado Pago)</h3>
    <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>ID MP</th><th>Estado</th><th>MP</th><th>Importe</th><th>Correcto</th></tr></thead><tbody>${
      d.payments
        .map(
          (p) =>
            `<tr><td>${esc(p.providerPaymentId)}</td><td>${pill(p.status)}${p.isOrderPayment ? ' ★' : ''}</td><td>${esc(p.providerStatus)} ${esc(p.providerStatusDetail || '')}</td><td>${money(p.amountCop)} ${esc(p.currency)}</td><td>${p.amountMatches ? 'Sí' : 'NO'}</td></tr>`,
        )
        .join('') || '<tr><td colspan="5">Sin pagos.</td></tr>'
    }</tbody></table></div>
    <h3>Historial</h3>
    <div class="adm-table-wrap"><table class="adm-table"><tbody>${d.history
      .map(
        (h) =>
          `<tr><td>${fmtDate(h.createdAt)}</td><td>${esc(h.action)}</td><td>${esc(h.fromStatus || '')} → ${esc(h.toStatus || '')}</td><td>${esc(h.actorType)}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  renderActions(d);
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
  if (!$('admApp').hidden && !document.hidden) loadOrdersTab();
}, 60_000);
