import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config/env.js';
import { paidOrderText, type PaidOrderNotice } from '../../src/server/integrations/notify/owner.js';

const notice: PaidOrderNotice = {
  reference: 'TGS-ABC123',
  totalCop: 25_900,
  playerUid: '765432100',
  nickname: '<b>Jugador</b>',
  items: [{ name: '100 + 10 Diamantes', quantity: 2 }],
};

describe('aviso al dueño (texto del correo de pedido pagado)', () => {
  it('el texto dice qué entregar: referencia, total, ID y paquetes', () => {
    const text = paidOrderText(notice);
    expect(text).toContain('TGS-ABC123');
    expect(text).toMatch(/25\.900/);
    expect(text).toContain('765432100 (<b>Jugador</b>)');
    expect(text).toContain('2 × 100 + 10 Diamantes');
    // Sin servidor declarado (pedidos anteriores) no aparece la línea.
    expect(text).not.toContain('Servidor:');
  });

  it('incluye el servidor de Free Fire en el que hay que entregar', () => {
    expect(paidOrderText({ ...notice, server: 'Brasil' })).toContain('Servidor: Brasil');
  });

  it('Telegram no existe: sus variables se ignoran y no activan ningún canal', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: `123456789:${'A'.repeat(35)}`,
      TELEGRAM_CHAT_ID: '-1001234',
    });
    expect(JSON.stringify(config)).not.toMatch(/telegram/i);
  });
});
