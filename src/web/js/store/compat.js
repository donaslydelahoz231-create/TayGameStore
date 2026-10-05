/**
 * Compatibilidad con navegadores algo antiguos (p. ej. iPhone con iOS 15, Android viejos).
 * Se usa la API nativa si existe y una alternativa equivalente si no.
 */

/** AbortSignal.timeout: Safari 16+, Firefox 100+, Chrome 103+. */
export function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Tiempo agotado', 'TimeoutError')), ms);
  return controller.signal;
}

/** crypto.randomUUID: Safari 15.4+ y solo en https; alternativa con getRandomValues (RFC 4122 v4). */
export function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Object.hasOwn: Safari 15.4+. */
export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
