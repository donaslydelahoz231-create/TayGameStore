import { hasOwn } from '../compat.js';
import { setText } from '../dom.js';

/**
 * Medios de pago que el cliente elige en la tienda. Todos se cobran en la página segura de
 * Mercado Pago (la única autoridad de pago), que abre directo el formulario del medio elegido
 * (el servidor oculta los demás); el medio real lo confirma Mercado Pago. TayGameStore nunca ve
 * tarjetas ni bancos. Nequi no es un medio propio de Mercado Pago en Colombia: se paga por PSE
 * eligiendo el banco «Nequi», separado de las tarjetas para que nadie lo confunda.
 */
export const PAY_MEANS = {
  tarjeta: 'Tarjeta crédito o débito (cualquier banco)',
  nequi: 'Nequi (por PSE)',
  pse: 'PSE (débito bancario)',
  efecty: 'Efecty (efectivo)',
  saldo: 'Saldo de Mercado Pago',
};

const HINTS = {
  none: 'Elige cómo pagar. Todo se cobra en la página segura de Mercado Pago y llega a la cuenta de TayGameStore; nunca vemos ni guardamos tus datos bancarios.',
  tarjeta:
    'Mercado Pago abre solo el formulario de tarjeta (crédito o débito de cualquier banco): número, vencimiento, código de seguridad y cédula.',
  nequi:
    'Mercado Pago abre PSE: en la lista de bancos elige «Nequi», escribe tu número de celular y aprueba el pago en tu app Nequi. Si no ves Nequi en la lista, paga con la tarjeta débito de tu Nequi en «Tarjeta».',
  pse: 'Mercado Pago abre PSE: eliges tu banco y apruebas el débito en la página de tu banco.',
  efecty:
    'Mercado Pago te da un código para pagar en efectivo en un punto Efecty. Tu pedido se confirma cuando Efecty reporta el pago.',
  saldo: 'Entras con tu cuenta de Mercado Pago y pagas con el dinero que tienes en ella.',
};

/** Medio elegido o null si el cliente aún no eligió. */
export function chosenPayMeans() {
  const input = document.querySelector('input[name="payMeans"]:checked');
  return input && hasOwn(PAY_MEANS, input.value) ? input.value : null;
}

/** Qué va a pasar en Mercado Pago con el medio elegido. */
export function renderPayMeansHint() {
  setText('payMeansHint', HINTS[chosenPayMeans() ?? 'none']);
}
