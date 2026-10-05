import { api } from '../api.js';
import { cartItems, total } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { EMAIL_PATTERN, money, validUid } from '../format.js';
import { renderAll } from '../render.js';
import { runtime, state } from '../state.js';
import { modal, toast } from '../ui.js';
import { upsertPurchaseHistory } from './history.js';
import { renderInvoice } from './invoice.js';
import { startPolling } from './orders.js';

// Checkout. Wompi NO está implementado en el servidor (BLOQUEADO hasta verificar la
// documentación oficial): sin backend, /api/checkout falla y la UI muestra el error.
// En modo demo el pago y la entrega se simulan sin cobro real.

const WOMPI_WIDGET_URL = 'https://checkout.wompi.co/widget.js';

const PAYMENT_ERRORS = {
  WOMPI_NOT_CONFIGURED: 'Wompi no está configurado con credenciales válidas.',
  LIOGAMES_NOT_CONFIGURED: 'LioGames no está configurado en el servidor.',
  PLAYER_NOT_FOUND: 'No se encontró el jugador.',
  PLAYER_REGION_UNRESOLVED: 'No fue posible confirmar la región.',
  NICKNAME_MISMATCH: 'El nickname cambió; vuelve a verificarlo.',
  INVALID_PRODUCT: 'El producto ya no está disponible.',
  INVALID_TOTAL: 'El total no es válido.',
  PROMO_NOT_ACTIVE: 'La promoción ya no está activa.',
  PROVIDER_NOT_VERIFIED: 'El producto todavía no está validado por el proveedor.',
};

function friendlyPaymentError(code) {
  return PAYMENT_ERRORS[code] || code || 'No se pudo preparar el pago.';
}

export async function preparePayment() {
  const items = cartItems(),
    customer = state.customerName.trim(),
    email = state.customerEmail.trim();
  if (!items.length) {
    toast('Agrega una recarga.', 'bad');
    $('catalogo').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!state.verified || !validUid(state.playerUid) || !state.nickname) {
    toast('Verifica y confirma el jugador antes de pagar.', 'bad');
    $('verificacion').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if ($('paymentMethod').value !== 'wompi') {
    $('paymentMethod').focus();
    toast('Selecciona Wompi como método de pago.', 'bad');
    return;
  }
  if (!customer) {
    $('customerName').focus();
    toast('Escribe el nombre del cliente.', 'bad');
    $('factura').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    $('customerEmail').focus();
    toast('Escribe un correo válido para el comprobante.', 'bad');
    $('factura').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!$('acceptTerms').checked) {
    $('acceptTerms').focus();
    toast('Debes aceptar los términos de la compra.', 'bad');
    return;
  }

  runtime.paymentBusy = true;
  runtime.checkoutConfig = null;
  $('payBtn').disabled = true;
  setText('payClient', customer);
  setText('payUid', state.playerUid);
  setText('payNick', state.nickname);
  setText('payAmount', money(total()));
  $('paymentError').classList.remove('show');
  modal('paymentModal', true);

  if (state.localDemo) {
    const ref = 'TGS-DEMO-' + String(state.invoice).padStart(4, '0');
    state.currentOrder = { reference: ref, status: 'AWAITING_PAYMENT', code: 'DEMO', demo: true };
    upsertPurchaseHistory(state.currentOrder);
    setText('paymentPrep', 'Modo demostración: checkout preparado, sin cobro real.');
    $('paymentPrep').className = 'payment-status ok';
    $('startPayment').disabled = false;
    setText('startPayment', 'Simular pago');
    renderAll();
    runtime.paymentBusy = false;
    return;
  }

  setText('paymentPrep', 'Revalidando jugador, precios y proveedor…');
  try {
    const j = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        uid: state.playerUid,
        nickname: state.nickname,
        customerName: state.customerName,
        customerEmail: EMAIL_PATTERN.test(state.customerEmail) ? state.customerEmail : undefined,
        tariff: state.tariff,
        items: items.map((x) => ({ productKey: x.p.id, quantity: x.qty })),
      }),
    });
    runtime.checkoutConfig = j.checkout;
    state.checkout = j.checkout;
    state.currentOrder = { ...j.order, status: 'AWAITING_PAYMENT' };
    upsertPurchaseHistory(state.currentOrder);
    setText('paymentPrep', 'Checkout seguro listo.');
    $('paymentPrep').className = 'payment-status ok';
    $('startPayment').disabled = false;
    renderAll();
  } catch (err) {
    $('paymentPrep').className = 'payment-status bad';
    setText('paymentPrep', 'No se pudo preparar el pago.');
    setText('paymentError', friendlyPaymentError(err.message));
    $('paymentError').classList.add('show');
  } finally {
    runtime.paymentBusy = false;
    renderInvoice();
  }
}

