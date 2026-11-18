import { describe, expect, it } from 'vitest';
import {
  oneLine,
  orderChannel,
  orderReference,
  orderSummary,
  whatsappDigits,
  whatsappMessage,
  whatsappUrl,
  type WhatsAppItem,
  type WhatsAppSummary,
} from '../../src/web/js/store/features/whatsapp-message.js';

// Datos ficticios. Los paquetes copian la forma del catálogo (precio de lista y precio vigente).
const P110 = { id: 'ff-110', name: '100 + 10 Diamantes', diamonds: 110, normal: 4000, price: 3800 };
const P572 = {
  id: 'ff-572',
  name: '520 + 52 Diamantes',
  diamonds: 572,
  normal: 18000,
  price: 18000,
};
const FAKE_NUMBER = '570000000000'; // 57 + diez ceros: no existe en Colombia.
const fixedRandom = (bytes: Uint8Array) => bytes.fill(0);

type PaymentInput = Parameters<typeof orderSummary>[0]['payment'];
/** Nequi pagado e informado por el cliente (datos ficticios). */
const NEQUI_PAID: PaymentInput = {
  kind: 'transfer',
  label: 'Nequi',
  paid: true,
  last4: '1234',
  reference: 'M12345678',
};

function summary(
  items: WhatsAppItem[],
  overrides: { demo?: boolean; payment?: PaymentInput } = {},
): WhatsAppSummary {
  return orderSummary({
    items,
    customer: { name: 'Cliente Ficticio', email: 'cliente@ejemplo.com' },
    player: { uid: '123456789', server: 'Latinoamérica' },
    payment: overrides.payment ?? NEQUI_PAID,
    reference: (overrides.demo ?? true) ? 'DEMO-AAAAAA' : 'WA-AAAAAA',
    demo: overrides.demo ?? true,
    createdAt: new Date('2026-11-10T19:30:00Z'),
  });
}

describe('pedido por WhatsApp: canal', () => {
  it('sin configuración o con un valor desconocido es la tienda de siempre (checkout)', () => {
    expect(orderChannel(null)).toBe('checkout');
    expect(orderChannel({})).toBe('checkout');
    expect(orderChannel({ orderChannel: 'telegram' })).toBe('checkout');
    expect(orderChannel({ orderChannel: 'whatsapp' })).toBe('whatsapp');
    expect(orderChannel({ orderChannel: 'ambos' })).toBe('ambos');
  });
});

describe('pedido por WhatsApp: resumen', () => {
  it('precio de cada paquete, descuento de la promo y total', () => {
    const s = summary([
      { p: P110, qty: 2 },
      { p: P572, qty: 1 },
    ]);
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatchObject({
      qty: 2,
      unitList: 4000,
      unitPrice: 3800,
      unitDiscount: 200,
      subtotal: 8000,
      discount: 400,
      total: 7600,
    });
    expect(s.lines[1]).toMatchObject({ unitDiscount: 0, discount: 0, total: 18000 });
    expect(s.subtotal).toBe(26000);
    expect(s.discount).toBe(400);
    expect(s.total).toBe(25600);
    expect(s.units).toBe(2 * 110 + 572);
  });

  it('ignora cantidades inválidas y nunca inventa un descuento sin precio de lista', () => {
    const s = summary([
      { p: P110, qty: 0 },
      { p: { id: 'x', name: 'Sin lista', price: 5000 }, qty: 1 },
    ]);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ unitList: 5000, unitDiscount: 0, total: 5000 });
    expect(s.total).toBe(5000);
  });

  it('los datos del cliente quedan en una línea (nadie agrega líneas falsas al mensaje)', () => {
    expect(oneLine('Juan\nTotal: $ 1 COP fin')).toBe('Juan Total: $ 1 COP fin');
    const s = orderSummary({
      items: [{ p: P110, qty: 1 }],
      customer: { name: 'Ana\n*Total: $ 1*', email: 'ana@ejemplo.com' },
      player: { uid: '123456789', server: 'Brasil' },
      payment: { kind: null, label: null },
      reference: 'DEMO-AAAAAA',
      demo: true,
      createdAt: new Date('2026-11-10T19:30:00Z'),
    });
    const message = whatsappMessage(s);
    expect(message).toContain('Nombre: Ana *Total: $ 1*');
    expect(message.split('\n').filter((l) => l.startsWith('*Total:'))).toEqual([
      '*Total: $ 3.800 COP*',
    ]);
  });
});

