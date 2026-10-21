import { createPrivateKey } from 'node:crypto';

/**
 * Credenciales de la hoja de Google (registro auxiliar; nunca es la fuente de verdad).
 *
 * Como Nequi: una variable de la hoja mal escrita o incompleta nunca impide arrancar la tienda.
 * La hoja queda apagada y el arranque dice qué falta, sin repetir ningún valor.
 *
 * La llave de la cuenta de servicio llega de una de dos formas:
 * - `GOOGLE_SHEETS_CREDENTIALS_JSON`: el archivo JSON que descarga Google Cloud («Agregar clave →
 *   JSON»), pegado completo en Render. Es lo más simple: no hay que copiar campos sueltos.
 * - `GOOGLE_SHEETS_CLIENT_EMAIL` + `GOOGLE_SHEETS_PRIVATE_KEY` (forma anterior; sigue valiendo).
 */

export interface SheetsEnv {
  GOOGLE_SHEETS_SPREADSHEET_ID?: string | undefined;
  GOOGLE_SHEETS_CREDENTIALS_JSON?: string | undefined;
  GOOGLE_SHEETS_CLIENT_EMAIL?: string | undefined;
  GOOGLE_SHEETS_PRIVATE_KEY?: string | undefined;
}

export interface SheetsCredentials {
  spreadsheetId: string;
  clientEmail: string;
  /** Llave privada PEM de la cuenta de servicio. */
  privateKey: string;
}

export interface SheetsSettings {
  credentials: SheetsCredentials | undefined;
  /** Por qué la hoja quedó apagada pese a tener alguna variable (sin valores). */
  problem: string | undefined;
}

const SPREADSHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
const MAX_KEY_FILE = 20_000;
const SERVICE_ACCOUNT = /^[a-z0-9._-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/;

const off = (problem: string): SheetsSettings => ({ credentials: undefined, problem });

/** La llave se puede leer como llave privada (sin mostrarla nunca). */
function isReadablePrivateKey(value: string): boolean {
  try {
    return createPrivateKey(value).type === 'private';
  } catch {
    return false;
  }
}

/** Correo y llave del archivo JSON de la cuenta de servicio, o el motivo por el que no sirve. */
function fromKeyFile(json: string): { clientEmail: string; privateKey: string } | string {
  // El archivo de una llave mide unos 2,4 KB: algo mucho más largo no es la llave.
  if (json.length > MAX_KEY_FILE) {
    return 'GOOGLE_SHEETS_CREDENTIALS_JSON es demasiado largo para ser la llave JSON';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return 'GOOGLE_SHEETS_CREDENTIALS_JSON no es un JSON válido: pega el archivo de la llave completo';
  }
  const file = parsed as Record<string, unknown> | null;
  if (
    !file ||
    typeof file !== 'object' ||
    file.type !== 'service_account' ||
    typeof file.client_email !== 'string' ||
    typeof file.private_key !== 'string'
  ) {
    return 'GOOGLE_SHEETS_CREDENTIALS_JSON no es la llave JSON de una cuenta de servicio';
  }
  return { clientEmail: file.client_email, privateKey: file.private_key };
}

export function sheetsSettings(env: SheetsEnv): SheetsSettings {
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || undefined;
  const keyFile = env.GOOGLE_SHEETS_CREDENTIALS_JSON?.trim() || undefined;
  const email = env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim() || undefined;
  // Pegada en una sola línea, la llave trae los saltos de línea escritos como \n.
  const pem = env.GOOGLE_SHEETS_PRIVATE_KEY?.trim().replace(/\\n/g, '\n') || undefined;
  if (!spreadsheetId && !keyFile && !email && !pem)
    return { credentials: undefined, problem: undefined };

  if (!spreadsheetId) return off('falta GOOGLE_SHEETS_SPREADSHEET_ID (el id de la URL de la hoja)');
  if (!SPREADSHEET_ID.test(spreadsheetId)) {
    return off('GOOGLE_SHEETS_SPREADSHEET_ID debe ser el id que aparece en la URL de la hoja');
  }
  let clientEmail = email;
  let privateKey = pem;
  if (keyFile) {
    const key = fromKeyFile(keyFile);
    if (typeof key === 'string') return off(key);
    if (email && email !== key.clientEmail) {
      return off('GOOGLE_SHEETS_CLIENT_EMAIL no es la cuenta de la llave JSON');
    }
    ({ clientEmail, privateKey } = key);
  }
  if (!clientEmail || !privateKey) {
    return off(
      'falta la llave de la cuenta de servicio: GOOGLE_SHEETS_CREDENTIALS_JSON (o GOOGLE_SHEETS_CLIENT_EMAIL y GOOGLE_SHEETS_PRIVATE_KEY)',
    );
  }
  if (!SERVICE_ACCOUNT.test(clientEmail)) {
    return off(
      'el correo de la llave no es de una cuenta de servicio (…@….iam.gserviceaccount.com)',
    );
  }
  if (!isReadablePrivateKey(privateKey))
    return off('la llave privada de la cuenta no se puede leer');
  return { credentials: { spreadsheetId, clientEmail, privateKey }, problem: undefined };
}
