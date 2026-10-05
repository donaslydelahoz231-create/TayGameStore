import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { z } from 'zod';
import { actorOf, requireAdmin, requireDeps, SESSION_COOKIE } from '../../http/context.js';
import type { GoogleClient } from '../../integrations/google/oidc.js';
import { OidcError, pkceChallenge } from '../../integrations/google/oidc.js';
import { AppError } from '../../plugins/errors.js';
import { clearCookie, readCookie, RATE_LIMITS, setCookie } from '../../plugins/security.js';
import {
  beginMfaSetup,
  consumeOAuthState,
  createOAuthState,
  createSession,
  enableMfa,
  revokeSession,
  rotateSession,
  upsertGoogleUser,
  verifyMfa,
} from '../../services/auth.js';
import type { ServiceDeps } from '../../services/context.js';

export interface AuthRoutesOptions {
  config: AppConfig;
  deps: ServiceDeps | undefined;
  google: GoogleClient | undefined;
}

const OAUTH_COOKIE = 'tgs_oauth';

/** Destinos de redirección fijos: nunca se redirige a una URL aportada por el usuario. */
const AFTER_LOGIN = { customer: '/?acceso=ok', admin: '/admin.html' } as const;
const loginError = (reason: string) => `/?acceso=error&motivo=${encodeURIComponent(reason)}`;

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const redirectUri = (deps: ServiceDeps) =>
    `${deps.config.publicBaseUrl ?? `http://${deps.config.host}:${deps.config.port}`}/auth/google/callback`;

  app.get('/auth/google', { config: { rateLimit: RATE_LIMITS.auth } }, async (request, reply) => {
    const deps = requireDeps(options.deps);
    if (!options.google)
      throw new AppError('AUTH_NOT_CONFIGURED', 503, 'El acceso con Google no está configurado.');
    const { modo } = z
      .object({ modo: z.enum(['cliente', 'admin']).default('cliente') })
      .parse(request.query);
    const purpose = modo === 'admin' ? 'admin' : 'customer';
    const { state, nonce, codeVerifier } = await createOAuthState(deps, purpose);
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
      const query = z
        .object({
          code: z.string().min(1).max(2048).optional(),
          state: z.string().min(1).max(200).optional(),
          error: z.string().max(100).optional(),
        })
        .parse(request.query);
      const cookieState = readCookie(deps.config, request, OAUTH_COOKIE);
      clearCookie(deps.config, reply, OAUTH_COOKIE);
      if (query.error || !query.code || !query.state)
        return reply.redirect(loginError('cancelado'));
      if (!cookieState || cookieState !== query.state) return reply.redirect(loginError('estado'));
      const stored = await consumeOAuthState(deps, query.state);
      if (!stored) return reply.redirect(loginError('estado'));
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
        return reply.redirect(AFTER_LOGIN[purpose]);
      } catch (error) {
        request.log.warn(
          { err: error instanceof OidcError ? error.reason : error },
          'google login failed',
        );
        const reason =
          error instanceof AppError && error.code === 'FORBIDDEN'
            ? 'sin_permiso'
            : error instanceof AppError && error.code === 'BLOCKED'
              ? 'bloqueado'
              : 'google';
        return reply.redirect(loginError(reason));
      }
    },
  );

  app.get('/api/auth/me', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const { user, session } = request.auth;
    if (!user || !session) return { authenticated: false };
    return {
      authenticated: true,
      user: { name: user.name ?? user.email, email: user.email },
      admin: session.isAdmin
        ? { mfaEnabled: user.mfaEnabled, mfaVerified: session.mfaVerified }
        : null,
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.auth.session && options.deps)
      await revokeSession(options.deps, request.auth.session.id);
    clearCookie(options.config, reply, SESSION_COOKIE);
    return { ok: true };
  });

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
