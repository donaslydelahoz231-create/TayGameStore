import { buildServer } from './bootstrap.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { startScheduler, type Scheduler } from './services/jobs.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const { app, deps, database } = await buildServer(config);

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
