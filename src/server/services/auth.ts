import { and, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import {
  auditEvents,
  blocklist,
  mfaRecoveryCodes,
  oauthStates,
  sessions,
  users,
  type SocialProvider,
} from '../db/schema.js';
import { decrypt, encrypt, randomToken, sha256 } from '../lib/crypto.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from '../lib/totp.js';
import type { GoogleIdentity } from '../integrations/google/oidc.js';
import { AppError } from '../plugins/errors.js';
import { audit, type Actor, type ServiceDeps } from './context.js';

export type OAuthPurpose = 'customer' | 'admin' | 'link';

export interface AuthUser {
  id: string;
  /** Nulo si la cuenta se creó con una red social que no dio un correo verificado. */
  email: string | null;
  name: string | null;
  role: 'customer' | 'admin';
  googleSub: string | null;
  mfaEnabled: boolean;
}

export interface AuthSession {
  id: string;
  isAdmin: boolean;
  mfaVerified: boolean;
}

// ── Estado OAuth (un solo uso, 10 minutos) ───────────────────────────────────

export async function createOAuthState(
  deps: ServiceDeps,
  purpose: OAuthPurpose,
  options: { provider?: 'google' | SocialProvider; linkUserId?: string } = {},
) {
  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken(48);
  await deps.db.insert(oauthStates).values({
    stateHash: sha256(state),
    codeVerifier,
    nonce,
    purpose,
    provider: options.provider ?? 'google',
    linkUserId: options.linkUserId ?? null,
    expiresAt: new Date(deps.now().getTime() + 10 * 60_000),
  });
  return { state, nonce, codeVerifier };
}

export async function consumeOAuthState(deps: ServiceDeps, state: string) {
  const [row] = await deps.db
    .delete(oauthStates)
    .where(and(eq(oauthStates.stateHash, sha256(state)), gt(oauthStates.expiresAt, deps.now())))
    .returning();
  return row;
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

export function isAllowlistedAdmin(deps: ServiceDeps, email: string | null): boolean {
  return email !== null && deps.config.adminEmails.includes(email.toLowerCase());
}

export async function upsertGoogleUser(
  deps: ServiceDeps,
  identity: GoogleIdentity,
  purpose: OAuthPurpose,
  actor: Actor,
): Promise<AuthUser> {
  const now = deps.now();
  const [blocked] = await deps.db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(
      and(
        eq(blocklist.kind, 'google_sub'),
        eq(blocklist.value, identity.sub),
        or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)),
      ),
    )
    .limit(1);
  if (blocked) throw new AppError('BLOCKED', 403, 'Esta cuenta no puede acceder.');
  if (
    purpose === 'admin' &&
    (!identity.emailVerified || !isAllowlistedAdmin(deps, identity.email))
  ) {
    await audit(deps.db, actor, {
      entityType: 'user',
      entityId: identity.sub,
      action: 'admin.login_denied',
      data: { alert: true },
    });
    throw new AppError('FORBIDDEN', 403, 'Esta cuenta no tiene acceso de administración.');
  }
  const role = purpose === 'admin' ? 'admin' : undefined;
  const [user] = await deps.db
    .insert(users)
    .values({
      googleSub: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      name: identity.name ?? null,
      role: role ?? 'customer',
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: identity.name ?? null,
        lastLoginAt: now,
        updatedAt: sql`now()`,
        ...(role ? { role } : {}),
      },
    })
    .returning();
  if (!user) throw new Error('no se guardó el usuario');
  if (user.status !== 'active')
    throw new AppError('FORBIDDEN', 403, 'Esta cuenta está deshabilitada.');
  await audit(
    deps.db,
    { ...actor, userId: user.id },
    {
      entityType: 'user',
      entityId: user.id,
      action: purpose === 'admin' ? 'admin.login' : 'customer.login',
    },
  );
  return toAuthUser(user);
}

export function toAuthUser(user: typeof users.$inferSelect): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === 'admin' ? 'admin' : 'customer',
    googleSub: user.googleSub,
    mfaEnabled: user.mfaEnabledAt !== null,
  };
}

