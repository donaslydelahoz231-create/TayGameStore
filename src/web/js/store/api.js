/**
 * Cliente HTTP de la API (mismo origen).
 * - Errores con código estable: `ApiError.code` = `error.code` del servidor, o NETWORK / TIMEOUT.
 * - Toda escritura lleva la cabecera anti-CSRF `x-tgs-csrf`.
 * - Timeout por petición: nunca hay cargas infinitas.
 */
import { timeoutSignal } from './compat.js';

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

const NETWORK_MESSAGE = 'Sin conexión con TayGameStore. Revisa tu internet e inténtalo de nuevo.';
const TIMEOUT_MESSAGE = 'El servidor tardó demasiado en responder. Inténtalo de nuevo.';

export async function api(path, options = {}) {
  if (location.protocol === 'file:') {
    throw new ApiError(
      'SERVER_REQUIRED',
      'Abre TayGameStore desde su servidor para usar esta función.',
    );
  }
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') headers['x-tgs-csrf'] = '1';
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeoutSignal(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ApiError('TIMEOUT', TIMEOUT_MESSAGE);
    }
    throw new ApiError('NETWORK', NETWORK_MESSAGE);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data && typeof data.error === 'object' ? data.error : {};
    throw new ApiError(
      typeof error.code === 'string' ? error.code : `HTTP_${response.status}`,
      typeof error.message === 'string' ? error.message : 'Ocurrió un error inesperado.',
      response.status,
    );
  }
  return data;
}

/** Mensaje para el usuario a partir de cualquier error. */
export function errorMessage(err, fallback = 'Ocurrió un error inesperado.') {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}
