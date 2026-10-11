import { createHmac } from 'node:crypto';
import type { TopupProvider, TopupResult, ValidateResult } from './provider.js';

/**
 * UniPin «In Game Top Up» (distribuidor oficial): recarga directa al ID del jugador.
 *
 * Verificado en el SDK oficial (github.com/UniPinSDK/php, src/Driver.php y unipin.generate):
 * - hosts: https://dev-api.unipin.com/ (staging) y https://api.unipin.com/ (producción);
 * - rutas: in-game-topup/list, /detail, /user/validate, /order/create, /order/inquiry;
 * - POST con JSON y cabeceras `partnerid`, `timestamp` (segundos Unix), `path` (la ruta sin
 *   barra inicial) y `auth` = HMAC-SHA256 en hexadecimal de partnerid + timestamp + path con la
 *   llave secreta del socio.
 * Según su documentación pública (Postman «In Game Top Up V.2»): validar devuelve
 * `validation_token` y `username`; crear el pedido lleva `game_code`, `validation_token`,
 * `reference_no` y `denomination_id` y devuelve `transaction_number`; los errores llegan como
 * `{"status":0,"error":{"code","message"}}` (708 = referencia repetida, 726 = token usado o
 * caducado, 727 = servidor/ID/usuario inválido).
 * NO VERIFICADO contra la API real (sin credenciales de socio): el nombre `fields` del cuerpo de
 * validación y la forma exacta de las respuestas correctas. `npm run unipin:check` lo comprueba
 * en staging antes de activar la recarga.
 */

export const UNIPIN_PATHS = {
  list: 'in-game-topup/list',
  detail: 'in-game-topup/detail',
  validate: 'in-game-topup/user/validate',
  create: 'in-game-topup/order/create',
  inquiry: 'in-game-topup/order/inquiry',
} as const;

export interface UniPinOptions {
  baseUrl: string;
  partnerId: string;
  secretKey: string;
  timeoutMs: number;
  /** Para pruebas: reloj y fetch inyectables. */
  now?: () => Date;
  fetch?: typeof fetch;
}

/** Cabeceras de autenticación del SDK oficial (`Helpers::GetHeaders`). */
export function unipinHeaders(
  partnerId: string,
  secretKey: string,
  path: string,
  timestamp: number,
): Record<string, string> {
  const ts = String(timestamp);
  return {
    'content-type': 'application/json',
    partnerid: partnerId,
    timestamp: ts,
    path,
    auth: createHmac('sha256', secretKey)
      .update(partnerId + ts + path)
      .digest('hex'),
  };
}

type Reply =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; uncertain: true; reason: string }
  | { ok: false; uncertain: false; code: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Texto corto y seguro para registros: solo letras, números y _-. */
const safeCode = (value: unknown): string =>
  (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40) || 'sin_codigo';

const isOk = (status: unknown) => status === 1 || status === '1';
const isError = (status: unknown) => status === 0 || status === '0';

/**
 * Interpreta una respuesta HTTP de UniPin.
 * - 200 con status 1 → ok; 200 con status 0 y código → error explícito.
 * - 4xx (salvo 408/429) → error explícito: UniPin no procesó la petición.
 * - Cualquier otra cosa (5xx, 408, 429, cuerpo ilegible) → incierto.
 */
export function readReply(httpStatus: number, text: string): Reply {
  if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
    return { ok: false, uncertain: false, code: `http_${httpStatus}` };
  }
  if (httpStatus !== 200) return { ok: false, uncertain: true, reason: `http_${httpStatus}` };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, uncertain: true, reason: 'respuesta_no_json' };
  }
  if (!isRecord(body)) return { ok: false, uncertain: true, reason: 'respuesta_no_objeto' };
  if (isOk(body.status)) return { ok: true, body };
  if (isError(body.status)) {
    const error = isRecord(body.error) ? body.error : {};
    return { ok: false, uncertain: false, code: safeCode(error.code) };
  }
  return { ok: false, uncertain: true, reason: 'estado_desconocido' };
}

const nonEmpty = (value: unknown): string | undefined => {
  const text =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return text ? text.slice(0, 120) : undefined;
};

export function classifyValidate(reply: Reply): ValidateResult {
  if (!reply.ok) {
    return reply.uncertain
      ? { kind: 'uncertain', reason: reply.reason }
      : { kind: 'failed', code: reply.code };
  }
  const token = nonEmpty(reply.body.validation_token);
  if (!token) return { kind: 'uncertain', reason: 'sin_validation_token' };
  return { kind: 'ok', token, username: nonEmpty(reply.body.username)?.slice(0, 40) };
}

/** Crear pedido: éxito solo con status 1 y `transaction_number`. */
export function classifyCreate(reply: Reply): TopupResult {
  if (!reply.ok) {
    if (reply.uncertain) return { kind: 'uncertain', reason: reply.reason };
    if (reply.code === '708') return { kind: 'duplicate' };
    if (reply.code === '726') return { kind: 'token_expired' };
    return { kind: 'failed', code: reply.code };
  }
  const transaction = nonEmpty(reply.body.transaction_number);
  return transaction
    ? { kind: 'success', transaction }
    : { kind: 'uncertain', reason: 'sin_transaction_number' };
}

/**
 * Consulta: éxito solo con status 1 y `transaction_number`. Un error en la consulta no prueba
 * que la recarga no se hizo: queda incierta y, si no se aclara, la revisa el dueño.
 */
export function classifyInquiry(reply: Reply): TopupResult {
  if (!reply.ok) {
    return { kind: 'uncertain', reason: reply.uncertain ? reply.reason : `error_${reply.code}` };
  }
  const transaction = nonEmpty(reply.body.transaction_number);
  return transaction
    ? { kind: 'success', transaction }
    : { kind: 'uncertain', reason: 'sin_transaction_number' };
}

export class UniPinTopupProvider implements TopupProvider {
  readonly name = 'unipin' as const;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: UniPinOptions) {
    this.now = options.now ?? (() => new Date());
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** POST firmado. Nunca lanza: los fallos de red son una respuesta incierta. */
  async call(path: string, payload: Record<string, unknown>): Promise<Reply> {
    const timestamp = Math.floor(this.now().getTime() / 1000);
    const headers = unipinHeaders(this.options.partnerId, this.options.secretKey, path, timestamp);
    try {
      const response = await this.fetchImpl(new URL(path, this.options.baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options.timeoutMs),
        redirect: 'error',
      });
      return readReply(response.status, await response.text());
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      return { ok: false, uncertain: true, reason: name === 'TimeoutError' ? 'timeout' : 'red' };
    }
  }

  async validateUser(input: {
    game: string;
    uidField: string;
    playerUid: string;
  }): Promise<ValidateResult> {
    return classifyValidate(
      await this.call(UNIPIN_PATHS.validate, {
        game_code: input.game,
        fields: { [input.uidField]: input.playerUid },
      }),
    );
  }

  async createOrder(input: {
    game: string;
    validationToken: string;
    referenceNo: string;
    denominationId: string;
  }): Promise<TopupResult> {
    return classifyCreate(
      await this.call(UNIPIN_PATHS.create, {
        game_code: input.game,
        validation_token: input.validationToken,
        reference_no: input.referenceNo,
        denomination_id: input.denominationId,
      }),
    );
  }

  async inquiry(referenceNo: string): Promise<TopupResult> {
    return classifyInquiry(await this.call(UNIPIN_PATHS.inquiry, { reference_no: referenceNo }));
  }
}
