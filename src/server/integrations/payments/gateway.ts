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

/** Medio que el cliente eligió en la tienda; Mercado Pago abre directo ese formulario. */
export const PAY_MEANS = ['tarjeta', 'nequi', 'pse', 'efecty', 'saldo'] as const;
export type PayMeans = (typeof PAY_MEANS)[number];

/**
 * Tipos de pago de Mercado Pago que se ocultan según el medio elegido (`payment_methods.
 * excluded_payment_types`). Tarjeta: solo tarjetas (crédito, débito o prepago de cualquier
 * banco). Nequi: Mercado Pago no lo ofrece como medio propio en Colombia, así que se paga por
 * PSE eligiendo el banco «Nequi»: igual que PSE, solo débito bancario. Efecty: solo efectivo.
 * Saldo de Mercado Pago: sin restricción (el saldo no es un tipo que se pueda dejar solo).
 * Todos se cobran en Mercado Pago (la única autoridad de pago) y llegan a la cuenta del dueño.
 */
export function excludedPaymentTypes(payMeans: PayMeans | undefined): string[] {
  switch (payMeans) {
    case 'tarjeta':
      return ['ticket', 'atm', 'bank_transfer'];
    case 'nequi':
    case 'pse':
      return ['credit_card', 'debit_card', 'prepaid_card', 'ticket', 'atm'];
    case 'efecty':
      return ['credit_card', 'debit_card', 'prepaid_card', 'bank_transfer', 'atm'];
    default:
      return [];
  }
}

export interface CreateCheckoutInput {
  orderRef: string;
  /** Opcional: abre Mercado Pago directo en el medio elegido. */
  payMeans?: PayMeans | undefined;
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
  /** `payment_method_id` (p. ej. «pse», «visa»). Solo informativo para el panel. */
  paymentMethodId?: string | undefined;
  /** `payment_type_id` (p. ej. «bank_transfer», «credit_card»). Solo informativo. */
  paymentTypeId?: string | undefined;
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
