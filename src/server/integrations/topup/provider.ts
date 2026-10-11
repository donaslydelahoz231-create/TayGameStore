/**
 * Puerto de recarga directa al ID (sin PIN) con un distribuidor oficial. El dominio solo conoce
 * esta interfaz; la implementación real es `UniPinTopupProvider`. Los dobles viven en `tests/`.
 *
 * Regla de oro: solo `success` cuenta como entregado. Cualquier respuesta que no sea clara es
 * `uncertain` y se aclara consultando al proveedor, nunca reenviando con otra referencia.
 */

export type ValidateResult =
  | { kind: 'ok'; token: string; username: string | undefined }
  /** El proveedor respondió con un error explícito (p. ej. ID de jugador inexistente). */
  | { kind: 'failed'; code: string }
  | { kind: 'uncertain'; reason: string };

export type TopupResult =
  | { kind: 'success'; transaction: string }
  /** Error explícito: la recarga no se hizo. */
  | { kind: 'failed'; code: string }
  /** La referencia ya existe en el proveedor: hay que consultarla. */
  | { kind: 'duplicate' }
  /** El token de validación caducó o ya se usó: validar otra vez y repetir la misma referencia. */
  | { kind: 'token_expired' }
  | { kind: 'uncertain'; reason: string };

export interface TopupProvider {
  readonly name: 'unipin';
  validateUser(input: {
    game: string;
    uidField: string;
    playerUid: string;
  }): Promise<ValidateResult>;
  createOrder(input: {
    game: string;
    validationToken: string;
    referenceNo: string;
    denominationId: string;
  }): Promise<TopupResult>;
  /** Estado de una referencia ya enviada. `duplicate` y `token_expired` no aplican aquí. */
  inquiry(referenceNo: string): Promise<TopupResult>;
}
