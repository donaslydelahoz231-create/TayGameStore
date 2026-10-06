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

type Provider = 'discord' | 'facebook';

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

describe('login con Discord y Facebook', () => {
  it('Discord: crea la cuenta, abre sesión y la reconoce en el siguiente acceso', async () => {
    const subject = nextSubject();
    const first = await socialFlow('discord', { subject, name: 'Jugador Discord' });
    expect(first.location).toBe('/?acceso=ok');
    const profile = await me(first.session);
    expect(profile).toMatchObject({ authenticated: true, user: { name: 'Jugador Discord' } });
    expect(profile.linked).toEqual(['discord']);

    const second = await socialFlow('discord', { subject, name: 'Jugador Discord' });
    expect(second.location).toBe('/?acceso=ok');
    const rows = await h.database.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.subject, subject));
    expect(rows).toHaveLength(1); // misma cuenta, sin duplicados
  });

  it('Facebook: entra y la URL de autorización lleva state y redirección fijas', async () => {
    const flow = await socialFlow('facebook', { subject: nextSubject(), name: 'Cliente FB' });
    expect(flow.location).toBe('/?acceso=ok');
    const auth = h.facebook.lastAuthorization;
    expect(auth?.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/facebook/callback',
    );
    expect((await me(flow.session)).linked).toEqual(['facebook']);
  });

  it('rechaza el callback sin la cookie de state, con state de otro proveedor o cancelado', async () => {
    const start = await inject({ method: 'GET', url: '/auth/discord' });
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const noCookie = await inject({
      method: 'GET',
      url: `/auth/discord/callback?code=x&state=${state}`,
    });
    expect(noCookie.headers.location).toBe('/?acceso=error&motivo=estado');

    const crossed = await socialFlow(
      'discord',
      { subject: nextSubject() },
      { callbackProvider: 'facebook' },
    );
    expect(crossed.location).toBe('/?acceso=error&motivo=estado');

    const cancelled = await inject({
      method: 'GET',
      url: '/auth/facebook/callback?error=access_denied',
    });
    expect(cancelled.headers.location).toBe('/?acceso=error&motivo=cancelado');
  });

  it('un código inválido no abre sesión', async () => {
    const start = await inject({ method: 'GET', url: '/auth/discord' });
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const cookie = start.cookies.find((c) => c.name === 'tgs_oauth')?.value ?? '';
    const res = await inject({
      method: 'GET',
      url: `/auth/discord/callback?code=inventado&state=${state}`,
      cookies: { tgs_oauth: cookie },
    });
    expect(res.headers.location).toBe('/?acceso=error&motivo=discord');
    expect(res.cookies.find((c) => c.name === 'tgs_session')).toBeUndefined();
  });

  it('una cuenta bloqueada no entra', async () => {
    const subject = nextSubject();
    await h.database.db
      .insert(blocklist)
      .values({ kind: 'discord_id', value: subject, reason: 'fraude' });
    const flow = await socialFlow('discord', { subject });
    expect(flow.location).toBe('/?acceso=error&motivo=bloqueado');
  });
});

describe('vinculación de cuentas', () => {
  it('vincula Facebook a una cuenta de Discord y luego entra con cualquiera de las dos', async () => {
    const discordId = nextSubject();
    const facebookId = nextSubject();
    const login = await socialFlow('discord', { subject: discordId, name: 'Multi' });
    const linked = await socialFlow(
      'facebook',
      { subject: facebookId },
      { session: login.session, link: true },
    );
    expect(linked.location).toBe('/?acceso=vinculado');
    expect((await me(login.session)).linked).toEqual(['discord', 'facebook']);

    const viaFacebook = await socialFlow('facebook', { subject: facebookId });
    const [a] = await h.database.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(eq(userIdentities.subject, discordId));
    const [b] = await h.database.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(eq(userIdentities.subject, facebookId));
    expect(a?.userId).toBe(b?.userId);
    expect((await me(viaFacebook.session)).user?.name).toBe('Multi');
  });

  it('no vincula una identidad que ya es de otra persona', async () => {
    const owned = nextSubject();
    await socialFlow('facebook', { subject: owned });
    const other = await socialFlow('discord', { subject: nextSubject() });
    const steal = await socialFlow(
      'facebook',
      { subject: owned },
      { session: other.session, link: true },
    );
    expect(steal.location).toBe('/?acceso=error&motivo=en_uso');
  });

  it('vincular exige una sesión abierta', async () => {
    const flow = await socialFlow('discord', { subject: nextSubject() }, { link: true });
    expect(flow.location).toBe('/?acceso=error&motivo=sesion');
  });

  it('NUNCA une cuentas por correo (evita el secuestro de cuentas)', async () => {
    const first = await socialFlow('discord', {
      subject: nextSubject(),
      email: 'mismo@example.com',
    });
    const second = await socialFlow('discord', {
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
    const flow = await socialFlow('discord', { subject: nextSubject(), email: ADMIN_EMAIL });
    expect((await me(flow.session)).admin).toBeNull();
    const panel = await inject({
      method: 'GET',
      url: '/api/admin/orders',
      cookies: flow.session ?? {},
    });
    // Para quien no es administrador el panel no existe (404).
    expect(panel.statusCode).toBe(404);
  });

  it('vincula Google a una cuenta creada con Discord', async () => {
    const login = await socialFlow('discord', { subject: nextSubject() });
    h.google.identity = {
      sub: `g-${nextSubject()}`,
      email: 'vinculo@example.com',
      emailVerified: true,
      name: 'Con Google',
    };
    const start = await inject({
      method: 'GET',
      url: '/auth/google?vincular=1',
      cookies: login.session ?? {},
    });
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const cookie = start.cookies.find((c) => c.name === 'tgs_oauth')?.value ?? '';
    const callback = await inject({
      method: 'GET',
      url: `/auth/google/callback?code=codigo&state=${state}`,
      cookies: { ...(login.session ?? {}), tgs_oauth: cookie },
    });
    expect(callback.headers.location).toBe('/?acceso=vinculado');
    expect((await me(login.session)).linked).toEqual(['google', 'discord']);
  });

  it('/api/config anuncia los accesos configurados', async () => {
    const config = (await inject({ method: 'GET', url: '/api/config' })).json<{
      auth: Record<string, boolean>;
    }>();
    expect(config.auth).toEqual({ google: true, discord: true, facebook: true });
  });
});
