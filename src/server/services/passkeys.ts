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
import { randomToken, safeEqual, sha256 } from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { isAllowlistedAdmin, toAuthUser, type AuthUser } from './auth.js';
import { isUniqueViolation } from './orders.js';
import { audit, type Actor, type ServiceDeps } from './context.js';

/**
 * Huella o llave de acceso (passkeys, estándar WebAuthn) del ADMINISTRADOR. No se ofrece al
 * público: los clientes compran como invitados (o con Google/Facebook si se activan).
 *
 * - Activación: la primera llave se registra en el panel con ADMIN_SETUP_CODE (frase que solo
 *   conoce el dueño, escrita en el hosting). Cuando ya existe una, la frase deja de servir.
 * - Entrar: el dispositivo firma un reto con verificación del usuario (huella, rostro o PIN):
 *   posesión + biometría/PIN, por eso la sesión cuenta como verificada en dos pasos.
 * - Otra llave (otro equipo): solo desde una sesión de administrador ya abierta.
 *
 * Seguridad: retos de un solo uso (5 min) ligados a cookie; origen y dominio exactos; contador
 * de firmas (detecta llaves clonadas); la cuenta debe seguir en ADMIN_EMAILS en cada uso.
 */

const RP_NAME = 'TayGameStore';
const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS_PER_USER = 10;
const OWNER_NAME = 'Dueño de TayGameStore';

type Purpose = 'setup' | 'register' | 'login';

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
/** Para quien no es el dueño, la activación no existe (misma respuesta que una ruta inexistente). */
const hidden = () => new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');

function requireRp(deps: ServiceDeps) {
  const rp = deps.config.passkey;
  if (!rp || !deps.config.adminEmails.length) throw hidden();
  return rp;
}

async function storeChallenge(
  deps: ServiceDeps,
  values: { challenge: string; purpose: Purpose; userId?: string | undefined },
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
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  });
  return token;
}

async function consumeChallenge(deps: ServiceDeps, token: string | undefined, purpose: Purpose) {
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

/** Cuenta de administrador del dueño (primer correo de ADMIN_EMAILS); se crea si no existe. */
export async function ownerAccount(deps: ServiceDeps) {
  const email = deps.config.adminEmails[0];
  if (!email) throw hidden();
  const [existing] = await deps.db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, 'admin')))
    .limit(1);
  if (existing) return existing;
  const [created] = await deps.db
    .insert(users)
    .values({ email, emailVerified: false, name: OWNER_NAME, role: 'admin' })
    .returning();
  if (!created) throw new Error('no se creó la cuenta del dueño');
  return created;
}

async function passkeysOf(deps: ServiceDeps, userId: string) {
  return deps.db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
}

async function registrationOptions(
  deps: ServiceDeps,
  user: { id: string; email: string | null; name: string | null },
  purpose: 'setup' | 'register',
) {
  const rp = requireRp(deps);
  const existing = await passkeysOf(deps, user.id);
  if (existing.length >= MAX_PASSKEYS_PER_USER) {
    throw new AppError('LIMIT_EXCEEDED', 429, 'Esta cuenta ya tiene el máximo de llaves.');
  }
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpId,
    userName: user.email ?? OWNER_NAME,
    userDisplayName: user.name ?? OWNER_NAME,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: transportsOf(p.transports),
    })),
    // Llave guardada en el dispositivo y con huella, rostro o PIN obligatorios.
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 120_000,
  });
  const token = await storeChallenge(deps, {
    challenge: options.challenge,
    purpose,
    userId: user.id,
  });
  return { token, options };
}

// ── Activación inicial (frase del dueño) ─────────────────────────────────────

export async function beginAdminPasskeySetup(
  deps: ServiceDeps,
  code: string,
): Promise<{ token: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  requireRp(deps);
  const expected = deps.config.adminSetupCode;
  if (!expected || !safeEqual(code, expected)) throw hidden();
  const owner = await ownerAccount(deps);
  // Con una llave ya registrada, la frase deja de servir: las demás se añaden con sesión.
  const [row] = await deps.db
    .select({ n: count() })
    .from(passkeys)
    .where(eq(passkeys.userId, owner.id));
  if ((row?.n ?? 0) > 0) throw hidden();
  return registrationOptions(deps, owner, 'setup');
}

/** Otra llave (otro equipo) para el administrador con sesión abierta. */
export async function beginAdminPasskeyRegistration(
  deps: ServiceDeps,
  admin: AuthUser,
): Promise<{ token: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  return registrationOptions(deps, admin, 'register');
}

export async function finishAdminPasskeyRegistration(
  deps: ServiceDeps,
  input: {
    token: string | undefined;
    response: RegistrationResponseJSON;
    /** Administrador con sesión (para añadir una llave); vacío en la activación inicial. */
    adminUserId: string | undefined;
  },
  actor: Actor,
): Promise<AuthUser> {
  const rp = requireRp(deps);
  const purpose = input.adminUserId ? 'register' : 'setup';
  const challenge = await consumeChallenge(deps, input.token, purpose);
  if (!challenge.userId) throw invalid();
  if (purpose === 'register' && challenge.userId !== input.adminUserId) {
    throw new AppError('FORBIDDEN', 403, 'Inicia sesión de nuevo para añadir la llave.');
  }
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
    });
  } catch {
    throw invalid();
  }
  if (!verification.verified) throw invalid();
  const info = verification.registrationInfo;
  const userId = challenge.userId;
  try {
    await deps.db.transaction(async (tx) => {
      if (purpose === 'setup') {
        // Dos activaciones a la vez: solo la primera llave se acepta.
        const [row] = await tx
          .select({ n: count() })
          .from(passkeys)
          .where(eq(passkeys.userId, userId));
        if ((row?.n ?? 0) > 0) throw hidden();
      }
      await tx.insert(passkeys).values({
        userId,
        credentialId: info.credential.id,
        publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports?.join(',') ?? null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        lastUsedAt: deps.now(),
      });
      await audit(tx, actor, {
        entityType: 'user',
        entityId: userId,
        action: purpose === 'setup' ? 'admin.passkey_setup' : 'admin.passkey_added',
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, 'Esa llave de acceso ya está registrada.');
    }
    throw error;
  }
  return activeAdmin(deps, userId);
}

// ── Entrar ───────────────────────────────────────────────────────────────────

/** Opciones para entrar: el dispositivo ofrece las llaves que tenga para esta tienda. */
export async function beginAdminPasskeyLogin(
  deps: ServiceDeps,
): Promise<{ token: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const rp = requireRp(deps);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'required',
    timeout: 120_000,
  });
  const token = await storeChallenge(deps, { challenge: options.challenge, purpose: 'login' });
  return { token, options };
}

export async function finishAdminPasskeyLogin(
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
      requireUserVerification: true,
    });
  } catch {
    // Incluye un contador de firmas que no avanza: posible llave clonada.
    throw invalid();
  }
  if (!verification.verified) throw invalid();
  const admin = await activeAdmin(deps, stored.userId);
  const now = deps.now();
  await deps.db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now })
    .where(eq(passkeys.id, stored.id));
  await deps.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, admin.id));
  await audit(deps.db, actor, {
    entityType: 'user',
    entityId: admin.id,
    action: 'admin.passkey_login',
  });
  return admin;
}

/** La llave solo abre el panel si la cuenta sigue siendo administradora y está en la lista. */
async function activeAdmin(deps: ServiceDeps, userId: string): Promise<AuthUser> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status !== 'active' || user.role !== 'admin') throw invalid();
  if (!isAllowlistedAdmin(deps, user.email)) throw invalid();
  return toAuthUser(user);
}
