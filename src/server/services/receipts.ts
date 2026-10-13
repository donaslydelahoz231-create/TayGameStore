import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Keyring } from '../config/env.js';
import type { Tx } from '../db/client.js';
import { orders, payments } from '../db/schema.js';
import type { ServiceDeps } from './context.js';

/**
 * Comprobantes verificables. Cada pedido pagado recibe:
 *
 * - un **número consecutivo** (1, 2, 3…), asignado al aprobarse el pago. El dueño sabe cuál es el
 *   último emitido: un comprobante con un número mayor, o repetido, es falso;
 * - un **código de verificación** `V<versión>-XXXX-XXXX-XXXX-XXXX`: HMAC-SHA256, con una clave que
 *   solo tiene el servidor, del número, la referencia, el total y la operación de Mercado Pago.
 *   Nadie puede inventar un código válido ni cambiar el total de un comprobante real sin que el
 *   código deje de coincidir. Se recalcula en cada verificación: no se guarda.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (sin I, L, O, U)
/** Bloqueo de PostgreSQL que reparte los números de uno en uno (sin repetidos ni saltos). */
const RECEIPT_LOCK = 7401;

export interface ReceiptFacts {
  number: number;
  reference: string;
  totalCop: number;
  paymentId: string;
}

function receiptKey(keyring: Keyring, version: number): Buffer | undefined {
  const base = keyring.keys.get(version);
  // Clave propia para comprobantes, derivada de la del llavero: nunca la misma que la de accesos.
  return base ? createHmac('sha256', base).update('tgs-receipt-key-v1').digest() : undefined;
}

function base32(bytes: Buffer, length: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** Código de verificación con la versión indicada (por defecto, la activa del llavero). */
export function receiptVerificationCode(
  keyring: Keyring,
  facts: ReceiptFacts,
  version = keyring.activeVersion,
): string {
  const key = receiptKey(keyring, version);
  if (!key) throw new Error('llavero sin la clave del comprobante');
  const mac = createHmac('sha256', key)
    .update(`tgs-receipt|${facts.number}|${facts.reference}|${facts.totalCop}|${facts.paymentId}`)
    .digest();
  const body = base32(mac, 16).match(/.{4}/g)?.join('-') ?? '';
  return `V${version}-${body}`;
}

/** Normaliza lo que escribe una persona: mayúsculas, sin espacios, O→0, I/L→1. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** ¿El código corresponde a estos datos? Comparación en tiempo constante. */
export function codeMatches(keyring: Keyring, facts: ReceiptFacts, code: string): boolean {
  const given = normalizeCode(code);
  const version = Number(/^V(\d{1,4})-/.exec(given)?.[1]);
  if (!Number.isInteger(version) || !keyring.keys.has(version)) return false;
  const expected = Buffer.from(receiptVerificationCode(keyring, facts, version));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Asigna el siguiente número de comprobante, dentro de la transacción que marca el pedido pagado.
 * Idempotente: un pedido que ya tiene número lo conserva.
 */
export async function assignReceiptNumber(tx: Tx, orderId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${RECEIPT_LOCK})`);
  await tx.execute(sql`
    update orders
       set receipt_number = (select coalesce(max(receipt_number), 0) + 1 from orders)
     where id = ${orderId} and receipt_number is null`);
}

export async function lastReceiptNumber(deps: ServiceDeps): Promise<number> {
  const [row] = await deps.db
    .select({ last: sql<number | null>`max(${orders.receiptNumber})` })
    .from(orders);
  return Number(row?.last ?? 0);
}

/** Datos firmados de un pedido pagado, o null si aún no tiene comprobante. */
export async function receiptFacts(
  db: ServiceDeps['db'] | Tx,
  order: Pick<typeof orders.$inferSelect, 'id' | 'publicRef' | 'totalCop' | 'receiptNumber'>,
): Promise<ReceiptFacts | null> {
  if (order.receiptNumber === null) return null;
  const [payment] = await db
    .select({ id: payments.providerPaymentId })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.isOrderPayment, true)));
  if (!payment) return null;
  return {
    number: order.receiptNumber,
    reference: order.publicRef,
    totalCop: order.totalCop,
    paymentId: payment.id,
  };
}

export type ReceiptCheck =
  | {
      valid: true;
      number: number;
      reference: string;
      totalCop: number;
      paymentId: string;
      status: string;
      paidAt: string | null;
      lastIssued: number;
    }
  | {
      valid: false;
      reason: 'no_existe' | 'sin_comprobante' | 'codigo_no_coincide';
      lastIssued: number;
    };

/**
 * Verificación para el dueño: con la referencia y el código impresos en el comprobante. No
 * revela nada si la referencia no existe o el código no coincide.
 */
export async function verifyReceipt(
  deps: ServiceDeps,
  input: { reference: string; code: string },
): Promise<ReceiptCheck> {
  const lastIssued = await lastReceiptNumber(deps);
  const reference = input.reference.trim().toUpperCase();
  const [order] = await deps.db.select().from(orders).where(eq(orders.publicRef, reference));
  if (!order) return { valid: false, reason: 'no_existe', lastIssued };
  const facts = await receiptFacts(deps.db, order);
  if (!facts) return { valid: false, reason: 'sin_comprobante', lastIssued };
  if (!codeMatches(deps.config.secrets.orderTokenKeys, facts, input.code)) {
    return { valid: false, reason: 'codigo_no_coincide', lastIssued };
  }
  const [payment] = await deps.db
    .select({ approvedAt: payments.approvedAt })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.isOrderPayment, true)));
  return {
    valid: true,
    ...facts,
    status: order.status,
    paidAt: payment?.approvedAt?.toISOString() ?? null,
    lastIssued,
  };
}

export const publicVerifySchema = z.strictObject({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^TGS-[0-9A-Z]{10}$/),
  code: z.string().trim().min(5).max(60),
});

/** Lo que cualquiera puede comprobar de un comprobante: sin datos del cliente ni del pago. */
export type PublicReceiptCheck =
  | {
      authentic: true;
      number: number;
      reference: string;
      totalCop: number;
      status: string;
      paidAt: string | null;
    }
  | { authentic: false };

/**
 * Verificación pública (sección Soporte de la tienda): un comprobante falso o alterado no pasa.
 * Si no es auténtico la respuesta es siempre la misma, exista o no la referencia, para no
 * revelar qué pedidos existen; y nunca devuelve nombre, correo, UID ni el ID del pago.
 */
export async function verifyReceiptPublic(
  deps: ServiceDeps,
  input: z.infer<typeof publicVerifySchema>,
): Promise<PublicReceiptCheck> {
  const check = await verifyReceipt(deps, input);
  if (!check.valid) return { authentic: false };
  return {
    authentic: true,
    number: check.number,
    reference: check.reference,
    totalCop: check.totalCop,
    status: check.status,
    paidAt: check.paidAt,
  };
}
