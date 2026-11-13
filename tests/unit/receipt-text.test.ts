import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReceiptOrder } from '../../src/web/js/store/features/receipt-text.js';

// Los módulos del navegador leen `location` al cargarse: se simula antes de importarlos.
vi.stubGlobal('location', { protocol: 'https:' });
let receiptText: (order: ReceiptOrder | null | undefined, origin: string) => string;
let storeWhatsAppDigits: (value: unknown) => string;
beforeAll(async () => {
  ({ receiptText, storeWhatsAppDigits } =
    await import('../../src/web/js/store/features/receipt-text.js'));
});

const ORIGIN = 'https://tienda.example';
/** Pedido pagado ficticio (todos los datos son de prueba). */
const paid = (over: Partial<ReceiptOrder> = {}): ReceiptOrder => ({
  reference: 'TGS-AAAAAAAAAA',
  customerName: 'Cliente Ficticio',
  playerUid: '734567890',
  playerServer: 'latam',
  status: 'PAID',
  totalCop: 21800,
  items: [
    { name: '100 + 10 Diamantes', quantity: 2 },
    { name: '310 + 31 Diamantes', quantity: 1 },
  ],
  verification: { status: 'CONFIRMED', nickname: 'JugadorFicticio', region: 'Colombia' },
  payment: { method: 'mercadopago', status: 'APPROVED' },
  receipt: { number: 42, verificationCode: 'V1-ABCD-EFGH-JKLM-NPQR' },
  ...over,
});

describe('texto del comprobante para compartir o enviar a la tienda', () => {
  it('sin comprobante (pedido sin pagar) no hay texto', () => {
    expect(receiptText(null, ORIGIN)).toBe('');
    expect(receiptText(paid({ status: 'AWAITING_PAYMENT', receipt: null }), ORIGIN)).toBe('');
  });

  it('pone un dato por línea, listo para copiar', () => {
    expect(receiptText(paid(), ORIGIN).split('\n')).toEqual([
      'Comprobante TayGameStore N.º 000042',
      'Pedido: TGS-AAAAAAAAAA',
      'Cliente: Cliente Ficticio',
      'ID Free Fire: 734567890',
      'Nickname: JugadorFicticio',
      'Servidor: Colombia',
      'Paquetes:',
      '• 2× 100 + 10 Diamantes',
      '• 1× 310 + 31 Diamantes',
      'Total: $ 21.800 COP',
      'Pago: Mercado Pago · Pago confirmado',
      'Código de verificación: V1-ABCD-EFGH-JKLM-NPQR',
      'Verifícalo en https://tienda.example → Soporte → «Verificar comprobante».',
    ]);
  });

  it('sin jugador verificado no inventa nickname y usa el servidor que eligió el cliente', () => {
    const lines = receiptText(
      paid({ verification: { status: 'PENDING', nickname: null }, playerServer: 'brasil' }),
      ORIGIN,
    ).split('\n');
    expect(lines.some((l) => l.startsWith('Nickname:'))).toBe(false);
    expect(lines).toContain('Servidor: Brasil');
  });

  it('pago por Nequi y estado de entrega', () => {
    const text = receiptText(
      paid({ payment: { method: 'nequi_manual', status: 'APPROVED' }, status: 'DELIVERED' }),
      ORIGIN,
    );
    expect(text).toContain('Pago: Nequi · ¡Envío exitoso!');
  });

  it('solo datos del pedido: ni correo del cliente ni datos de la cuenta de pago', () => {
    const text = receiptText(paid(), ORIGIN);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/llave|Bre-B|celular/i);
  });
});

describe('WhatsApp de la tienda', () => {
  it('acepta el número con signos y espacios y rechaza lo que no es un número', () => {
    expect(storeWhatsAppDigits('+57 300 000 0000')).toBe('573000000000');
    expect(storeWhatsAppDigits('')).toBe('');
    expect(storeWhatsAppDigits(null)).toBe('');
    expect(storeWhatsAppDigits('123')).toBe('');
  });
});
