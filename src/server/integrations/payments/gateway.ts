import type { PaymentStatus } from '../../db/schema.js';

/**
 * Puerto de pagos. El dominio solo conoce esta interfaz; la única implementación real es
 * `MercadoPagoPaymentGateway`. Los dobles de prueba viven en `tests/`.
 */

export interface CheckoutItem {
  id: string;
  title: string;
  quantity: number;
  unitPriceCop: number;
}

export interface CreateCheckoutInput {
  orderRef: string;
  items: readonly CheckoutItem[];
  totalCop: number;
  expiresAt: Date;
  returnUrl: string;
  notificationUrl: string;
}

export interface CheckoutSession {
  preferenceId: string;
  checkoutUrl: string;
}

/** Pago tal como lo informa el proveedor (fuente de verdad financiera). */
export interface ProviderPayment {
  id: string;
  status: string;
  statusDetail: string | undefined;
  externalReference: string | undefined;
  amount: number | undefined;
  currency: string | undefined;
  approvedAt: Date | undefined;
  /** `live_mode` de Mercado Pago: true = pago real; false = pago de prueba (sandbox). */
  liveMode: boolean | undefined;
}

export interface WebhookInput {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
}

export interface PaymentGateway {
  readonly name: 'mercadopago';
  /** Crea la sesión de pago. Idempotente por `idempotencyKey`. */
  createCheckout(input: CreateCheckoutInput, idempotencyKey: string): Promise<CheckoutSession>;
  getPayment(paymentId: string): Promise<ProviderPayment>;
  searchPaymentsByReference(orderRef: string): Promise<ProviderPayment[]>;
  /** Verifica la autenticidad de una notificación. No hace llamadas de red. */
  verifyWebhook(input: WebhookInput): boolean;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    /** true si no se sabe si la operación tuvo efecto (timeout, error de red). */
    readonly uncertain: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PaymentProviderError';
  }
}

/**
 * Mapeo de estados nativos de Mercado Pago a estados internos.
 * Lista nativa según la documentación oficial ("Get payment status"):
 * pending, approved, authorized, in_process, in_mediation, rejected, cancelled, refunded,
 * charged_back. Cualquier otro valor se trata como UNKNOWN (revisión manual).
 */
export function mapMercadoPagoStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'PENDING';
    case 'rejected':
    case 'cancelled':
      return 'DECLINED';
    case 'refunded':
      return 'REFUNDED';
    case 'in_mediation':
    case 'charged_back':
      return 'DISPUTED';
    default:
      return 'UNKNOWN';
  }
}
