/**
 * Configuración de Nequi, separada de la de Mercado Pago: ninguna variable, credencial o ajuste
 * de un proveedor sirve para el otro.
 *
 * Nequi por transferencia (`nequi_manual`) está apagado por defecto. Con NEQUI_MANUAL_ENABLED=true
 * el comprador que elige Nequi en su pedido ve la llave Bre-B y/o el celular (y, si se configura,
 * el nombre del titular) de la cuenta Nequi del dueño para transferir. Publicar esos datos es
 * decisión del dueño (docs/datos-del-propietario.md, requisito 19; docs/pagos-nequi.md).
 *
 * Aislamiento: una variable de Nequi mal escrita nunca impide arrancar la tienda (Mercado Pago
 * sigue funcionando); Nequi queda apagado y el arranque lo informa sin repetir el valor.
 *
 * Nequi Push (API oficial de Nequi) no tiene variables: no hay acceso oficial ni documentación
 * verificada, así que no se implementa ninguna llamada (ver docs/pagos-nequi.md).
 */

export interface NequiManualConfig {
  /** Celular de la cuenta Nequi del dueño (10 dígitos, empieza por 3), si decide publicarlo. */
  phone: string | undefined;
  /** Llave Bre-B alfanumérica de la cuenta (empieza por @), si decide publicarla. */
  brebKey: string | undefined;
  /** Nombre que el comprador ve como titular (opcional; lo decide el dueño). */
  holder: string | undefined;
  /** Horas que el pedido sigue abierto después de que el cliente avisa que transfirió. */
  reviewHours: number;
}

export interface NequiEnv {
  NEQUI_MANUAL_ENABLED?: string | undefined;
  NEQUI_MANUAL_PHONE?: string | undefined;
  NEQUI_MANUAL_BREB_KEY?: string | undefined;
  NEQUI_MANUAL_HOLDER?: string | undefined;
  NEQUI_MANUAL_REVIEW_HOURS?: string | undefined;
}

export interface NequiSettings {
  manual: NequiManualConfig | undefined;
  /** Por qué Nequi por transferencia quedó apagado pese a pedirse (sin valores). */
  problem: string | undefined;
}

const DEFAULT_REVIEW_HOURS = 24;

/**
 * Solo llaves alfanuméricas de Bre-B (@ + letras, números, punto, guion o guion bajo). Una llave
 * hecha solo de números se rechaza: podría ser un número de documento, que nunca se publica
 * (docs/datos-del-propietario.md). La única excepción es @ + un celular (10 dígitos que empiezan
 * por 3): ninguna cédula colombiana tiene esa forma (las de 10 dígitos empiezan por 1).
 */
const BREB_KEY = /^@[A-Za-z0-9._-]{2,40}$/;
const BREB_PHONE_KEY = /^@3\d{9}$/;

const off = (problem: string): NequiSettings => ({ manual: undefined, problem });

export function nequiSettings(env: NequiEnv): NequiSettings {
  const flag = env.NEQUI_MANUAL_ENABLED?.trim().toLowerCase() ?? '';
  if (flag === '' || flag === 'false' || flag === '0')
    return { manual: undefined, problem: undefined };
  if (flag !== 'true' && flag !== '1') return off('NEQUI_MANUAL_ENABLED debe ser true o false');
  const phone = (env.NEQUI_MANUAL_PHONE ?? '').replace(/[\s-]/g, '') || undefined;
  if (phone && !/^3\d{9}$/.test(phone)) {
    return off('NEQUI_MANUAL_PHONE debe ser un celular colombiano de 10 dígitos que empiece por 3');
  }
  const brebKey = env.NEQUI_MANUAL_BREB_KEY?.trim() || undefined;
  if (
    brebKey &&
    (!BREB_KEY.test(brebKey) || (/^@\d+$/.test(brebKey) && !BREB_PHONE_KEY.test(brebKey)))
  ) {
    return off(
      'NEQUI_MANUAL_BREB_KEY debe empezar por @ y tener letras, o ser @ más un celular de 10 dígitos que empiece por 3',
    );
  }
  if (!phone && !brebKey) {
    return off('Nequi necesita NEQUI_MANUAL_BREB_KEY o NEQUI_MANUAL_PHONE para recibir pagos');
  }
  const holder = env.NEQUI_MANUAL_HOLDER?.trim().replace(/\s+/g, ' ') || undefined;
  if (holder && !/^[\p{L} .'-]{2,60}$/u.test(holder)) {
    return off('NEQUI_MANUAL_HOLDER: solo letras, espacios y puntos (2 a 60 caracteres)');
  }
  const rawHours = env.NEQUI_MANUAL_REVIEW_HOURS?.trim();
  const reviewHours = rawHours ? Number(rawHours) : DEFAULT_REVIEW_HOURS;
  if (!Number.isInteger(reviewHours) || reviewHours < 1 || reviewHours > 72) {
    return off('NEQUI_MANUAL_REVIEW_HOURS debe ser un número entero de horas entre 1 y 72');
  }
  return { manual: { phone, brebKey, holder, reviewHours }, problem: undefined };
}
