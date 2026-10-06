import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { z } from 'zod';
import { actorOf, requireAdmin, requireDeps, SESSION_COOKIE } from '../../http/context.js';
import type { SocialProvider } from '../../db/schema.js';
import type { GoogleClient } from '../../integrations/google/oidc.js';
import { OidcError, pkceChallenge } from '../../integrations/google/oidc.js';
import { SocialAuthError, type SocialClient } from '../../integrations/social/providers.js';
import { AppError } from '../../plugins/errors.js';
import { clearCookie, readCookie, RATE_LIMITS, setCookie } from '../../plugins/security.js';
import {
  beginMfaSetup,
  consumeOAuthState,
  createOAuthState,
  createSession,
  enableMfa,
  isAllowlistedAdmin,
  revokeSession,
  rotateSession,
  upsertGoogleUser,
  verifyMfa,
} from '../../services/auth.js';
import { audit, type ServiceDeps } from '../../services/context.js';
import {
  linkGoogleIdentity,
  linkSocialIdentity,
  listLinkedProviders,
  loginWithSocial,
} from '../../services/social.js';

export interface AuthRoutesOptions {
  config: AppConfig;
  deps: ServiceDeps | undefined;
  google: GoogleClient | undefined;
  social?: Partial<Record<SocialProvider, SocialClient>> | undefined;
}

const OAUTH_COOKIE = 'tgs_oauth';

/**
 * Destinos de redirección fijos: nunca se redirige a una URL aportada por el usuario. El del
 * panel es su ruta secreta (config.adminPath).
 */
const AFTER_LOGIN = {
  customer: '/?acceso=ok',
  link: '/?acceso=vinculado',
} as const;
const loginError = (reason: string) => `/?acceso=error&motivo=${encodeURIComponent(reason)}`;

const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(200).optional(),
  error: z.string().max(100).optional(),
});

/** Motivo (fijo, sin datos) que la tienda traduce a un mensaje. */
function failureReason(error: unknown, fallback: string): string {
  if (error instanceof AppError) {
    if (error.code === 'FORBIDDEN') return 'sin_permiso';
    if (error.code === 'BLOCKED') return 'bloqueado';
    if (error.code === 'CONFLICT') return 'en_uso';
  }
  return fallback;
}

