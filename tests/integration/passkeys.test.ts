import { eq } from 'drizzle-orm';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, passkeys, users, webauthnChallenges } from '../../src/server/db/schema.js';
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
 * Llaves de acceso (passkeys): crear la cuenta y entrar con huella, rostro o PIN, sin
 * credenciales de terceros. El harness publica la tienda en http://localhost:3000.
 */
const ORIGIN = 'http://localhost:3000';
let h: Harness;
let ip = 0;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});
beforeEach(() => {
  h.clock.now = new Date();
});

// Cada caso desde una IP distinta: el límite por IP de /auth no es lo que se prueba aquí.
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.77.${Math.floor(++ip / 200)}.${(ip % 200) + 1}`, ...options });

const cookiesOf = (res: LightMyRequestResponse) =>
  Object.fromEntries(res.cookies.filter((c) => c.value).map((c) => [c.name, c.value]));

const sessionCookie = (res: LightMyRequestResponse) => {
  const cookie = res.cookies.find((c) => c.name === 'tgs_session' && c.value);
  return cookie ? { tgs_session: cookie.value } : undefined;
};

async function register(
  auth: SoftAuthenticator,
  options: { name?: string; cookies?: Record<string, string>; origin?: string } = {},
) {
  const start = await inject({
    method: 'POST',
    url: '/api/auth/passkey/register/options',
    headers: CSRF,
    cookies: options.cookies,
    payload: options.name ? { name: options.name } : {},
  });
  expect(start.statusCode, start.body).toBe(200);
  const creation = start.json<{ options: PublicKeyCredentialCreationOptionsJSON }>().options;
  const response = auth.create(creation, { origin: options.origin });
  const finish = await inject({
    method: 'POST',
    url: '/api/auth/passkey/register/verify',
    headers: CSRF,
    cookies: { ...options.cookies, ...cookiesOf(start) },
    payload: { response },
  });
  return { start, finish, creation, response };
}

async function login(
  auth: SoftAuthenticator,
  overrides: Parameters<SoftAuthenticator['get']>[1] = {},
) {
  const start = await inject({
    method: 'POST',
    url: '/api/auth/passkey/login/options',
    headers: CSRF,
    payload: {},
  });
  expect(start.statusCode, start.body).toBe(200);
  const request = start.json<{ options: PublicKeyCredentialRequestOptionsJSON }>().options;
  const response = auth.get(request, overrides);
  const finish = await inject({
    method: 'POST',
    url: '/api/auth/passkey/login/verify',
    headers: CSRF,
    cookies: cookiesOf(start),
    payload: { response },
  });
  return { start, finish, request, response };
}

const me = async (cookies: Record<string, string> | undefined) =>
  (await inject({ method: 'GET', url: '/api/auth/me', cookies })).json<{
    authenticated: boolean;
    user?: { name: string };
    admin: unknown;
  }>();

describe('llaves de acceso (passkeys)', () => {
  it('la tienda las anuncia: no dependen de Google, Facebook ni Discord', async () => {
    const config = (await inject({ method: 'GET', url: '/api/config' })).json<{
      auth: { passkey: boolean };
    }>();
    expect(config.auth.passkey).toBe(true);
  });

  it('crear la cuenta con una llave abre la sesión; luego se entra con la misma llave', async () => {
    const auth = new SoftAuthenticator(ORIGIN, 'localhost');
    const { finish, creation } = await register(auth, { name: 'Ana Gamer' });
    expect(finish.statusCode, finish.body).toBe(200);
    expect(finish.json()).toEqual({ ok: true, added: false });
    expect(creation.rp).toEqual({ name: 'TayGameStore', id: 'localhost' });
    const cookie = sessionCookie(finish);
    expect(await me(cookie)).toMatchObject({
      authenticated: true,
      user: { name: 'Ana Gamer' },
      admin: null,
    });
    // Solo la clave pública queda guardada; la cuenta no tiene correo ni contraseña.
    const [saved] = await h.database.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, [...auth.keys.keys()][0] ?? ''));
    expect(saved?.publicKey.length).toBeGreaterThan(40);
    const [account] = await h.database.db
      .select()
      .from(users)
      .where(eq(users.id, saved?.userId ?? ''));
    expect(account).toMatchObject({ email: null, role: 'customer', googleSub: null });

    const second = await login(auth);
    expect(second.finish.statusCode, second.finish.body).toBe(200);
    expect(await me(sessionCookie(second.finish))).toMatchObject({
      authenticated: true,
      user: { name: 'Ana Gamer' },
    });
    const [after] = await h.database.db
      .select({ counter: passkeys.counter, lastUsedAt: passkeys.lastUsedAt })
      .from(passkeys)
      .where(eq(passkeys.id, saved?.id ?? ''));
    expect(after?.counter).toBe(1);
    const actions = (
      await h.database.db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, saved?.userId ?? ''))
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['customer.passkey_signup', 'customer.passkey_login']),
    );
  });

  it('un reto se usa una sola vez y caduca a los 5 minutos', async () => {
    const auth = new SoftAuthenticator(ORIGIN, 'localhost');
    await register(auth);
    const first = await login(auth);
    expect(first.finish.statusCode).toBe(200);
    // Reenviar la misma respuesta firmada (repetición): rechazado.
    const replay = await inject({
      method: 'POST',
      url: '/api/auth/passkey/login/verify',
      headers: CSRF,
      cookies: cookiesOf(first.start),
      payload: { response: first.response },
    });
    expect(replay.statusCode).toBe(400);
    expect(sessionCookie(replay)).toBeUndefined();

    const start = await inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      headers: CSRF,
      payload: {},
    });
    h.clock.now = new Date(Date.now() + 6 * 60_000);
    const late = await inject({
      method: 'POST',
      url: '/api/auth/passkey/login/verify',
      headers: CSRF,
      cookies: cookiesOf(start),
      payload: {
        response: auth.get(
          start.json<{ options: PublicKeyCredentialRequestOptionsJSON }>().options,
        ),
      },
    });
    expect(late.statusCode).toBe(400);
  });

  it('rechaza otro origen, firmas alteradas, llaves desconocidas y contadores que retroceden', async () => {
    const before = (await h.database.db.select({ id: users.id }).from(users)).length;
    const phishing = await register(new SoftAuthenticator(ORIGIN, 'localhost'), {
      origin: 'https://taygamestore-falsa.example',
    });
    expect(phishing.finish.statusCode).toBe(400);
    expect((await h.database.db.select({ id: users.id }).from(users)).length).toBe(before);

    const auth = new SoftAuthenticator(ORIGIN, 'localhost');
    await register(auth);
    expect((await login(auth, { tamper: true })).finish.statusCode).toBe(400);
    // La misma llave firmando para otro dominio (otra página que se haga pasar por la tienda).
    const wrongRp = new SoftAuthenticator(ORIGIN, 'otro-dominio.example');
    for (const [id, key] of auth.keys) wrongRp.keys.set(id, { ...key });
    expect((await login(wrongRp)).finish.statusCode).toBe(400);
    expect((await login(auth, { counter: 5 })).finish.statusCode).toBe(200);
    // Una llave clonada firmaría con un contador menor o igual al último visto.
    expect((await login(auth, { counter: 3 })).finish.statusCode).toBe(400);

    const stranger = new SoftAuthenticator(ORIGIN, 'localhost');
    stranger.create({
      challenge: 'x',
      rp: { name: 'x', id: 'localhost' },
      user: { id: 'eA', name: 'x', displayName: 'x' },
      pubKeyCredParams: [],
    });
    expect((await login(stranger)).finish.statusCode).toBe(400);
  });

  it('con sesión abierta se añade otra llave a la misma cuenta', async () => {
    const phone = new SoftAuthenticator(ORIGIN, 'localhost');
    const first = await register(phone, { name: 'Luis' });
    const cookie = sessionCookie(first.finish);
    const laptop = new SoftAuthenticator(ORIGIN, 'localhost');
    const added = await register(laptop, { cookies: cookie });
    expect(added.finish.json()).toEqual({ ok: true, added: true });
    // La llave ya registrada en esta cuenta se excluye para no duplicarla.
    expect(added.creation.excludeCredentials?.map((c) => c.id)).toEqual([...phone.keys.keys()]);
    const fromLaptop = await login(laptop);
    expect(await me(sessionCookie(fromLaptop.finish))).toMatchObject({ user: { name: 'Luis' } });
  });

  it('una llave nunca da acceso de administración y el nombre no admite caracteres ocultos', async () => {
    const admin = await sessionFor(h, {
      email: ADMIN_EMAIL,
      admin: true,
      mfa: true,
      sub: 'pk-adm',
    });
    const blocked = await inject({
      method: 'POST',
      url: '/api/auth/passkey/register/options',
      headers: CSRF,
      cookies: admin.cookie,
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);
    for (const name of ['Ana\nVisita evil.example', 'Ana‮gpj.exe']) {
      const res = await inject({
        method: 'POST',
        url: '/api/auth/passkey/register/options',
        headers: CSRF,
        payload: { name },
      });
      expect(res.statusCode, JSON.stringify(name)).toBe(400);
    }
    // Sin la cabecera CSRF no se crea ningún reto.
    const before = (await h.database.db.select().from(webauthnChallenges)).length;
    const noCsrf = await inject({
      method: 'POST',
      url: '/api/auth/passkey/login/options',
      payload: {},
    });
    expect(noCsrf.statusCode).toBe(403);
    expect((await h.database.db.select().from(webauthnChallenges)).length).toBe(before);
  });
});
