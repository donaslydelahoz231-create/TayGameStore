import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';

export interface ConfigRoutesOptions {
  config: AppConfig;
  paymentsAvailable: boolean;
  googleAvailable: boolean;
}

/** Configuración pública para el frontend. Nunca incluye secretos. */
export const configRoutes: FastifyPluginAsync<ConfigRoutesOptions> = async (app, options) => {
  const { config } = options;
  app.get('/api/config', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      maintenanceMode: config.flags.maintenanceMode,
      checkoutEnabled: config.flags.checkoutEnabled,
      paymentsEnabled: config.flags.paymentsEnabled && options.paymentsAvailable,
      paymentMethod: 'mercadopago',
      auth: { google: options.googleAvailable },
      support: { whatsapp: config.support.whatsapp ?? null, email: config.support.email ?? null },
      termsVersion: config.orders.termsVersion,
      limits: {
        maxUnitsPerProduct: config.orders.maxUnitsPerProduct,
        maxOrderTotalCop: config.orders.maxOrderTotalCop,
      },
    };
  });
};
