import { describe, expect, it } from 'vitest';
import { orderChannel } from '../../src/web/js/store/features/order-channel.js';

describe('canal para cerrar el pedido', () => {
  it('sin configuración o con un valor desconocido es la tienda de siempre (checkout)', () => {
    expect(orderChannel(null)).toBe('checkout');
    expect(orderChannel(undefined)).toBe('checkout');
    expect(orderChannel({})).toBe('checkout');
    expect(orderChannel({ orderChannel: 'telegram' })).toBe('checkout');
    expect(orderChannel({ orderChannel: 'checkout' })).toBe('checkout');
    expect(orderChannel({ orderChannel: 'whatsapp' })).toBe('whatsapp');
    expect(orderChannel({ orderChannel: 'ambos' })).toBe('ambos');
  });
});
