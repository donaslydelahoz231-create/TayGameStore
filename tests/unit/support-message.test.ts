import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { state as StoreState } from '../../src/web/js/store/state.js';

// Los módulos del navegador leen `location` al cargarse: se simula antes de importarlos.
vi.stubGlobal('location', { protocol: 'https:' });
let state: typeof StoreState;
let supportMessage: () => string;
beforeAll(async () => {
  ({ state } = await import('../../src/web/js/store/state.js'));
  ({ supportMessage } = await import('../../src/web/js/store/features/support.js'));
});

/** Mensaje que abre WhatsApp/correo: útil en cada momento de la compra (datos ficticios). */
const reset = () => {
  state.currentOrder = null;
  state.qty = {};
  state.products.freefire = [];
  state.uidAccepted = false;
  state.playerUid = '';
};
afterEach(reset);

describe('mensaje de soporte', () => {
  it('antes de comprar es una consulta, nunca «pedido BORRADOR»', () => {
    reset();
    expect(supportMessage()).toBe('Hola TayGameStore, quiero recargar diamantes de Free Fire.');
  });

  it('con carrito dice qué paquetes y para qué ID', () => {
    state.products.freefire = [{ id: 'ff-110', name: '100 + 10 Diamantes', price: 3800 }];
    state.qty = { 'ff-110': 2 };
    state.uidAccepted = true;
    state.playerUid = '123456789';
    expect(supportMessage()).toBe(
      'Hola TayGameStore, quiero recargar 2× 100 + 10 Diamantes para el ID 123456789.',
    );
  });

  it('con pedido incluye referencia, ID y servidor', () => {
    state.currentOrder = {
      reference: 'TGS-ABCDE12345',
      playerUid: '123456789',
      playerServer: 'brasil',
    };
    expect(supportMessage()).toBe(
      'Hola TayGameStore, necesito soporte con mi pedido TGS-ABCDE12345 (ID 123456789, servidor Brasil).',
    );
  });
});
