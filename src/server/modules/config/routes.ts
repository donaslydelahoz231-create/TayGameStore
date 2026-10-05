import type { FastifyPluginAsync } from 'fastify';
import type { FeatureFlags } from '../../config/env.js';

export interface ConfigRoutesOptions {
  flags: FeatureFlags;
}

/** Configuración pública para el frontend. Nunca incluye secretos. */
export const configRoutes: FastifyPluginAsync<ConfigRoutesOptions> = async (app, options) => {
  app.get('/api/config', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      maintenanceMode: options.flags.maintenanceMode,
      checkoutEnabled: options.flags.checkoutEnabled,
      paymentsEnabled: options.flags.paymentsEnabled,
    };
  });
};
