/**
 * Configuración de Nequi, separada de la de Mercado Pago: ninguna variable, credencial o ajuste
 * de un proveedor sirve para el otro.
 *
 * Nequi por transferencia (`nequi_manual`) está apagado por defecto. Con NEQUI_MANUAL_ENABLED=true
 * el comprador que elige Nequi en su pedido ve el celular (y, si se configura, el nombre) de la
 * cuenta Nequi del dueño para transferir. Publicar ese dato es decisión del dueño
 * (docs/datos-del-propietario.md, requisito 19; docs/pagos-nequi.md).
 *
 * Aislamiento: una variable de Nequi mal escrita nunca impide arrancar la tienda (Mercado Pago
 * sigue funcionando); Nequi queda apagado y el arranque lo informa sin repetir el valor.
 *
 * Nequi Push (API oficial de Nequi) no tiene variables: no hay acceso oficial ni documentación
 * verificada, así que no se implementa ninguna llamada (ver docs/pagos-nequi.md).
 */

export interface NequiManualConfig {
  /** Celular de la cuenta Nequi del dueño (10 dígitos, empieza por 3). */
  phone: string;
  /** Nombre que el comprador ve como titular (opcional; lo decide el dueño). */
  holder: string | undefined;
  /** Horas que el pedido sigue abierto después de que el cliente avisa que transfirió. */
  reviewHours: number;
}

export interface NequiEnv {
  NEQUI_MANUAL_ENABLED?: string | undefined;
  NEQUI_MANUAL_PHONE?: string | undefined;
  NEQUI_MANUAL_HOLDER?: string | undefined;
  NEQUI_MANUAL_REVIEW_HOURS?: string | undefined;
}

export interface NequiSettings {
  manual: NequiManualConfig | undefined;
  /** Por qué Nequi por transferencia quedó apagado pese a pedirse (sin valores). */
  problem: string | undefined;
}

const DEFAULT_REVIEW_HOURS = 24;

export function nequiSettings(env: NequiEnv): NequiSettings {
  const flag = env.NEQUI_MANUAL_ENABLED?.trim().toLowerCase() ?? '';
  if (flag === '' || flag === 'false' || flag === '0')
    return { manual: undefined, problem: undefined };
  if (flag !== 'true' && flag !== '1') {
    return { manual: undefined, problem: 'NEQUI_MANUAL_ENABLED debe ser true o false' };
  }
  const phone = (env.NEQUI_MANUAL_PHONE ?? '').replace(/[\s-]/g, '');
  if (!/^3\d{9}$/.test(phone)) {
    return {
      manual: undefined,
      problem: 'NEQUI_MANUAL_PHONE debe ser un celular colombiano de 10 dígitos que empiece por 3',
    };
  }
  const holder = env.NEQUI_MANUAL_HOLDER?.trim().replace(/\s+/g, ' ') || undefined;
  if (holder && !/^[\p{L} .'-]{2,60}$/u.test(holder)) {
    return {
      manual: undefined,
      problem: 'NEQUI_MANUAL_HOLDER: solo letras, espacios y puntos (2 a 60 caracteres)',
    };
  }
  const rawHours = env.NEQUI_MANUAL_REVIEW_HOURS?.trim();
  const reviewHours = rawHours ? Number(rawHours) : DEFAULT_REVIEW_HOURS;
  if (!Number.isInteger(reviewHours) || reviewHours < 1 || reviewHours > 72) {
    return {
      manual: undefined,
      problem: 'NEQUI_MANUAL_REVIEW_HOURS debe ser un número entero de horas entre 1 y 72',
    };
  }
  return { manual: { phone, holder, reviewHours }, problem: undefined };
}
