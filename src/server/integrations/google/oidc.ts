import { createHash } from 'node:crypto';

/**
 * Google OpenID Connect (Authorization Code + PKCE). Endpoints tomados del documento de
 * descubrimiento oficial https://accounts.google.com/.well-known/openid-configuration.
 *
 * El ID token se obtiene directamente del token endpoint de Google por TLS (OIDC Core §3.1.3.7):
 * se validan emisor, audiencia, expiración y nonce.
 */
export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | undefined;
}

export interface GoogleClient {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleIdentity>;
}

export class OidcError extends Error {
  constructor(readonly reason: string) {
    super(`OIDC: ${reason}`);
    this.name = 'OidcError';
  }
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

export function validateIdTokenClaims(
  idToken: string,
  expected: { clientId: string; nonce: string; nowSeconds: number },
): GoogleIdentity {
  const payload = idToken.split('.')[1];
  if (!payload) throw new OidcError('id_token_malformed');
  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    throw new OidcError('id_token_malformed');
  }
  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.includes(claims.iss))
    throw new OidcError('issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) throw new OidcError('audience');
  if (typeof claims.exp !== 'number' || claims.exp <= expected.nowSeconds)
    throw new OidcError('expired');
  if (claims.nonce !== expected.nonce) throw new OidcError('nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new OidcError('subject');
  if (typeof claims.email !== 'string' || !claims.email) throw new OidcError('email');
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
    name:
      typeof claims.name === 'string'
        ? // eslint-disable-next-line no-control-regex -- se eliminan los caracteres de control
          claims.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) || undefined
        : undefined,
  };
}

export class HttpGoogleClient implements GoogleClient {
  constructor(
    private readonly options: { clientId: string; clientSecret: string; timeoutMs?: number },
  ) {}

  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      scope: 'openid email profile',
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    nonce: string;
  }): Promise<GoogleIdentity> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new OidcError(`token_endpoint_${response.status}`);
    const body = (await response.json()) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') throw new OidcError('no_id_token');
    return validateIdTokenClaims(body.id_token, {
      clientId: this.options.clientId,
      nonce: input.nonce,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  }
}
