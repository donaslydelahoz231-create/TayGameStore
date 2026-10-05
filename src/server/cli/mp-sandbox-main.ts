import { ConfigError, loadConfig } from '../config/env.js';
import { PaymentProviderError } from '../integrations/payments/gateway.js';
import { MercadoPagoPaymentGateway } from '../integrations/payments/mercadopago.js';
import { runSandboxCommand, SandboxUsageError } from './mp-sandbox.js';

// Punto de entrada de `npm run mp:sandbox`. Los errores muestran el motivo, nunca credenciales.
try {
  await runSandboxCommand(
    process.argv.slice(2),
    loadConfig(),
    (mercadoPago) => new MercadoPagoPaymentGateway(mercadoPago),
    { out: (line) => console.warn(line) },
  );
} catch (error) {
  if (error instanceof ConfigError || error instanceof SandboxUsageError) {
    console.error(error.message);
  } else if (error instanceof PaymentProviderError) {
    const cause = error.cause instanceof Error ? error.cause.message : '';
    console.error(`${error.message}${cause ? `: ${cause}` : ''}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
