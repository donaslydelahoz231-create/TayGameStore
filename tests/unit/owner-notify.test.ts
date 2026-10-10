import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config/env.js';
import {
  paidOrderText,
  TelegramOwnerNotifier,
  type PaidOrderNotice,
} from '../../src/server/integrations/notify/owner.js';

const TOKEN = `123456789:${'A'.repeat(35)}`;
const notice: PaidOrderNotice = {
  reference: 'TGS-ABC123',
  totalCop: 25_900,
  playerUid: '765432100',
  nickname: '<b>Jugador</b>',
  items: [{ name: '100 + 10 Diamantes', quantity: 2 }],
};

describe('aviso al dueño por Telegram', () => {
  it('envía sendMessage al chat configurado, en texto plano', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const notifier = new TelegramOwnerNotifier({ botToken: TOKEN, chatId: '-1001234' }, (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch);
    await notifier.orderPaid(notice);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(calls[0]?.init.method).toBe('POST');
    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ chat_id: '-1001234' });
    expect(body).not.toHaveProperty('parse_mode');
    expect(body.text).toBe(paidOrderText(notice));
  });

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

  it('los errores nunca incluyen el token del bot', async () => {
    const rejecting = new TelegramOwnerNotifier(
      { botToken: TOKEN, chatId: '1' },
      async () => new Response('{"ok":false}', { status: 401 }),
    );
    await expect(rejecting.orderPaid(notice)).rejects.toThrow('HTTP 401');
    const offline = new TelegramOwnerNotifier({ botToken: TOKEN, chatId: '1' }, (async (
      url: string,
    ) => {
      throw new TypeError(`fetch failed ${url}`);
    }) as unknown as typeof fetch);
    await expect(offline.orderPaid(notice)).rejects.toThrow('Telegram no respondió (TypeError)');
  });

  it('configuración: token y chat van juntos y con formato válido', () => {
    expect(loadConfig({}).ownerNotify.telegram).toBeUndefined();
    expect(
      loadConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '@mi_canal' }).ownerNotify.telegram,
    ).toEqual({ botToken: TOKEN, chatId: '@mi_canal' });
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: TOKEN })).toThrow(/TELEGRAM_CHAT_ID/);
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_CHAT_ID: '1' })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
    // El mensaje de error nunca repite el valor recibido.
    try {
      loadConfig({ TELEGRAM_BOT_TOKEN: 'secreto-mal-escrito', TELEGRAM_CHAT_ID: '1' });
    } catch (error) {
      expect((error as Error).message).not.toContain('secreto-mal-escrito');
    }
  });
});
