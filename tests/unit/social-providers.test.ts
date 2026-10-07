import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FacebookClient, SocialAuthError } from '../../src/server/integrations/social/providers.js';

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

  it('falla de forma controlada ante errores del proveedor o datos inválidos', async () => {
    const tokenError = new FacebookClient({
      ...options,
      fetchImpl: fakeFetch([{ status: 400, body: { error: { message: 'invalid code' } } }]).impl,
    });
    await expect(tokenError.exchangeCode({ code: 'c', redirectUri: REDIRECT })).rejects.toThrow(
      SocialAuthError,
    );
    const badSubject = new FacebookClient({
      ...options,
      fetchImpl: fakeFetch([{ body: { access_token: 't' } }, { body: { id: '../admin' } }]).impl,
    });
    await expect(badSubject.exchangeCode({ code: 'c', redirectUri: REDIRECT })).rejects.toThrow(
      /subject/,
    );
  });
});
