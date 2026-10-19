import { describe, expect, it, vi } from 'vitest';
import {
  excludedPaymentTypes,
  MP_PAY_MEANS,
} from '../../src/server/integrations/payments/gateway.js';
import { MercadoPagoPaymentGateway } from '../../src/server/integrations/payments/mercadopago.js';

type CreateArgs = { body: Record<string, unknown>; requestOptions: { idempotencyKey: string } };

function gatewayWith(create: (args: CreateArgs) => Promise<unknown>) {
  const gateway = new MercadoPagoPaymentGateway({
    accessToken: 'TEST-sin-uso',
    webhookSecret: 'secreto-de-webhook',
    statementDescriptor: undefined,
    timeoutMs: 1000,
  });
  const spy = vi.fn(create);
  (gateway as unknown as { preference: { create: typeof spy } }).preference = { create: spy };
  return { gateway, spy };
}

const input = {
  orderRef: 'TGS-ABCDEFGHJK',
  items: [{ id: 'ff-110', title: '100 + 10 Diamantes', quantity: 1, unitPriceCop: 3800 }],
  totalCop: 3800,
  expiresAt: new Date(Date.now() + 3_600_000),
  returnUrl: 'https://tienda.example/?pedido=TGS-ABCDEFGHJK#seguimiento',
  notificationUrl: 'https://tienda.example/api/webhooks/mercadopago',
};
const ok = {
  id: 'pref-1',
  init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1',
};
const excludedIn = (args: CreateArgs | undefined) =>
  (
    args?.body.payment_methods as { excluded_payment_types?: { id: string }[] } | undefined
  )?.excluded_payment_types?.map((t) => t.id) ?? [];

describe('medio de pago elegido en la tienda', () => {
  it('cada medio deja visible solo su tipo de pago en Mercado Pago', () => {
    expect(excludedPaymentTypes('tarjeta')).toEqual(['ticket', 'atm', 'bank_transfer']);
    expect(excludedPaymentTypes('pse')).not.toContain('bank_transfer');
    expect(excludedPaymentTypes('pse')).toContain('credit_card');
    expect(excludedPaymentTypes('efecty')).not.toContain('ticket');
    expect(excludedPaymentTypes('saldo')).toEqual([]);
    expect(excludedPaymentTypes(undefined)).toEqual([]);
  });

  it('Nequi ya no es un medio de Mercado Pago: es un método de pago independiente', () => {
    expect(MP_PAY_MEANS).toEqual(['tarjeta', 'pse', 'efecty', 'saldo']);
    expect(MP_PAY_MEANS).not.toContain('nequi');
  });

  it('con «tarjeta» la preferencia oculta efectivo y PSE', async () => {
    const { gateway, spy } = gatewayWith(async () => ok);
    await gateway.createCheckout({ ...input, payMeans: 'tarjeta' }, 'clave-1');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(excludedIn(spy.mock.calls[0]?.[0])).toEqual(['ticket', 'atm', 'bank_transfer']);
  });

  it('sin medio elegido no se restringe nada', async () => {
    const { gateway, spy } = gatewayWith(async () => ok);
    await gateway.createCheckout(input, 'clave-1');
    expect(spy.mock.calls[0]?.[0].body.payment_methods).toBeUndefined();
  });

  it('si Mercado Pago rechaza la restricción, abre con todos los medios (otra clave)', async () => {
    let calls = 0;
    const { gateway, spy } = gatewayWith(async () => {
      calls += 1;
      if (calls === 1) throw new Error('invalid excluded_payment_types');
      return ok;
    });
    const session = await gateway.createCheckout({ ...input, payMeans: 'pse' }, 'clave-1');
    expect(session.preferenceId).toBe('pref-1');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]?.[0].body.payment_methods).toBeUndefined();
    expect(spy.mock.calls[1]?.[0].requestOptions.idempotencyKey).toBe('clave-1:todos');
  });

  it('un error incierto (timeout) no se repite sin restricción', async () => {
    const { gateway, spy } = gatewayWith(async () => {
      throw new Error('request timeout');
    });
    await expect(gateway.createCheckout({ ...input, payMeans: 'tarjeta' }, 'k')).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
