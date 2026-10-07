import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents, users } from '../../src/server/db/schema.js';
import { decrypt } from '../../src/server/lib/crypto.js';
import { totp } from '../../src/server/lib/totp.js';
import { MFA_MAX_FAILURES } from '../../src/server/services/auth.js';
import type { ApiErrorBody } from '../../src/shared/errors.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

let h: Harness;
let ipCounter = 1;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.9.0.${(ipCounter += 1) % 250}`, ...options });

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

async function googleLogin(mode: 'cliente' | 'admin') {
  const start = await inject({ method: 'GET', url: `/auth/google?modo=${mode}` });
  expect(start.statusCode).toBe(302);
  const location = new URL(String(start.headers.location));
  expect(location.origin).toBe('https://accounts.google.com');
  const state = location.searchParams.get('state') ?? '';
  const stateCookie = start.cookies.find((c) => c.name === 'tgs_oauth');
  expect(stateCookie?.httpOnly).toBe(true);
  const callback = await inject({
    method: 'GET',
    url: `/auth/google/callback?code=codigo&state=${state}`,
    cookies: { tgs_oauth: stateCookie?.value ?? '' },
  });
  const session = callback.cookies.find((c) => c.name === 'tgs_session');
  return {
    callback,
    session: session ? { tgs_session: session.value } : undefined,
    state,
    stateCookie,
  };
}

describe('Google OIDC', () => {
  it('login de cliente: state + nonce + PKCE, cookie de sesión HttpOnly y /api/auth/me', async () => {
    h.google.identity = {
      sub: 'g-cliente',
      email: 'cliente@example.com',
      emailVerified: true,
      name: 'Cliente',
    };
    const { callback, session } = await googleLogin('cliente');
    expect(callback.headers.location).toBe('/?acceso=ok');
    expect(h.google.lastNonce).toBeTruthy();
    const cookie = callback.cookies.find((c) => c.name === 'tgs_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const me = await inject({ method: 'GET', url: '/api/auth/me', cookies: session });
    expect(me.json()).toMatchObject({
      authenticated: true,
      user: { email: 'cliente@example.com' },
      admin: null,
    });
  });

  it('rechaza un state que no coincide con la cookie (CSRF de login) y no reutiliza states', async () => {
    const start = await inject({ method: 'GET', url: '/auth/google' });
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const forged = await inject({
      method: 'GET',
      url: `/auth/google/callback?code=c&state=${state}`,
      cookies: { tgs_oauth: 'otro' },
    });
    expect(forged.headers.location).toBe('/?acceso=error&motivo=estado');
    const { state: used, stateCookie } = await googleLogin('cliente');
    const replay = await inject({
      method: 'GET',
      url: `/auth/google/callback?code=c&state=${used}`,
      cookies: { tgs_oauth: stateCookie?.value ?? '' },
    });
    expect(replay.headers.location).toBe('/?acceso=error&motivo=estado');
  });

  it('el acceso de administración exige correo en la allowlist', async () => {
    h.google.identity = {
      sub: 'g-intruso',
      email: 'intruso@example.com',
      emailVerified: true,
      name: 'X',
    };
    const denied = await googleLogin('admin');
    // Mismo mensaje que cualquier fallo de Google: no confirma que exista un panel.
    expect(denied.callback.headers.location).toBe('/?acceso=error&motivo=google');
    expect(denied.session).toBeUndefined();
  });

  it('logout revoca la sesión en el servidor', async () => {
    h.google.identity = {
      sub: 'g-logout',
      email: 'salir@example.com',
      emailVerified: true,
      name: 'S',
    };
    const { session } = await googleLogin('cliente');
    await inject({ method: 'POST', url: '/api/auth/logout', headers: CSRF, cookies: session });
    const me = await inject({ method: 'GET', url: '/api/auth/me', cookies: session });
    expect(me.json()).toEqual({ authenticated: false });
  });
});

describe('MFA de administración (TOTP + códigos de recuperación)', () => {
  it('configura, activa, verifica y consume códigos de recuperación una sola vez', async () => {
    h.google.identity = { sub: 'g-admin', email: ADMIN_EMAIL, emailVerified: true, name: 'Admin' };
    const { callback, session } = await googleLogin('admin');
    expect(callback.headers.location).toBe('/admin.html');
    if (!session) throw new Error('sin sesión');

    const blocked = await inject({ method: 'GET', url: '/api/admin/orders', cookies: session });
    expect(blocked.json<ApiErrorBody>().error.code).toBe('MFA_REQUIRED');

    const setup = await inject({
      method: 'POST',
      url: '/api/admin/mfa/setup',
      headers: CSRF,
      cookies: session,
    });
    const { secret, otpauthUri } = setup.json<{ secret: string; otpauthUri: string }>();
    expect(otpauthUri).toContain('otpauth://totp/');
    const [stored] = await h.database.db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    expect(stored?.mfaSecretEnc).not.toContain(secret); // cifrado en reposo
    expect(decrypt(h.deps.config.secrets.mfaKeys, stored?.mfaSecretEnc ?? '').plaintext).toBe(
      secret,
    );

    // Pedir la clave otra vez (doble clic, recarga) devuelve la MISMA clave pendiente: la que
    // ya se añadió a la app autenticadora sigue sirviendo.
    const again = await inject({
      method: 'POST',
      url: '/api/admin/mfa/setup',
      headers: CSRF,
      cookies: session,
    });
    expect(again.json<{ secret: string }>().secret).toBe(secret);

    const wrong = await inject({
      method: 'POST',
      url: '/api/admin/mfa/enable',
      headers: CSRF,
      cookies: session,
      payload: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(400);
    const enabled = await inject({
      method: 'POST',
      url: '/api/admin/mfa/enable',
      headers: CSRF,
      cookies: session,
      // Tal como lo muestra la app («123 456»).
      payload: { code: totp(secret, h.clock.now.getTime()).replace(/^(\d{3})/, '$1 ') },
    });
    expect(enabled.statusCode).toBe(200);
    const { recoveryCodes } = enabled.json<{ recoveryCodes: string[] }>();
    expect(recoveryCodes).toHaveLength(10);
    // La sesión rota su token al completar MFA (anti fijación de sesión): el token viejo ya no
    // es una sesión de administrador, así que el panel no existe para él (404).
    expect(
      (await inject({ method: 'GET', url: '/api/admin/orders', cookies: session })).statusCode,
    ).toBe(404);
    const rotated = enabled.cookies.find((c) => c.name === 'tgs_session');
    const adminCookie = { tgs_session: rotated?.value ?? '' };
    expect(
      (await inject({ method: 'GET', url: '/api/admin/orders', cookies: adminCookie })).statusCode,
    ).toBe(200);

    // Nuevo login: verificación con código de recuperación, de un solo uso.
    const second = await googleLogin('admin');
    if (!second.session) throw new Error('sin sesión');
    const code = recoveryCodes[0] ?? '';
    const ok = await inject({
      method: 'POST',
      url: '/api/admin/mfa/verify',
      headers: CSRF,
      cookies: second.session,
      payload: { recoveryCode: code },
    });
    expect(ok.statusCode).toBe(200);
    const third = await googleLogin('admin');
    if (!third.session) throw new Error('sin sesión');
    const reused = await inject({
      method: 'POST',
      url: '/api/admin/mfa/verify',
      headers: CSRF,
      cookies: third.session,
      payload: { recoveryCode: code },
    });
    expect(reused.statusCode).toBe(400);
  });

  it('bloquea la verificación de la CUENTA tras 5 códigos erróneos, aunque cambie la IP', async () => {
    const login = await googleLogin('admin');
    if (!login.session) throw new Error('sin sesión');
    const verify = (payload: object) =>
      inject({
        method: 'POST',
        url: '/api/admin/mfa/verify',
        headers: CSRF,
        cookies: login.session,
        payload,
      });
    const [adminUser] = await h.database.db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL));
    // Fallos previos de esta cuenta desde el último acierto (la prueba anterior deja uno).
    const events = await h.database.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, adminUser?.id ?? ''))
      .orderBy(auditEvents.id);
    const lastOk = events.map((e) => e.action).lastIndexOf('admin.mfa_verified');
    const prior = events.slice(lastOk + 1).filter((e) => e.action === 'admin.mfa_failed').length;
    // Cada intento sale de una IP distinta (el rate limiting por IP no lo frenaría).
    for (let i = prior; i < MFA_MAX_FAILURES; i += 1) {
      expect((await verify({ code: '000000' })).statusCode).toBe(400);
    }
    const locked = await verify({ code: '000000' });
    expect(locked.statusCode).toBe(429);
    expect(locked.json<ApiErrorBody>().error.code).toBe('RATE_LIMITED');
    // Ni siquiera el código correcto entra durante el bloqueo.
    const secret = decrypt(h.deps.config.secrets.mfaKeys, adminUser?.mfaSecretEnc ?? '').plaintext;
    expect((await verify({ code: totp(secret, Date.now()) })).statusCode).toBe(429);
    const [event] = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'admin.mfa_locked'));
    expect(event?.data).toMatchObject({ alert: true });
  });
});
