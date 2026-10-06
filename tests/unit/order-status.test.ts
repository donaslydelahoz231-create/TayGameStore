import { describe, expect, it } from 'vitest';
import { humanStatus, paymentInProgress } from '../../src/web/js/store/features/order-status.js';

const order = (status: string, paymentStatus: string | null) => ({
  status,
  verification: { status: 'CONFIRMED' },
  payment: { status: paymentStatus, canPay: true, checkoutAvailable: true },
});

describe('estado del pedido para el cliente', () => {
  it('un pago iniciado y sin acreditar (Efecty, PSE) se muestra como "Pago en proceso"', () => {
    expect(paymentInProgress(order('AWAITING_PAYMENT', 'PENDING'))).toBe(true);
    expect(humanStatus(order('AWAITING_PAYMENT', 'PENDING'))).toBe('Pago en proceso');
  });

  it('sin pago iniciado o con el pago rechazado sigue "Pago pendiente"', () => {
    for (const payment of [null, 'DECLINED']) {
      expect(paymentInProgress(order('AWAITING_PAYMENT', payment))).toBe(false);
      expect(humanStatus(order('AWAITING_PAYMENT', payment))).toBe('Pago pendiente');
    }
  });

  it('el navegador nunca da un pago por confirmado: solo el estado PAID del servidor', () => {
    expect(humanStatus(order('AWAITING_PAYMENT', 'APPROVED'))).toBe('Pago pendiente');
    expect(humanStatus(order('PAID', 'APPROVED'))).toBe('Pago confirmado');
  });
});
