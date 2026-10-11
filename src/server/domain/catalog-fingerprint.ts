import { createHash } from 'node:crypto';

/**
 * Huella del catálogo: un resumen corto de los paquetes activos y sus precios (normal y promo).
 * Si alguien cambia un precio, agrega o quita un paquete, la huella cambia. La calculan igual el
 * panel del dueño (desde la base de datos) y el diagnóstico diario (desde /api/catalog, público):
 * si las dos no coinciden, o la huella cambió sin que el dueño tocara precios, algo pasó.
 */
export interface FingerprintProduct {
  sku: string;
  units: number;
  /** Precio normal (sin la promo del fin de semana). */
  listPriceCop: number;
  promoPriceCop: number | null;
}

export function catalogFingerprint(products: readonly FingerprintProduct[]): string {
  const lines = products
    .map((p) => `${p.sku}|${p.units}|${p.listPriceCop}|${p.promoPriceCop ?? '-'}`)
    .sort();
  return formatFingerprint(createHash('sha256').update(lines.join('\n')).digest('hex'));
}

/** 64 hex → `4F2A-9C1B-77D0-1E3B` (los primeros 64 bits, fáciles de leer y comparar). */
export function formatFingerprint(hex: string): string {
  return hex.slice(0, 16).toUpperCase().match(/.{4}/g)?.join('-') ?? '';
}
