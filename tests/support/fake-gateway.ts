import {
  PaymentProviderError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentGateway,
  type ProviderPayment,
  type WebhookInput,
} from '../../src/server/integrations/payments/gateway.js';

/**
 * Doble de pruebas de Mercado Pago. SOLO para tests: simula la API con datos controlados.
 * Nunca se usa fuera de `tests/` ni de `e2e/`.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly name = 'mercadopago' as const;
  readonly preferences = new Map<string, CheckoutSession & { input: CreateCheckoutInput }>();
  readonly payments = new Map<string, ProviderPayment>();
  createCalls = 0;
  /** Próximas llamadas a createCheckout que fallarán con resultado incierto. */
  failNextCreates = 0;
  failQueries = false;

  /** `checkoutBase`: página que simula el checkout de Mercado Pago (las e2e usan una local). */
  constructor(
    private readonly checkoutBase = 'https://www.mercadopago.com.co/checkout/v1/redirect',
  ) {}

  async createCheckout(
    input: CreateCheckoutInput,
    idempotencyKey: string,
  ): Promise<CheckoutSession> {
    this.createCalls += 1;
    if (this.failNextCreates > 0) {
      this.failNextCreates -= 1;
      throw new PaymentProviderError('timeout simulado', true);
    }
    const existing = this.preferences.get(idempotencyKey);
    if (existing) return { preferenceId: existing.preferenceId, checkoutUrl: existing.checkoutUrl };
    const preferenceId = `pref-${this.preferences.size + 1}`;
    const session = { preferenceId, checkoutUrl: `${this.checkoutBase}?pref_id=${preferenceId}` };
    this.preferences.set(idempotencyKey, { ...session, input });
    return session;
  }

  /** Simula que el comprador paga (o que Mercado Pago cambia el estado del pago). */
  setPayment(payment: Partial<ProviderPayment> & { id: string; externalReference: string }): void {
    this.payments.set(payment.id, {
      status: 'approved',
      statusDetail: 'accredited',
      amount: 0,
      currency: 'COP',
      approvedAt: new Date(),
      ...payment,
    });
  }

  async getPayment(paymentId: string): Promise<ProviderPayment> {
    if (this.failQueries) throw new PaymentProviderError('caída simulada', true);
    const payment = this.payments.get(paymentId);
    if (!payment) throw new PaymentProviderError('no existe', false);
    return { ...payment };
  }

  async searchPaymentsByReference(orderRef: string): Promise<ProviderPayment[]> {
    if (this.failQueries) throw new PaymentProviderError('caída simulada', true);
    return [...this.payments.values()]
      .filter((p) => p.externalReference === orderRef)
      .map((p) => ({ ...p }));
  }

  findPreference(preferenceId: string) {
    return [...this.preferences.values()].find((p) => p.preferenceId === preferenceId);
  }

  verifyWebhook(input: WebhookInput): boolean {
    return input.signature === 'firma-valida';
  }
}
