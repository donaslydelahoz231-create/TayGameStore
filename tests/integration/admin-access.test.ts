import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, passkeys, users } from '../../src/server/db/schema.js';
import {
  ADMIN_EMAIL,
  createHarness,
  CSRF,
  resetDatabase,
  sessionFor,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';
import { SoftAuthenticator } from '../support/webauthn.js';

/**
 * Acceso del dueño sin Google: contraseña propia (creada con la frase ADMIN_SETUP_CODE) +
 * código TOTP, o huella/llave de acceso (WebAuthn). Nada de esto es público.
 */
const ORIGIN = 'http://localhost:3000';
const CODE = 'frase-de-activacion-solo-del-dueno';
const PASSWORD = 'Contraseña-larga-del-dueño-2026';
let h: Harness;
let ip = 0;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness({ ADMIN_SETUP_CODE: CODE });
});
afterAll(async () => {
  await h?.close();
});
beforeEach(() => {
  h.clock.now = new Date();
});

// Cada petición desde una IP distinta: aquí se prueba el bloqueo por cuenta, no el de IP.
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.88.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });
const post = (url: string, payload: unknown, cookies?: Record<string, string>) =>
  inject({ method: 'POST', url, headers: CSRF, payload: payload as object, cookies });
const cookiesOf = (res: LightMyRequestResponse) =>
  Object.fromEntries(res.cookies.filter((c) => c.value).map((c) => [c.name, c.value]));
const sessionCookie = (res: LightMyRequestResponse) => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_session' && c.value);
  return cookie ? { tgs_session: cookie.value } : undefined;
};
const me = async (cookies: Record<string, string> | undefined) =>
  (await inject({ method: 'GET', url: '/api/auth/me', cookies })).json<{
    authenticated: boolean;
    admin: { mfaEnabled: boolean; mfaVerified: boolean } | null;
  }>();
const orders = (cookies: Record<string, string> | undefined) =>
  inject({ method: 'GET', url: '/api/admin/orders', cookies });

async function passkeySetup(auth: SoftAuthenticator, code = CODE) {
  const start = await post('/api/auth/admin/passkey/setup/options', { code });
  if (start.statusCode !== 200) return { start, finish: undefined };
  const creation = start.json<{ options: PublicKeyCredentialCreationOptionsJSON }>().options;
  const finish = await post(
    '/api/auth/admin/passkey/register/verify',
    { response: auth.create(creation) },
    cookiesOf(start),
  );
  return { start, finish, creation };
}

async function passkeyLogin(
  auth: SoftAuthenticator,
  overrides: Parameters<SoftAuthenticator['get']>[1] = {},
) {
  const start = await post('/api/auth/admin/passkey/login/options', {});
  const request = start.json<{ options: PublicKeyCredentialRequestOptionsJSON }>().options;
  const response = auth.get(request, overrides);
  const finish = await post('/api/auth/admin/passkey/login/verify', { response }, cookiesOf(start));
  return { start, finish, response };
}

