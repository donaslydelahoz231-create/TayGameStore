import type { PromoSchedule } from '../domain/pricing.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * Configuración del servidor, validada al arrancar.
 * Los secretos solo llegan por variables de entorno; nunca se registran sus valores.
 */

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const trustProxySchema = z
  .string()
  .default('false')
  .transform((value, ctx): boolean | number => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d{1,2}$/.test(value)) return Number(value);
    ctx.addIssue({
      code: 'custom',
      message: 'debe ser "true", "false" o el número de proxies de confianza',
    });
    return z.NEVER;
  });

/** Llavero versionado: "2:secretoNuevo,1:secretoAnterior". La primera entrada es la activa. */
export interface Keyring {
  activeVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

function keyringSchema(minBytes: number) {
  return z
    .string()
    .optional()
    .transform((value, ctx): Keyring | undefined => {
      if (value === undefined) return undefined;
      const keys = new Map<number, Buffer>();
      let activeVersion: number | undefined;
      for (const entry of value.split(',')) {
        const match = /^(\d{1,4}):([A-Za-z0-9+/=_-]+)$/.exec(entry.trim());
        const version = match ? Number(match[1]) : NaN;
        const key = match?.[2] ? Buffer.from(match[2], 'base64') : undefined;
        if (!key || key.length < minBytes || keys.has(version)) {
          ctx.addIssue({
            code: 'custom',
            message: `formato "versión:claveBase64" (mín. ${minBytes} bytes, versiones únicas)`,
          });
          return z.NEVER;
        }
        keys.set(version, key);
        activeVersion ??= version;
      }
      if (activeVersion === undefined) {
        ctx.addIssue({ code: 'custom', message: 'no contiene claves' });
        return z.NEVER;
      }
      return { activeVersion, keys };
    });
}

const emailList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()));

/** Texto de una línea para las páginas legales: sin saltos ni caracteres de control. */
const legalText = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u, 'una sola línea, sin caracteres de control')
    .optional();

