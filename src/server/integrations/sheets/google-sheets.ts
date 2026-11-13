import { createSign } from 'node:crypto';

/**
 * Registro auxiliar de pedidos en una hoja de Google Sheets (opcional).
 *
 * - NO es la base de datos ni la autoridad de nada: el estado oficial vive en PostgreSQL y el
 *   pago lo confirma Mercado Pago (o el dueño, con Nequi). Editar una celda de los datos no cambia
 *   ningún pedido. La única entrada son las columnas del dueño (`COMMAND_COLUMNS`): la casilla
 *   «✓ Enviado» de «Entregas» y la casilla «✓ Pago verificado» con la referencia del movimiento
 *   Nequi de «Pagos pendientes». La tienda las aplica con las mismas reglas del panel (ver
 *   services/sheet-commands.ts).
 * - Escribe con `valueInputOption=RAW`: nada se interpreta como fórmula.
 * - Cinco pestañas: «Pedidos» (historial de eventos, una fila por evento, solo datos de la
 *   operación), «Entregas» (una fila por pedido que se actualiza con cada cambio de estado, con
 *   los datos del jugador que hacen falta para recargar: ID, nickname, servidor y región),
 *   «Pagos pendientes» (una fila por pedido Nequi: lo que el cliente debe y lo que avisó),
 *   «Usuarios» (una fila por cliente con su nombre de usuario, sin correo ni nombre real) y
 *   «Pedidos en vivo» (una fila por pedido de cualquier método desde que se crea, sin datos
 *   personales).
 * - Credenciales: una cuenta de servicio de Google Cloud con la hoja compartida con su correo.
 *   La llave privada (campo `private_key` del JSON de la cuenta) vive solo en el servidor.
 * - Se usa desde la cola de avisos: si Google falla, el pedido sigue igual y la fila se reintenta.
 *
 * APIs oficiales: OAuth 2.0 para cuentas de servicio (JWT con RS256 hacia
 * https://oauth2.googleapis.com/token) y Sheets API v4 `spreadsheets.values` (`get`,
 * `batchGet`, `update` y `append`).
 */

/**
 * `orders`: pestaña sin datos personales. `deliveries`: con los datos del jugador. `pending`:
 * pagos Nequi por verificar (con los 4 últimos dígitos y la referencia que avisó el cliente).
 * `users`: nombres de usuario de los clientes (alias, nunca correo ni nombre real). `live`: cada
 * pedido desde que se crea, de cualquier método, sin datos personales.
 */
export type SheetTab = 'orders' | 'deliveries' | 'pending' | 'users' | 'live';

/**
 * Columnas del dueño, justo después de las que escribe la tienda (al reescribir la fila de un
 * pedido, la tienda solo toca las suyas):
 * - «Entregas» (la tienda escribe A–S, ver `DELIVERY_COLUMNS`): T casilla «✓ Enviado (tú)»,
 *   U «Nota del cambio (tú)» y V «Respuesta de la tienda»;
 * - «Pagos pendientes» (A–T, ver `PENDING_PAYMENT_COLUMNS`): U casilla «✓ Pago verificado (tú)»,
 *   V «Referencia Nequi (tú)» (la del movimiento en su app Nequi) y W «Respuesta de la tienda».
 */
export const COMMAND_COLUMNS = {
  deliveries: { command: 'T', note: 'U', response: 'V' },
  pending: { command: 'U', note: 'V', response: 'W' },
} as const;

/**
 * «Pedidos en vivo» (la tienda escribe A–M, ver `LIVE_ORDER_COLUMNS`): L menú «Estado (tú)» con los
 * 4 estados, M copia del estado que escribió la tienda (oculta), N «Referencia Nequi (tú)» y
 * O «Respuesta de la tienda». A diferencia de las casillas, L siempre tiene el estado real: hay
 * una orden solo cuando el dueño lo cambia (L distinta de M).
 */
export const LIVE_COMMAND_COLUMNS = { command: 'L', echo: 'M', note: 'N', response: 'O' } as const;
export type CommandTab = keyof typeof COMMAND_COLUMNS | 'live';

