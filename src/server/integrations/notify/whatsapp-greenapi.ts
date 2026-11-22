/**
 * Aviso al WhatsApp del dueño con Green-API, desde un número propio de la tienda (pedido del dueño,
 * 2026-11-19: «que esté disponible, que me llegue y que sea contra spam, malware o revelación de
 * datos sensibles del propietario y de los usuarios»). CallMeBot, la otra vía, no acepta usuarios
 * nuevos («The bot is currently full»).
 *
 * Green-API (https://green-api.com/en/docs/api/sending/SendMessage/, revisado el 2026-11-19): el
 * número de la tienda se vincula una vez por QR (Dispositivos vinculados) y la tienda envía con
 * `POST {apiUrl}/waInstance{idInstance}/sendMessage/{apiTokenInstance}` y el cuerpo
 * `{ chatId: "<número>@c.us", message }`; si lo acepta, responde `{ "idMessage": "…" }`.
 *
 * Medidas de seguridad:
 * - El token solo viaja a Green-API: la dirección se valida contra sus dominios oficiales (aquí y
 *   en la configuración), por HTTPS, y una redirección se trata como error.
 * - El destinatario es fijo (el número del dueño, de la configuración); nada de la petición del
 *   cliente decide a quién se escribe.
 * - Solo texto: sin archivos, sin vista previa de enlaces y sin enlaces en el mensaje.
 * - La tienda nunca recibe mensajes de Green-API (no hay webhook): lo que alguien escriba al número
 *   de la tienda no entra al servidor.
 * - Los errores nunca llevan la URL (contiene el token) ni el cuerpo de la respuesta.
 * - El tope de avisos por hora (antispam) lo aplica la cola de avisos (notifications.ts).
 */

import type { OwnerWhatsApp } from './whatsapp-owner.js';

export interface GreenApiOptions {
  /** Dirección de la API que muestra la consola de Green-API (`apiUrl`). */
  apiUrl: string;
  idInstance: string;
  apiToken: string;
  /** Número de WhatsApp del dueño (quien recibe), con código de país, solo dígitos. */
  phone: string;
  timeoutMs?: number;
}

/** Green-API documenta 20.000 caracteres como máximo por mensaje. */
const MAX_MESSAGE_CHARS = 20_000;
/** La respuesta es un JSON corto con `idMessage`: no hace falta leer más. */
const MAX_BODY_CHARS = 4_000;

/**
 * Dominios oficiales de Green-API: `api.green-api.com`, `api.greenapi.com` y sus servidores
 * numerados (p. ej. `1103.api.green-api.com`). Cualquier otro destino se rechaza.
 */
const GREEN_API_HOST = /^(?:\d{1,6}\.)?api\.green-?api\.com$/;

export const DEFAULT_GREEN_API_URL = 'https://api.green-api.com';

/** Normaliza y valida `apiUrl`; devuelve el origen (`https://host`) o `undefined` si no es oficial. */
export function greenApiOrigin(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const bare = url.pathname === '/' && !url.search && !url.hash;
  const plainHttps = url.protocol === 'https:' && !url.port && !url.username && !url.password;
  return plainHttps && bare && GREEN_API_HOST.test(url.hostname) ? url.origin : undefined;
}

export class GreenApiWhatsApp implements OwnerWhatsApp {
  readonly channel = 'whatsapp' as const;
  private readonly origin: string;

  constructor(
    private readonly options: GreenApiOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // La configuración ya lo valida; se repite aquí para que el token nunca salga a otro sitio.
    const origin = greenApiOrigin(options.apiUrl);
    if (!origin) throw new Error('Green-API: la dirección no es un dominio oficial de Green-API');
    if (!/^\d{4,20}$/.test(options.idInstance)) throw new Error('Green-API: idInstance inválido');
    if (!/^[A-Za-z0-9]{20,128}$/.test(options.apiToken))
      throw new Error('Green-API: token inválido');
    if (!/^\d{8,15}$/.test(options.phone)) throw new Error('Green-API: número del dueño inválido');
    this.origin = origin;
  }

  async send(text: string): Promise<void> {
    const { idInstance, apiToken, phone } = this.options;
    const url = `${this.origin}/waInstance${idInstance}/sendMessage/${apiToken}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chatId: `${phone}@c.us`,
          message: text.slice(0, MAX_MESSAGE_CHARS),
          linkPreview: false,
        }),
        // Una redirección podría llevar el token a otro sitio: se trata como error.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8_000),
      });
    } catch (error) {
      // Sin la URL (lleva el token) en el mensaje: quien registra el fallo guarda solo `message`.
      const reason = error instanceof Error ? error.name : 'error';
      throw new Error(`Green-API no respondió (${reason})`, { cause: error });
    }
    const body = (await response.text().catch(() => '')).slice(0, MAX_BODY_CHARS);
    if (!response.ok) throw new Error(`Green-API rechazó el aviso (HTTP ${response.status})`);
    // Un 200 sin `idMessage` no cuenta como enviado: la cola lo reintenta y, si sigue fallando,
    // el panel lo muestra como fallido.
    if (!hasMessageId(body)) throw new Error('Green-API no confirmó el aviso');
  }
}

function hasMessageId(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('idMessage' in parsed)) return false;
    const { idMessage } = parsed;
    return typeof idMessage === 'string' && idMessage.length > 0;
  } catch {
    return false;
  }
}
