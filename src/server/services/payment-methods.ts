import type { PaymentMethod } from '../db/schema.js';
import { AppError } from '../plugins/errors.js';
import type { ServiceDeps } from './context.js';
import { NEQUI_PUSH_UNAVAILABLE_REASON } from '../integrations/payments/nequi-push.js';

/**
 * Selector de métodos de pago (PaymentMethodSelector): qué métodos puede ofrecer la tienda ahora.
 * Cada método depende SOLO de su propia configuración: sin Mercado Pago, Nequi sigue disponible,
 * y sin Nequi, Mercado Pago sigue igual.
 */
export function paymentMethodAvailability(deps: ServiceDeps): Record<PaymentMethod, boolean> {
  return {
    mercadopago: deps.config.flags.paymentsEnabled && deps.gateway !== undefined,
    nequi_manual: deps.config.nequi.manual !== undefined,
    // Sin acceso oficial a la API de Nequi no hay implementación (integrations/payments/nequi-push.ts).
    nequi_push: false,
  };
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mercadopago: 'Mercado Pago',
  nequi_manual: 'Nequi (transferencia)',
  nequi_push: 'Nequi (pago en la app)',
};

const UNAVAILABLE: Record<PaymentMethod, string> = {
  mercadopago: 'Mercado Pago no está disponible en este momento. Tu pedido sigue guardado.',
  nequi_manual: 'Nequi no está disponible en este momento. Tu pedido sigue guardado.',
  nequi_push: NEQUI_PUSH_UNAVAILABLE_REASON,
};

/** Falla con un mensaje propio del método si no está disponible (nunca menciona al otro). */
export function requirePaymentMethod(deps: ServiceDeps, method: PaymentMethod): void {
  if (!paymentMethodAvailability(deps)[method]) {
    throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 503, UNAVAILABLE[method]);
  }
}
