import { describe, expect, it } from 'vitest';
import {
  humanStatus,
  paymentInProgress,
  purchaseSucceeded,
} from '../../src/web/js/store/features/order-status.js';

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

describe('«Compra exitosa» en el historial y el comprobante', () => {
  const receipt = { number: 42, verificationCode: 'V1-ABCD-EFGH-JKLM-NPQR' };
  const withReceipt = (status: string, paymentStatus: string) => ({
    ...order(status, paymentStatus),
    receipt,
  });

  it('solo con comprobante del servidor y el pedido en curso o entregado', () => {
    for (const status of ['PAID', 'DELIVERING', 'DELIVERED']) {
      expect(purchaseSucceeded(withReceipt(status, 'APPROVED'))).toBe(true);
    }
  });

  it('reembolsado o en revisión conserva el comprobante, pero no es una compra exitosa', () => {
    expect(purchaseSucceeded(withReceipt('REFUNDED', 'REFUNDED'))).toBe(false);
    expect(purchaseSucceeded(withReceipt('NEEDS_REVIEW', 'APPROVED'))).toBe(false);
  });

  it('sin comprobante nunca es compra exitosa, aunque el estado diga pagado', () => {
    expect(purchaseSucceeded(order('PAID', 'APPROVED'))).toBe(false);
    expect(purchaseSucceeded({ ...order('DELIVERED', 'APPROVED'), receipt: null })).toBe(false);
    expect(purchaseSucceeded(null)).toBe(false);
  });
});
