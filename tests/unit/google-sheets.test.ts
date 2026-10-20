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
import {
  DELIVERY_COLUMNS,
  deliveryRow,
  deliveryStatusLabel,
  playerConfirmationLabel,
  SHEET_COLUMNS,
  sheetRow,
  sheetText,
} from '../../src/server/services/notifications.js';

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
      tabs: { orders: 'Pedidos', deliveries: 'Entregas' },
      fetch: fetcher.impl,
    });
    await log.appendRow('orders', ['TGS-AAAAAAAAAA', '=IMPORTXML("https://evil.example")', 3800]);
    await log.appendRow('orders', ['TGS-BBBBBBBBBB', 'Pago confirmado', 11000]);
    expect(fetcher.calls).toHaveLength(3);
    const [token, append] = fetcher.calls;
    expect(token?.url).toBe(GOOGLE_TOKEN_URL);
    expect((token?.init.body as URLSearchParams).toString()).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    );
    expect(append?.url).toBe(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Pedidos!A1:append?valueInputOption=RAW&insertDataOption=OVERWRITE`.replace(
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
      tabs: { orders: 'Pedidos', deliveries: 'Entregas' },
      fetch: fetcher.impl,
    });
    const error = await log.appendRow('orders', ['x']).catch((caught: unknown) => caught);
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
      tabs: { orders: 'Pedidos', deliveries: 'Entregas' },
      fetch: fetcher.impl,
    });
    await expect(log.appendRow('orders', ['x'])).rejects.toBeInstanceOf(SheetsError);
    await log.appendRow('orders', ['x']);
    expect((fetcher.calls[3]?.init.headers as Record<string, string>).authorization).toBe(
      'Bearer segundo',
    );
  });
});

describe('Google Sheets: pestaña «Entregas»', () => {
  it('escribe en la pestaña configurada para entregas, también como texto literal', async () => {
    const fetcher = fakeFetch([json({ access_token: 'token' }), json({})]);
    const log = new GoogleSheetsLog({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey,
      tabs: { orders: 'Pedidos', deliveries: 'Entregas' },
      fetch: fetcher.impl,
    });
    await log.appendRow('deliveries', ['TGS-AAAAAAAAAA', '0123456789', '=HYPERLINK("x")']);
    const append = fetcher.calls[1];
    expect(append?.url).toContain(`/values/${encodeURIComponent('Entregas!A1')}:append?`);
    expect(append?.url).toContain('valueInputOption=RAW');
    expect(JSON.parse(append?.init.body as string)).toEqual({
      values: [['TGS-AAAAAAAAAA', '0123456789', '=HYPERLINK("x")']],
    });
  });
});

describe('Google Sheets: fila única por pedido en «Entregas»', () => {
  const sheetLog = (impl: typeof fetch, deliveries = 'Entregas') =>
    new GoogleSheetsLog({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey,
      tabs: { orders: 'Pedidos', deliveries },
      fetch: impl,
    });
  const values = (url: string) => decodeURIComponent(url.split('/values/')[1] ?? '');

  it('si la referencia ya tiene fila, reescribe esa fila (RAW) y no agrega otra', async () => {
    const fetcher = fakeFetch([
      json({ access_token: 'token' }),
      json({ values: [['Referencia', 'TGS-AAAAAAAAAA', '', 'TGS-BBBBBBBBBB']] }),
      json({}),
    ]);
    await sheetLog(fetcher.impl).upsertRow('deliveries', [
      'TGS-BBBBBBBBBB',
      '✅ Entregado con éxito',
    ]);
    const [, read, write] = fetcher.calls;
    expect(values(read?.url ?? '')).toBe('Entregas!A:A?majorDimension=COLUMNS');
    expect(read?.init.method).toBe('GET');
    expect(values(write?.url ?? '')).toBe('Entregas!A4?valueInputOption=RAW');
    expect(write?.init.method).toBe('PUT');
    expect(JSON.parse(write?.init.body as string)).toEqual({
      values: [['TGS-BBBBBBBBBB', '✅ Entregado con éxito']],
    });
  });

  it('si no la encuentra, agrega la fila al final; nunca pisa los encabezados', async () => {
    const fetcher = fakeFetch([
      json({ access_token: 'token' }),
      json({ values: [['Referencia']] }),
      json({}),
    ]);
    await sheetLog(fetcher.impl).upsertRow('deliveries', ['Referencia', 'x']);
    const write = fetcher.calls[2];
    expect(write?.url).toContain(`/values/${encodeURIComponent('Entregas!A1')}:append?`);
    expect(write?.init.method).toBe('POST');
  });

  it('con la pestaña vacía (sin valores) agrega la fila', async () => {
    const fetcher = fakeFetch([json({ access_token: 'token' }), json({}), json({})]);
    await sheetLog(fetcher.impl).upsertRow('deliveries', ['TGS-AAAAAAAAAA']);
    expect(fetcher.calls[2]?.url).toContain(':append?');
  });

  it('un nombre de pestaña con espacios va entre comillas en el rango', async () => {
    const fetcher = fakeFetch([json({ access_token: 'token' }), json({}), json({})]);
    await sheetLog(fetcher.impl, 'Mis entregas').upsertRow('deliveries', ['TGS-AAAAAAAAAA']);
    expect(values(fetcher.calls[1]?.url ?? '')).toBe("'Mis entregas'!A:A?majorDimension=COLUMNS");
    expect(values(fetcher.calls[2]?.url ?? '')).toBe(
      "'Mis entregas'!A1:append?valueInputOption=RAW&insertDataOption=OVERWRITE",
    );
  });

  it('nunca inserta filas: agregar no desplaza los rangos de las fórmulas del dueño', async () => {
    // Con INSERT_ROWS, Google insertaba la fila delante de las vacías y «Pedidos!B2:B» de
    // «Resumen» pasaba a «B3:B», dejando fuera los pedidos (visto en una copia de la hoja real).
    const fetcher = fakeFetch([json({ access_token: 'token' }), json({}), json({}), json({})]);
    const log = sheetLog(fetcher.impl);
    await log.appendRow('orders', ['TGS-AAAAAAAAAA', 'Pago confirmado']);
    await log.upsertRow('deliveries', ['TGS-AAAAAAAAAA']);
    const appends = fetcher.calls.filter((call) => call.url.includes(':append?'));
    expect(appends).toHaveLength(2);
    for (const call of appends) {
      expect(call.url).toContain('insertDataOption=OVERWRITE');
      expect(call.url).not.toContain('INSERT_ROWS');
    }
  });

  it('si Google no deja leer, falla sin escribir (se reintenta desde la cola)', async () => {
    const fetcher = fakeFetch([json({ access_token: 'token' }), json({}, 403)]);
    await expect(
      sheetLog(fetcher.impl).upsertRow('deliveries', ['TGS-AAAAAAAAAA']),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher.calls).toHaveLength(2);
  });

  it('una fila sin clave no se escribe', async () => {
    const fetcher = fakeFetch([]);
    await expect(sheetLog(fetcher.impl).upsertRow('deliveries', [''])).rejects.toBeInstanceOf(
      SheetsError,
    );
    expect(fetcher.calls).toHaveLength(0);
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

  it('con las tres variables queda configurado (pestañas «Pedidos» y «Entregas» por defecto)', () => {
    const config = loadConfig(sheetsEnv());
    expect(config.sheets).toMatchObject({
      spreadsheetId: SPREADSHEET_ID,
      clientEmail: CLIENT_EMAIL,
      tabs: { orders: 'Pedidos', deliveries: 'Entregas' },
    });
    expect(config.sheets?.privateKey).toBe(privateKey);
  });

  it('la pestaña de entregas nunca puede ser la de pedidos (que va sin datos personales)', () => {
    expect(() =>
      loadConfig(
        sheetsEnv({ GOOGLE_SHEETS_TAB: 'Pedidos', GOOGLE_SHEETS_DELIVERY_TAB: 'pedidos' }),
      ),
    ).toThrow(ConfigError);
    expect(
      loadConfig(sheetsEnv({ GOOGLE_SHEETS_DELIVERY_TAB: 'Recargas' })).sheets?.tabs.deliveries,
    ).toBe('Recargas');
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

describe('Google Sheets: fila de «Entregas»', () => {
  const order = {
    reference: 'TGS-ABCDEFGHJK',
    totalCop: 3800,
    items: [{ name: '100 + 10 Diamantes', quantity: 2, unitPriceCop: 1900, lineTotalCop: 3800 }],
    receipt: { number: 12, verificationCode: 'ABCD-EFGH-JKLM' },
    payment: {
      provider: 'mercadopago',
      providerPaymentId: '123456789012',
      approvedAt: new Date('2026-10-18T17:05:00Z'),
    },
    playerUid: '0123456789',
    nickname: 'JugadorPro',
    region: 'CO',
    server: 'Latinoamérica',
    verificationStatus: 'CONFIRMED' as const,
    verificationNote: 'proveedor:prueba',
    verifiedByOwner: false,
  };
  const updatedAt = new Date('2026-10-18T17:20:00Z');

  it('un nickname, región o evidencia que empieza como fórmula no se ejecuta al exportar a CSV', () => {
    const row = deliveryRow(
      { ...order, nickname: '=HYPERLINK("https://evil.example","x")', region: '+CO' },
      { payment: 'CONFIRMED', recharge: 'COMPLETED' },
      { deliveredAt: updatedAt, evidence: '@SUM(A1)', failureReason: null },
      updatedAt,
    );
    expect(row[6]).toBe('\'=HYPERLINK("https://evil.example","x")');
    expect(row[9]).toBe("'+CO");
    expect(row[17]).toBe("'@SUM(A1)");
    // El texto normal no cambia.
    expect(sheetText('JugadorPro')).toBe('JugadorPro');
    expect(sheetText('-5 diamantes')).toBe("'-5 diamantes");
  });

  it('pagado: lo que hace falta para recargar, sus referencias, y nunca correo, nombre ni PIN', () => {
    const row = deliveryRow(
      order,
      { payment: 'CONFIRMED', recharge: 'PENDING' },
      { deliveredAt: null, evidence: null, failureReason: null },
      updatedAt,
    );
    expect(row).toEqual([
      'TGS-ABCDEFGHJK',
      '⏳ Por entregar',
      '2026-10-18 12:05',
      '',
      '',
      '0123456789',
      'JugadorPro',
      'Confirmado con la búsqueda de ID',
      'Latinoamérica',
      'CO',
      '2× 100 + 10 Diamantes',
      3800,
      'Confirmado',
      'Pendiente',
      '000012',
      'ABCD-EFGH-JKLM',
      'Mercado Pago · 123456789012',
      '',
      '2026-10-18 12:20',
    ]);
    expect(row).toHaveLength(DELIVERY_COLUMNS.length);
    expect(DELIVERY_COLUMNS[0]).toBe('Referencia');
    // El ID va como texto: un número perdería los ceros a la izquierda.
    expect(typeof row[5]).toBe('string');
  });

  it('entregado: hora de entrega, minutos desde el pago y la evidencia', () => {
    const row = deliveryRow(
      order,
      { payment: 'CONFIRMED', recharge: 'COMPLETED' },
      {
        deliveredAt: new Date('2026-10-18T17:17:40Z'),
        evidence: 'Recarga hecha en el canal oficial',
        failureReason: null,
      },
      updatedAt,
    );
    expect(row.slice(1, 5)).toEqual([
      '✅ Entregado con éxito',
      '2026-10-18 12:05',
      '2026-10-18 12:17',
      13,
    ]);
    expect(row[17]).toBe('Recarga hecha en el canal oficial');
  });

  it('fallido: el motivo, sin hora de entrega', () => {
    const row = deliveryRow(
      order,
      { payment: 'CONFIRMED', recharge: 'NEEDS_REVIEW' },
      { deliveredAt: null, evidence: null, failureReason: 'UniPin rechazó la recarga (E1)' },
      updatedAt,
    );
    expect([row[1], row[3], row[4], row[17]]).toEqual([
      '⚠️ Requiere revisión',
      '',
      '',
      'UniPin rechazó la recarga (E1)',
    ]);
  });

  it('sin nickname, servidor, región ni comprobante deja esas celdas vacías', () => {
    const row = deliveryRow(
      { ...order, nickname: null, region: null, server: null, receipt: null, payment: null },
      { payment: 'CONFIRMED', recharge: 'PENDING' },
      undefined,
      updatedAt,
    );
    expect([row[2], row[6], row[8], row[9], row[14], row[15], row[16]]).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('el estado de la fila resume pago y recarga en una sola palabra', () => {
    expect(deliveryStatusLabel({ payment: 'CONFIRMED', recharge: 'PENDING' })).toBe(
      '⏳ Por entregar',
    );
    expect(deliveryStatusLabel({ payment: 'CONFIRMED', recharge: 'IN_PROGRESS' })).toBe(
      '🔄 En proceso',
    );
    expect(deliveryStatusLabel({ payment: 'CONFIRMED', recharge: 'COMPLETED' })).toBe(
      '✅ Entregado con éxito',
    );
    expect(deliveryStatusLabel({ payment: 'CONFIRMED', recharge: 'NEEDS_REVIEW' })).toBe(
      '⚠️ Requiere revisión',
    );
    // Entregado pero con disputa o devolución parcial: lo primero es revisar el dinero.
    expect(deliveryStatusLabel({ payment: 'IN_REVIEW', recharge: 'COMPLETED' })).toBe(
      '⚠️ Requiere revisión',
    );
    expect(deliveryStatusLabel({ payment: 'REFUNDED', recharge: 'CANCELLED' })).toBe(
      '↩️ Reembolsado',
    );
    expect(deliveryStatusLabel({ payment: 'EXPIRED', recharge: 'CANCELLED' })).toBe('✖️ Cancelado');
    expect(deliveryStatusLabel({ payment: 'PENDING', recharge: 'PENDING' })).toBe('Pago pendiente');
  });

  it('dice cómo se confirmó el jugador sin copiar la nota del operador', () => {
    const label = (overrides: Partial<Parameters<typeof playerConfirmationLabel>[0]>) =>
      playerConfirmationLabel({
        verificationStatus: 'CONFIRMED',
        verificationNote: null,
        verifiedByOwner: false,
        ...overrides,
      });
    expect(label({ verificationNote: 'proveedor:x' })).toBe('Confirmado con la búsqueda de ID');
    expect(label({ verificationNote: 'cliente' })).toBe(
      'Confirmado por el cliente (escribió su ID dos veces)',
    );
    expect(label({ verifiedByOwner: true, verificationNote: 'nota privada del operador' })).toBe(
      'Verificado por el dueño y aceptado por el cliente',
    );
    // Aunque el operador escriba «cliente» o «proveedor:…» en su nota, cuenta que verificó él.
    expect(label({ verifiedByOwner: true, verificationNote: 'proveedor:x' })).toBe(
      'Verificado por el dueño y aceptado por el cliente',
    );
    expect(label({ verificationStatus: 'NOT_FOUND' })).toBe('ID no encontrado');
  });
});