async function loadWompi() {
  if (window.WidgetCheckout) return;
  await new Promise((resolve, reject) => {
    const old = document.querySelector('script[data-tgs-wompi]');
    if (old) {
      old.addEventListener('load', resolve, { once: true });
      old.addEventListener('error', () => reject(new Error('WOMPI_WIDGET_LOAD_FAILED')), {
        once: true,
      });
      return;
    }
    const s = document.createElement('script');
    s.src = WOMPI_WIDGET_URL;
    s.async = true;
    s.dataset.tgsWompi = '1';
    s.onload = resolve;
    s.onerror = () => reject(new Error('WOMPI_WIDGET_LOAD_FAILED'));
    document.head.appendChild(s);
  });
}

function simulateDemoPayment() {
  if (!state.currentOrder) {
    setText('paymentError', 'Primero prepara el checkout.');
    $('paymentError').classList.add('show');
    return;
  }
  $('startPayment').disabled = true;
  setText('startPayment', 'Procesando…');
  setText('paymentPrep', 'Simulación de pago en curso…');
  setTimeout(() => {
    state.currentOrder = { ...state.currentOrder, status: 'APPROVED' };
    upsertPurchaseHistory(state.currentOrder);
    modal('paymentModal', false);
    renderAll();
    toast('Pago demo aprobado.', 'good');
    setTimeout(() => {
      state.currentOrder = { ...state.currentOrder, status: 'FULFILLING' };
      upsertPurchaseHistory(state.currentOrder);
      renderAll();
    }, 900);
    setTimeout(() => {
      state.currentOrder = { ...state.currentOrder, status: 'FULFILLED' };
      upsertPurchaseHistory(state.currentOrder);
      renderAll();
      toast('Recarga demo completada.', 'good');
    }, 2100);
  }, 700);
}

export async function startWompi() {
  if (state.localDemo) {
    simulateDemoPayment();
    return;
  }
  if (!runtime.checkoutConfig) {
    setText('paymentError', 'No existe un checkout preparado.');
    $('paymentError').classList.add('show');
    return;
  }
  $('startPayment').disabled = true;
  setText('startPayment', 'Abriendo…');
  try {
    await loadWompi();
    const c = runtime.checkoutConfig;
    const widget = new window.WidgetCheckout({
      currency: c.currency,
      amountInCents: c.amountInCents,
      reference: c.reference,
      publicKey: c.publicKey,
      signature: { integrity: c.signatureIntegrity },
      expirationTime: c.expirationTime,
      redirectUrl: c.redirectUrl,
      customerData: c.customerData || undefined,
    });
    widget.open((result) => {
      const tx = result?.transaction || {};
      if (tx.id)
        state.currentOrder = { ...(state.currentOrder || {}), wompi_transaction_id: tx.id };
      modal('paymentModal', false);
      renderAll();
      startPolling();
      toast(
        tx.status === 'APPROVED'
          ? 'Pago recibido; verificando entrega.'
          : 'Pago registrado; el backend determinará el estado final.',
        tx.status === 'APPROVED' ? 'good' : '',
      );
    });
  } catch (err) {
    setText('paymentError', err.message || 'No se pudo abrir Wompi.');
    $('paymentError').classList.add('show');
  } finally {
    $('startPayment').disabled = false;
    setText('startPayment', 'Continuar');
  }
}
