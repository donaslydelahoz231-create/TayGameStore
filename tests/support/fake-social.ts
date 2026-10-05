import type { SocialProvider } from '../../src/server/db/schema.js';
import {
  SocialAuthError,
  type SocialClient,
  type SocialIdentity,
} from '../../src/server/integrations/social/providers.js';

/**
 * Doble de pruebas de Discord/Facebook (solo tests y e2e; nunca en producción).
 * `authorizeBase` es la "página del proveedor": en e2e, una ruta local que devuelve al
 * callback con el código; en integración, la prueba construye el callback a mano.
 */
export class FakeSocialClient implements SocialClient {
  private readonly codes = new Map<string, SocialIdentity>();
  lastAuthorization: URL | undefined;

  constructor(
    readonly provider: SocialProvider,
    private readonly authorizeBase = `https://example.com/${provider}/authorize`,
  ) {}

  /** Registra el código que "devolverá" el proveedor para esta identidad. */
  issueCode(identity: Omit<SocialIdentity, 'provider'>): string {
    const code = `code-${this.provider}-${this.codes.size + 1}-${identity.subject}`;
    this.codes.set(code, { provider: this.provider, ...identity });
    return code;
  }

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }) {
    const url = new URL(this.authorizeBase);
    url.searchParams.set('state', input.state);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('code_challenge', input.codeChallenge);
    this.lastAuthorization = url;
    return url.toString();
  }

  async exchangeCode(input: { code: string }): Promise<SocialIdentity> {
    const identity = this.codes.get(input.code);
    if (!identity) throw new SocialAuthError('invalid_code');
    this.codes.delete(input.code); // un código sirve una vez, como en los proveedores reales
    return identity;
  }
}
