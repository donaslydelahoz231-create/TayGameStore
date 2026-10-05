import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { blocklist, userIdentities, users, type SocialProvider } from '../db/schema.js';
import type { GoogleIdentity } from '../integrations/google/oidc.js';
import type { SocialIdentity } from '../integrations/social/providers.js';
import { AppError } from '../plugins/errors.js';
import { isUniqueViolation } from './orders.js';
import { toAuthUser, type AuthUser } from './auth.js';
import { audit, type Actor, type ServiceDeps } from './context.js';

/**
 * Cuentas de clientes con varias redes sociales.
 * Reglas de seguridad:
 * - Una identidad (proveedor + id) pertenece a UN usuario.
 * - Se vincula solo de forma explícita, con la sesión abierta ("Vincular" en Mi cuenta).
 *   Nunca por coincidencia de correo: un proveedor con correos sin verificar permitiría
 *   apoderarse de cuentas ajenas.
 * - Ninguna identidad social da acceso de administración.
 */
export const LINKABLE_PROVIDERS = ['google', 'discord', 'facebook'] as const;
export type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number];

const inUse = () =>
  new AppError('CONFLICT', 409, 'Esa cuenta ya está vinculada a otro usuario de TayGameStore.');

async function assertNotBlocked(deps: ServiceDeps, provider: SocialProvider, subject: string) {
  const [blocked] = await deps.db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(
      and(
        eq(blocklist.kind, `${provider}_id`),
        eq(blocklist.value, subject),
        or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, deps.now())),
      ),
    )
    .limit(1);
  if (blocked) throw new AppError('BLOCKED', 403, 'Esta cuenta no puede acceder.');
}

async function activeUser(deps: ServiceDeps, userId: string): Promise<AuthUser> {
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError('UNAUTHORIZED', 401, 'Debes iniciar sesión.');
  if (user.status !== 'active')
    throw new AppError('FORBIDDEN', 403, 'Esta cuenta está deshabilitada.');
  return toAuthUser(user);
}

/** Entrar (o crear la cuenta) con Discord o Facebook. */
export async function loginWithSocial(
  deps: ServiceDeps,
  identity: SocialIdentity,
  actor: Actor,
): Promise<AuthUser> {
  await assertNotBlocked(deps, identity.provider, identity.subject);
  const now = deps.now();
  const [existing] = await deps.db
    .update(userIdentities)
    .set({ lastLoginAt: now })
    .where(
      and(
        eq(userIdentities.provider, identity.provider),
        eq(userIdentities.subject, identity.subject),
      ),
    )
    .returning({ userId: userIdentities.userId });
  let userId = existing?.userId;
  if (!userId) {
    try {
      userId = await deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            googleSub: null,
            email: identity.email ?? null,
            emailVerified: identity.email !== undefined,
            name: identity.name ?? null,
            role: 'customer',
            lastLoginAt: now,
          })
          .returning({ id: users.id });
        if (!created) throw new Error('no se creó el usuario');
        await tx.insert(userIdentities).values({
          userId: created.id,
          provider: identity.provider,
          subject: identity.subject,
          lastLoginAt: now,
        });
        return created.id;
      });
    } catch (error) {
      // Dos callbacks simultáneos del mismo usuario: gana el primero.
      if (!isUniqueViolation(error, 'user_identities_provider_subject_key')) throw error;
      const [winner] = await deps.db
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.provider, identity.provider),
            eq(userIdentities.subject, identity.subject),
          ),
        );
      userId = winner?.userId;
      if (!userId) throw error;
    }
  }
  const user = await activeUser(deps, userId);
  await audit(
    deps.db,
    { ...actor, userId },
    {
      entityType: 'user',
      entityId: userId,
      action: 'customer.login',
      data: { provider: identity.provider },
    },
  );
  return user;
}

/** Vincular Discord o Facebook a la cuenta con sesión abierta. */
export async function linkSocialIdentity(
  deps: ServiceDeps,
  userId: string,
  identity: SocialIdentity,
  actor: Actor,
): Promise<void> {
  await assertNotBlocked(deps, identity.provider, identity.subject);
  await activeUser(deps, userId);
  const [owner] = await deps.db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, identity.provider),
        eq(userIdentities.subject, identity.subject),
      ),
    );
  if (owner && owner.userId !== userId) throw inUse();
  if (owner) return;
  try {
    await deps.db
      .insert(userIdentities)
      .values({ userId, provider: identity.provider, subject: identity.subject });
  } catch (error) {
    if (isUniqueViolation(error, 'user_identities_user_provider_key')) {
      throw new AppError('CONFLICT', 409, 'Ya tienes otra cuenta de ese tipo vinculada.');
    }
    if (isUniqueViolation(error, 'user_identities_provider_subject_key')) throw inUse();
    throw error;
  }
  await audit(
    deps.db,
    { ...actor, userId },
    {
      entityType: 'user',
      entityId: userId,
      action: 'customer.identity_linked',
      data: { provider: identity.provider },
    },
  );
}

/** Vincular Google a una cuenta creada con otra red (sin tocar el acceso de administración). */
export async function linkGoogleIdentity(
  deps: ServiceDeps,
  userId: string,
  identity: GoogleIdentity,
  actor: Actor,
): Promise<void> {
  const user = await activeUser(deps, userId);
  if (user.googleSub === identity.sub) return;
  if (user.googleSub)
    throw new AppError('CONFLICT', 409, 'Ya tienes una cuenta de Google vinculada.');
  const [owner] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSub, identity.sub));
  if (owner) throw inUse();
  try {
    await deps.db
      .update(users)
      .set({
        googleSub: identity.sub,
        // El correo verificado de Google pasa a ser el de la cuenta si no había uno.
        email: sql`coalesce(${users.email}, ${identity.emailVerified ? identity.email : null})`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(users.id, userId), isNull(users.googleSub)));
  } catch (error) {
    if (isUniqueViolation(error)) throw inUse();
    throw error;
  }
  await audit(
    deps.db,
    { ...actor, userId },
    {
      entityType: 'user',
      entityId: userId,
      action: 'customer.identity_linked',
      data: { provider: 'google' },
    },
  );
}

/** Redes vinculadas a la cuenta (para "Mi cuenta"). */
export async function listLinkedProviders(
  deps: ServiceDeps,
  user: AuthUser,
): Promise<LinkableProvider[]> {
  const rows = await deps.db
    .select({ provider: userIdentities.provider })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id));
  const linked = new Set<LinkableProvider>(rows.map((r) => r.provider));
  if (user.googleSub) linked.add('google');
  return LINKABLE_PROVIDERS.filter((p) => linked.has(p));
}