// ── Sesiones opacas ──────────────────────────────────────────────────────────

export async function createSession(
  deps: ServiceDeps,
  userId: string,
  options: {
    isAdmin: boolean;
    ipHash: string | undefined;
    userAgent: string | undefined;
    /** La autenticación ya fue de dos factores (llave de acceso con verificación del usuario). */
    mfaVerified?: boolean;
  },
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = randomToken();
  const ttlMs = options.isAdmin
    ? deps.config.sessions.adminTtlMinutes * 60_000
    : deps.config.sessions.ttlHours * 3_600_000;
  await deps.db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    isAdmin: options.isAdmin,
    mfaVerifiedAt: options.mfaVerified ? deps.now() : null,
    expiresAt: new Date(deps.now().getTime() + ttlMs),
    ipHash: options.ipHash ?? null,
    userAgent: options.userAgent?.slice(0, 200) ?? null,
  });
  return { token, maxAgeSeconds: Math.floor(ttlMs / 1000) };
}

export async function resolveSession(
  deps: ServiceDeps,
  token: string,
): Promise<{ user: AuthUser; session: AuthSession } | undefined> {
  const now = deps.now();
  const [row] = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.user.status !== 'active') return undefined;
  const idleLimit = row.session.lastSeenAt.getTime() + deps.config.sessions.idleMinutes * 60_000;
  if (idleLimit < now.getTime()) return undefined;
  if (now.getTime() - row.session.lastSeenAt.getTime() > 5 * 60_000) {
    await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }
  return {
    user: toAuthUser(row.user),
    session: {
      id: row.session.id,
      isAdmin: row.session.isAdmin,
      mfaVerified: row.session.mfaVerifiedAt !== null,
    },
  };
}

export async function revokeSession(deps: ServiceDeps, sessionId: string): Promise<void> {
  await deps.db
    .update(sessions)
    .set({ revokedAt: deps.now() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Rota el token de la sesión (tras completar MFA) para evitar fijación de sesión. */
export async function rotateSession(
  deps: ServiceDeps,
  sessionId: string,
  changes: { mfaVerifiedAt?: Date },
): Promise<string> {
  const token = randomToken();
  await deps.db
    .update(sessions)
    .set({ tokenHash: sha256(token), ...changes })
    .where(eq(sessions.id, sessionId));
  return token;
}

// ── MFA (TOTP + códigos de recuperación) ─────────────────────────────────────

export async function beginMfaSetup(deps: ServiceDeps, user: AuthUser) {
  if (user.mfaEnabled)
    throw new AppError('CONFLICT', 409, 'La verificación en dos pasos ya está activa.');
  const secret = generateTotpSecret();
  await deps.db
    .update(users)
    .set({ mfaSecretEnc: encrypt(deps.config.secrets.mfaKeys, secret), updatedAt: sql`now()` })
    .where(and(eq(users.id, user.id), isNull(users.mfaEnabledAt)));
  return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.id) };
}

async function storedSecret(deps: ServiceDeps, userId: string): Promise<string> {
  const [row] = await deps.db
    .select({ enc: users.mfaSecretEnc })
    .from(users)
    .where(eq(users.id, userId));
  if (!row?.enc)
    throw new AppError('MFA_INVALID', 400, 'Primero configura la verificación en dos pasos.');
  const { plaintext, version } = decrypt(deps.config.secrets.mfaKeys, row.enc);
  if (version !== deps.config.secrets.mfaKeys.activeVersion) {
    // Rotación de clave: se vuelve a cifrar con la clave activa al usarla.
    await deps.db
      .update(users)
      .set({ mfaSecretEnc: encrypt(deps.config.secrets.mfaKeys, plaintext) })
      .where(eq(users.id, userId));
  }
  return plaintext;
}

export async function enableMfa(deps: ServiceDeps, user: AuthUser, code: string, actor: Actor) {
  const secret = await storedSecret(deps, user.id);
  if (!verifyTotp(secret, code, deps.now().getTime())) {
    throw new AppError('MFA_INVALID', 400, 'Código de verificación inválido.');
  }
  const codes = generateRecoveryCodes();
  await deps.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ mfaEnabledAt: deps.now(), updatedAt: sql`now()` })
      .where(and(eq(users.id, user.id), isNull(users.mfaEnabledAt)))
      .returning({ id: users.id });
    if (!updated)
      throw new AppError('CONFLICT', 409, 'La verificación en dos pasos ya está activa.');
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
    await tx
      .insert(mfaRecoveryCodes)
      .values(codes.map((c) => ({ userId: user.id, codeHash: sha256(normalizeRecoveryCode(c)) })));
    await audit(tx, actor, { entityType: 'user', entityId: user.id, action: 'admin.mfa_enabled' });
  });
  return codes;
}

