import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditEvents, users } from '../db/schema.js';
import { safeEqual } from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { isAllowlistedAdmin, toAuthUser, type AuthUser } from './auth.js';
import { audit, type Actor, type ServiceDeps } from './context.js';
import { ownerAccount } from './passkeys.js';

/**
 * Contraseña del administrador (cuenta del dueño, primer correo de ADMIN_EMAILS).
 *
 * - La crea el propio dueño en el panel con la frase ADMIN_SETUP_CODE (una sola vez): nadie
 *   más la conoce ni se guarda en claro (scrypt con sal aleatoria).
 * - Es el PRIMER factor: después el panel exige el código de la app autenticadora (TOTP).
 *   La huella o llave de acceso es la alternativa de un solo paso (ya es de dos factores).
 * - 5 intentos fallidos en 15 minutos bloquean la cuenta (desde cualquier IP); el límite por IP
 *   de las rutas sigue aplicando. El mensaje de error no revela si el correo existe.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP (Password Storage Cheat Sheet), variante de 64 MiB por cálculo: N=2^16, r=8, p=2.
// Cabe de sobra en el plan gratuito de Render (512 MB) aun con varios intentos a la vez.
const PARAMS = { N: 2 ** 16, r: 8, p: 2 };
const KEY_LENGTH = 32;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export const passwordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres.')
  .max(128)
  .regex(/^[^\p{Cc}]+$/u, 'Sin caracteres de control.');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: 128 * 1024 * 1024 });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash de referencia para gastar el mismo tiempo cuando el correo no corresponde. */
let decoy: Promise<string> | undefined;

const wrongCredentials = () =>
  new AppError('UNAUTHORIZED', 401, 'Correo o contraseña incorrectos.');
const hidden = () => new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');

async function assertNotLocked(deps: ServiceDeps, userId: string, actor: Actor) {
  const ofUser = (action: string) =>
    and(
      eq(auditEvents.entityType, 'user'),
      eq(auditEvents.entityId, userId),
      eq(auditEvents.action, action),
    );
  const [lastSuccess] = await deps.db
    .select({ at: auditEvents.createdAt })
    .from(auditEvents)
    .where(ofUser('admin.password_login'))
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  const [failures] = await deps.db
    .select({ n: count() })
    .from(auditEvents)
    .where(
      and(
        ofUser('admin.password_failed'),
        gt(auditEvents.createdAt, sql`now() - make_interval(mins => ${LOCK_MINUTES})`),
        lastSuccess ? gt(auditEvents.createdAt, lastSuccess.at) : undefined,
      ),
    );
  if ((failures?.n ?? 0) < MAX_FAILURES) return;
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: userId,
    action: 'admin.password_locked',
    data: { alert: true },
  });
  throw new AppError('RATE_LIMITED', 429, `Demasiados intentos. Espera ${LOCK_MINUTES} minutos.`);
}

/** Primera contraseña del dueño, con la frase de activación. Solo si aún no tiene una. */
export async function setupAdminPassword(
  deps: ServiceDeps,
  input: { code: string; password: string },
  actor: Actor,
): Promise<AuthUser> {
  const expected = deps.config.adminSetupCode;
  if (!deps.config.adminEmails.length || !expected || !safeEqual(input.code, expected)) {
    throw hidden();
  }
  const owner = await ownerAccount(deps);
  if (owner.passwordHash) throw hidden();
  const passwordHash = await hashPassword(passwordSchema.parse(input.password));
  // Solo la primera vez: si dos activaciones compiten, gana una.
  const [updated] = await deps.db
    .update(users)
    .set({ passwordHash, passwordChangedAt: deps.now() })
    .where(and(eq(users.id, owner.id), sql`${users.passwordHash} is null`))
    .returning();
  if (!updated) throw hidden();
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: owner.id,
    action: 'admin.password_setup',
    data: { alert: true },
  });
  return toAuthUser(updated);
}

/** Correo + contraseña (primer factor). La sesión resultante aún debe pasar el TOTP. */
export async function loginAdminPassword(
  deps: ServiceDeps,
  input: { email: string; password: string },
  actor: Actor,
): Promise<AuthUser> {
  const email = input.email.trim().toLowerCase();
  const [user] = isAllowlistedAdmin(deps, email)
    ? await deps.db
        .select()
        .from(users)
        .where(and(eq(users.email, email), eq(users.role, 'admin')))
        .limit(1)
    : [];
  if (!user?.passwordHash || user.status !== 'active') {
    decoy ??= hashPassword('referencia-para-igualar-tiempos');
    await verifyPassword(input.password, await decoy);
    throw wrongCredentials();
  }
  await assertNotLocked(deps, user.id, actor);
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await audit(deps.db, actor, {
      entityType: 'user',
      entityId: user.id,
      action: 'admin.password_failed',
      data: { alert: true },
    });
    throw wrongCredentials();
  }
  await deps.db.update(users).set({ lastLoginAt: deps.now() }).where(eq(users.id, user.id));
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: user.id,
    action: 'admin.password_login',
  });
  return toAuthUser(user);
}

export const changePasswordSchema = z.strictObject({
  current: z.string().min(1).max(128),
  password: passwordSchema,
});

/** Cambiar la contraseña con la sesión de administrador abierta (y verificada). */
export async function changeAdminPassword(
  deps: ServiceDeps,
  admin: AuthUser,
  input: z.infer<typeof changePasswordSchema>,
  actor: Actor,
): Promise<void> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, admin.id));
  if (!user?.passwordHash || !(await verifyPassword(input.current, user.passwordHash))) {
    throw new AppError('VALIDATION_ERROR', 400, 'La contraseña actual no es correcta.');
  }
  await deps.db
    .update(users)
    .set({ passwordHash: await hashPassword(input.password), passwordChangedAt: deps.now() })
    .where(eq(users.id, user.id));
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: user.id,
    action: 'admin.password_changed',
    data: { alert: true },
  });
}
