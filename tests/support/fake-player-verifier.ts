import type {
  PlayerLookupResult,
  PlayerVerifier,
} from '../../src/server/integrations/player/verifier.js';

/**
 * Doble de prueba del proveedor de verificación (solo tests; nunca en producción).
 * UID que empieza por 9 → encontrado; por 8 → no existe; cualquier otro → proveedor caído,
 * para que los flujos manuales existentes sigan cubiertos.
 */
export class FakePlayerVerifier implements PlayerVerifier {
  readonly name = 'fake';
  calls: string[] = [];

  async lookup(input: { game: 'freefire'; uid: string }): Promise<PlayerLookupResult> {
    this.calls.push(input.uid);
    if (input.uid.startsWith('9')) {
      return { status: 'FOUND', nickname: `Jugador${input.uid.slice(-4)}`, region: 'Colombia' };
    }
    if (input.uid.startsWith('8')) return { status: 'NOT_FOUND' };
    return { status: 'UNAVAILABLE', reason: 'provider_error' };
  }
}