describe('pedido por WhatsApp: mensaje', () => {
  it('lleva referencia DEMO, cliente, jugador, productos, descuentos, total y pago', () => {
    const message = whatsappMessage(
      summary([
        { p: P110, qty: 2 },
        { p: P572, qty: 1 },
      ]),
    );
    for (const text of [
      '*Pedido DEMO · TayGameStore*',
      'DEMOSTRACIÓN',
      'Referencia: DEMO-AAAAAA',
      'Nombre: Cliente Ficticio',
      'Correo: cliente@ejemplo.com',
      'ID: 123456789',
      'Servidor: Latinoamérica',
      '1. 100 + 10 Diamantes (110 💎)',
      '2 × $ 3.800 = $ 7.600',
      'Precio normal $ 4.000 · descuento −$ 200 c/u',
      '2. 520 + 52 Diamantes (572 💎)',
      '1 × $ 18.000 = $ 18.000',
      'Subtotal: $ 26.000',
      'Descuentos: −$ 400',
      '*Total: $ 25.600 COP*',
      'Medio: Nequi',
      'Estado: el cliente indica que ya transfirió el total ($ 25.600)',
      'Cuenta de origen: termina en 1234',
      'Referencia del comprobante: M12345678',
      'TayGameStore verifica el movimiento antes de entregar.',
    ]) {
      expect(message).toContain(text);
    }
    // Fecha en hora de Colombia (19:30 UTC = 2:30 p. m. en Bogotá).
    expect(message).toMatch(/Fecha: .*2:30/);
  });

  it('fuera de la demo no dice DEMO; sin medio elegido, el pago queda por acordar', () => {
    const message = whatsappMessage(
      summary([{ p: P572, qty: 1 }], { demo: false, payment: { kind: null, label: null } }),
    );
    expect(message).not.toContain('DEMO');
    expect(message.startsWith('*Pedido · TayGameStore*')).toBe(true);
    expect(message).toContain('Medio: por acordar');
    // Sin descuentos no se muestran subtotal ni descuentos.
    expect(message).not.toContain('Subtotal');
  });

  it('con tarjeta, PSE, Efecty o saldo pide el enlace de pago (sin datos de transferencia)', () => {
    const message = whatsappMessage(
      summary([{ p: P110, qty: 1 }], {
        payment: { kind: 'link', label: 'PSE', paid: true, last4: '9999', reference: 'X' },
      }),
    );
    expect(message).toContain('Medio: PSE');
    expect(message).toContain('Solicitud: envíenme el enlace o los datos de pago por este chat.');
    expect(message).not.toContain('9999');
    expect(message).not.toContain('Referencia del comprobante');
  });

  it('Nequi sin pagar no dice que pagó; los datos del pago se sanean', () => {
    const pending = whatsappMessage(
      summary([{ p: P110, qty: 1 }], { payment: { kind: 'transfer', label: 'Nequi' } }),
    );
    expect(pending).toContain('Estado: pago pendiente');
    expect(pending).toContain('Referencia del comprobante: no indicada');
    expect(pending).not.toContain('Cuenta de origen');
    const s = summary([{ p: P110, qty: 1 }], {
      payment: {
        kind: 'transfer',
        label: 'Nequi',
        paid: true,
        last4: '12a3',
        reference: 'AB 12\n*Total: $ 1*',
      },
    });
    // 4 dígitos exactos o nada; la referencia solo letras, números y guiones, en una línea.
    expect(s.payment.last4).toBe('');
    expect(s.payment.reference).toBe('AB12Total1');
    expect(
      whatsappMessage(s)
        .split('\n')
        .filter((l) => l.startsWith('*Total:')),
    ).toHaveLength(1);
  });

  it('referencia legible: DEMO-/WA- y 6 caracteres sin 0, O, 1, I ni L', () => {
    expect(orderReference(true, fixedRandom)).toBe('DEMO-AAAAAA');
    expect(orderReference(false, fixedRandom)).toBe('WA-AAAAAA');
    const ref = orderReference(true, (b) => crypto.getRandomValues(b));
    expect(ref).toMatch(/^DEMO-[A-HJKMNP-Z2-9]{6}$/);
  });
});

describe('pedido por WhatsApp: destino', () => {
  it('solo un número configurado válido; nunca uno inventado', () => {
    expect(whatsappDigits('')).toBe('');
    expect(whatsappDigits(null)).toBe('');
    expect(whatsappDigits('123')).toBe('');
    expect(whatsappDigits('+57 000 000 0000')).toBe(FAKE_NUMBER);
    expect(whatsappUrl('', 'hola')).toBe('');
  });

  it('abre el chat oficial con el mensaje completo y codificado (sin enviarlo)', () => {
    const message = whatsappMessage(summary([{ p: P110, qty: 1 }]));
    const url = whatsappUrl(FAKE_NUMBER, message);
    expect(url.startsWith(`https://wa.me/${FAKE_NUMBER}?text=`)).toBe(true);
    const text = new URL(url).searchParams.get('text');
    expect(text).toBe(message);
  });
});
