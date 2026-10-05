import { createHmac } from 'node:crypto';
import type { SocialProvider } from '../../db/schema.js';

/**
 * Inicio de sesión de clientes con Discord y Facebook (OAuth 2.0, Authorization Code).
 * Endpoints según la documentación oficial:
 * - Discord: https://docs.discord.com/developers/topics/oauth2 (PKCE S256, formulario
 *   x-www-form-urlencoded en el token endpoint, perfil en /users/@me).
 * - Facebook: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
 *   (dialog/oauth → oauth/access_token → /me?fields=id,name,email), con appsecret_proof.
 * Solo se usan para CLIENTES: la administración exige Google + lista de correos + TOTP.
 */
export interface SocialIdentity {
  provider: SocialProvider;
  /** Identificador estable del usuario en el proveedor. */
  subject: string;
  /** Solo si el proveedor lo informa como verificado. */
  email: string | undefined;
  name: string | undefined;
}

export interface SocialClient {
  readonly provider: SocialProvider;
  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<SocialIdentity>;
}

export class SocialAuthError extends Error {
  constructor(readonly reason: string) {
    super(`login social: ${reason}`);
    this.name = 'SocialAuthError';
  }
}

interface ClientOptions {
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  /** Inyectable en pruebas; por defecto `fetch` global. */
  fetchImpl?: typeof fetch;
}

async function readJson(response: Response, step: string): Promise<Record<string, unknown>> {
  if (!response.ok) throw new SocialAuthError(`${step}_${response.status}`);
  const body: unknown = await response.json().catch(() => undefined);
  if (!body || typeof body !== 'object') throw new SocialAuthError(`${step}_body`);
  return body as Record<string, unknown>;
}

/** Texto de un proveedor externo: sin caracteres de control (U+0000 rompe PostgreSQL). */
const text = (value: unknown, max = 80) => {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- se eliminan justamente los de control
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean ? clean.slice(0, max) : undefined;
};

// ── Discord ──────────────────────────────────────────────────────────────────

export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
export const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

export class DiscordClient implements SocialClient {
  readonly provider = 'discord' as const;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.fetch = options.fetchImpl ?? fetch;
  }

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }) {
    const url = new URL(DISCORD_AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.options.clientId,
      scope: 'identify email',
      state: input.state,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 10_000);
    const token = await readJson(
      await this.fetch(DISCORD_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          redirect_uri: input.redirectUri,
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code_verifier: input.codeVerifier,
        }),
        signal,
      }),
      'token',
    );
    if (typeof token.access_token !== 'string') throw new SocialAuthError('no_access_token');
    const me = await readJson(
      await this.fetch(DISCORD_ME_URL, {
        headers: { authorization: `Bearer ${token.access_token}` },
        signal,
      }),
      'profile',
    );
    const subject = text(me.id, 40);
    if (!subject || !/^\d{5,25}$/.test(subject)) throw new SocialAuthError('subject');
    const email = me.verified === true ? text(me.email, 160)?.toLowerCase() : undefined;
    return {
      provider: this.provider,
      subject,
      email,
      name: text(me.global_name) ?? text(me.username),
    };
  }
}

// ── Facebook ─────────────────────────────────────────────────────────────────

export class FacebookClient implements SocialClient {
  readonly provider = 'facebook' as const;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ClientOptions & { graphVersion: string }) {
    this.fetch = options.fetchImpl ?? fetch;
  }

  /** Facebook no documenta PKCE en este flujo: protege el `state` (+ cookie) y el secreto. */
  authorizationUrl(input: { state: string; redirectUri: string }) {
    const url = new URL(`https://www.facebook.com/${this.options.graphVersion}/dialog/oauth`);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      state: input.state,
      response_type: 'code',
      scope: 'public_profile,email',
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: { code: string; redirectUri: string }) {
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 10_000);
    const graph = `https://graph.facebook.com/${this.options.graphVersion}`;
    const tokenUrl = new URL(`${graph}/oauth/access_token`);
    tokenUrl.search = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    }).toString();
    const token = await readJson(await this.fetch(tokenUrl, { signal }), 'token');
    if (typeof token.access_token !== 'string') throw new SocialAuthError('no_access_token');
    // appsecret_proof: el token solo sirve junto con el secreto de la app (si alguien lo
    // intercepta no puede usarlo desde otro servidor).
    const proof = createHmac('sha256', this.options.clientSecret)
      .update(token.access_token)
      .digest('hex');
    const meUrl = new URL(`${graph}/me`);
    // Forma documentada en el flujo manual: access_token como parámetro de /me.
    meUrl.search = new URLSearchParams({
      fields: 'id,name,email',
      access_token: token.access_token,
      appsecret_proof: proof,
    }).toString();
    const me = await readJson(await this.fetch(meUrl, { signal }), 'profile');
    const subject = text(me.id, 40);
    if (!subject || !/^\d{5,25}$/.test(subject)) throw new SocialAuthError('subject');
    // Facebook no informa si el correo está verificado: no se guarda como correo de la cuenta.
    return { provider: this.provider, subject, email: undefined, name: text(me.name) };
  }
}
