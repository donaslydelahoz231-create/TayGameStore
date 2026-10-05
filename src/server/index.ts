import type { FastifyBaseLogger } from 'fastify';
import { buildAppWithDeps } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { HttpGoogleClient } from './integrations/google/oidc.js';
import { MercadoPagoPaymentGateway } from './integrations/payments/mercadopago.js';
import { startScheduler, type Scheduler } from './services/jobs.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

// El pool se crea antes que la app; sus errores se registran con el logger de la app en cuanto existe.
const logRef: { current?: FastifyBaseLogger } = {};
const database = config.databaseUrl
  ? createDatabase({
      url: config.databaseUrl,
      poolMax: config.databasePoolMax,
      onPoolError: (error) => logRef.current?.error({ err: error }, 'postgres pool error'),
    })
  : undefined;

const { app, deps } = await buildAppWithDeps({
  config,
  database,
  db: database?.db,
  paymentGateway: config.mercadoPago
    ? new MercadoPagoPaymentGateway(config.mercadoPago)
    : undefined,
  googleClient: config.google ? new HttpGoogleClient(config.google) : undefined,
});
logRef.current = app.log;
if (!database) app.log.warn('DATABASE_URL no configurada: /api/ready y la tienda responderán 503.');
if (config.secrets.ephemeral) {
  app.log.warn(
    'Claves efímeras (ORDER_TOKEN_KEYS/MFA_ENCRYPTION_KEYS/IP_HASH_PEPPER): solo para desarrollo.',
  );
}

let scheduler: Scheduler | undefined;
if (deps && config.jobsEnabled) scheduler = startScheduler(deps);

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'cerrando servidor');
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  try {
    scheduler?.stop();
    await app.close();
    await database?.close();
    process.exit(exitCode);
  } catch (error) {
    app.log.error({ err: error }, 'error durante el cierre');
    process.exit(1);
  }
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

// Un error no capturado deja el proceso en un estado desconocido: se registra (sin datos de la
// petición) y se sale con código 1 para que la plataforma reinicie un proceso limpio.
function crash(kind: string, error: unknown): void {
  app.log.fatal({ err: error, kind }, 'error no capturado: reiniciando el proceso');
  setTimeout(() => process.exit(1), 1_000).unref();
  void shutdown('SIGTERM', 1);
}
process.on('uncaughtException', (error) => crash('uncaughtException', error));
process.on('unhandledRejection', (reason) => crash('unhandledRejection', reason));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'no se pudo iniciar el servidor');
  await database?.close();
  process.exit(1);
}
