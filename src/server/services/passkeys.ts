import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { and, count, eq, gt, lt } from 'drizzle-orm';
import { passkeys, users, webauthnChallenges } from '../db/schema.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { toAuthUser, type AuthUser } from './auth.js';
import { isUniqueViolation } from './orders.js';
import { audit, type Actor, type ServiceDeps } from './context.js';

/**
 * Llaves de acceso (passkeys, estándar WebAuthn) para clientes: la cuenta se crea y se abre con
 * la huella, el rostro o el PIN del dispositivo. La tienda solo guarda la clave pública; no hay
 * contraseña que filtrar ni proveedor externo que configurar.
 *
 * Seguridad:
 * - Cada operación usa un reto de un solo uso (5 min) ligado a una cookie del navegador.
 * - El servidor comprueba origen y dominio exactos (config.passkey) y el contador de firmas.
 * - Una llave nunca da acceso de administración (el panel sigue exigiendo Google + TOTP).
 */

const RP_NAME = 'TayGameStore';
const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS_PER_USER = 10;

const invalid = () =>
  new AppError(
    'VALIDATION_ERROR',
    400,
    'No se pudo validar la llave de acceso. Inténtalo de nuevo.',
  );
const expired = () =>
  new AppError(
    'VALIDATION_ERROR',
    400,
    'La solicitud de llave de acceso venció. Inténtalo de nuevo.',
  );

function requireRp(deps: ServiceDeps) {
  const rp = deps.config.passkey;
  if (!rp) throw new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');
  return rp;
}

async function storeChallenge(
  deps: ServiceDeps,
  values: {
    challenge: string;
    purpose: 'register' | 'login';
    userId?: string | undefined;
    webauthnUserId?: string | undefined;
    displayName?: string | null | undefined;
  },
): Promise<string> {
  const token = randomToken();
  const now = deps.now();
  // Limpieza oportunista: los retos vencidos no sirven para nada.
  await deps.db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
  await deps.db.insert(webauthnChallenges).values({
    idHash: sha256(token),
    challenge: values.challenge,
    purpose: values.purpose,
    userId: values.userId ?? null,
    webauthnUserId: values.webauthnUserId ?? null,
    displayName: values.displayName ?? null,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  });
  return token;
}

async function consumeChallenge(
  deps: ServiceDeps,
  token: string | undefined,
  purpose: 'register' | 'login',
) {
  if (!token) throw expired();
  const [row] = await deps.db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.idHash, sha256(token)),
        gt(webauthnChallenges.expiresAt, deps.now()),
      ),
    )
    .returning();
  if (!row || row.purpose !== purpose) throw expired();
  return row;
}

const transportsOf = (value: string | null) => (value ? value.split(',') : undefined);

// ── Registro ─────────────────────────────────────────────────────────────────

/**
 * Opciones para crear una llave. Sin `userId` se prepara una cuenta nueva; con `userId`
 * (sesión de cliente abierta) se añade una llave más a esa cuenta.
 */
export async function beginPasskeyRegistration(
  deps: ServiceDeps,
  input: { userId?: string | undefined; displayName: string | null },
): Promise<{ token: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const rp = requireRp(deps);
  let existing: { credentialId: string; transports: string | null }[] = [];
  let label = input.displayName;
  if (input.userId) {
    existing = await deps.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, input.userId));
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw new AppError('LIMIT_EXCEEDED', 429, 'Esta cuenta ya tiene el máximo de llaves.');
    }
    const [user] = await deps.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.userId));
    label = user?.name ?? label;
  }
  // El id WebAuthn de una cuenta nueva es el id que tendrá el usuario en la tienda.
  const webauthnUserId = input.userId ?? randomUUID();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpId,
    userName: label ?? 'Cliente TayGameStore',
    userDisplayName: label ?? 'Cliente TayGameStore',
    userID: new TextEncoder().encode(webauthnUserId),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: transportsOf(p.transports),
    })),
    // Llave guardada en el dispositivo (sirve para entrar sin escribir nada).
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    timeout: 120_000,
  });
  const token = await storeChallenge(deps, {
    challenge: options.challenge,
    purpose: 'register',
    userId: input.userId,
    webauthnUserId,
    displayName: input.displayName,
  });
  return { token, options };
}

