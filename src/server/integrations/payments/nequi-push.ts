/**
 * Nequi Push (NequiPushPayment): cobro que el cliente aprueba en su app Nequi, con la API oficial
 * de Nequi. **Deshabilitado y sin implementación.**
 *
 * Por qué: no hay acceso oficial a la API de Nequi ni credenciales, y su documentación no está
 * verificada (docs/pagos-colombia.md, «Nequi Negocios»). No se inventan endpoints, campos ni
 * estados: cuando el dueño tenga acceso autorizado, este adaptador se implementa con la
 * documentación oficial, sus propias variables (nunca las de Mercado Pago) y pruebas con un doble
 * del proveedor. Hasta entonces el método `nequi_push` existe en la base de datos pero la tienda
 * nunca lo ofrece ni lo acepta (services/payment-methods.ts).
 *
 * Requisitos al implementarlo (los mismos que el resto de proveedores):
 * - credenciales solo en variables protegidas del hosting, separadas de Mercado Pago;
 * - confirmación verificable solo desde Nequi (firma o consulta a su API), nunca desde el
 *   navegador ni desde el estado de otro proveedor;
 * - pagos guardados con `provider = 'nequi_push'` (el trigger `payments_provider_matches_order`
 *   impide que paguen un pedido de otro método);
 * - errores o caídas de Nequi que no afecten a Mercado Pago.
 */
export const NEQUI_PUSH_UNAVAILABLE_REASON =
  'El pago con aprobación en la app Nequi no está disponible. Puedes pagar por transferencia Nequi o con Mercado Pago si están activos.';
