import { createSign } from 'node:crypto';

/**
 * Registro auxiliar de pedidos en una hoja de Google Sheets (opcional).
 *
 * - NO es la base de datos ni la autoridad de nada: el estado oficial vive en PostgreSQL y el
 *   pago lo confirma Mercado Pago. Editar una celda no cambia ningún pedido: la tienda solo lee
 *   la columna A de «Entregas» para encontrar la fila de cada referencia.
 * - Escribe con `valueInputOption=RAW`: nada se interpreta como fórmula.
 * - Dos pestañas: «Pedidos» (historial de eventos, una fila por evento, solo datos de la
 *   operación) y «Entregas» (una fila por pedido que se actualiza con cada cambio de estado, con
 *   los datos del jugador que hacen falta para recargar: ID, nickname, servidor y región).
 * - Credenciales: una cuenta de servicio de Google Cloud con la hoja compartida con su correo.
 *   La llave privada (campo `private_key` del JSON de la cuenta) vive solo en el servidor.
 * - Se usa desde la cola de avisos: si Google falla, el pedido sigue igual y la fila se reintenta.
 *
 * APIs oficiales: OAuth 2.0 para cuentas de servicio (JWT con RS256 hacia
 * https://oauth2.googleapis.com/token) y Sheets API v4 `spreadsheets.values` (`get`, `update`
 * y `append`).
 */

/** `orders`: pestaña sin datos personales. `deliveries`: con los datos del jugador. */
export type SheetTab = 'orders' | 'deliveries';

export interface OrderSheetLog {
  /** Agrega una fila al final de la pestaña. */
  appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void>;
  /**
   * Reescribe la fila cuya columna A es `values[0]` (la clave, p. ej. la referencia del pedido)
   * o, si no existe, la agrega al final.
   */
  upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void>;
}

export interface GoogleSheetsOptions {
  spreadsheetId: string;
  clientEmail: string;
  /** Llave privada PEM de la cuenta de servicio. */
  privateKey: string;
  /** Nombre de cada pestaña donde se agregan las filas. */
  tabs: Record<SheetTab, string>;
  timeoutMs?: number;
  /** Para pruebas: sustituye a `fetch`. */
  fetch?: typeof fetch;
  now?: () => Date;
}

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SheetsError';
  }
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** Rango A1 de una pestaña; entre comillas si el nombre tiene espacios o guiones. */
const a1 = (sheet: string, cells: string) =>
  `${/^[\p{L}\p{N}_]+$/u.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`}!${cells}`;

/** Afirmación JWT firmada (RS256) para pedir un token de acceso de cuenta de servicio. */
export function serviceAccountAssertion(
  options: Pick<GoogleSheetsOptions, 'clientEmail' | 'privateKey'>,
  now: Date,
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: options.clientEmail,
      scope: SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(options.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

export class GoogleSheetsLog implements OrderSheetLog {
  private token: { value: string; expiresAt: number } | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: GoogleSheetsOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private signal() {
    return AbortSignal.timeout(this.options.timeoutMs ?? 10_000);
  }

  private async accessToken(): Promise<string> {
    const now = this.now();
    if (this.token && this.token.expiresAt - 60_000 > now.getTime()) return this.token.value;
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: serviceAccountAssertion(this.options, now),
      }),
      signal: this.signal(),
    });
    // Nunca se copia la respuesta de Google en el error: podría traer detalles de la cuenta.
    if (!response.ok)
      throw new SheetsError('Google rechazó la cuenta de servicio', response.status);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new SheetsError('Google no entregó un token de acceso');
    }
    const lifetime = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.token = { value: body.access_token, expiresAt: now.getTime() + lifetime * 1000 };
    return body.access_token;
  }

  private valuesUrl(tab: SheetTab, cells: string) {
    const range = encodeURIComponent(a1(this.options.tabs[tab], cells));
    return `${SHEETS_API}/${encodeURIComponent(this.options.spreadsheetId)}/values/${range}`;
  }

  /** Llamada a la API con el token; un 401 lo descarta para pedir otro en el próximo intento. */
  private async request(url: string, init: RequestInit, failure: string): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: this.signal(),
    });
    if (response.status === 401) this.token = undefined;
    if (!response.ok) throw new SheetsError(failure, response.status);
    return response;
  }

  async appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    await this.request(
      `${this.valuesUrl(tab, 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [values] }) },
      'Google Sheets no aceptó la fila',
    );
  }

  async upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    const key = values[0];
    if (key === undefined || key === '') throw new SheetsError('La fila no tiene clave');
    const read = await this.request(
      `${this.valuesUrl(tab, 'A:A')}?majorDimension=COLUMNS`,
      { method: 'GET' },
      'Google Sheets no dejó leer la columna de referencias',
    );
    const body = (await read.json()) as { values?: unknown };
    const column =
      Array.isArray(body.values) && Array.isArray(body.values[0]) ? body.values[0] : [];
    // La fila 1 son los encabezados: nunca se reescribe.
    const index = column.findIndex((cell, i) => i > 0 && cell === String(key));
    if (index < 0) return this.appendRow(tab, values);
    await this.request(
      `${this.valuesUrl(tab, `A${index + 1}`)}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [values] }) },
      'Google Sheets no aceptó la actualización de la fila',
    );
  }
}