const minutes = (fallback: number, max = 60 * 24 * 30) =>
  z.coerce.number().int().min(1).max(max).default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_PRETTY: z.stringbool().optional(),
    PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * Llaves de acceso (WebAuthn). Por defecto: dominio y origen de PUBLIC_BASE_URL. Solo hace
     * falta fijarlas cuando la tienda se sirve en otra dirección (pruebas locales).
     */
    PASSKEY_RP_ID: z
      .string()
      .regex(/^[a-z0-9.-]{1,253}$/)
      .optional(),
    PASSKEY_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
    TRUST_PROXY: trustProxySchema,
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Peticiones por minuto y por IP en cualquier ruta (las sensibles tienen su propio límite). */
    RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().min(60).max(100_000).default(600),
    SERVE_WEB: z.stringbool().optional(),
    WEB_DIST_DIR: z.string().min(1).default('dist/web'),

    MAINTENANCE_MODE: z.stringbool().default(false),
    CHECKOUT_ENABLED: z.stringbool().default(false),
    PAYMENTS_ENABLED: z.stringbool().default(false),
    FULFILLMENT_ENABLED: z.stringbool().default(true),
    FULFILLMENT_MODE: z.enum(['manual']).default('manual'),
    JOBS_ENABLED: z.stringbool().optional(),

    ORDER_TOKEN_KEYS: keyringSchema(32),
    MFA_ENCRYPTION_KEYS: keyringSchema(32),
    IP_HASH_PEPPER: z.string().min(32).optional(),

    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24 * 7),
    SESSION_IDLE_MINUTES: minutes(60 * 24),
    ADMIN_SESSION_TTL_MINUTES: minutes(120, 60 * 12),

    GOOGLE_CLIENT_ID: z.string().min(10).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
    /** Login de clientes con Discord (https://discord.com/developers/applications). */
    DISCORD_CLIENT_ID: z
      .string()
      .regex(/^\d{5,25}$/)
      .optional(),
    DISCORD_CLIENT_SECRET: z.string().min(10).optional(),
    /** Login de clientes con Facebook (https://developers.facebook.com/apps). */
    FACEBOOK_APP_ID: z
      .string()
      .regex(/^\d{5,25}$/)
      .optional(),
    FACEBOOK_APP_SECRET: z.string().min(10).optional(),
    /** Versión de la Graph API (Meta publica una nueva varias veces al año). */
    FACEBOOK_GRAPH_VERSION: z
      .string()
      .regex(/^v\d{1,3}\.\d$/)
      .default('v25.0'),
    ADMIN_EMAILS: emailList,
    /**
     * Dirección secreta del panel (p. ej. /gestion-k7Q2x9LmP4vR). /admin.html responde 404 y el
     * panel no se enlaza desde ningún sitio público. Obligatoria en producción con ADMIN_EMAILS.
     */
    ADMIN_PATH: z
      .string()
      .regex(/^\/[A-Za-z0-9_-]{12,64}$/, '"/" seguido de 12 a 64 letras, números, "-" o "_"')
      .optional(),
    /**
     * Frase de activación (solo la conoce el dueño) para registrar la PRIMERA huella o llave de
     * administrador en el panel. Cuando ya hay una registrada deja de servir.
     */
    ADMIN_SETUP_CODE: z.string().min(20).max(200).optional(),

    MP_ACCESS_TOKEN: z.string().min(10).optional(),
    MP_WEBHOOK_SECRET: z.string().min(10).optional(),
    MP_STATEMENT_DESCRIPTOR: z
      .string()
      .regex(/^[A-Za-z0-9 ]{1,22}$/)
      .optional(),
    MP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
    /**
     * Cuenta de Mercado Pago declarada: `sandbox` (cuenta vendedora de prueba) o `production`.
     * Las credenciales de prueba también empiezan por APP_USR, así que no se puede deducir del
     * token: se declara y el servidor la contrasta con `live_mode` de cada pago.
     */
    MP_MODE: z.enum(['sandbox', 'production']).optional(),

    VERIFICATION_TTL_MINUTES: minutes(60 * 12),
    PAYMENT_TTL_MINUTES: minutes(60, 60 * 24),
    CLAIM_TIMEOUT_MINUTES: minutes(30, 60 * 24),
    LIMIT_MAX_UNITS_PER_PRODUCT: z.coerce.number().int().min(1).max(5).default(5),
    LIMIT_MAX_ORDER_TOTAL_COP: z.coerce.number().int().min(1).max(1_000_000).default(1_000_000),
    LIMIT_MAX_OPEN_ORDERS_PER_EMAIL: z.coerce.number().int().min(1).max(50).default(3),
    LIMIT_MAX_OPEN_ORDERS_PER_UID: z.coerce.number().int().min(1).max(50).default(3),

    TERMS_VERSION: z.string().min(1).max(40).default('2026-10-05'),
    /** Precio promocional: `weekends` (sábado y domingo, hora de Colombia) o `always`. */
    PROMO_SCHEDULE: z.enum(['always', 'weekends']).default('weekends'),
    /**
     * Sin proveedor de consulta de ID: `customer` (el cliente escribe su ID dos veces, lo
     * confirma y paga al instante, como en LootBar) u `operator` (el equipo verifica el
     * nickname antes de que el cliente pueda pagar).
     */
    PLAYER_VERIFICATION: z.enum(['customer', 'operator']).default('customer'),
    /**
     * Entrega automática con el inventario: al aprobarse el pago, si hay PIN para todas las
     * unidades, el pedido queda entregado y el cliente ve sus PIN (pedido y correo) para
     * canjearlos en el sitio oficial (pagostore.com). Si falta alguno, se entrega a mano.
     */
    PIN_AUTO_DELIVERY: z.stringbool().default(false),
    SUPPORT_WHATSAPP: z
      .string()
      .regex(/^\+?\d{8,15}$/)
      .optional(),
    SUPPORT_EMAIL: z.email().optional(),

    /**
     * Datos del vendedor para términos y privacidad. El dueño los escribe en el hosting (no en
     * el repositorio ni en un chat); el servidor los pone en las páginas al servirlas.
     */
    LEGAL_NAME: legalText(120),
    LEGAL_ID: legalText(40),
    LEGAL_ADDRESS: legalText(160),
    LEGAL_DELIVERY_TIME: legalText(160),
    LEGAL_REFUND_TIME: legalText(160),
    LEGAL_RESPONSE_TIME: legalText(160),
    LEGAL_TAX_NOTE: legalText(200),
    LEGAL_RETENTION: legalText(160),

    /** Aviso al dueño por Telegram cuando un pedido queda pagado (opcional). */
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/, 'formato de token de @BotFather')
      .optional(),
    /**
     * Correo por SMTP (opcional): avisos al cliente (pago confirmado, entrega, reembolso) y al
     * dueño. Gmail: smtp.gmail.com, puerto 465 y una contraseña de aplicación de la cuenta.
     */
    SMTP_HOST: z
      .string()
      .regex(/^[A-Za-z0-9.-]{3,253}$/, 'nombre de servidor, p. ej. smtp.gmail.com')
      .optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_USER: z.string().min(3).max(320).optional(),
    SMTP_PASS: z.string().min(8).max(200).optional(),
    MAIL_FROM: z.email().optional(),
    MAIL_FROM_NAME: z
      .string()
      .regex(/^[\p{L}\p{N} .·-]{1,60}$/u, 'solo letras, números, espacios y . · -')
      .default('TayGameStore'),
    /**
     * Llave de /api/internal/jobs (Vercel Cron y el flujo de GitHub `tareas.yml`). Aleatoria,
     * de al menos 32 caracteres; el mismo valor en el hosting y en los secretos de GitHub.
     */
    CRON_SECRET: z.string().min(32).max(256).optional(),
    /**
     * Eventos de pedidos (pagado, entregado, reembolsado) hacia una automatización del dueño,
     * p. ej. el Webhook de un flujo de n8n. La llave va como `Authorization: Bearer` y en n8n
     * como credencial "Header Auth". Opcionales; van juntas.
     */
    EVENTS_WEBHOOK_URL: z.url().max(500).optional(),
    EVENTS_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
    TELEGRAM_CHAT_ID: z
      .string()
      .regex(/^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/, 'id numérico del chat o @canal')
      .optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (Boolean(env.DISCORD_CLIENT_ID) !== Boolean(env.DISCORD_CLIENT_SECRET)) {
      issue('DISCORD_CLIENT_SECRET', 'DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET van juntos');
    }
    if (Boolean(env.FACEBOOK_APP_ID) !== Boolean(env.FACEBOOK_APP_SECRET)) {
      issue('FACEBOOK_APP_SECRET', 'FACEBOOK_APP_ID y FACEBOOK_APP_SECRET van juntos');
    }
    const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS];
    if (smtp.some(Boolean) && !smtp.every(Boolean)) {
      issue('SMTP_HOST', 'SMTP_HOST, SMTP_USER y SMTP_PASS van juntos');
    }
    if (env.SMTP_HOST && !env.MAIL_FROM && !z.email().safeParse(env.SMTP_USER).success) {
      issue('MAIL_FROM', 'obligatoria si SMTP_USER no es una dirección de correo');
    }
    if (Boolean(env.TELEGRAM_BOT_TOKEN) !== Boolean(env.TELEGRAM_CHAT_ID)) {
      issue('TELEGRAM_CHAT_ID', 'TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID van juntos');
    }
    if (Boolean(env.EVENTS_WEBHOOK_URL) !== Boolean(env.EVENTS_WEBHOOK_SECRET)) {
      issue('EVENTS_WEBHOOK_SECRET', 'EVENTS_WEBHOOK_URL y EVENTS_WEBHOOK_SECRET van juntas');
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      issue('GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET van juntos');
    }
    // El dueño entra con Google o con su huella/llave (WebAuthn, que exige dirección pública).
    if (
      env.ADMIN_EMAILS.length &&
      !env.GOOGLE_CLIENT_ID &&
      !env.PUBLIC_BASE_URL &&
      !env.PASSKEY_ORIGIN
    ) {
      issue(
        'ADMIN_EMAILS',
        'el acceso de administración requiere Google OAuth o PUBLIC_BASE_URL (huella/llave)',
      );
    }
    if (env.PAYMENTS_ENABLED) {
      if (!env.MP_ACCESS_TOKEN) issue('MP_ACCESS_TOKEN', 'obligatoria con PAYMENTS_ENABLED');
      if (!env.MP_WEBHOOK_SECRET) issue('MP_WEBHOOK_SECRET', 'obligatoria con PAYMENTS_ENABLED');
      if (!env.PUBLIC_BASE_URL) issue('PUBLIC_BASE_URL', 'obligatoria con PAYMENTS_ENABLED');
      if (!env.MP_MODE) issue('MP_MODE', 'obligatoria con PAYMENTS_ENABLED (sandbox o production)');
    }

    if (env.NODE_ENV !== 'production') return;
    if (!env.PUBLIC_BASE_URL) {
      issue('PUBLIC_BASE_URL', 'obligatoria en producción');
    } else if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
      issue('PUBLIC_BASE_URL', 'debe usar https en producción');
    }
    if (!env.DATABASE_URL) issue('DATABASE_URL', 'obligatoria en producción');
    if (!env.ORDER_TOKEN_KEYS) issue('ORDER_TOKEN_KEYS', 'obligatoria en producción');
    if (env.ADMIN_EMAILS.length && !env.ADMIN_PATH) {
      issue('ADMIN_PATH', 'obligatoria en producción: dirección secreta del panel');
    }
    if (!env.IP_HASH_PEPPER) issue('IP_HASH_PEPPER', 'obligatoria en producción');
    // Nunca credenciales de correo sin cifrar: 465 (TLS) o 587 (STARTTLS obligatorio).
    if (env.SMTP_HOST && env.SMTP_PORT !== 465 && env.SMTP_PORT !== 587) {
      issue('SMTP_PORT', 'en producción debe ser 465 (TLS) o 587 (STARTTLS)');
    }
    // La llave del webhook de eventos nunca viaja sin cifrar.
    if (env.EVENTS_WEBHOOK_URL && !env.EVENTS_WEBHOOK_URL.startsWith('https://')) {
      issue('EVENTS_WEBHOOK_URL', 'debe usar https en producción');
    }
    if (env.GOOGLE_CLIENT_ID && !env.MFA_ENCRYPTION_KEYS) {
      issue('MFA_ENCRYPTION_KEYS', 'obligatoria en producción cuando hay acceso con Google');
    }
    // No se aceptan órdenes que no se puedan pagar.
    if (env.CHECKOUT_ENABLED && !env.PAYMENTS_ENABLED) {
      issue('CHECKOUT_ENABLED', 'en producción requiere PAYMENTS_ENABLED=true (Mercado Pago)');
    }
  });