export async function finishPasskeyRegistration(
  deps: ServiceDeps,
  input: {
    token: string | undefined;
    response: RegistrationResponseJSON;
    sessionUserId: string | undefined;
  },
  actor: Actor,
): Promise<AuthUser> {
  const rp = requireRp(deps);
  const challenge = await consumeChallenge(deps, input.token, 'register');
  // Añadir una llave a una cuenta exige seguir con la sesión de esa misma cuenta.
  if (challenge.userId && challenge.userId !== input.sessionUserId) {
    throw new AppError('FORBIDDEN', 403, 'Inicia sesión de nuevo para añadir la llave.');
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: false,
    });
  } catch {
    throw invalid();
  }
  if (!verification.verified) throw invalid();
  const info = verification.registrationInfo;
  const now = deps.now();
  try {
    const userId = await deps.db.transaction(async (tx) => {
      let id = challenge.userId;
      if (!id) {
        if (!challenge.webauthnUserId) throw invalid();
        const [created] = await tx
          .insert(users)
          .values({
            id: challenge.webauthnUserId,
            googleSub: null,
            email: null,
            emailVerified: false,
            name: challenge.displayName,
            role: 'customer',
            lastLoginAt: now,
          })
          .returning({ id: users.id });
        if (!created) throw new Error('no se creó el usuario');
        id = created.id;
      }
      await tx.insert(passkeys).values({
        userId: id,
        credentialId: info.credential.id,
        publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports?.join(',') ?? null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        lastUsedAt: now,
      });
      await audit(tx, actor, {
        entityType: 'user',
        entityId: id,
        action: challenge.userId ? 'customer.passkey_added' : 'customer.passkey_signup',
      });
      return id;
    });
    return await activeUser(deps, userId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, 'Esa llave de acceso ya está registrada.');
    }
    throw error;
  }
}

// ── Inicio de sesión ─────────────────────────────────────────────────────────

/** Opciones para entrar: el dispositivo ofrece las llaves que tenga para esta tienda. */
export async function beginPasskeyLogin(
  deps: ServiceDeps,
): Promise<{ token: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const rp = requireRp(deps);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'preferred',
    timeout: 120_000,
  });
  const token = await storeChallenge(deps, { challenge: options.challenge, purpose: 'login' });
  return { token, options };
}

export async function finishPasskeyLogin(
  deps: ServiceDeps,
  input: { token: string | undefined; response: AuthenticationResponseJSON },
  actor: Actor,
): Promise<AuthUser> {
  const rp = requireRp(deps);
  const challenge = await consumeChallenge(deps, input.token, 'login');
  const [stored] = await deps.db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, input.response.id));
  if (!stored) throw invalid();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      credential: {
        id: stored.credentialId,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: transportsOf(stored.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    // Incluye un contador de firmas que no avanza: posible llave clonada.
    throw invalid();
  }
  if (!verification.verified) throw invalid();
  const user = await activeUser(deps, stored.userId);
  const now = deps.now();
  await deps.db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now })
    .where(eq(passkeys.id, stored.id));
  await deps.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: user.id,
    action: 'customer.passkey_login',
  });
  return user;
}

export async function countPasskeys(deps: ServiceDeps, userId: string): Promise<number> {
  const [row] = await deps.db
    .select({ n: count() })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  return row?.n ?? 0;
}

async function activeUser(deps: ServiceDeps, userId: string): Promise<AuthUser> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) throw invalid();
  if (user.status !== 'active') {
    throw new AppError('FORBIDDEN', 403, 'Esta cuenta está deshabilitada.');
  }
  return toAuthUser(user);
}
