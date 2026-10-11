import { describe, expect, it } from 'vitest';
import { collect, runUnipinCheck, shape } from '../../src/server/cli/unipin-check.js';
import { loadConfig } from '../../src/server/config/env.js';
import { UniPinTopupProvider } from '../../src/server/integrations/topup/unipin.js';

const SECRET = 'llave-ficticia-de-prueba';
const env = {
  TOPUP_PROVIDER: 'unipin',
  UNIPIN_PARTNER_ID: 'socio-ficticio-0001',
  UNIPIN_SECRET_KEY: SECRET,
  UNIPIN_CATALOG: '{"latam":{"game":"FF_LATAM","skus":{"ff-110":"D110"}}}',
};

/** UniPin simulado por ruta: devuelve el cuerpo JSON indicado. */
function fakeUniPin(routes: Record<string, unknown>, seen: string[] = []) {
  return (topup: NonNullable<ReturnType<typeof loadConfig>['topup']>) =>
    new UniPinTopupProvider({
      ...topup,
      fetch: async (url) => {
        const path = new URL(url instanceof Request ? url.url : url).pathname.slice(1);
        seen.push(path);
        return new Response(JSON.stringify(routes[path] ?? { status: 0, error: { code: '701' } }));
      },
    });
}

const LIST = { status: 1, game_list: [{ game_code: 'FF_LATAM', game_name: 'Free Fire' }] };
const DETAIL = {
  status: 1,
  denominations: [{ id: 'D110', name: '110 Diamonds' }],
  fields: [{ name: 'userid', type: 'text' }],
};

async function run(args: string[], routes: Record<string, unknown>, extra = {}) {
  const lines: string[] = [];
  const seen: string[] = [];
  const ok = await runUnipinCheck(
    args,
    loadConfig({ ...env, ...extra }),
    fakeUniPin(routes, seen),
    {
      out: (line) => lines.push(line),
    },
  );
  return { ok, lines, seen, text: lines.join('\n') };
}

describe('npm run unipin:check', () => {
  it('firma aceptada, juego, denominaciones y campo del ID correctos', async () => {
    const { ok, text } = await run([], {
      'in-game-topup/list': LIST,
      'in-game-topup/detail': DETAIL,
    });
    expect(ok).toBe(true);
    expect(text).toContain('OK     firma aceptada · 1 juegos');
    expect(text).toContain('OK     latam: FF_LATAM con sus 1 paquetes');
    expect(text).toContain('OK     latam: campos que pide UniPin: userid');
    // Estructura de las respuestas, nunca sus valores ni la llave.
    expect(text).toContain('respuesta: status, game_list[game_code, game_name]');
    expect(text).not.toContain(SECRET);
  });

  it('credenciales rechazadas: lo dice y se detiene', async () => {
    const { ok, text, seen } = await run([], {
      'in-game-topup/list': { status: 0, error: { code: '702' } },
    });
    expect(ok).toBe(false);
    expect(text).toContain('FALLA  lista de juegos: error 702');
    expect(seen).toEqual(['in-game-topup/list']);
  });

  it('denominación o campo del ID que UniPin no tiene: FALLA con la corrección', async () => {
    const { ok, text } = await run([], {
      'in-game-topup/list': LIST,
      'in-game-topup/detail': {
        status: 1,
        denominations: [{ id: 'OTRA' }],
        fields: [{ name: 'user_id' }],
      },
    });
    expect(ok).toBe(false);
    expect(text).toContain('denominaciones que UniPin no lista: ff-110→D110');
    expect(text).toContain('ajusta uidField en UNIPIN_CATALOG');
  });

  it('--uid valida el jugador sin crear nada', async () => {
    const { ok, text, seen } = await run(['--uid', '123456789'], {
      'in-game-topup/list': LIST,
      'in-game-topup/detail': DETAIL,
      'in-game-topup/user/validate': { status: 1, validation_token: 'v', username: 'Tay' },
    });
    expect(ok).toBe(true);
    expect(text).toContain('OK     UniPin reconoce el ID 123456789 (Tay)');
    expect(seen).not.toContain('in-game-topup/order/create');
  });

  it('--compra-prueba en staging: crea y confirma con la consulta', async () => {
    const { ok, text } = await run(['--uid', '123456789', '--compra-prueba'], {
      'in-game-topup/list': LIST,
      'in-game-topup/detail': DETAIL,
      'in-game-topup/user/validate': { status: 1, validation_token: 'v' },
      'in-game-topup/order/create': { status: 1, transaction_number: 'UP1' },
      'in-game-topup/order/inquiry': { status: 1, transaction_number: 'UP1' },
    });
    expect(ok).toBe(true);
    expect(text).toMatch(/OK {5}recarga de prueba TGS-PRUEBA-\d+: transacción UP1/);
    expect(text).toMatch(/OK {5}la consulta confirma la recarga/);
  });

  it('--compra-prueba se niega en producción (gastaría saldo real)', async () => {
    await expect(
      run(['--uid', '123456789', '--compra-prueba'], {}, { UNIPIN_ENV: 'production' }),
    ).rejects.toThrow('solo corre con UNIPIN_ENV=staging');
  });

  it('sin recarga directa configurada: explica qué variables faltan', async () => {
    await expect(
      runUnipinCheck([], loadConfig({}), fakeUniPin({}), { out: () => undefined }),
    ).rejects.toThrow('TOPUP_PROVIDER=unipin');
  });
});

describe('utilidades', () => {
  it('collect busca a cualquier profundidad; shape describe sin valores', () => {
    expect(collect({ a: [{ game_code: 'X' }, { b: { game_code: 'Y' } }] }, 'game_code')).toEqual([
      'X',
      'Y',
    ]);
    expect(shape({ status: 1, list: [{ id: 'secreto', n: 2 }] })).toBe('status, list[id, n]');
  });
});
