import { hasOwn } from '../compat.js';

/**
 * Medios de pago que el cliente elige en la tienda. Todos se cobran en la página segura de
 * Mercado Pago (la única autoridad de pago): la elección orienta al cliente y aparece en el
 * resumen, pero el medio real lo confirma Mercado Pago. TayGameStore nunca ve tarjetas ni bancos.
 */
export const PAY_MEANS = {
  tarjeta: 'Tarjeta crédito o débito',
  pse: 'PSE (débito bancario)',
  efecty: 'Efecty (efectivo)',
  saldo: 'Saldo de Mercado Pago',
};

/** Medio elegido o null si el cliente aún no eligió. */
export function chosenPayMeans() {
  const input = document.querySelector('input[name="payMeans"]:checked');
  return input && hasOwn(PAY_MEANS, input.value) ? input.value : null;
}

/** Texto para el resumen: «PSE (débito bancario) · Mercado Pago». */
export function payMeansText() {
  const means = chosenPayMeans();
  return means ? `${PAY_MEANS[means]} · Mercado Pago` : 'Mercado Pago';
}
