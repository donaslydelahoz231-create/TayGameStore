/**
 * Canal para cerrar el pedido según /api/config (ORDER_CHANNEL del servidor): `checkout` (solo
 * «Pagar», como siempre), `whatsapp` (solo «Revisar, pagar y enviar») o `ambos`. Si falta o no se
 * conoce, `checkout`: la tienda de siempre. Sin DOM ni estado: se prueba sola
 * (tests/unit/order-channel.test.ts).
 */
export function orderChannel(config) {
  const channel = config?.orderChannel;
  return channel === 'whatsapp' || channel === 'ambos' ? channel : 'checkout';
}
