import type {
  TopupProvider,
  TopupResult,
  ValidateResult,
} from '../../src/server/integrations/topup/provider.js';

/**
 * Doble de UniPin para pruebas. Por defecto todo sale bien; cada prueba encola respuestas con
 * `nextValidate`, `nextCreate` y `nextInquiry`. Recuerda las referencias creadas con éxito para
 * que una consulta posterior las confirme, como haría UniPin.
 */
export class FakeTopupProvider implements TopupProvider {
  readonly name = 'unipin' as const;
  readonly validateCalls: { game: string; uidField: string; playerUid: string }[] = [];
  readonly createCalls: {
    game: string;
    validationToken: string;
    referenceNo: string;
    denominationId: string;
  }[] = [];
  readonly inquiryCalls: string[] = [];
  readonly nextValidate: ValidateResult[] = [];
  readonly nextCreate: TopupResult[] = [];
  readonly nextInquiry: TopupResult[] = [];
  private counter = 0;

  async validateUser(input: {
    game: string;
    uidField: string;
    playerUid: string;
  }): Promise<ValidateResult> {
    this.validateCalls.push(input);
    return (
      this.nextValidate.shift() ?? {
        kind: 'ok',
        token: `tok-${(this.counter += 1)}`,
        username: 'Jugador',
      }
    );
  }

  async createOrder(input: {
    game: string;
    validationToken: string;
    referenceNo: string;
    denominationId: string;
  }): Promise<TopupResult> {
    this.createCalls.push(input);
    return this.nextCreate.shift() ?? { kind: 'success', transaction: `UP-${input.referenceNo}` };
  }

  async inquiry(referenceNo: string): Promise<TopupResult> {
    this.inquiryCalls.push(referenceNo);
    return this.nextInquiry.shift() ?? { kind: 'uncertain', reason: 'sin_datos' };
  }

  reset(): void {
    for (const list of [
      this.validateCalls,
      this.createCalls,
      this.inquiryCalls,
      this.nextValidate,
      this.nextCreate,
      this.nextInquiry,
    ]) {
      list.length = 0;
    }
  }
}
