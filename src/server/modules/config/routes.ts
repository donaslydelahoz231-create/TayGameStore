import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';

export interface ConfigRoutesOptions {
  config: AppConfig;
  paymentsAvailable: boolean;
  googleAvailable: boolean;
  socialAvailable: { discord: boolean; facebook: boolean };
  playerLookupAvailable: boolean;
  emailUpdatesAvailable: boolean;
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
      /** `sandbox`: la tienda avisa de que los pagos son de prueba (sin dinero real). */
      paymentsMode:
        config.flags.paymentsEnabled && options.paymentsAvailable
          ? (config.mercadoPago?.mode ?? null)
          : null,
      paymentMethod: 'mercadopago',
      auth: { google: options.googleAvailable, ...options.socialAvailable },
      playerLookup: options.playerLookupAvailable,
      /** El cliente recibe por correo el pago confirmado y la entrega (SMTP configurado). */
      emailUpdates: options.emailUpdatesAvailable,
      support: { whatsapp: config.support.whatsapp ?? null, email: config.support.email ?? null },
      termsVersion: config.orders.termsVersion,
      limits: {
        maxUnitsPerProduct: config.orders.maxUnitsPerProduct,
        maxOrderTotalCop: config.orders.maxOrderTotalCop,
      },
    };
  });
};
