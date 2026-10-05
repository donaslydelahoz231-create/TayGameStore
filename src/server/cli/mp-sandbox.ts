import { randomBytes, randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import { mapMercadoPagoStatus, type PaymentGateway } from '../integrations/payments/gateway.js';

/**
 * Verificación de la integración con Mercado Pago en SANDBOX, contra la API real y con la
 * cuenta vendedora de prueba del propietario (nunca con la cuenta de producción).
 *
 *   npm run mp:sandbox -- preferencia --monto 3800
 *   npm run mp:sandbox -- pago <id del pago>
 *   npm run mp:sandbox -- buscar <referencia>
 *
 * Usa el mismo adaptador que la tienda (`MercadoPagoPaymentGateway`). No escribe en la base de
 * datos ni imprime credenciales. Se niega a ejecutarse si `MP_MODE` no es `sandbox`.
 */

export interface SandboxIo {
  out(line: string): void;
}

export class SandboxUsageError extends Error {}

const USAGE = [
  'Uso:',
  '  npm run mp:sandbox -- preferencia --monto <COP>   crea un checkout de prueba',
  '  npm run mp:sandbox -- pago <id>                   consulta un pago y su live_mode',
  '  npm run mp:sandbox -- buscar <referencia>         busca pagos por external_reference',
].join('\n');

type MercadoPagoConfig = NonNullable<AppConfig['mercadoPago']>;

function requireSandbox(config: AppConfig): { baseUrl: string; mercadoPago: MercadoPagoConfig } {
  if (!config.mercadoPago) {
    throw new SandboxUsageError(
      'Faltan MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET (credenciales de la cuenta vendedora de prueba).',
    );
  }
  if (config.mercadoPago.mode !== 'sandbox') {
    throw new SandboxUsageError(
      'MP_MODE debe ser "sandbox": este comando nunca se ejecuta con la cuenta de producción.',
    );
  }
  if (!config.publicBaseUrl) {
    throw new SandboxUsageError(
      'Falta PUBLIC_BASE_URL (URL pública para el webhook y el retorno).',
    );
  }
  return { baseUrl: config.publicBaseUrl, mercadoPago: config.mercadoPago };
}

function parseAmount(args: readonly string[]): number {
  const index = args.indexOf('--monto');
  const raw = index >= 0 ? args[index + 1] : undefined;
  const amount = Number(raw);
  if (!raw || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw new SandboxUsageError('Indica --monto en pesos enteros (1 a 1.000.000).');
  }
  return amount;
}

export async function runSandboxCommand(
  args: readonly string[],
  config: AppConfig,
  /** Se crea solo después de comprobar que la cuenta declarada es de prueba. */
  gatewayFor: (mercadoPago: MercadoPagoConfig) => PaymentGateway,
  io: SandboxIo,
): Promise<void> {
  const { baseUrl, mercadoPago } = requireSandbox(config);
  const gateway = gatewayFor(mercadoPago);
  const [command, value] = args;

  if (command === 'preferencia') {
    const amount = parseAmount(args);
    const orderRef = `SANDBOX-${randomBytes(5).toString('hex').toUpperCase()}`;
    const session = await gateway.createCheckout(
      {
        orderRef,
        items: [{ id: 'sandbox', title: 'Prueba TayGameStore', quantity: 1, unitPriceCop: amount }],
        totalCop: amount,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        returnUrl: `${baseUrl}/`,
        notificationUrl: `${baseUrl}/api/webhooks/mercadopago`,
      },
      randomUUID(),
    );
    io.out(`Referencia:  ${orderRef}`);
    io.out(`Preferencia: ${session.preferenceId}`);
    io.out(`Checkout:    ${session.checkoutUrl}`);
    io.out('Abre el checkout con el COMPRADOR de prueba (otra sesión del navegador) y paga con');
    io.out('una tarjeta de prueba. Luego: npm run mp:sandbox -- buscar ' + orderRef);
    return;
  }

  if (command === 'pago' || command === 'buscar') {
    if (!value) throw new SandboxUsageError(USAGE);
    const found =
      command === 'pago'
        ? [await gateway.getPayment(value)]
        : await gateway.searchPaymentsByReference(value);
    if (!found.length) io.out('Sin pagos para esa referencia todavía.');
    for (const payment of found) {
      io.out(
        [
          `Pago ${payment.id}`,
          `estado MP: ${payment.status}${payment.statusDetail ? ` (${payment.statusDetail})` : ''}`,
          `estado interno: ${mapMercadoPagoStatus(payment.status)}`,
          `monto: ${payment.amount ?? '—'} ${payment.currency ?? ''}`.trim(),
          `referencia: ${payment.externalReference ?? '—'}`,
          `live_mode: ${payment.liveMode === undefined ? 'no informado' : String(payment.liveMode)}`,
        ].join(' · '),
      );
      if (payment.liveMode !== false) {
        io.out(
          '¡ATENCIÓN! Este pago no está marcado como de prueba (live_mode=false). Revisa que las ' +
            'credenciales sean de la cuenta vendedora de PRUEBA. La tienda lo enviaría a revisión.',
        );
      }
    }
    return;
  }

  throw new SandboxUsageError(USAGE);
}
