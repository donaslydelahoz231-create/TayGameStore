import type { FastifyBaseLogger } from 'fastify';
import { buildAppWithDeps, type BuiltApp } from './app.js';
import type { AppConfig } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import { HttpGoogleClient } from './integrations/google/oidc.js';
import { SmtpMailer } from './integrations/notify/email.js';
import { WebhookEventSink } from './integrations/notify/events.js';
import { GreenApiWhatsApp } from './integrations/notify/whatsapp-greenapi.js';
import { CallMeBotWhatsApp, type OwnerWhatsApp } from './integrations/notify/whatsapp-owner.js';
import { MercadoPagoPaymentGateway } from './integrations/payments/mercadopago.js';
import { UniPinTopupProvider } from './integrations/topup/unipin.js';
import { GoogleSheetsLog } from './integrations/sheets/google-sheets.js';
import { FacebookClient } from './integrations/social/providers.js';

export interface Server extends BuiltApp {
  database: Database | undefined;
}

/** Green-API (número de la tienda) o CallMeBot, según lo que esté configurado en el hosting. */
function ownerWhatsAppSender(settings: AppConfig['ownerWhatsApp']): OwnerWhatsApp | undefined {
  if (!settings) return undefined;
  return settings.provider === 'greenapi'
    ? new GreenApiWhatsApp(settings)
    : new CallMeBotWhatsApp(settings);
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
    mailer: config.smtp ? new SmtpMailer(config.smtp) : undefined,
    ownerWhatsApp: ownerWhatsAppSender(config.ownerWhatsApp),
    eventSink: config.eventsWebhook ? new WebhookEventSink(config.eventsWebhook) : undefined,
    orderSheet: config.sheets ? new GoogleSheetsLog(config.sheets) : undefined,
    topupProvider: config.topup ? new UniPinTopupProvider(config.topup) : undefined,
    googleClient: config.google ? new HttpGoogleClient(config.google) : undefined,
    socialClients: {
      ...(config.social.facebook ? { facebook: new FacebookClient(config.social.facebook) } : {}),
    },
  });
  logRef.current = built.app.log;
  if (!database)
    built.app.log.warn('DATABASE_URL no configurada: /api/ready y la tienda responderán 503.');
  if (config.google) {
    // Forma de las credenciales de Google, sin sus valores: detecta un pegado incompleto.
    const { clientId, clientSecret } = config.google;
    built.app.log.info(
      {
        idValido: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId),
        secretoGocspx: clientSecret.startsWith('GOCSPX-'),
        largoSecreto: clientSecret.length,
      },
      'google oauth configurado',
    );
  }
  // Qué avisos y automatizaciones están activos (sí/no, nunca sus valores): con entrega manual,
  // el dueño necesita el correo (o el panel abierto) para enterarse de cada pedido pagado.
  built.app.log.info(
    {
      correo: Boolean(config.smtp),
      // Solo el nombre del servicio (greenapi o callmebot), nunca el número, el id ni el token.
      whatsappDueno: config.ownerWhatsApp?.provider ?? false,
      whatsappTopePorHora: config.ownerWhatsAppMaxPerHour,
      eventosExternos: Boolean(config.eventsWebhook),
      hojaGoogle: Boolean(config.sheets),
      cronExterno: Boolean(config.cronSecret),
      plazoEntrega: Boolean(config.legal.deliveryTime),
    },
    'avisos y automatización',
  );
  // Métodos de pago, cada uno por su lado (sí/no, nunca valores ni credenciales).
  built.app.log.info(
    {
      mercadoPago: config.flags.paymentsEnabled && Boolean(config.mercadoPago),
      nequiTransferencia: Boolean(config.nequi.manual),
      nequiPush: false,
    },
    'métodos de pago',
  );
  if (config.sheets) {
    // La cuenta de servicio no es un secreto: es la que debe tener la hoja compartida como Editor.
    built.app.log.info({ cuentaDeServicio: config.sheets.clientEmail }, 'hoja de Google conectada');
  } else if (config.sheetsProblem) {
    built.app.log.warn(
      { problema: config.sheetsProblem },
      'Hoja de Google apagada (la tienda y los pagos no se ven afectados)',
    );
  }
  if (config.nequi.problem) {
    built.app.log.warn(
      { problema: config.nequi.problem },
      'Nequi por transferencia queda apagado (Mercado Pago no se ve afectado)',
    );
  }
  if (config.topup) {
    // Qué cubre la recarga directa, sin credenciales.
    const { catalog, env } = config.topup;
    built.app.log.info(
      {
        entorno: env,
        servidores: Object.keys(catalog),
        paquetes: Object.values(catalog).reduce(
          (n, region) => n + Object.keys(region.skus).length,
          0,
        ),
      },
      'recarga directa UniPin configurada',
    );
  }
  if (config.secrets.ephemeral) {
    built.app.log.warn(
      'Claves efímeras (ORDER_TOKEN_KEYS/MFA_ENCRYPTION_KEYS/IP_HASH_PEPPER): solo para desarrollo.',
    );
  }
  return { ...built, database };
}
