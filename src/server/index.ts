import type { FastifyBaseLogger } from 'fastify';
import { buildApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createDatabase } from './db/client.js';

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

const app = await buildApp({ config, database });
logRef.current = app.log;
if (!database) app.log.warn('DATABASE_URL no configurada: /api/ready responderá 503.');

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'cerrando servidor');
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
  try {
    await app.close();
    await database?.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'error durante el cierre');
    process.exit(1);
  }
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'no se pudo iniciar el servidor');
  await database?.close();
  process.exit(1);
}
