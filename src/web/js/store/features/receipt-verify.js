import { api, ApiError, errorMessage } from '../api.js';
import { $, esc, setHtml } from '../dom.js';
import { money } from '../format.js';

// Verificación pública de comprobantes: con la referencia y el código impresos en él, el servidor
// recalcula la firma. Un comprobante falso o alterado no pasa; la respuesta no revela nada más.

const STATUS = {
  PAID: 'Pago confirmado · recarga por entregar',
  DELIVERING: 'Pago confirmado · recarga en entrega',
  DELIVERED: 'Pago confirmado · recarga entregada',
  NEEDS_REVIEW: 'Pago confirmado · pedido en revisión',
  REFUNDED: 'Pago reembolsado',
};

const CODE = /V\d{1,4}(?:-[0-9A-Z]{4}){4}/i;
const REF = /TGS-[0-9A-Z]{10}/i;

function show(kind, html) {
  const box = $('verifyReceiptResult');
  box.hidden = false;
  box.dataset.kind = kind;
  setHtml('verifyReceiptResult', html);
}

export async function verifyReceipt(event) {
  event.preventDefault();
  const rawRef = $('verifyRef').value.trim();
  const rawCode = $('verifyCode').value.trim();
  // Se acepta pegar la línea completa del comprobante («N.º 000002 · V1-…»).
  const reference = (REF.exec(rawRef)?.[0] ?? rawRef).toUpperCase();
  const code = CODE.exec(rawCode)?.[0] ?? rawCode;
  if (!REF.test(reference) || code.length < 5) {
    show('bad', 'Escribe la referencia (TGS-…) y el código tal como aparecen en el comprobante.');
    return;
  }
  const button = $('verifyReceiptBtn');
  button.disabled = true;
  try {
    const result = await api('/api/receipts/verify', {
      method: 'POST',
      body: { reference, code },
    });
    if (!result.authentic) {
      show(
        'bad',
        '<b>No es auténtico.</b> Ese comprobante no lo emitió TayGameStore o fue alterado. No entregues nada ni hagas pagos con base en él.',
      );
      return;
    }
    const paid = result.paidAt
      ? new Date(result.paidAt).toLocaleString('es-CO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';
    show(
      'good',
      `<b>Comprobante auténtico.</b><dl><div><dt>Comprobante</dt><dd>N.º ${String(result.number).padStart(6, '0')}</dd></div><div><dt>Referencia</dt><dd>${esc(result.reference)}</dd></div><div><dt>Total</dt><dd>${esc(money(result.totalCop))}</dd></div><div><dt>Pagado</dt><dd>${esc(paid)}</dd></div><div><dt>Estado</dt><dd>${esc(STATUS[result.status] ?? result.status)}</dd></div></dl>`,
    );
  } catch (err) {
    show(
      'bad',
      esc(
        err instanceof ApiError && err.status === 429
          ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
          : errorMessage(err, 'No pudimos verificar ahora. Inténtalo de nuevo.'),
      ),
    );
  } finally {
    button.disabled = false;
  }
}
