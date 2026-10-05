import type { FastifyPluginAsync } from 'fastify';
import { withTimeout } from '../../lib/time.js';

export interface DatabaseHealthCheck {
  ping(): Promise<void>;
}

export interface HealthRoutesOptions {
  database: DatabaseHealthCheck | undefined;
  readinessTimeoutMs: number;
}

/**
 * /api/health: liveness (el proceso responde). No toca dependencias.
 * /api/ready: readiness (la base de datos responde). Sin detalles internos en la respuesta.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  app.get('/api/health', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return { status: 'ok' };
  });

  app.get('/api/ready', async (request, reply) => {
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
