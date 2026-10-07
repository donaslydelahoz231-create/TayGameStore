import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocklist, userIdentities, users } from '../../src/server/db/schema.js';
import {
  ADMIN_EMAIL,
  createHarness,
  resetDatabase,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

let h: Harness;
let ipCounter = 1;
const inject = (options: InjectOptions) =>
  h.app.inject({ remoteAddress: `10.21.0.${(ipCounter += 1) % 250}`, ...options });

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

let subjectCounter = 900_000_000_000_000_000n;
const nextSubject = () => String((subjectCounter += 1n));

type Provider = 'facebook';

/** Recorre el flujo OAuth completo contra el servidor (el proveedor es un doble de pruebas). */
async function socialFlow(
  provider: Provider,
  identity: { subject: string; email?: string; name?: string },
  options: { session?: Record<string, string>; link?: boolean; callbackProvider?: Provider } = {},
) {
  const start = await inject({
    method: 'GET',
    url: `/auth/${provider}${options.link ? '?vincular=1' : ''}`,
    cookies: options.session ?? {},
  });
  expect(start.statusCode).toBe(302);
  const raw = String(start.headers.location);
  // Redirección propia (error antes de ir al proveedor): ruta relativa de la tienda.
  if (raw.startsWith('/')) return { start, location: raw, session: options.session };
  const location = new URL(raw);
  const state = location.searchParams.get('state');
  const stateCookie = start.cookies.find((c) => c.name === 'tgs_oauth');
  if (!state || !stateCookie) throw new Error('el inicio no fijó state ni cookie');
  expect(stateCookie.httpOnly).toBe(true);
  const callbackProvider = options.callbackProvider ?? provider;
  const code = h[callbackProvider].issueCode({
    subject: identity.subject,
    email: identity.email,
    name: identity.name,
  });
  const callback = await inject({
    method: 'GET',
    url: `/auth/${callbackProvider}/callback?code=${encodeURIComponent(code)}&state=${state}`,
    cookies: { ...(options.session ?? {}), tgs_oauth: stateCookie.value },
  });
  const session = callback.cookies.find((c) => c.name === 'tgs_session');
  return {
    start,
    callback,
    location: String(callback.headers.location),
    session: session ? { tgs_session: session.value } : options.session,
  };
}

async function me(session: Record<string, string> | undefined) {
  return (await inject({ method: 'GET', url: '/api/auth/me', cookies: session ?? {} })).json<{
    authenticated: boolean;
    user?: { name: string; email: string | null };
    linked?: string[];
    admin?: unknown;
  }>();
}

/** Inicio con Google (cliente, o vinculando si se pasa la sesión). */
async function googleFlow(
  identity: { sub: string; email: string; name: string },
  session?: Record<string, string>,
) {
  h.google.identity = { ...identity, emailVerified: true };
  const start = await inject({
    method: 'GET',
    url: session ? '/auth/google?vincular=1' : '/auth/google',
    cookies: session ?? {},
  });
  const state = new URL(String(start.headers.location)).searchParams.get('state');
  const cookie = start.cookies.find((c) => c.name === 'tgs_oauth')?.value ?? '';
  const callback = await inject({
    method: 'GET',
    url: `/auth/google/callback?code=codigo&state=${state}`,
    cookies: { ...(session ?? {}), tgs_oauth: cookie },
  });
  const created = callback.cookies.find((c) => c.name === 'tgs_session');
  return {
    location: String(callback.headers.location),
    session: created ? { tgs_session: created.value } : session,
  };
}

describe('login con Facebook', () => {
  it('crea la cuenta, abre sesión y la reconoce en el siguiente acceso', async () => {
    const subject = nextSubject();
    const first = await socialFlow('facebook', { subject, name: 'Jugador Facebook' });
    expect(first.location).toBe('/?acceso=ok');
    const profile = await me(first.session);
    expect(profile).toMatchObject({ authenticated: true, user: { name: 'Jugador Facebook' } });
    expect(profile.linked).toEqual(['facebook']);

    const second = await socialFlow('facebook', { subject, name: 'Jugador Facebook' });
    expect(second.location).toBe('/?acceso=ok');
    const rows = await h.database.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.subject, subject));
    expect(rows).toHaveLength(1); // misma cuenta, sin duplicados
  });

  it('la URL de autorización lleva state y redirección fijas', async () => {
    const flow = await socialFlow('facebook', { subject: nextSubject(), name: 'Cliente FB' });
    expect(flow.location).toBe('/?acceso=ok');
    const auth = h.facebook.lastAuthorization;
    expect(auth?.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/facebook/callback',
    );
  });

  it('Discord ya no se ofrece: sus rutas no existen', async () => {
    for (const url of ['/auth/discord', '/auth/discord/callback?code=x&state=y']) {
      expect((await inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('rechaza el callback sin la cookie de state, con state de otro proveedor o cancelado', async () => {
    const start = await inject({ method: 'GET', url: '/auth/facebook' });
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const noCookie = await inject({
      method: 'GET',
      url: `/auth/facebook/callback?code=x&state=${state}`,
    });
    expect(noCookie.headers.location).toBe('/?acceso=error&motivo=estado');

    // State emitido para Google presentado en el regreso de Facebook.
    const google = await inject({ method: 'GET', url: '/auth/google' });
    const googleState = new URL(String(google.headers.location)).searchParams.get('state');
    const googleCookie = google.cookies.find((c) => c.name === 'tgs_oauth')?.value ?? '';
    const crossed = await inject({
      method: 'GET',
      url: `/auth/facebook/callback?code=${h.facebook.issueCode({ subject: nextSubject(), email: undefined, name: undefined })}&state=${googleState}`,
      cookies: { tgs_oauth: googleCookie },
    });
    expect(crossed.headers.location).toBe('/?acceso=error&motivo=estado');

    const cancelled = await inject({
      method: 'GET',
      url: '/auth/facebook/callback?error=access_denied',
    });
    expect(cancelled.headers.location).toBe('/?acceso=error&motivo=cancelado');
  });

  it('un código inválido no abre sesión', async () => {
    const start = await inject({ method: 'GET', url: '/auth/facebook' });
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const cookie = start.cookies.find((c) => c.name === 'tgs_oauth')?.value ?? '';
    const res = await inject({
      method: 'GET',
      url: `/auth/facebook/callback?code=inventado&state=${state}`,
      cookies: { tgs_oauth: cookie },
    });
    expect(res.headers.location).toBe('/?acceso=error&motivo=facebook');
    expect(res.cookies.find((c) => c.name === 'tgs_session')).toBeUndefined();
  });

  it('una cuenta bloqueada no entra', async () => {
    const subject = nextSubject();
    await h.database.db
      .insert(blocklist)
      .values({ kind: 'facebook_id', value: subject, reason: 'fraude' });
    const flow = await socialFlow('facebook', { subject });
    expect(flow.location).toBe('/?acceso=error&motivo=bloqueado');
  });
});

describe('vinculación de cuentas', () => {
  it('vincula Google a una cuenta de Facebook y luego entra con cualquiera de las dos', async () => {
    const facebookId = nextSubject();
    const login = await socialFlow('facebook', { subject: facebookId, name: 'Multi' });
    const googleSub = `g-${nextSubject()}`;
    const linked = await googleFlow(
      { sub: googleSub, email: 'vinculo@example.com', name: 'Con Google' },
      login.session,
    );
    expect(linked.location).toBe('/?acceso=vinculado');
    expect((await me(login.session)).linked).toEqual(['google', 'facebook']);

    const viaGoogle = await googleFlow({
      sub: googleSub,
      email: 'vinculo@example.com',
      name: 'Con Google',
    });
    const [row] = await h.database.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(eq(userIdentities.subject, facebookId));
    const [owner] = await h.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleSub, googleSub));
    expect(owner?.id).toBe(row?.userId);
    expect((await me(viaGoogle.session)).linked).toEqual(['google', 'facebook']);
  });

  it('no vincula una identidad que ya es de otra persona', async () => {
    const owned = nextSubject();
    await socialFlow('facebook', { subject: owned });
    const other = await googleFlow({
      sub: `g-${nextSubject()}`,
      email: 'otra@example.com',
      name: 'Otra',
    });
    const steal = await socialFlow(
      'facebook',
      { subject: owned },
      { session: other.session, link: true },
    );
    expect(steal.location).toBe('/?acceso=error&motivo=en_uso');
  });

  it('vincular exige una sesión abierta', async () => {
    const flow = await socialFlow('facebook', { subject: nextSubject() }, { link: true });
    expect(flow.location).toBe('/?acceso=error&motivo=sesion');
  });

  it('NUNCA une cuentas por correo (evita el secuestro de cuentas)', async () => {
    const first = await socialFlow('facebook', {
      subject: nextSubject(),
      email: 'mismo@example.com',
    });
    const second = await socialFlow('facebook', {
      subject: nextSubject(),
      email: 'mismo@example.com',
    });
    const rows = await h.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'mismo@example.com'));
    expect(rows).toHaveLength(2);
    expect(first.session).not.toEqual(second.session);
  });

  it('una red social nunca da acceso de administración, aunque el correo sea del admin', async () => {
    const flow = await socialFlow('facebook', { subject: nextSubject(), email: ADMIN_EMAIL });
    expect((await me(flow.session)).admin).toBeNull();
    const panel = await inject({
      method: 'GET',
      url: '/api/admin/orders',
      cookies: flow.session ?? {},
    });
    // Para quien no es administrador el panel no existe (404).
    expect(panel.statusCode).toBe(404);
  });

  it('/api/config anuncia los accesos configurados (sin Discord)', async () => {
    const config = (await inject({ method: 'GET', url: '/api/config' })).json<{
      auth: Record<string, boolean>;
    }>();
    expect(config.auth).toEqual({ google: true, facebook: true });
  });
});
