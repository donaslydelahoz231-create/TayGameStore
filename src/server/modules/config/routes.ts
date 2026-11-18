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
       * datos de cuentas: con el pago en línea, el celular de Nequi solo lo ve quien elige Nequi en
       * su propio pedido (la excepción es `orderPayment`, solo con el pedido por WhatsApp).
       */
      paymentMethods: {
        mercadopago: config.flags.paymentsEnabled && options.paymentsAvailable,
        nequiManual: config.nequi.manual !== undefined,
        nequiPush: false,
      },
      auth: { google: options.googleAvailable, ...options.socialAvailable },
      playerLookup: options.playerLookupAvailable,
      /** Sin consulta de proveedor: `customer` (el cliente confirma su ID) u `operator`. */
      playerVerification: config.orders.playerVerification,
      /**
       * `checkout`, `whatsapp` o `ambos`: con WhatsApp, la tienda arma el pedido y abre el chat con
       * el número de `support.whatsapp`; no crea pedidos ni cobra (el dueño confirma por WhatsApp).
       */
      orderChannel: config.orders.orderChannel,
      orderPayment: orderPayment(config),
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

/**
 * Cuenta Nequi para el paso «Paga tu pedido» del pedido por WhatsApp: el cliente transfiere e
 * informa el pago antes de enviar el pedido, porque ese canal no crea pedidos en la tienda.
 * Publicarla así fue decisión del dueño (2026-11-11; docs/datos-del-propietario.md, requisito
 * 19). Solo con ORDER_CHANNEL `whatsapp` o `ambos` y Nequi por transferencia activo; con
 * `checkout` la cuenta sigue apareciendo solo dentro del pedido Nequi de cada cliente.
 */
function orderPayment(config: AppConfig) {
  const nequi = config.nequi.manual;
  if (config.orders.orderChannel === 'checkout' || !nequi) return null;
  return {
    nequi: {
      brebKey: nequi.brebKey ?? null,
      phone: nequi.phone ?? null,
      holder: nequi.holder ?? null,
    },
  };
}

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
