import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import { configRoutes } from './modules/config/routes.js';
import { healthRoutes, type DatabaseHealthCheck } from './modules/health/routes.js';
import { registerErrorHandling } from './plugins/errors.js';
import { buildLoggerOptions, generateRequestId } from './plugins/logging.js';
import { registerMaintenanceGuard } from './plugins/maintenance.js';

export interface AppDependencies {
  config: AppConfig;
  /** Ausente si DATABASE_URL no está configurada (solo permitido fuera de producción). */
  database?: DatabaseHealthCheck | undefined;
  readinessTimeoutMs?: number;
}

const BODY_LIMIT_BYTES = 64 * 1024;

/** `TRUST_PROXY=<n>` confía en los n saltos más cercanos (semántica de proxy-addr). */
function toTrustProxyOption(
  value: boolean | number,
): boolean | ((address: string, hop: number) => boolean) {
  if (typeof value === 'boolean') return value;
  return (_address, hop) => hop < value;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config } = deps;

  const app = Fastify({
    logger: buildLoggerOptions(config),
    genReqId: generateRequestId,
    requestIdHeader: false,
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      // El health check del hosting es frecuente: no se registra cada petición.
      disableRequestLogging: (request) => request.url === '/api/health',
    }),
    trustProxy: toTrustProxyOption(config.trustProxy),
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandling(app);
  registerMaintenanceGuard(app, config.flags);

  await app.register(healthRoutes, {
    database: deps.database,
    readinessTimeoutMs: deps.readinessTimeoutMs ?? 2_000,
  });
  await app.register(configRoutes, { flags: config.flags });

  if (config.serveWeb) {
    const root = path.resolve(config.webDistDir);
    if (!existsSync(path.join(root, 'index.html'))) {
      throw new Error(`No existe el build del frontend en ${root}. Ejecuta "npm run build".`);
    }
    await app.register(fastifyStatic, { root, index: 'index.html' });
  }

  return app;
}
