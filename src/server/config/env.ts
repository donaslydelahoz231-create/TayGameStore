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

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    LOG_PRETTY: z.stringbool().optional(),
    PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    TRUST_PROXY: trustProxySchema,
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    SERVE_WEB: z.stringbool().optional(),
    WEB_DIST_DIR: z.string().min(1).default('dist/web'),
    MAINTENANCE_MODE: z.stringbool().default(false),
    CHECKOUT_ENABLED: z.stringbool().default(false),
    PAYMENTS_ENABLED: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    // Los pagos no están implementados (Wompi BLOQUEADO hasta verificar documentación oficial).
    if (env.PAYMENTS_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENTS_ENABLED'],
        message: 'los pagos no están implementados; debe ser false',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'obligatoria en producción',
      });
    } else if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'debe usar https en producción',
      });
    }
    if (!env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'obligatoria en producción',
      });
    }
    // Ventas reales bloqueadas mientras C1 (verificación de jugador) y Wompi sigan bloqueados.
    if (env.CHECKOUT_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['CHECKOUT_ENABLED'],
        message: 'las ventas reales están bloqueadas (verificación de jugador y pagos pendientes)',
      });
    }
  });

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface FeatureFlags {
  maintenanceMode: boolean;
  checkoutEnabled: boolean;
  paymentsEnabled: boolean;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: LogLevel;
  logPretty: boolean;
  publicBaseUrl: string | undefined;
  trustProxy: boolean | number;
  databaseUrl: string | undefined;
  databasePoolMax: number;
  serveWeb: boolean;
  webDistDir: string;
  flags: FeatureFlags;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Trata las variables vacías (p. ej. copiadas de .env.example) como no definidas. */
function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') result[key] = value.trim();
  }
  return result;
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
  return {
    env: env.NODE_ENV,
    host: env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY ?? env.NODE_ENV === 'development',
    publicBaseUrl: env.PUBLIC_BASE_URL,
    trustProxy: env.TRUST_PROXY,
    databaseUrl: env.DATABASE_URL,
    databasePoolMax: env.DATABASE_POOL_MAX,
    serveWeb: env.SERVE_WEB ?? isProduction,
    webDistDir: env.WEB_DIST_DIR,
    flags: {
      maintenanceMode: env.MAINTENANCE_MODE,
      checkoutEnabled: env.CHECKOUT_ENABLED,
      paymentsEnabled: env.PAYMENTS_ENABLED,
    },
  };
}
