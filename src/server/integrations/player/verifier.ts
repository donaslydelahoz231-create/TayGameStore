/**
 * Puerto de verificación automática de jugadores (consulta UID → nickname/región).
 *
 * No hay implementación real: Garena no publica una API oficial y las APIs de terceros que
 * extraen datos del juego no son fuentes legítimas (decisión del propietario: sin scraping).
 * Se implementa un adaptador solo con un proveedor autorizado (p. ej. el distribuidor de
 * recargas con el que se firme contrato) y su documentación oficial. Mientras tanto, la
 * verificación la hace el operador (flujo manual) y los dobles de prueba viven en `tests/`.
 */
export type PlayerLookupResult =
  | { status: 'FOUND'; nickname: string; region: string }
  | { status: 'NOT_FOUND' }
  | { status: 'UNAVAILABLE'; reason: 'timeout' | 'provider_error' };

export interface PlayerVerifier {
  readonly name: string;
  lookup(
    input: { game: 'freefire'; uid: string },
    signal: AbortSignal,
  ): Promise<PlayerLookupResult>;
}
