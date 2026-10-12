import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config/env.js';
import {
  classifyCreate,
  classifyInquiry,
  classifyValidate,
  readReply,
  unipinHeaders,
  UniPinTopupProvider,
} from '../../src/server/integrations/topup/unipin.js';

const PARTNER = 'socio-ficticio-0001';
const SECRET = 'llave-ficticia-de-prueba';

describe('firma de UniPin (SDK oficial: HMAC-SHA256 de partnerid + timestamp + path)', () => {
  it('coincide con un cálculo independiente', () => {
    // python3: hmac.new(SECRET, PARTNER + '1760000000' + path, sha256).hexdigest()
    const headers = unipinHeaders(PARTNER, SECRET, 'in-game-topup/order/create', 1760000000);
    expect(headers).toEqual({
      'content-type': 'application/json',
      partnerid: PARTNER,
      timestamp: '1760000000',
      path: 'in-game-topup/order/create',
      auth: '1828ec4649cc9e936c48a060256a61229ebb0c6668f1319bb97bf931f576ca12',
    });
  });
});

describe('lectura de respuestas', () => {
  it('status 1 → ok; status 0 con código → error explícito', () => {
    expect(readReply(200, '{"status":1,"validation_token":"t"}')).toMatchObject({ ok: true });
    expect(readReply(200, '{"status":"0","error":{"code":"708","message":"dup"}}')).toEqual({
      ok: false,
      uncertain: false,
      code: '708',
    });
  });

  it('5xx, 408, 429, cuerpo ilegible o estado desconocido → incierto', () => {
    for (const [status, body] of [
      [502, ''],
      [408, ''],
      [429, ''],
      [200, '<html>'],
      [200, '[]'],
      [200, '{"status":"procesando"}'],
    ] as const) {
      expect(readReply(status, body)).toMatchObject({ ok: false, uncertain: true });
    }
  });

  it('4xx → error explícito (UniPin no procesó la petición)', () => {
    expect(readReply(401, '')).toEqual({ ok: false, uncertain: false, code: 'http_401' });
  });

  it('el código de error se limpia antes de guardarlo', () => {
    expect(readReply(200, '{"status":0,"error":{"code":"<b>7 0 7</b>"}}')).toMatchObject({
      code: 'b707b',
    });
    expect(readReply(200, '{"status":0,"error":{"code":{"x":1}}}')).toMatchObject({
      code: 'sin_codigo',
    });
  });
});

describe('clasificación', () => {
  const ok = (body: Record<string, unknown>) => ({ ok: true as const, body });
  const err = (code: string) => ({ ok: false as const, uncertain: false as const, code });
  const unsure = { ok: false as const, uncertain: true as const, reason: 'timeout' };

  it('validar: necesita validation_token', () => {
    expect(classifyValidate(ok({ validation_token: 'abc', username: 'Tay' }))).toEqual({
      kind: 'ok',
      token: 'abc',
      username: 'Tay',
    });
    expect(classifyValidate(ok({}))).toMatchObject({ kind: 'uncertain' });
    expect(classifyValidate(err('727'))).toEqual({ kind: 'failed', code: '727' });
    expect(classifyValidate(unsure)).toEqual({ kind: 'uncertain', reason: 'timeout' });
  });

  it('crear: éxito solo con transaction_number; 708 y 726 tienen su propio camino', () => {
    expect(classifyCreate(ok({ transaction_number: 'UP123' }))).toEqual({
      kind: 'success',
      transaction: 'UP123',
    });
    expect(classifyCreate(ok({}))).toMatchObject({ kind: 'uncertain' });
    expect(classifyCreate(err('708'))).toEqual({ kind: 'duplicate' });
    expect(classifyCreate(err('726'))).toEqual({ kind: 'token_expired' });
    expect(classifyCreate(err('707'))).toEqual({ kind: 'failed', code: '707' });
    expect(classifyCreate(unsure)).toEqual({ kind: 'uncertain', reason: 'timeout' });
  });

  it('consultar: un error de la consulta no prueba que la recarga no se hizo', () => {
    expect(classifyInquiry(ok({ transaction_number: 99 }))).toEqual({
      kind: 'success',
      transaction: '99',
    });
    expect(classifyInquiry(err('702'))).toEqual({ kind: 'uncertain', reason: 'error_702' });
    expect(classifyInquiry(ok({}))).toMatchObject({ kind: 'uncertain' });
  });
});

