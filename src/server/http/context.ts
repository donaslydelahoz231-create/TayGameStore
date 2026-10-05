import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { hashIp, randomToken, sha256 } from '../lib/crypto.js';
import { AppError } from '../plugins/errors.js';
import { readCookie, setCookie } from '../plugins/security.js';
import type { Actor, ServiceDeps } from '../services/context.js';
import {
  isAllowlistedAdmin,
  resolveSession,
  type AuthSession,
  type AuthUser,
} from '../services/auth.js';

export const SESSION_COOKIE = 'tgs_session';
export const GUEST_COOKIE = 'tgs_guest';
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export interface RequestAuth {
  user: AuthUser | undefined;
  session: AuthSession | undefined;
  guestHash: string | undefined;
  ipHash: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth;
  }
}

/** Resuelve sesión, invitado y hash de IP en cada petición. Nunca a partir del cuerpo. */
export function registerRequestContext(
  app: FastifyInstance,
  config: AppConfig,
  deps: ServiceDeps | undefined,
): void {
  app.decorateRequest('auth', null as unknown as RequestAuth);
  app.addHook('onRequest', async (request) => {
    const guest = readCookie(config, request, GUEST_COOKIE);
    request.auth = {
      user: undefined,
      session: undefined,
      guestHash: guest ? sha256(guest) : undefined,
      ipHash: hashIp(config.secrets.ipHashPepper, request.ip),
    };
    const token = readCookie(config, request, SESSION_COOKIE);
    if (token && deps) {
      const resolved = await resolveSession(deps, token);
      if (resolved) {
        request.auth.user = resolved.user;
        request.auth.session = resolved.session;
      }
    }
  });
}

/** Asegura una cookie de invitado (identifica las órdenes creadas en este navegador). */
export function ensureGuest(
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): string {
  if (request.auth.guestHash) return request.auth.guestHash;
  const token = randomToken();
  setCookie(config, reply, GUEST_COOKIE, token, GUEST_MAX_AGE_SECONDS);
  request.auth.guestHash = sha256(token);
  return request.auth.guestHash;
}

export function actorOf(request: FastifyRequest, type?: Actor['type']): Actor {
  return {
    type: type ?? (request.auth.session?.isAdmin ? 'admin' : 'customer'),
    userId: request.auth.user?.id,
    ipHash: request.auth.ipHash,
    requestId: request.id,
  };
}

export function requireDeps(deps: ServiceDeps | undefined): ServiceDeps {
  if (!deps)
    throw new AppError('SERVICE_UNAVAILABLE', 503, 'Servicio no disponible. Inténtalo más tarde.');
  return deps;
}

/** Sesión de administración (Google + allowlist vigente). `mfa` exige la verificación TOTP. */
export function requireAdmin(
  deps: ServiceDeps,
  request: FastifyRequest,
  options: { mfa: boolean } = { mfa: true },
): AuthUser {
  const { user, session } = request.auth;
  if (!user || !session) throw new AppError('UNAUTHORIZED', 401, 'Debes iniciar sesión.');
  // La allowlist se revisa en cada petición: quitar un correo de ADMIN_EMAILS revoca el acceso.
  if (!session.isAdmin || user.role !== 'admin' || !isAllowlistedAdmin(deps, user.email)) {
    throw new AppError('FORBIDDEN', 403, 'No tienes permiso para esta acción.');
  }
  if (options.mfa && !session.mfaVerified) {
    throw new AppError('MFA_REQUIRED', 403, 'Se requiere verificación en dos pasos.');
  }
  return user;
}
