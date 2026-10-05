import { TGS_PUBLIC_SUPPORT } from '../config.js';
import { $, setText } from '../dom.js';
import { state } from '../state.js';
import { invoiceReference } from './invoice.js';

const ALWAYS_HIDDEN_WHEN_OFF = new Set(['waBtn', 'invoiceWa', 'mailBtn', 'invoiceMail']);

/** Canales oficiales de soporte (definidos por el backend; vacíos hasta configurarlos). */
export function renderSupport() {
  const s = state.serverConfig?.support || {};
  const wa = String(s.whatsapp || TGS_PUBLIC_SUPPORT.whatsapp || '').replace(/\D/g, '');
  const mail = String(s.email || TGS_PUBLIC_SUPPORT.email || '').trim();
  const ref = invoiceReference();
  const waUrl = wa
    ? 'https://wa.me/' +
      wa +
      '?text=' +
      encodeURIComponent('Hola TayGameStore, necesito soporte con mi pedido ' + ref)
    : '';
  const mailUrl = mail
    ? 'mailto:' + mail + '?subject=' + encodeURIComponent('Soporte TayGameStore ' + ref)
    : '';
  const links = [
    ['waBtn', waUrl, !!wa],
    ['invoiceWa', waUrl, !!wa],
    ['mailBtn', mailUrl, !!mail],
    ['invoiceMail', mailUrl, !!mail],
    ['floatWhatsApp', waUrl, !!wa],
    ['floatEmail', mailUrl, !!mail],
  ];
  for (const [id, url, ready] of links) {
    const el = $(id);
    if (!el) continue;
    el.href = ready ? url : '#';
    el.hidden = !ready && ALWAYS_HIDDEN_WHEN_OFF.has(id);
    el.classList.toggle('disabled', !ready);
    el.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }
  setText(
    'supportWhatsappState',
    wa ? 'Canal oficial disponible' : 'Pendiente de configuración del backend',
  );
  setText(
    'supportEmailState',
    mail ? 'Canal oficial disponible' : 'Pendiente de configuración del backend',
  );
  const st = $('supportBackendState');
  if (st) {
    st.classList.toggle('ok', !!(wa || mail));
    st.querySelector('i').style.background = wa || mail ? 'var(--green)' : 'var(--gold)';
    st.lastChild.textContent = wa || mail ? ' Canales oficiales activos' : ' Canal pendiente';
  }
}