/** Vincular exige una sesión de cliente abierta (nunca la de administración). */
function linkingUser(request: FastifyRequest): string | undefined {
  const { user, session } = request.auth;
  return user && session && !session.isAdmin ? user.id : undefined;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const redirectUri = (deps: ServiceDeps) =>
    `${deps.config.publicBaseUrl ?? `http://${deps.config.host}:${deps.config.port}`}/auth/google/callback`;

  app.get('/auth/google', { config: { rateLimit: RATE_LIMITS.auth } }, async (request, reply) => {
    const deps = requireDeps(options.deps);
    if (!options.google)
      throw new AppError('AUTH_NOT_CONFIGURED', 503, 'El acceso con Google no está configurado.');
    const { modo, vincular } = z
      .object({
        modo: z.enum(['cliente', 'admin']).default('cliente'),
        vincular: z.literal('1').optional(),
      })
      .parse(request.query);
    const linkUserId = vincular ? linkingUser(request) : undefined;
    if (vincular && !linkUserId) return reply.redirect(loginError('sesion'));
    const purpose = linkUserId ? 'link' : modo === 'admin' ? 'admin' : 'customer';
    const { state, nonce, codeVerifier } = await createOAuthState(deps, purpose, {
      provider: 'google',
      linkUserId,
    });
    // El state viaja también en una cookie HttpOnly: liga el callback a este navegador.
    setCookie(deps.config, reply, OAUTH_COOKIE, state, 600);
    return reply.redirect(
      options.google.authorizationUrl({
        state,
        nonce,
        codeChallenge: pkceChallenge(codeVerifier),
        redirectUri: redirectUri(deps),
      }),
    );
  });

  app.get(
    '/auth/google/callback',
    { config: { rateLimit: RATE_LIMITS.auth } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const google = options.google;
      if (!google) return reply.redirect(loginError('no_configurado'));
      const query = callbackQuery.parse(request.query);
      const cookieState = readCookie(deps.config, request, OAUTH_COOKIE);
      clearCookie(deps.config, reply, OAUTH_COOKIE);
      if (query.error || !query.code || !query.state)
        return reply.redirect(loginError('cancelado'));
      if (!cookieState || cookieState !== query.state) return reply.redirect(loginError('estado'));
      const stored = await consumeOAuthState(deps, query.state);
      if (!stored || stored.provider !== 'google') return reply.redirect(loginError('estado'));
      if (stored.purpose === 'link') {
        if (!stored.linkUserId || linkingUser(request) !== stored.linkUserId)
          return reply.redirect(loginError('sesion'));
        try {
          const identity = await google.exchangeCode({
            code: query.code,
            codeVerifier: stored.codeVerifier,
            redirectUri: redirectUri(deps),
            nonce: stored.nonce,
          });
          await linkGoogleIdentity(deps, stored.linkUserId, identity, actorOf(request, 'customer'));
          return reply.redirect(AFTER_LOGIN.link);
        } catch (error) {
          request.log.warn(
            { err: error instanceof OidcError ? error.reason : error },
            'google link failed',
          );
          return reply.redirect(loginError(failureReason(error, 'google')));
        }
      }
      const purpose = stored.purpose === 'admin' ? 'admin' : 'customer';
      try {
        const identity = await google.exchangeCode({
          code: query.code,
          codeVerifier: stored.codeVerifier,
          redirectUri: redirectUri(deps),
          nonce: stored.nonce,
        });
        const user = await upsertGoogleUser(
          deps,
          identity,
          purpose,
          actorOf(request, purpose === 'admin' ? 'admin' : 'customer'),
        );
        if (request.auth.session) await revokeSession(deps, request.auth.session.id);
        const session = await createSession(deps, user.id, {
          isAdmin: purpose === 'admin',
          ipHash: request.auth.ipHash,
          userAgent: request.headers['user-agent'],
        });
        setCookie(deps.config, reply, SESSION_COOKIE, session.token, session.maxAgeSeconds);
        return reply.redirect(purpose === 'admin' ? deps.config.adminPath : AFTER_LOGIN.customer);
      } catch (error) {
        request.log.warn(
          { err: error instanceof OidcError ? error.reason : error },
          'google login failed',
        );
        // Un intento de entrar al panel con una cuenta sin permiso recibe el mismo mensaje que
        // cualquier fallo de Google: no confirma que exista un panel (queda en la auditoría).
        return reply.redirect(
          loginError(purpose === 'admin' ? 'google' : failureReason(error, 'google')),
        );
      }
    },
  );

  // ── Discord y Facebook (solo clientes) ──
  for (const provider of ['discord', 'facebook'] as const) {
    const callbackUrl = (deps: ServiceDeps) =>
      `${deps.config.publicBaseUrl ?? `http://${deps.config.host}:${deps.config.port}`}/auth/${provider}/callback`;

    app.get(
      `/auth/${provider}`,
      { config: { rateLimit: RATE_LIMITS.auth } },
      async (request, reply) => {
        const deps = requireDeps(options.deps);
        const client = options.social?.[provider];
        if (!client)
          throw new AppError('AUTH_NOT_CONFIGURED', 503, 'Este acceso no está configurado.');
        const { vincular } = z.object({ vincular: z.literal('1').optional() }).parse(request.query);
        const linkUserId = vincular ? linkingUser(request) : undefined;
        if (vincular && !linkUserId) return reply.redirect(loginError('sesion'));
        const { state, codeVerifier } = await createOAuthState(
          deps,
          linkUserId ? 'link' : 'customer',
          {
            provider,
            linkUserId,
          },
        );
        setCookie(deps.config, reply, OAUTH_COOKIE, state, 600);
        return reply.redirect(
          client.authorizationUrl({
            state,
            codeChallenge: pkceChallenge(codeVerifier),
            redirectUri: callbackUrl(deps),
          }),
        );
      },
    );

    app.get(
      `/auth/${provider}/callback`,
      { config: { rateLimit: RATE_LIMITS.auth } },
      async (request, reply) => {
        const deps = requireDeps(options.deps);
        const client = options.social?.[provider];
        if (!client) return reply.redirect(loginError('no_configurado'));
        const query = callbackQuery.parse(request.query);
        const cookieState = readCookie(deps.config, request, OAUTH_COOKIE);
        clearCookie(deps.config, reply, OAUTH_COOKIE);
        if (query.error || !query.code || !query.state)
          return reply.redirect(loginError('cancelado'));
        if (!cookieState || cookieState !== query.state)
          return reply.redirect(loginError('estado'));
        const stored = await consumeOAuthState(deps, query.state);
        // El state solo vale para el proveedor que lo emitió.
        if (!stored || stored.provider !== provider) return reply.redirect(loginError('estado'));
        try {
          const identity = await client.exchangeCode({
            code: query.code,
            codeVerifier: stored.codeVerifier,
            redirectUri: callbackUrl(deps),
          });
          const actor = actorOf(request, 'customer');
          if (stored.purpose === 'link') {
            if (!stored.linkUserId || linkingUser(request) !== stored.linkUserId)
              return reply.redirect(loginError('sesion'));
            await linkSocialIdentity(deps, stored.linkUserId, identity, actor);
            return reply.redirect(AFTER_LOGIN.link);
          }
          const user = await loginWithSocial(deps, identity, actor);
          if (request.auth.session) await revokeSession(deps, request.auth.session.id);
          const session = await createSession(deps, user.id, {
            isAdmin: false,
            ipHash: request.auth.ipHash,
            userAgent: request.headers['user-agent'],
          });
          setCookie(deps.config, reply, SESSION_COOKIE, session.token, session.maxAgeSeconds);
          return reply.redirect(AFTER_LOGIN.customer);
        } catch (error) {
          request.log.warn(
            { err: error instanceof SocialAuthError ? error.reason : error, provider },
            'social login failed',
          );
          return reply.redirect(loginError(failureReason(error, provider)));
        }
      },
    );
  }

  app.get('/api/auth/me', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const { user, session } = request.auth;
    if (!user || !session) return { authenticated: false };
    return {
      authenticated: true,
      user: { name: user.name ?? user.email ?? 'Cliente', email: user.email },
      linked: options.deps ? await listLinkedProviders(options.deps, user) : [],
      admin: session.isAdmin
        ? { mfaEnabled: user.mfaEnabled, mfaVerified: session.mfaVerified }
        : null,
      // Solo para el dueño (rol admin y en ADMIN_EMAILS), también con sesión de cliente: dónde
      // está su panel. Entrar sigue exigiendo Google + allowlist + TOTP.
      adminEntry:
        options.deps && user.role === 'admin' && isAllowlistedAdmin(options.deps, user.email)
          ? options.deps.config.adminPath
          : null,
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.auth.session && options.deps)
      await revokeSession(options.deps, request.auth.session.id);
    clearCookie(options.config, reply, SESSION_COOKIE);
    return { ok: true };
  });

  /**
   * "Ver tienda como cliente": el administrador baja su propia sesión a cliente (misma cuenta,
   * sin permisos de panel). Volver al panel exige de nuevo Google + allowlist + TOTP: cambiar de
   * rol nunca sube privilegios sin autenticarse.
   */
  app.post(
    '/api/admin/sesion/cliente',
    { config: { rateLimit: RATE_LIMITS.admin } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const user = requireAdmin(deps, request);
      const current = request.auth.session;
      if (!current) throw new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');
      await revokeSession(deps, current.id);
      const session = await createSession(deps, user.id, {
        isAdmin: false,
        ipHash: request.auth.ipHash,
        userAgent: request.headers['user-agent'],
      });
      await audit(deps.db, actorOf(request, 'admin'), {
        entityType: 'user',
        entityId: user.id,
        action: 'admin.switch_to_customer',
      });
      setCookie(deps.config, reply, SESSION_COOKIE, session.token, session.maxAgeSeconds);
      reply.header('cache-control', 'no-store');
      return { redirect: '/' };
    },
  );

  // ── MFA de administración ──
  app.post(
    '/api/admin/mfa/setup',
    { config: { rateLimit: RATE_LIMITS.mfa } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const user = requireAdmin(deps, request, { mfa: false });
      reply.header('cache-control', 'no-store');
      return beginMfaSetup(deps, user);
    },
  );

  app.post(
    '/api/admin/mfa/enable',
    { config: { rateLimit: RATE_LIMITS.mfa } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const user = requireAdmin(deps, request, { mfa: false });
      const { code } = z.strictObject({ code: z.string().regex(/^\d{6}$/) }).parse(request.body);
      const recoveryCodes = await enableMfa(deps, user, code, actorOf(request, 'admin'));
      const session = request.auth.session;
      if (!session) throw new AppError('UNAUTHORIZED', 401, 'Debes iniciar sesión.');
      const token = await rotateSession(deps, session.id, { mfaVerifiedAt: deps.now() });
      setCookie(
        deps.config,
        reply,
        SESSION_COOKIE,
        token,
        deps.config.sessions.adminTtlMinutes * 60,
      );
      reply.header('cache-control', 'no-store');
      return { recoveryCodes };
    },
  );

  app.post(
    '/api/admin/mfa/verify',
    { config: { rateLimit: RATE_LIMITS.mfa } },
    async (request, reply) => {
      const deps = requireDeps(options.deps);
      const user = requireAdmin(deps, request, { mfa: false });
      const input = z
        .strictObject({
          code: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
          recoveryCode: z.string().min(10).max(20).optional(),
        })
        .refine(
          (v) => Boolean(v.code) !== Boolean(v.recoveryCode),
          'Envía un código o un código de recuperación.',
        )
        .parse(request.body);
      await verifyMfa(deps, user, input, actorOf(request, 'admin'));
      const session = request.auth.session;
      if (!session) throw new AppError('UNAUTHORIZED', 401, 'Debes iniciar sesión.');
      const token = await rotateSession(deps, session.id, { mfaVerifiedAt: deps.now() });
      setCookie(
        deps.config,
        reply,
        SESSION_COOKIE,
        token,
        deps.config.sessions.adminTtlMinutes * 60,
      );
      return { ok: true };
    },
  );
};
