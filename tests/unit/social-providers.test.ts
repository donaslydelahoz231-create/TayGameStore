import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DISCORD_ME_URL,
  DISCORD_TOKEN_URL,
  DiscordClient,
  FacebookClient,
  SocialAuthError,
} from '../../src/server/integrations/social/providers.js';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** fetch simulado: responde en orden y guarda cada llamada para inspeccionarla. */
function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
    const next = responses.shift();
    if (!next) throw new Error('llamada inesperada');
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const REDIRECT = 'https://tienda.example/auth/x/callback';

describe('DiscordClient', () => {
  it('construye la URL de autorización con PKCE S256 y los scopes mínimos', () => {
    const client = new DiscordClient({ clientId: '123456789', clientSecret: 'secreto-discord' });
    const url = new URL(
      client.authorizationUrl({ state: 'st', codeChallenge: 'ch', redirectUri: REDIRECT }),
    );
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: '123456789',
      scope: 'identify email',
      state: 'st',
      redirect_uri: REDIRECT,
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('canjea el código (formulario, nunca JSON) y lee el perfil', async () => {
    const { impl, calls } = fakeFetch([
      { body: { access_token: 'tok', token_type: 'Bearer' } },
      {
        body: {
          id: '80351110224678912',
          username: 'jugador',
          global_name: 'Jugador Pro',
          email: 'Jugador@Example.com',
          verified: true,
        },
      },
    ]);
    const client = new DiscordClient({
      clientId: '123456789',
      clientSecret: 'secreto-discord',
      fetchImpl: impl,
    });
    const identity = await client.exchangeCode({
      code: 'c0de',
      codeVerifier: 'verif',
      redirectUri: REDIRECT,
    });
    expect(identity).toEqual({
      provider: 'discord',
      subject: '80351110224678912',
      email: 'jugador@example.com',
      name: 'Jugador Pro',
    });
    expect(calls[0]?.url).toBe(DISCORD_TOKEN_URL);
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(calls[0]?.init?.body as URLSearchParams);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'authorization_code',
      code: 'c0de',
      redirect_uri: REDIRECT,
      client_id: '123456789',
      client_secret: 'secreto-discord',
      code_verifier: 'verif',
    });
    expect(calls[1]?.url).toBe(DISCORD_ME_URL);
    expect(new Headers(calls[1]?.init?.headers).get('authorization')).toBe('Bearer tok');
  });

  it('descarta un correo no verificado', async () => {
    const { impl } = fakeFetch([
      { body: { access_token: 'tok' } },
      { body: { id: '80351110224678912', username: 'x', email: 'a@b.co', verified: false } },
    ]);
    const client = new DiscordClient({ clientId: '1', clientSecret: 's', fetchImpl: impl });
    const identity = await client.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' });
    expect(identity.email).toBeUndefined();
  });

  it('falla de forma controlada ante errores del proveedor o datos inválidos', async () => {
    const tokenError = new DiscordClient({
      clientId: '1',
      clientSecret: 's',
      fetchImpl: fakeFetch([{ status: 400, body: { error: 'invalid_grant' } }]).impl,
    });
    await expect(
      tokenError.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toThrow(SocialAuthError);
    const badSubject = new DiscordClient({
      clientId: '1',
      clientSecret: 's',
      fetchImpl: fakeFetch([{ body: { access_token: 't' } }, { body: { id: '../admin' } }]).impl,
    });
    await expect(
      badSubject.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'r' }),
    ).rejects.toThrow(/subject/);
  });
});

describe('FacebookClient', () => {
  const options = { clientId: '1234567890', clientSecret: 'secreto-meta', graphVersion: 'v25.0' };

  it('usa el diálogo OAuth de la versión configurada con state y scopes mínimos', () => {
    const client = new FacebookClient(options);
    const url = new URL(client.authorizationUrl({ state: 'st', redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v25.0/dialog/oauth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '1234567890',
      redirect_uri: REDIRECT,
      state: 'st',
      response_type: 'code',
      scope: 'public_profile,email',
    });
  });

  it('canjea el código, firma con appsecret_proof y no guarda el correo', async () => {
    const { impl, calls } = fakeFetch([
      { body: { access_token: 'EAAtoken', token_type: 'bearer', expires_in: 5000 } },
      { body: { id: '10224678912345', name: 'Cliente Meta', email: 'meta@example.com' } },
    ]);
    const client = new FacebookClient({ ...options, fetchImpl: impl });
    const identity = await client.exchangeCode({ code: 'c0de', redirectUri: REDIRECT });
    expect(identity).toEqual({
      provider: 'facebook',
      subject: '10224678912345',
      email: undefined,
      name: 'Cliente Meta',
    });
    const token = new URL(calls[0]?.url ?? '');
    expect(token.origin + token.pathname).toBe(
      'https://graph.facebook.com/v25.0/oauth/access_token',
    );
    expect(token.searchParams.get('code')).toBe('c0de');
    expect(token.searchParams.get('redirect_uri')).toBe(REDIRECT);
    const meUrl = new URL(calls[1]?.url ?? '');
    expect(meUrl.origin + meUrl.pathname).toBe('https://graph.facebook.com/v25.0/me');
    expect(meUrl.searchParams.get('fields')).toBe('id,name,email');
    expect(meUrl.searchParams.get('appsecret_proof')).toBe(
      createHmac('sha256', 'secreto-meta').update('EAAtoken').digest('hex'),
    );
    expect(meUrl.searchParams.get('access_token')).toBe('EAAtoken');
  });
});