/** Lo que el dueño marcó o escribió en sus columnas de una fila. */
export interface SheetCommand {
  /** «Entregas» (envío) o «Pagos pendientes» (pago Nequi). */
  tab: CommandTab;
  /** Referencia del pedido (columna A de la misma fila). */
  reference: string;
  /** «true» si marcó la casilla; si no, el texto de la celda tal cual. */
  command: string;
  /** Nota (evidencia o motivo) o, en «Pagos pendientes», la referencia del movimiento Nequi. */
  note: string;
}

/** Estado del menú de una fila de «Pedidos en vivo» que el dueño cambió (L distinta de M). */
const liveCommandOf = (row: string[] | undefined) => {
  const chosen = row?.[0] ?? '';
  const written = row?.[1] ?? '';
  return chosen && chosen !== written ? chosen : '';
};

/** Texto de una celda leída sin formato: casilla marcada = «true»; desmarcada o vacía = «». */
const cellText = (cell: unknown): string => {
  if (cell === true) return 'true';
  if (typeof cell === 'number') return String(cell);
  if (typeof cell !== 'string') return '';
  const text = cell.trim();
  return /^false$/i.test(text) ? '' : text;
};

export interface OrderSheetLog {
  /** Agrega una fila al final de la pestaña. */
  appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void>;
  /**
   * Reescribe la fila cuya columna A es `values[0]` (la clave, p. ej. la referencia del pedido)
   * o, si no existe, la agrega al final.
   */
  upsertRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void>;
  /** Cambios de estado que el dueño dejó en «Entregas» (filas con la columna T escrita). */
  readCommands?(): Promise<SheetCommand[]>;
  /**
   * Escribe la respuesta (columna V) en la fila del pedido y vacía T y U, salvo que el dueño ya
   * haya escrito otra cosa en T: esa queda para la próxima pasada. En «Pedidos en vivo» deja el
   * menú (L y su copia M) en `state`, el estado real tras aplicar la orden, y vacía la referencia.
   */
  finishCommand?(command: SheetCommand, response: string, state?: string): Promise<void>;
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

/** Letra de columna (1 → A, 26 → Z, 27 → AA). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

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

  /**
   * Lee varios rangos de una pestaña en una sola llamada, sin formato (una casilla llega como
   * true/false, no como «VERDADERO» según el idioma de la hoja), como texto por celda.
   */
  private async readRanges(tab: SheetTab, ranges: string[]): Promise<string[][][]> {
    const query = ranges
      .map((cells) => `ranges=${encodeURIComponent(a1(this.options.tabs[tab], cells))}`)
      .join('&');
    const response = await this.request(
      `${SHEETS_API}/${encodeURIComponent(this.options.spreadsheetId)}/values:batchGet?${query}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
      { method: 'GET' },
      'Google Sheets no dejó leer los cambios del dueño',
    );
    const body = (await response.json()) as { valueRanges?: { values?: unknown }[] };
    return ranges.map((_, i) => {
      const values = body.valueRanges?.[i]?.values;
      return Array.isArray(values)
        ? values.map((row) => (Array.isArray(row) ? row.map(cellText) : []))
        : [];
    });
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

  /**
   * `insertDataOption=OVERWRITE`: la fila se escribe en la primera fila vacía tras los datos (y
   * Google agrega filas al final solo si la hoja se llena). Con INSERT_ROWS, Google insertaba la
   * fila delante de las vacías y desplazaba los rangos de las fórmulas del dueño («Pedidos!B2:B»
   * pasaba a «B3:B»…): «Resumen», «Por entregar» y «Reporte diario» dejaban fuera todos los
   * pedidos (encontrado con una copia de la hoja real, 2026-10-20).
   *
   * El rango de búsqueda son solo las columnas que escribe la tienda (A hasta la última de la
   * fila): Google busca la «tabla» dentro de ese rango. Con `A1`, unas casillas del dueño al lado
   * (que valían FALSE en todas las filas vacías) estiraban la tabla hasta la fila 1000 y un pedido
   * nuevo cayó en la 1001 (2026-11-02).
   */
  async appendRow(tab: SheetTab, values: readonly (string | number)[]): Promise<void> {
    await this.request(
      `${this.valuesUrl(tab, `A:${columnLetter(Math.max(1, values.length))}`)}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
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

  /**
   * Casi siempre las casillas están sin marcar: por pestaña se leen solo las dos columnas del
   * dueño (Google no devuelve las filas vacías del final) y la de referencias únicamente si hay
   * algo que aplicar.
   */
  async readCommands(): Promise<SheetCommand[]> {
    const commands: SheetCommand[] = [];
    for (const tab of Object.keys(COMMAND_COLUMNS) as (keyof typeof COMMAND_COLUMNS)[]) {
      const { command: c, note: n } = COMMAND_COLUMNS[tab];
      const [rows = []] = await this.readRanges(tab, [`${c}2:${n}`]);
      if (!rows.some((row) => row[0])) continue;
      const [references = []] = await this.readRanges(tab, ['A2:A']);
      rows.forEach((row, i) => {
        const command = row[0] ?? '';
        const reference = references[i]?.[0] ?? '';
        if (command && reference) commands.push({ tab, reference, command, note: row[1] ?? '' });
      });
    }
    // «Pedidos en vivo»: el menú L siempre tiene el estado; es una orden solo si difiere de M.
    const { command: lc, note: ln } = LIVE_COMMAND_COLUMNS;
    const [live = []] = await this.readRanges('live', [`${lc}2:${ln}`]);
    if (live.some((row) => liveCommandOf(row))) {
      const [references = []] = await this.readRanges('live', ['A2:A']);
      live.forEach((row, i) => {
        const command = liveCommandOf(row);
        const reference = references[i]?.[0] ?? '';
        if (command && reference) {
          commands.push({ tab: 'live', reference, command, note: row[2] ?? '' });
        }
      });
    }
    return commands;
  }

  /**
   * Responde en la fila del pedido y desmarca la casilla (vacía también la nota o la referencia),
   * salvo que el dueño haya cambiado la casilla mientras tanto: entonces solo responde. Busca la
   * fila por la referencia al escribir: el dueño pudo ordenar la pestaña.
   */
  async finishCommand(command: SheetCommand, response: string, state?: string): Promise<void> {
    if (command.tab === 'live') return this.finishLiveCommand(command, response, state ?? '');
    const { command: c, note: n, response: r } = COMMAND_COLUMNS[command.tab];
    const [references = [], rows = []] = await this.readRanges(command.tab, ['A2:A', `${c}2:${n}`]);
    const index = references.findIndex((row) => row[0] === command.reference);
    if (index < 0) return;
    const row = index + 2;
    const unchanged = (rows[index]?.[0] ?? '') === command.command;
    await this.request(
      `${this.valuesUrl(command.tab, unchanged ? `${c}${row}:${r}${row}` : `${r}${row}`)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [unchanged ? ['', '', response] : [response]] }),
      },
      'Google Sheets no aceptó la respuesta al dueño',
    );
  }

  /**
   * «Pedidos en vivo»: responde en O y, si el dueño no volvió a cambiar el menú mientras tanto,
   * deja L y M en el estado real (el nuevo si se aplicó, el de antes si no) y vacía N. Si lo cambió
   * de nuevo, solo responde: ese cambio queda para la próxima pasada.
   */
  private async finishLiveCommand(
    command: SheetCommand,
    response: string,
    state: string,
  ): Promise<void> {
    const { command: c, note: n, response: r } = LIVE_COMMAND_COLUMNS;
    const [references = [], rows = []] = await this.readRanges('live', ['A2:A', `${c}2:${n}`]);
    const index = references.findIndex((row) => row[0] === command.reference);
    if (index < 0) return;
    const row = index + 2;
    const unchanged = (rows[index]?.[0] ?? '') === command.command;
    await this.request(
      `${this.valuesUrl('live', unchanged ? `${c}${row}:${r}${row}` : `${r}${row}`)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({ values: [unchanged ? [state, state, '', response] : [response]] }),
      },
      'Google Sheets no aceptó la respuesta al dueño',
    );
  }
}
