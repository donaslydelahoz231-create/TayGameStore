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
      /**
       * Métodos de pago, cada uno según su propia configuración (ninguno depende del otro). Sin
       * datos de cuentas: la llave y el celular de Nequi solo los ve quien elige Nequi en su propio
       * pedido, también al enviar el pedido desde la tienda (ORDER_CHANNEL `whatsapp` o `ambos`).
       */
      paymentMethods: {
        // Con MERCADOPAGO_NEW_PAYMENTS=false la tienda no ofrece Mercado Pago (solo Nequi).
        mercadopago:
          config.flags.paymentsEnabled &&
          config.flags.mercadoPagoNewPayments &&
          options.paymentsAvailable,
        nequiManual: config.nequi.manual !== undefined,
        nequiPush: false,
      },
      auth: { google: options.googleAvailable, ...options.socialAvailable },
      playerLookup: options.playerLookupAvailable,
      /** Sin consulta de proveedor: `customer` (el cliente confirma su ID) u `operator`. */
      playerVerification: config.orders.playerVerification,
      /**
       * `checkout`, `whatsapp` o `ambos`: con `whatsapp` o `ambos` la tienda muestra «Revisar, pagar
       * y enviar»: el cliente envía su pedido desde la tienda (sin abrir WhatsApp) y el pedido le
       * llega al dueño (panel, hoja y, si está configurado, su WhatsApp por CallMeBot).
       */
      orderChannel: config.orders.orderChannel,
      /** El cliente recibe por correo el pago confirmado y la entrega (SMTP configurado). */
      emailUpdates: options.emailUpdatesAvailable,
      support: { whatsapp: config.support.whatsapp ?? null, email: config.support.email ?? null },
      termsVersion: config.orders.termsVersion,
      /** Plazo de entrega publicado en los términos (LEGAL_DELIVERY_TIME); null si falta. */
      deliveryTime: config.legal.deliveryTime ?? null,
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