/** Fallos de MFA tolerados por cuenta (desde cualquier IP) antes del bloqueo temporal. */
export const MFA_MAX_FAILURES = 5;
const MFA_LOCK_MINUTES = 15;

/**
 * Bloqueo por CUENTA (el rate limiting es por IP): quien tenga una sesión robada no puede
 * probar códigos desde muchas IPs. Cuenta los fallos de los últimos 15 minutos posteriores al
 * último acierto, con la hora de la base de datos (la misma que registra la auditoría).
 */
async function assertMfaNotLocked(deps: ServiceDeps, user: AuthUser, actor: Actor) {
  const ofUser = (action: string) =>
    and(
      eq(auditEvents.entityType, 'user'),
      eq(auditEvents.entityId, user.id),
      eq(auditEvents.action, action),
    );
  const [lastSuccess] = await deps.db
    .select({ at: auditEvents.createdAt })
    .from(auditEvents)
    .where(ofUser('admin.mfa_verified'))
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  const [failures] = await deps.db
    .select({ n: count() })
    .from(auditEvents)
    .where(
      and(
        ofUser('admin.mfa_failed'),
        gt(auditEvents.createdAt, sql`now() - make_interval(mins => ${MFA_LOCK_MINUTES})`),
        lastSuccess ? gt(auditEvents.createdAt, lastSuccess.at) : undefined,
      ),
    );
  if ((failures?.n ?? 0) < MFA_MAX_FAILURES) return;
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: user.id,
    action: 'admin.mfa_locked',
    data: { alert: true },
  });
  throw new AppError(
    'RATE_LIMITED',
    429,
    `Demasiados códigos incorrectos. Espera ${MFA_LOCK_MINUTES} minutos.`,
  );
}

export async function verifyMfa(
  deps: ServiceDeps,
  user: AuthUser,
  input: { code?: string | undefined; recoveryCode?: string | undefined },
  actor: Actor,
): Promise<void> {
  if (!user.mfaEnabled)
    throw new AppError('MFA_REQUIRED', 403, 'Configura la verificación en dos pasos.');
  await assertMfaNotLocked(deps, user, actor);
  if (input.code) {
    const secret = await storedSecret(deps, user.id);
    if (verifyTotp(secret, input.code, deps.now().getTime())) {
      await audit(deps.db, actor, {
        entityType: 'user',
        entityId: user.id,
        action: 'admin.mfa_verified',
      });
      return;
    }
  } else if (input.recoveryCode) {
    // Un solo uso: CAS sobre used_at.
    const [used] = await deps.db
      .update(mfaRecoveryCodes)
      .set({ usedAt: deps.now() })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, user.id),
          eq(mfaRecoveryCodes.codeHash, sha256(normalizeRecoveryCode(input.recoveryCode))),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id });
    if (used) {
      await audit(deps.db, actor, {
        entityType: 'user',
        entityId: user.id,
        action: 'admin.mfa_recovery_code_used',
        data: { alert: true },
      });
      return;
    }
  }
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: user.id,
    action: 'admin.mfa_failed',
    data: { alert: true },
  });
  throw new AppError('MFA_INVALID', 400, 'Código de verificación inválido.');
}
