import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import type { Db } from './db/client.js';
import { registerRequestContext } from './http/context.js';
import type { SocialProvider } from './db/schema.js';
import type { GoogleClient } from './integrations/google/oidc.js';
import type { SocialClient } from './integrations/social/providers.js';
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
import { registerShield } from './plugins/shield.js';
import type { ServiceDeps } from './services/context.js';
import { AbuseShield } from './services/shield.js';

export interface AppDependencies {
  config: AppConfig;
  /** Ausente si DATABASE_URL no está configurada (solo permitido fuera de producción). */
  database?: DatabaseHealthCheck | undefined;
  /** Base de datos para los módulos de negocio. Sin ella responden 503. */
  db?: Db | undefined;
  paymentGateway?: PaymentGateway | undefined;
  googleClient?: GoogleClient | undefined;
  /** Login de clientes con Discord y Facebook (solo los configurados). */
  socialClients?: Partial<Record<SocialProvider, SocialClient>> | undefined;
  /** Verificación automática de jugadores. Sin ella, la verificación es manual (operador). */
  playerVerifier?: PlayerVerifier | undefined;
  now?: () => Date;
  readinessTimeoutMs?: number;
}

const BODY_LIMIT_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

/** `TRUST_PROXY=<n>` confía en los n saltos más cercanos (semántica de proxy-addr). */
function toTrustProxyOption(
  value: boolean | number,
): boolean | ((address: string, hop: number) => boolean) {
  if (typeof value === 'boolean') return value;
  return (_address, hop) => hop < value;
}

/** Documentos legales enlazados desde la casilla de aceptación del checkout. */
export const LEGAL_PAGES = ['terminos.html', 'privacidad.html'] as const;
const LEGAL_PLACEHOLDER = '[COMPLETAR';

/**
 * En producción no se vende con los textos legales a medio hacer: si las ventas están activas
 * y falta una página o conserva marcadores "[COMPLETAR", el servidor no arranca.
 */
export function assertLegalPagesReady(config: AppConfig, root: string): void {
  if (config.env !== 'production' || !config.flags.checkoutEnabled) return;
  const pending = LEGAL_PAGES.filter((page) => {
    const file = path.join(root, page);
    return !existsSync(file) || readFileSync(file, 'utf8').includes(LEGAL_PLACEHOLDER);
  });
  if (pending.length) {
    throw new Error(
      `Textos legales incompletos (${pending.join(', ')}): completa los campos "[COMPLETAR" ` +
        'en src/web antes de activar CHECKOUT_ENABLED en producción.',
    );
  }
}

export interface BuiltApp {
  app: FastifyInstance;
  deps: ServiceDeps | undefined;
  shield: AbuseShield;
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
    // Por defecto Fastify no limita el tiempo para recibir una petición: una conexión que
    // envía cabeceras o cuerpo muy despacio (slowloris) ocuparía el servidor sin fin.
    requestTimeout: REQUEST_TIMEOUT_MS,
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
  const shield = new AbuseShield({
    db: deps?.db,
    now: input.now ?? (() => new Date()),
    log: app.log,
  });
  registerShield(app, shield);

  await app.register(healthRoutes, {
    database: input.database,
    readinessTimeoutMs: input.readinessTimeoutMs ?? 2_000,
  });
  await app.register(configRoutes, {
    config,
    paymentsAvailable: deps?.gateway !== undefined,
    googleAvailable: input.googleClient !== undefined && deps !== undefined,
    socialAvailable: {
      discord: input.socialClients?.discord !== undefined && deps !== undefined,
      facebook: input.socialClients?.facebook !== undefined && deps !== undefined,
    },
    playerLookupAvailable: input.playerVerifier !== undefined && deps !== undefined,
  });
  await app.register(shopRoutes, { deps, playerVerifier: input.playerVerifier });
  await app.register(webhookRoutes, { deps });
  await app.register(authRoutes, {
    config,
    deps,
    google: input.googleClient,
    social: input.socialClients,
  });
  await app.register(adminRoutes, { deps, shield });

  if (config.serveWeb) {
    const root = path.resolve(config.webDistDir);
    if (!existsSync(path.join(root, 'index.html'))) {
      throw new Error(`No existe el build del frontend en ${root}. Ejecuta "npm run build".`);
    }
    assertLegalPagesReady(config, root);
    await app.register(fastifyStatic, {
      root,
      // Debe ser un array: con preCompressed, @fastify/static solo resuelve índices en array
      // (con un string, "/" responde 404 a los navegadores que aceptan br/gzip).
      index: ['index.html'],
      // .br/.gz generados en el build (vite.config.ts); si no existen, se envía el original.
      preCompressed: true,
      cacheControl: false,
      setHeaders(reply, filePath) {
        // Los nombres de /assets/ llevan hash de contenido: nunca cambian.
        reply.header(
          'cache-control',
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    });
  }

  return { app, deps, shield };
}

export async function buildApp(input: AppDependencies): Promise<FastifyInstance> {
  return (await buildAppWithDeps(input)).app;
}
