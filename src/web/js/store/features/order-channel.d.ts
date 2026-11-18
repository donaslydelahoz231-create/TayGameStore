/** Tipos de order-channel.js (para las pruebas en TypeScript). */
export function orderChannel(
  config: { orderChannel?: unknown } | null | undefined,
): 'checkout' | 'whatsapp' | 'ambos';
