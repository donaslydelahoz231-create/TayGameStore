import { hasOwn } from '../compat.js';
import { $, setText } from '../dom.js';
import { state } from '../state.js';

/**
 * Selector de métodos de pago. Dos proveedores independientes, cada uno con su propio flujo:
 * - Mercado Pago: tarjeta, PSE, Efecty o saldo se cobran en su página segura (abre directo el
 *   formulario del medio elegido) y lo confirma Mercado Pago.
 * - Nequi: transferencia directa a la cuenta Nequi de TayGameStore, sin Mercado Pago; la confirma
 *   el dueño al ver el movimiento en su app Nequi.
 * Cada grupo solo se muestra si su método está activo en el servidor (/api/config).
 */
export const PAY_MEANS = {
  tarjeta: 'Tarjeta crédito o débito (cualquier banco)',
  pse: 'PSE (débito bancario)',
  efecty: 'Efecty (efectivo)',
  saldo: 'Saldo de Mercado Pago',
  nequi_manual: 'Nequi (transferencia directa)',
};

/** Texto antes de elegir: solo nombra los métodos activos. */
const NONE_HINTS = {
  both: 'Elige cómo pagar. Tarjeta, PSE, Efecty y saldo se cobran en la página segura de Mercado Pago; Nequi es una transferencia directa a la cuenta Nequi de TayGameStore. Nunca vemos ni guardamos tus datos bancarios.',
  mp: 'Elige cómo pagar. Se cobra en la página segura de Mercado Pago; nunca vemos ni guardamos tus datos bancarios.',
  nequi:
    'Paga con una transferencia directa a la cuenta Nequi de TayGameStore. Nunca te pediremos claves ni códigos.',
};

const HINTS = {
  tarjeta:
    'Mercado Pago abre solo el formulario de tarjeta (crédito o débito de cualquier banco): número, vencimiento, código de seguridad y cédula.',
  pse: 'Mercado Pago abre PSE: eliges tu banco y apruebas el débito en la página de tu banco.',
  efecty:
    'Mercado Pago te da un código para pagar en efectivo en un punto Efecty. Tu pedido se confirma cuando Efecty reporta el pago.',
  saldo: 'Entras con tu cuenta de Mercado Pago y pagas con el dinero que tienes en ella.',
  nequi_manual:
    'Sin Mercado Pago: al crear el pedido te mostramos el celular Nequi, el total exacto y la referencia. Transfieres desde tu app Nequi y confirmamos el pago cuando lo vemos en nuestra cuenta; después entregamos.',
};

/** Medio elegido o null si el cliente aún no eligió. */
export function chosenPayMeans() {
  const input = document.querySelector('input[name="payMeans"]:checked');
  return input && hasOwn(PAY_MEANS, input.value) ? input.value : null;
}

/** Método (proveedor) del medio elegido: `mercadopago`, `nequi_manual` o null. */
export function chosenMethod() {
  const means = chosenPayMeans();
  if (!means) return null;
  return means === 'nequi_manual' ? 'nequi_manual' : 'mercadopago';
}

/** Medio de Mercado Pago elegido (null si eligió Nequi o nada). */
export function chosenMpMeans() {
  return chosenMethod() === 'mercadopago' ? chosenPayMeans() : null;
}

/** Muestra solo los métodos activos y explica qué pasa con el medio elegido. */
export function renderPayMeansHint() {
  const methods = state.serverConfig?.paymentMethods;
  const order = state.currentOrder;
  // Pedido que ya va por Nequi: solo Nequi. Mercado Pago no se muestra ni se abre (para pagar con
  // Mercado Pago, el cliente empieza un pedido nuevo).
  const nequiOrder =
    order?.status === 'AWAITING_PAYMENT' && order.payment?.method === 'nequi_manual';
  // Sin configuración todavía: Mercado Pago visible (como siempre) y Nequi oculto.
  const showMp = !nequiOrder && (methods ? methods.mercadopago !== false : true);
  const showNequi = nequiOrder || methods?.nequiManual === true;
  const mp = $('payProviderMp');
  if (mp) mp.hidden = !showMp;
  const nequi = $('payProviderNequi');
  if (nequi) nequi.hidden = !showNequi;
  // Un medio que dejó de estar disponible no queda elegido a escondidas.
  const checked = document.querySelector('input[name="payMeans"]:checked');
  if (checked && checked.closest('[hidden]')) checked.checked = false;
  const nequiInput = $('payMeansNequi');
  if (nequiOrder && nequiInput) nequiInput.checked = true;
  const faq = $('faqNequi');
  if (faq) faq.hidden = !showNequi;
  const none = showNequi ? (showMp ? NONE_HINTS.both : NONE_HINTS.nequi) : NONE_HINTS.mp;
  const means = chosenPayMeans();
  setText('payMeansHint', means ? HINTS[means] : none);
}
