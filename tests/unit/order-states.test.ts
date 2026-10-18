import { describe, expect, it } from 'vitest';
import {
  orderStates,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATES,
  RECHARGE_STATE_LABELS,
  RECHARGE_STATES,
  type OrderFacts,
  type PaymentFacts,
} from '../../src/server/domain/order-states.js';
import {
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from '../../src/server/db/schema.js';

const approved: PaymentFacts = { status: 'APPROVED', isOrderPayment: true };
const facts = (overrides: Partial<OrderFacts>): OrderFacts => ({
  status: 'AWAITING_PAYMENT',
  payments: [],
  fulfillment: null,
  ...overrides,
});

describe('estado del pago y de la recarga (separados)', () => {
  it('un pedido nuevo tiene pago y recarga pendientes', () => {
    expect(orderStates(facts({}))).toEqual({ payment: 'PENDING', recharge: 'PENDING' });
  });

  it('un pago rechazado por Mercado Pago se ve rechazado mientras el pedido espera otro pago', () => {
    const result = orderStates(
      facts({ payments: [{ status: 'DECLINED', isOrderPayment: false }] }),
    );
    expect(result).toEqual({ payment: 'DECLINED', recharge: 'PENDING' });
  });

  it('un pago en proceso (PSE, efectivo) sigue pendiente', () => {
    const result = orderStates(facts({ payments: [{ status: 'PENDING', isOrderPayment: false }] }));
    expect(result.payment).toBe('PENDING');
  });

  it('pagado: pago confirmado y recarga todavía pendiente (son dos confirmaciones distintas)', () => {
    const result = orderStates(
      facts({ status: 'PAID', payments: [approved], fulfillment: 'READY_FOR_FULFILLMENT' }),
    );
    expect(result).toEqual({ payment: 'CONFIRMED', recharge: 'PENDING' });
  });

  it('en entrega: recarga en proceso', () => {
    const result = orderStates(
      facts({ status: 'DELIVERING', payments: [approved], fulfillment: 'DELIVERING' }),
    );
    expect(result).toEqual({ payment: 'CONFIRMED', recharge: 'IN_PROGRESS' });
  });

  it('entregado con evidencia: recarga completada', () => {
    const result = orderStates(
      facts({ status: 'DELIVERED', payments: [approved], fulfillment: 'DELIVERED' }),
    );
    expect(result).toEqual({ payment: 'CONFIRMED', recharge: 'COMPLETED' });
  });

  it('entrega fallida: el pago sigue confirmado y la recarga requiere revisión', () => {
    const result = orderStates(
      facts({ status: 'NEEDS_REVIEW', payments: [approved], fulfillment: 'FAILED' }),
    );
    expect(result).toEqual({ payment: 'CONFIRMED', recharge: 'NEEDS_REVIEW' });
  });

  it('importe o moneda incorrectos: pago en revisión y recarga en revisión', () => {
    const result = orderStates(
      facts({
        status: 'NEEDS_REVIEW',
        payments: [{ status: 'APPROVED', isOrderPayment: false }],
      }),
    );
    expect(result).toEqual({ payment: 'IN_REVIEW', recharge: 'NEEDS_REVIEW' });
  });

  it('reembolso parcial o contracargo: el pago queda en revisión', () => {
    expect(
      orderStates(
        facts({
          status: 'DELIVERED',
          payments: [{ ...approved, providerStatusDetail: 'partially_refunded' }],
          fulfillment: 'DELIVERED',
        }),
      ).payment,
    ).toBe('IN_REVIEW');
    expect(
      orderStates(
        facts({
          status: 'NEEDS_REVIEW',
          payments: [{ status: 'DISPUTED', isOrderPayment: true }],
          fulfillment: 'DELIVERED',
        }),
      ),
    ).toEqual({ payment: 'IN_REVIEW', recharge: 'COMPLETED' });
  });

  it('reembolsado solo cuando Mercado Pago lo informa; la recarga ya entregada no se borra', () => {
    expect(
      orderStates(
        facts({
          status: 'REFUNDED',
          payments: [{ status: 'REFUNDED', isOrderPayment: true }],
          fulfillment: 'DELIVERED',
        }),
      ),
    ).toEqual({ payment: 'REFUNDED', recharge: 'COMPLETED' });
    expect(
      orderStates(
        facts({
          status: 'REFUNDED',
          payments: [{ status: 'REFUNDED', isOrderPayment: true }],
          fulfillment: 'CANCELLED',
        }),
      ),
    ).toEqual({ payment: 'REFUNDED', recharge: 'CANCELLED' });
  });

  it('vencido o rechazado sin pago: recarga cancelada', () => {
    expect(orderStates(facts({ status: 'EXPIRED' }))).toEqual({
      payment: 'EXPIRED',
      recharge: 'CANCELLED',
    });
    expect(orderStates(facts({ status: 'REJECTED' }))).toEqual({
      payment: 'DECLINED',
      recharge: 'CANCELLED',
    });
  });

  it('nunca muestra «recarga completada» sin entrega registrada, ni «pago confirmado» sin pago', () => {
    for (const status of ORDER_STATUSES) {
      for (const fulfillment of [null, ...FULFILLMENT_STATUSES]) {
        for (const paymentStatus of [undefined, ...PAYMENT_STATUSES]) {
          for (const isOrderPayment of [false, true]) {
            const payments = paymentStatus ? [{ status: paymentStatus, isOrderPayment }] : [];
            const result = orderStates({ status, payments, fulfillment });
            expect(PAYMENT_STATES).toContain(result.payment);
            expect(RECHARGE_STATES).toContain(result.recharge);
            if (result.recharge === 'COMPLETED') expect(fulfillment).toBe('DELIVERED');
            if (result.payment === 'CONFIRMED') {
              expect(
                ['PAID', 'DELIVERING', 'DELIVERED'].includes(status) ||
                  (status === 'NEEDS_REVIEW' && isOrderPayment && paymentStatus === 'APPROVED'),
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it('cada estado tiene su texto en español', () => {
    for (const state of PAYMENT_STATES) expect(PAYMENT_STATE_LABELS[state]).toBeTruthy();
    for (const state of RECHARGE_STATES) expect(RECHARGE_STATE_LABELS[state]).toBeTruthy();
  });
});
