import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import type { Db } from './db/client.js';
import { registerRequestContext } from './http/context.js';
import type { GoogleClient } from './integrations/google/oidc.js';
import type { PaymentGateway } from './integrations/payments/gateway.js';
import type { PlayerVerifier } from './integrations/player/verifier.js';
import { adminRoutes } from './modules/admin/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { configRoutes } from './modules/config/routes.js';
import { healthRoutes, type DatabaseHealthCheck } from './modules/health/routes.js';
import { shopRoutes } from './modules/shop/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { registerErrorHandling } from './plugins/errors.js';
import { buildLoggerOptions, generateRequestId } from './plugins/logging.js';
import { registerMaintenanceGuard } from './plugins/maintenance.js';
import { registerSecurity } from './plugins/security.js';
import type { ServiceDeps } from './services/context.js';

export interface AppDependencies {
  config: AppConfig;
  /** Ausente si DATABASE_URL no está configurada (solo permitido fuera de producción). */
  database?: DatabaseHealthCheck | undefined;
  /** Base de datos para los módulos de negocio. Sin ella responden 503. */
  db?: Db | undefined;
  paymentGateway?: PaymentGateway | undefined;
  googleClient?: GoogleClient | undefined;
  /** Verificación automática de jugadores. Sin ella, la verificación es manual (operador). */
  playerVerifier?: PlayerVerifier | undefined;
  now?: () => Date;
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

export interface BuiltApp {
  app: FastifyInstance;
  deps: ServiceDeps | undefined;
}

export async function buildAppWithDeps(input: AppDependencies): Promise<BuiltApp> {
  const { config } = input;

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

  const deps: ServiceDeps | undefined = input.db
    ? {
        db: input.db,
        config,
        now: input.now ?? (() => new Date()),
        gateway: config.flags.paymentsEnabled ? input.paymentGateway : undefined,
        log: app.log,
      }
    : undefined;

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandling(app);
  registerMaintenanceGuard(app, config.flags);
  await registerSecurity(app, config);
  registerRequestContext(app, config, deps);

  await app.register(healthRoutes, {
    database: input.database,
    readinessTimeoutMs: input.readinessTimeoutMs ?? 2_000,
  });
  await app.register(configRoutes, {
    config,
    paymentsAvailable: deps?.gateway !== undefined,
    googleAvailable: input.googleClient !== undefined && deps !== undefined,
    playerLookupAvailable: input.playerVerifier !== undefined && deps !== undefined,
  });
  await app.register(shopRoutes, { deps, playerVerifier: input.playerVerifier });
  await app.register(webhookRoutes, { deps });
  await app.register(authRoutes, { config, deps, google: input.googleClient });
  await app.register(adminRoutes, { deps });

  if (config.serveWeb) {
    const root = path.resolve(config.webDistDir);
    if (!existsSync(path.join(root, 'index.html'))) {
      throw new Error(`No existe el build del frontend en ${root}. Ejecuta "npm run build".`);
    }
    await app.register(fastifyStatic, { root, index: 'index.html' });
  }

  return { app, deps };
}

export async function buildApp(input: AppDependencies): Promise<FastifyInstance> {
  return (await buildAppWithDeps(input)).app;
}
