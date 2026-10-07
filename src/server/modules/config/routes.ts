import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { weekendWindow } from '../../domain/pricing.js';

export interface ConfigRoutesOptions {
  config: AppConfig;
  paymentsAvailable: boolean;
  googleAvailable: boolean;
  socialAvailable: { facebook: boolean };
  playerLookupAvailable: boolean;
  emailUpdatesAvailable: boolean;
  now: () => Date;
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
      /** Sin consulta de proveedor: `customer` (el cliente confirma su ID) u `operator`. */
      playerVerification: config.orders.playerVerification,
      /** El cliente recibe por correo el pago confirmado y la entrega (SMTP configurado). */
      emailUpdates: options.emailUpdatesAvailable,
      support: { whatsapp: config.support.whatsapp ?? null, email: config.support.email ?? null },
      termsVersion: config.orders.termsVersion,
      promo: promoInfo(config, options.now()),
      limits: {
        maxUnitsPerProduct: config.orders.maxUnitsPerProduct,
        maxOrderTotalCop: config.orders.maxOrderTotalCop,
      },
    };
  });
};

/** Horario de la promo para que la tienda lo muestre (en hora de Colombia y del visitante). */
function promoInfo(config: AppConfig, now: Date) {
  if (config.promoSchedule === 'always') {
    return { schedule: 'always' as const, active: true, startsAt: null, endsAt: null };
  }
  const window = weekendWindow(now);
  return {
    schedule: 'weekends' as const,
    timeZone: 'America/Bogota',
    active: window.active,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
  };
}
