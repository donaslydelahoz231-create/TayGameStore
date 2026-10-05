import {
  MPConnectionError,
  MPRateLimitError,
  MPServerError,
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from 'mercadopago';
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentGateway,
  ProviderPayment,
  WebhookInput,
} from './gateway.js';
import { PaymentProviderError } from './gateway.js';

/**
 * Integración con Mercado Pago (Checkout Pro) mediante el SDK oficial `mercadopago`.
 * Contratos verificados en el SDK oficial 3.6.1 y en la documentación de Mercado Pago:
 * - `POST /checkout/preferences` (Preference.create), con `external_reference`, `back_urls`,
 *   `auto_return`, `notification_url`, `expires`/`expiration_date_*`.
 * - `GET /v1/payments/{id}` y `GET /v1/payments/search?external_reference=…`.
 * - Firma de webhooks `x-signature` (HMAC-SHA256) con `WebhookSignatureValidator`.
 */
export interface MercadoPagoOptions {
  accessToken: string;
  webhookSecret: string;
  statementDescriptor: string | undefined;
  timeoutMs: number;
}

function isUncertain(error: unknown): boolean {
  return (
    error instanceof MPConnectionError ||
    error instanceof MPServerError ||
    error instanceof MPRateLimitError ||
    (error instanceof Error && /timeout|abort/i.test(error.name + error.message))
  );
}

function wrap(operation: string, error: unknown): PaymentProviderError {
  // Nunca se propaga el detalle del proveedor al cliente; solo a los logs del servidor.
  return new PaymentProviderError(`Mercado Pago: ${operation} falló`, isUncertain(error), {
    cause: error,
  });
}

export class MercadoPagoPaymentGateway implements PaymentGateway {
  readonly name = 'mercadopago' as const;
  private readonly preference: Preference;
  private readonly payment: Payment;

  constructor(private readonly options: MercadoPagoOptions) {
    const config = new MercadoPagoConfig({
      accessToken: options.accessToken,
      options: { timeout: options.timeoutMs },
    });
    this.preference = new Preference(config);
    this.payment = new Payment(config);
  }

  async createCheckout(
    input: CreateCheckoutInput,
    idempotencyKey: string,
  ): Promise<CheckoutSession> {
    let response;
    try {
      response = await this.preference.create({
        body: {
          items: input.items.map((item) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            unit_price: item.unitPriceCop,
            currency_id: 'COP',
          })),
          external_reference: input.orderRef,
          back_urls: {
            success: input.returnUrl,
            pending: input.returnUrl,
            failure: input.returnUrl,
          },
          auto_return: 'approved',
          notification_url: input.notificationUrl,
          expires: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: input.expiresAt.toISOString(),
          ...(this.options.statementDescriptor
            ? { statement_descriptor: this.options.statementDescriptor }
            : {}),
        },
        // Misma clave en cada reintento: Mercado Pago no crea una preferencia duplicada.
        requestOptions: { idempotencyKey, timeout: this.options.timeoutMs, maxRetries: 1 },
      });
    } catch (error) {
      throw wrap('crear preferencia', error);
    }
    const checkoutUrl = response.init_point;
    if (!response.id || !checkoutUrl || new URL(checkoutUrl).protocol !== 'https:') {
      throw new PaymentProviderError('Mercado Pago: respuesta de preferencia incompleta', false);
    }
    return { preferenceId: response.id, checkoutUrl };
  }

  async getPayment(paymentId: string): Promise<ProviderPayment> {
    try {
      const payment = await this.payment.get({
        id: paymentId,
        requestOptions: { timeout: this.options.timeoutMs, maxRetries: 1 },
      });
      return {
        id: String(payment.id ?? paymentId),
        status: payment.status ?? 'unknown',
        statusDetail: payment.status_detail,
        externalReference: payment.external_reference,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        approvedAt: payment.date_approved ? new Date(payment.date_approved) : undefined,
        liveMode: payment.live_mode,
      };
    } catch (error) {
      throw wrap('consultar pago', error);
    }
  }

  async searchPaymentsByReference(orderRef: string): Promise<ProviderPayment[]> {
    let ids: string[];
    try {
      const result = await this.payment.search({
        options: { external_reference: orderRef, limit: 20 },
        requestOptions: { timeout: this.options.timeoutMs, maxRetries: 1 },
      });
      ids = (result.results ?? [])
        .map((row) => (row.id === undefined ? '' : String(row.id)))
        .filter(Boolean);
    } catch (error) {
      throw wrap('buscar pagos', error);
    }
    // Cada pago se vuelve a consultar individualmente: es la respuesta autoritativa.
    const payments: ProviderPayment[] = [];
    for (const id of ids) payments.push(await this.getPayment(id));
    return payments;
  }

  verifyWebhook(input: WebhookInput): boolean {
    try {
      WebhookSignatureValidator.validate({
        xSignature: input.signature,
        xRequestId: input.requestId,
        dataId: input.dataId,
        secret: this.options.webhookSecret,
      });
      return true;
    } catch {
      return false;
    }
  }
}
