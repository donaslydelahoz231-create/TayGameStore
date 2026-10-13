import type { FastifyPluginAsync } from 'fastify';
import { withTimeout } from '../../lib/time.js';

export interface DatabaseHealthCheck {
  ping(): Promise<void>;
}

export interface HealthRoutesOptions {
  database: DatabaseHealthCheck | undefined;
  readinessTimeoutMs: number;
  /** SHA completo del commit desplegado; nunca contiene credenciales. */
  revision?: string | null | undefined;
}

/**
 * /api/health: liveness (el proceso responde). No toca dependencias.
 * /api/ready: readiness (la base de datos responde). Sin detalles internos en la respuesta.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  // Sin rate limiting: las sondas del hosting no deben recibir 429.
  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    const revision = options.revision;
    if (revision && /^[0-9a-f]{40}$/i.test(revision)) {
      reply.header('x-tgs-revision', revision);
    }
    return { status: 'ok' };
  });

  app.get('/api/ready', { config: { rateLimit: false } }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.database) {
      return reply.code(503).send({ status: 'not_ready', checks: { database: 'not_configured' } });
    }
    try {
      await withTimeout(options.database.ping(), options.readinessTimeoutMs);
      return { status: 'ready', checks: { database: 'ok' } };
    } catch (err) {
      request.log.warn({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'not_ready', checks: { database: 'unavailable' } });
    }
  });
};