/** Nombres de todas las variables que entiende el servidor (para validar el Blueprint). */
export const ENV_VARIABLES: readonly string[] = Object.keys(envSchema.shape);

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface FeatureFlags {
  maintenanceMode: boolean;
  checkoutEnabled: boolean;
  paymentsEnabled: boolean;
  fulfillmentEnabled: boolean;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: LogLevel;
  logPretty: boolean;
  publicBaseUrl: string | undefined;
  /** Llaves de acceso: dominio (RP ID) y origen exacto aceptado. Sin ellos, no se ofrecen. */
  passkey: { rpId: string; origin: string } | undefined;
  /** Las cookies llevan prefijo `__Host-` y `Secure` solo con un origen https. */
  secureCookies: boolean;
  trustProxy: boolean | number;
  databaseUrl: string | undefined;
  databasePoolMax: number;
  rateLimitGlobalPerMinute: number;
  serveWeb: boolean;
  webDistDir: string;
  jobsEnabled: boolean;
  flags: FeatureFlags;
  fulfillmentMode: 'manual';
  secrets: {
    orderTokenKeys: Keyring;
    mfaKeys: Keyring;
    ipHashPepper: string;
    /** true si alguna clave se generó al arrancar (solo fuera de producción). */
    ephemeral: boolean;
  };
  sessions: { ttlHours: number; idleMinutes: number; adminTtlMinutes: number };
  google: { clientId: string; clientSecret: string } | undefined;
  social: {
    discord: { clientId: string; clientSecret: string } | undefined;
    facebook: { clientId: string; clientSecret: string; graphVersion: string } | undefined;
  };
  adminEmails: readonly string[];
  /** Ruta del panel. Sin ADMIN_PATH (desarrollo y pruebas) es /admin.html. */
  adminPath: string;
  adminSetupCode: string | undefined;
  mercadoPago:
    | {
        accessToken: string;
        webhookSecret: string;
        statementDescriptor: string | undefined;
        timeoutMs: number;
        /** `production` solo acepta pagos reales (`live_mode: true`); `sandbox`, solo de prueba. */
        mode: 'sandbox' | 'production';
      }
    | undefined;
  orders: {
    verificationTtlMinutes: number;
    paymentTtlMinutes: number;
    claimTimeoutMinutes: number;
    maxUnitsPerProduct: number;
    maxOrderTotalCop: number;
    maxOpenOrdersPerEmail: number;
    maxOpenOrdersPerUid: number;
    termsVersion: string;
    playerVerification: 'customer' | 'operator';
    pinAutoDelivery: boolean;
  };
  support: { whatsapp: string | undefined; email: string | undefined };
  promoSchedule: PromoSchedule;
  legal: {
    name?: string;
    id?: string;
    address?: string;
    deliveryTime?: string;
    refundTime?: string;
    responseTime?: string;
    taxNote?: string;
    retention?: string;
  };
  /** Avisos al dueño (pedido pagado). Sin canal configurado, solo el panel avisa. */
  ownerNotify: { telegram: { botToken: string; chatId: string } | undefined };
  /** Eventos de pedidos hacia una automatización externa (n8n). */
  eventsWebhook: { url: string; secret: string } | undefined;
  /** Llave de /api/internal/jobs; sin ella la ruta no existe. */
  cronSecret: string | undefined;
  /** Correo saliente por SMTP. Sin él no se envían correos (el panel sigue avisando). */
  smtp:
    | {
        host: string;
        port: number;
        user: string;
        pass: string;
        fromAddress: string;
        fromName: string;
      }
    | undefined;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Trata las variables vacías (p. ej. copiadas de .env.example) como no definidas. */
/**
 * WebAuthn exige un dominio (no una IP) y que el origen sea ese dominio o un subdominio suyo.
 */
function passkeyConfig(
  rpIdOverride: string | undefined,
  originUrl: string | undefined,
): { rpId: string; origin: string } | undefined {
  if (!originUrl) return undefined;
  const url = new URL(originUrl);
  const rpId = rpIdOverride ?? url.hostname;
  const isIp = /^[\d.]+$/.test(rpId) || rpId.includes(':');
  const matches = url.hostname === rpId || url.hostname.endsWith(`.${rpId}`);
  return isIp || !matches ? undefined : { rpId, origin: url.origin };
}

function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') result[key] = value.trim();
  }
  return result;
}

