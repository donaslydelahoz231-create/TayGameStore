import { hasOwn } from '../compat.js';

/**
 * Medios de pago que el cliente elige en la tienda. Todos se cobran en la página segura de
 * Mercado Pago (la única autoridad de pago), que abre directo el formulario del medio elegido
 * (el servidor oculta los demás); el medio real lo confirma Mercado Pago. TayGameStore nunca ve
 * tarjetas ni bancos.
 */
export const PAY_MEANS = {
  tarjeta: 'Tarjeta crédito o débito (cualquier banco)',
  pse: 'PSE (débito bancario)',
  efecty: 'Efecty (efectivo)',
  saldo: 'Saldo de Mercado Pago',
};

/** Medio elegido o null si el cliente aún no eligió. */
export function chosenPayMeans() {
  const input = document.querySelector('input[name="payMeans"]:checked');
  return input && hasOwn(PAY_MEANS, input.value) ? input.value : null;
}