describe('acceso del administrador', () => {
  it('las llaves de acceso de clientes no existen y la tienda no las anuncia', async () => {
    for (const url of ['/api/auth/passkey/register/options', '/api/auth/passkey/login/options']) {
      expect((await post(url, {})).statusCode, url).toBe(404);
    }
    const config = (await inject({ method: 'GET', url: '/api/config' })).json<{
      auth: Record<string, boolean>;
    }>();
    expect(Object.keys(config.auth).sort()).toEqual(['discord', 'facebook', 'google']);
  });

  it('sin la frase correcta, la activación no existe (404) y no crea nada', async () => {
    for (const code of ['', 'otra-frase-cualquiera-de-veinte', CODE.toUpperCase()]) {
      expect(
        (await post('/api/auth/admin/password/setup', { code, password: PASSWORD })).statusCode,
      ).toBe(code ? 404 : 400);
      expect((await post('/api/auth/admin/passkey/setup/options', { code })).statusCode).toBe(
        code ? 404 : 400,
      );
    }
    expect(await h.database.db.select().from(passkeys)).toEqual([]);
  });

  it('contraseña: el dueño la crea una vez; luego entra y el panel exige el código TOTP', async () => {
    const weak = await post('/api/auth/admin/password/setup', { code: CODE, password: 'corta' });
    expect(weak.statusCode).toBe(400);
    const setup = await post('/api/auth/admin/password/setup', { code: CODE, password: PASSWORD });
    expect(setup.statusCode, setup.body).toBe(200);
    const [owner] = await h.database.db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    expect(owner?.role).toBe('admin');
    // Nunca en claro: scrypt con sal.
    expect(owner?.passwordHash).toMatch(/^scrypt\$65536\$8\$2\$/);
    expect(owner?.passwordHash).not.toContain(PASSWORD);
    // La frase ya no sirve para cambiar la contraseña.
    expect(
      (
        await post('/api/auth/admin/password/setup', {
          code: CODE,
          password: 'Otra-contraseña-larga-123',
        })
      ).statusCode,
    ).toBe(404);

    const login = await post('/api/auth/admin/password/login', {
      email: ` ${ADMIN_EMAIL.toUpperCase()} `,
      password: PASSWORD,
    });
    expect(login.statusCode, login.body).toBe(200);
    const cookie = sessionCookie(login);
    expect((await me(cookie)).admin).toEqual({ mfaEnabled: false, mfaVerified: false });
    // Solo con la contraseña no se ve ningún dato del panel.
    expect((await orders(cookie)).statusCode).toBe(403);
  });

  it('contraseña equivocada o correo ajeno: mismo mensaje; 5 fallos bloquean la cuenta', async () => {
    const wrong = await post('/api/auth/admin/password/login', {
      email: ADMIN_EMAIL,
      password: 'no-es-la-contraseña',
    });
    const stranger = await post('/api/auth/admin/password/login', {
      email: 'otro@example.com',
      password: PASSWORD,
    });
    expect(wrong.statusCode).toBe(401);
    expect(stranger.statusCode).toBe(401);
    expect(wrong.json<{ error: { message: string } }>().error.message).toBe(
      stranger.json<{ error: { message: string } }>().error.message,
    );
    for (let i = 0; i < 4; i += 1) {
      await post('/api/auth/admin/password/login', { email: ADMIN_EMAIL, password: `mala-${i}` });
    }
    // Bloqueada aunque ahora use la contraseña correcta (y desde otra IP).
    const locked = await post('/api/auth/admin/password/login', {
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    expect(locked.statusCode).toBe(429);
    const [alert] = await h.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'admin.password_locked'));
    expect(alert).toBeDefined();
    expect(JSON.stringify(await h.database.db.select().from(auditEvents))).not.toContain(PASSWORD);
  });

  it('huella: la frase activa la PRIMERA llave; entrar con ella abre el panel (dos pasos)', async () => {
    const phone = new SoftAuthenticator(ORIGIN, 'localhost');
    const { finish, creation } = await passkeySetup(phone);
    expect(finish?.statusCode, finish?.body).toBe(200);
    expect(creation?.authenticatorSelection?.userVerification).toBe('required');
    expect((await me(sessionCookie(finish!))).admin?.mfaVerified).toBe(true);
    expect((await orders(sessionCookie(finish!))).statusCode).toBe(200);
    // Con una llave registrada, la frase ya no sirve.
    expect((await passkeySetup(new SoftAuthenticator(ORIGIN, 'localhost'))).start.statusCode).toBe(
      404,
    );

    const login = await passkeyLogin(phone);
    expect(login.finish.statusCode, login.finish.body).toBe(200);
    expect(login.finish.json<{ panel: string }>().panel).toBe(h.deps.config.adminPath);
    expect((await orders(sessionCookie(login.finish))).statusCode).toBe(200);

    // Repetición, firma alterada, otro dominio y llave clonada: rechazadas.
    const replay = await post(
      '/api/auth/admin/passkey/login/verify',
      { response: login.response },
      cookiesOf(login.start),
    );
    expect(replay.statusCode).toBe(400);
    expect((await passkeyLogin(phone, { tamper: true })).finish.statusCode).toBe(400);
    const wrongRp = new SoftAuthenticator(ORIGIN, 'otro-dominio.example');
    for (const [id, key] of phone.keys) wrongRp.keys.set(id, { ...key });
    expect((await passkeyLogin(wrongRp)).finish.statusCode).toBe(400);
    expect((await passkeyLogin(phone, { counter: 50 })).finish.statusCode).toBe(200);
    expect((await passkeyLogin(phone, { counter: 10 })).finish.statusCode).toBe(400);

    // Con la sesión de huella: cambiar la contraseña y añadir la llave de otro equipo.
    const cookie = sessionCookie(login.finish);
    const change = await post(
      '/api/admin/password',
      { current: PASSWORD, password: 'Nueva-contraseña-del-dueño-2026' },
      cookie,
    );
    expect(change.statusCode, change.body).toBe(200);
    expect(
      (
        await post(
          '/api/admin/password',
          { current: 'mala', password: 'Otra-contraseña-123456' },
          cookie,
        )
      ).statusCode,
    ).toBe(400);
    const laptop = new SoftAuthenticator(ORIGIN, 'localhost');
    const add = await post('/api/auth/admin/passkey/add/options', {}, cookie);
    expect(add.statusCode).toBe(200);
    const addOptions = add.json<{ options: PublicKeyCredentialCreationOptionsJSON }>().options;
    const added = await post(
      '/api/auth/admin/passkey/register/verify',
      { response: laptop.create(addOptions) },
      { ...cookie, ...cookiesOf(add) },
    );
    expect(added.json()).toEqual({ ok: true, added: true });
    expect((await passkeyLogin(laptop)).finish.statusCode).toBe(200);
  });

  it('entrar con Google (mismo correo verificado) vincula la MISMA cuenta del dueño', async () => {
    const [before] = await h.database.db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    expect(before?.googleSub).toBeNull();
    h.google.identity = {
      sub: 'g-dueno',
      email: ADMIN_EMAIL.toUpperCase(),
      emailVerified: true,
      name: 'Dueño',
    };
    const start = await inject({ method: 'GET', url: '/auth/google?modo=admin' });
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const stateCookie = start.cookies.find((c) => c.name === 'tgs_oauth');
    const callback = await inject({
      method: 'GET',
      url: `/auth/google/callback?code=codigo&state=${state}`,
      cookies: { tgs_oauth: stateCookie?.value ?? '' },
    });
    expect(sessionCookie(callback)).toBeDefined();
    const accounts = await h.database.db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    // Una sola cuenta: la de la contraseña y la huella, ahora también con Google.
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: before?.id, googleSub: 'g-dueno', role: 'admin' });
    expect(accounts[0]?.passwordHash).toBe(before?.passwordHash);
  });

  it('un cliente con sesión no puede añadir llaves ni ver el panel', async () => {
    const customer = (await sessionFor(h, { email: 'cliente@example.com', sub: 'cli-adm' })).cookie;
    expect((await post('/api/auth/admin/passkey/add/options', {}, customer)).statusCode).toBe(404);
    expect((await orders(customer)).statusCode).toBe(404);
  });
});