function ephemeralKeyring(): Keyring {
  return { activeVersion: 1, keys: new Map([[1, randomBytes(32)]]) };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(withoutEmptyValues(source));
  if (!parsed.success) {
    // Solo ruta + mensaje: nunca el valor recibido (podría ser un secreto).
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`),
    );
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const ephemeral = !env.ORDER_TOKEN_KEYS || !env.MFA_ENCRYPTION_KEYS || !env.IP_HASH_PEPPER;
  return {
    env: env.NODE_ENV,
    host: env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY ?? env.NODE_ENV === 'development',
    publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/+$/, ''),
    passkey: passkeyConfig(env.PASSKEY_RP_ID, env.PASSKEY_ORIGIN ?? env.PUBLIC_BASE_URL),
    secureCookies: env.PUBLIC_BASE_URL?.startsWith('https://') ?? false,
    trustProxy: env.TRUST_PROXY,
    databaseUrl: env.DATABASE_URL,
    databasePoolMax: env.DATABASE_POOL_MAX,
    rateLimitGlobalPerMinute: env.RATE_LIMIT_GLOBAL_PER_MINUTE,
    serveWeb: env.SERVE_WEB ?? isProduction,
    webDistDir: env.WEB_DIST_DIR,
    jobsEnabled: env.JOBS_ENABLED ?? env.NODE_ENV !== 'test',
    flags: {
      maintenanceMode: env.MAINTENANCE_MODE,
      checkoutEnabled: env.CHECKOUT_ENABLED,
      paymentsEnabled: env.PAYMENTS_ENABLED,
      fulfillmentEnabled: env.FULFILLMENT_ENABLED,
    },
    fulfillmentMode: env.FULFILLMENT_MODE,
    secrets: {
      // Fuera de producción se generan claves efímeras: los tokens dejan de valer al reiniciar.
      orderTokenKeys: env.ORDER_TOKEN_KEYS ?? ephemeralKeyring(),
      mfaKeys: env.MFA_ENCRYPTION_KEYS ?? ephemeralKeyring(),
      ipHashPepper: env.IP_HASH_PEPPER ?? randomBytes(32).toString('base64'),
      ephemeral,
    },
    sessions: {
      ttlHours: env.SESSION_TTL_HOURS,
      idleMinutes: env.SESSION_IDLE_MINUTES,
      adminTtlMinutes: env.ADMIN_SESSION_TTL_MINUTES,
    },
    social: {
      discord:
        env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
          ? { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET }
          : undefined,
      facebook:
        env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET
          ? {
              clientId: env.FACEBOOK_APP_ID,
              clientSecret: env.FACEBOOK_APP_SECRET,
              graphVersion: env.FACEBOOK_GRAPH_VERSION,
            }
          : undefined,
    },
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    adminEmails: env.ADMIN_EMAILS,
    adminPath: env.ADMIN_PATH ?? '/admin.html',
    adminSetupCode: env.ADMIN_SETUP_CODE,
    mercadoPago:
      env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET
        ? {
            accessToken: env.MP_ACCESS_TOKEN,
            webhookSecret: env.MP_WEBHOOK_SECRET,
            statementDescriptor: env.MP_STATEMENT_DESCRIPTOR,
            timeoutMs: env.MP_TIMEOUT_MS,
            mode: env.MP_MODE ?? 'sandbox',
          }
        : undefined,
    orders: {
      verificationTtlMinutes: env.VERIFICATION_TTL_MINUTES,
      paymentTtlMinutes: env.PAYMENT_TTL_MINUTES,
      claimTimeoutMinutes: env.CLAIM_TIMEOUT_MINUTES,
      maxUnitsPerProduct: env.LIMIT_MAX_UNITS_PER_PRODUCT,
      maxOrderTotalCop: env.LIMIT_MAX_ORDER_TOTAL_COP,
      maxOpenOrdersPerEmail: env.LIMIT_MAX_OPEN_ORDERS_PER_EMAIL,
      maxOpenOrdersPerUid: env.LIMIT_MAX_OPEN_ORDERS_PER_UID,
      termsVersion: env.TERMS_VERSION,
      playerVerification: env.PLAYER_VERIFICATION,
      pinAutoDelivery: env.PIN_AUTO_DELIVERY,
    },
    support: { whatsapp: env.SUPPORT_WHATSAPP?.replace(/\D/g, ''), email: env.SUPPORT_EMAIL },
    promoSchedule: env.PROMO_SCHEDULE,
    legal: {
      name: env.LEGAL_NAME,
      id: env.LEGAL_ID,
      address: env.LEGAL_ADDRESS,
      deliveryTime: env.LEGAL_DELIVERY_TIME,
      refundTime: env.LEGAL_REFUND_TIME,
      responseTime: env.LEGAL_RESPONSE_TIME,
      taxNote: env.LEGAL_TAX_NOTE,
      retention: env.LEGAL_RETENTION,
    },
    ownerNotify: {
      telegram:
        env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
          ? { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID }
          : undefined,
    },
    cronSecret: env.CRON_SECRET,
    eventsWebhook:
      env.EVENTS_WEBHOOK_URL && env.EVENTS_WEBHOOK_SECRET
        ? { url: env.EVENTS_WEBHOOK_URL, secret: env.EVENTS_WEBHOOK_SECRET }
        : undefined,
    smtp:
      env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
        ? {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
            fromAddress: env.MAIL_FROM ?? env.SMTP_USER,
            fromName: env.MAIL_FROM_NAME,
          }
        : undefined,
  };
}
