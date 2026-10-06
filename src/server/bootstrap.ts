import type { FastifyBaseLogger } from 'fastify';
import { buildAppWithDeps, type BuiltApp } from './app.js';
import type { AppConfig } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import { HttpGoogleClient } from './integrations/google/oidc.js';
import { SmtpMailer } from './integrations/notify/email.js';
import { WebhookEventSink } from './integrations/notify/events.js';
import { TelegramOwnerNotifier } from './integrations/notify/owner.js';
import { MercadoPagoPaymentGateway } from './integrations/payments/mercadopago.js';
import { DiscordClient, FacebookClient } from './integrations/social/providers.js';

export interface Server extends BuiltApp {
  database: Database | undefined;
}

/**
 * Construye la aplicación con sus integraciones reales a partir de la configuración.
 * Lo comparten el proceso de larga duración (index.ts, Render) y la función de Vercel
 * (serverless.ts); ninguno de los dos escucha aquí.
 */
export async function buildServer(config: AppConfig): Promise<Server> {
  // El pool se crea antes que la app; sus errores se registran con el logger de la app.
  const logRef: { current?: FastifyBaseLogger } = {};
  const database = config.databaseUrl
    ? createDatabase({
        url: config.databaseUrl,
        poolMax: config.databasePoolMax,
        onPoolError: (error) => logRef.current?.error({ err: error }, 'postgres pool error'),
      })
    : undefined;

  const built = await buildAppWithDeps({
    config,
    database,
    db: database?.db,
    paymentGateway: config.mercadoPago
      ? new MercadoPagoPaymentGateway(config.mercadoPago)
      : undefined,
    ownerNotifier: config.ownerNotify.telegram
      ? new TelegramOwnerNotifier(config.ownerNotify.telegram)
      : undefined,
    mailer: config.smtp ? new SmtpMailer(config.smtp) : undefined,
    eventSink: config.eventsWebhook ? new WebhookEventSink(config.eventsWebhook) : undefined,
    googleClient: config.google ? new HttpGoogleClient(config.google) : undefined,
    socialClients: {
      ...(config.social.discord ? { discord: new DiscordClient(config.social.discord) } : {}),
      ...(config.social.facebook ? { facebook: new FacebookClient(config.social.facebook) } : {}),
    },
  });
  logRef.current = built.app.log;
  if (!database)
    built.app.log.warn('DATABASE_URL no configurada: /api/ready y la tienda responderán 503.');
  if (config.secrets.ephemeral) {
    built.app.log.warn(
      'Claves efímeras (ORDER_TOKEN_KEYS/MFA_ENCRYPTION_KEYS/IP_HASH_PEPPER): solo para desarrollo.',
    );
  }
  return { ...built, database };
}
