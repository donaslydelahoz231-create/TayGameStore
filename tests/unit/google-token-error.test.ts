import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpGoogleClient, OidcError } from '../../src/server/integrations/google/oidc.js';

const client = new HttpGoogleClient({
  clientId: '123-abc.apps.googleusercontent.com',
  clientSecret: 'secreto-ficticio-de-prueba',
});
const input = { code: 'c', codeVerifier: 'v', redirectUri: 'https://t.example/cb', nonce: 'n' };

async function failure(status: number, body: unknown): Promise<string> {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));
  try {
    await client.exchangeCode(input);
  } catch (error) {
    if (error instanceof OidcError) return error.reason;
    throw error;
  }
  throw new Error('se esperaba OidcError');
}

describe('Google: errores del intercambio del código', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('registra el código de error de Google, nunca su descripción libre', async () => {
    expect(
      await failure(401, { error: 'invalid_client', error_description: 'texto <libre>' }),
    ).toBe('token_endpoint_401_invalid_client');
    expect(await failure(400, { error: 'invalid_grant' })).toBe('token_endpoint_400_invalid_grant');
  });

  it('un error sin código válido queda solo con el estado HTTP', async () => {
    expect(await failure(401, { error: 'Algo Raro!' })).toBe('token_endpoint_401');
    expect(await failure(500, 'no es json de error')).toBe('token_endpoint_500');
  });
});
