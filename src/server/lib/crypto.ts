import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Keyring } from '../config/env.js';

/** Token aleatorio de 256 bits en base64url (sesiones, accesos a órdenes, estados OAuth). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmacWith(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** HMAC con la clave activa del llavero. Devuelve el hash y la versión usada. */
export function keyedHash(keyring: Keyring, value: string): { hash: string; version: number } {
  const key = keyring.keys.get(keyring.activeVersion);
  if (!key) throw new Error('llavero sin clave activa');
  return { hash: hmacWith(key, value), version: keyring.activeVersion };
}

/**
 * Verifica un valor contra un hash creado con la versión indicada. Si esa versión ya no está
 * en el llavero (clave retirada), la verificación falla.
 */
export function verifyKeyedHash(
  keyring: Keyring,
  value: string,
  hash: string,
  version: number,
): boolean {
  const key = keyring.keys.get(version);
  return key ? safeEqual(hmacWith(key, value), hash) : false;
}

/** Hash de IP con pepper: permite rate limiting y blocklist sin guardar la IP en claro. */
export function hashIp(pepper: string, ip: string): string {
  return createHmac('sha256', pepper).update(ip).digest('hex').slice(0, 32);
}

/** Cifrado autenticado AES-256-GCM. Formato: `v<versión>.<iv>.<tag>.<texto>` (base64url). */
export function encrypt(keyring: Keyring, plaintext: string): string {
  const key = keyring.keys.get(keyring.activeVersion);
  if (!key) throw new Error('llavero sin clave activa');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.subarray(0, 32), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    `v${keyring.activeVersion}`,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decrypt(keyring: Keyring, payload: string): { plaintext: string; version: number } {
  const [versionPart, iv, tag, data] = payload.split('.');
  const version = Number(versionPart?.slice(1));
  const key = keyring.keys.get(version);
  if (!key || !iv || !tag || !data) throw new Error('texto cifrado inválido o clave retirada');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key.subarray(0, 32),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return { plaintext, version };
}

const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (sin I, L, O, U)

/** Referencia pública de orden: `TGS-` + 10 caracteres aleatorios (50 bits). */
export function publicOrderRef(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const byte of bytes) out += REF_ALPHABET[byte % 32];
  return `TGS-${out}`;
}

/** Código corto mostrado en el comprobante. No da acceso a nada. */
export function receiptCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}