describe('cliente HTTP', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const provider = (reply: () => Promise<Response>) =>
    new UniPinTopupProvider({
      baseUrl: 'https://dev-api.unipin.com/',
      partnerId: PARTNER,
      secretKey: SECRET,
      timeoutMs: 2000,
      now: () => new Date(1760000000 * 1000),
      fetch: async (url, init) => {
        calls.push({ url: url instanceof Request ? url.url : new URL(url).href, init: init ?? {} });
        return reply();
      },
    });

  it('POST firmado a la ruta del SDK con los campos de la documentación', async () => {
    calls.length = 0;
    const up = provider(async () => new Response('{"status":1,"transaction_number":"UP9"}'));
    await expect(
      up.createOrder({
        game: 'FF',
        validationToken: 'tok',
        referenceNo: 'TGS-1-11-1',
        denominationId: 'D1',
      }),
    ).resolves.toEqual({ kind: 'success', transaction: 'UP9' });
    const [call] = calls;
    expect(call?.url).toBe('https://dev-api.unipin.com/in-game-topup/order/create');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      path: 'in-game-topup/order/create',
      auth: '1828ec4649cc9e936c48a060256a61229ebb0c6668f1319bb97bf931f576ca12',
    });
    expect(JSON.parse(call?.init.body as string)).toEqual({
      game_code: 'FF',
      validation_token: 'tok',
      reference_no: 'TGS-1-11-1',
      denomination_id: 'D1',
    });
  });

  it('validar envía el ID en el campo del catálogo; consultar, solo la referencia', async () => {
    calls.length = 0;
    const up = provider(async () => new Response('{"status":1,"validation_token":"v"}'));
    await up.validateUser({ game: 'FF', uidField: 'userid', playerUid: '123456789' });
    await up.inquiry('TGS-1-11-1');
    expect(calls.map((c) => [c.url, JSON.parse(c.init.body as string) as unknown])).toEqual([
      [
        'https://dev-api.unipin.com/in-game-topup/user/validate',
        { game_code: 'FF', fields: { userid: '123456789' } },
      ],
      ['https://dev-api.unipin.com/in-game-topup/order/inquiry', { reference_no: 'TGS-1-11-1' }],
    ]);
  });

  it('fallo de red o tiempo agotado → incierto (nunca lanza)', async () => {
    const timeout = provider(async () => {
      throw new DOMException('tiempo', 'TimeoutError');
    });
    await expect(timeout.inquiry('R')).resolves.toEqual({ kind: 'uncertain', reason: 'timeout' });
    const network = provider(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      network.createOrder({
        game: 'FF',
        validationToken: 't',
        referenceNo: 'R',
        denominationId: 'D',
      }),
    ).resolves.toEqual({ kind: 'uncertain', reason: 'red' });
  });
});

describe('configuración', () => {
  const base = {
    TOPUP_PROVIDER: 'unipin',
    UNIPIN_PARTNER_ID: PARTNER,
    UNIPIN_SECRET_KEY: SECRET,
    UNIPIN_CATALOG: '{"latam":{"game":"FF","skus":{"ff-110":"D110"}}}',
  };
  const issues = (env: Record<string, string>) => {
    try {
      loadConfig(env);
      return [];
    } catch (error) {
      if (error instanceof ConfigError) return error.issues;
      throw error;
    }
  };

  it('apagada por defecto', () => {
    expect(loadConfig({}).topup).toBeUndefined();
  });

  it('staging por defecto, con el host del SDK y uidField `userid`', () => {
    expect(loadConfig(base).topup).toMatchObject({
      env: 'staging',
      baseUrl: 'https://dev-api.unipin.com/',
      catalog: {
        latam: {
          game: 'FF',
          uidField: 'userid',
          skus: { 'ff-110': { denomination: 'D110', costCop: null } },
        },
      },
    });
    expect(loadConfig({ ...base, UNIPIN_ENV: 'production' }).topup?.baseUrl).toBe(
      'https://api.unipin.com/',
    );
  });

  it('exige credenciales y catálogo', () => {
    expect(issues({ TOPUP_PROVIDER: 'unipin' })).toEqual([
      'UNIPIN_PARTNER_ID: obligatoria con TOPUP_PROVIDER=unipin',
      'UNIPIN_SECRET_KEY: obligatoria con TOPUP_PROVIDER=unipin',
      'UNIPIN_CATALOG: obligatoria con TOPUP_PROVIDER=unipin',
    ]);
  });

  it('un catálogo inválido se rechaza sin repetir su contenido', () => {
    for (const catalog of ['no-es-json', '{}', '{"marte":{"game":"FF","skus":{}}}']) {
      const found = issues({ ...base, UNIPIN_CATALOG: catalog });
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^UNIPIN_CATALOG:/);
      expect(found[0]).not.toContain('marte');
    }
  });

  it('en producción solo la recarga real: staging no entrega diamantes', () => {
    const prod = issues({ ...base, NODE_ENV: 'production' });
    expect(prod).toContain(
      'UNIPIN_ENV: en producción debe ser production (staging no entrega diamantes)',
    );
  });

  it('las credenciales no aparecen en los errores', () => {
    const found = issues({ ...base, UNIPIN_CATALOG: 'x' }).join('\n');
    expect(found).not.toContain(SECRET);
    expect(found).not.toContain(PARTNER);
  });
});
