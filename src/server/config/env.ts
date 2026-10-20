import type { PromoSchedule } from '../domain/pricing.js';
import { createPrivateKey, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FREE_FIRE_SERVERS, type FreeFireServer } from '../db/schema.js';
import { nequiSettings, type NequiSettings } from './nequi.js';

/** La llave de la cuenta de servicio se puede leer como llave privada (sin mostrarla nunca). */
function isReadablePrivateKey(value: string): boolean {
  try {
    return createPrivateKey(value).type === 'private';
  } catch {
    return false;
  }
}

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

/** Credencial sin espacios ni saltos de línea (en ningún lugar del valor). */
const noSpaces = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().min(10));

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

/**
 * Catálogo del proveedor de recarga directa: por servidor de Free Fire, el código de juego del
 * proveedor y el código de denominación de cada paquete de la tienda. Los códigos los da el
 * proveedor (en UniPin, «Game List» y «Game Details»); no son secretos.
 * Ejemplo: {"latam":{"game":"<game_code>","skus":{"ff-110":{"denomination":"<id>","costCop":3500}}}}
 * `costCop` es lo que el proveedor te cobra por ese paquete (precio de socio, en pesos): con él la
 * tienda garantiza ganancia (MIN_MARGIN_PCT). Se acepta también solo el código ("ff-110":"<id>"),
 * pero entonces la ganancia de ese paquete no está garantizada.
 */
export interface TopupSku {
  denomination: string;
  /** Costo del paquete con el proveedor (COP). null: desconocido. */
  costCop: number | null;
}
export interface TopupRegion {
  game: string;
  /** Nombre del campo del ID de jugador en el proveedor (UniPin, Free Fire: `userid`). */
  uidField: string;
  skus: Readonly<Record<string, TopupSku>>;
}
export type TopupCatalog = Partial<Record<Exclude<FreeFireServer, 'no_seguro'>, TopupRegion>>;

const providerCode = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/, 'código del proveedor');
const topupRegionSchema = z.strictObject({
  game: providerCode,
  uidField: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .default('userid'),
  skus: z.record(
    z.string().regex(/^[a-z0-9-]{2,40}$/, 'SKU de la tienda'),
    z.union([
      providerCode.transform((denomination): TopupSku => ({ denomination, costCop: null })),
      z.strictObject({
        denomination: providerCode,
        costCop: z.number().int().positive().max(1_000_000),
      }),
    ]),
  ),
});
const regionKeys = FREE_FIRE_SERVERS.filter((server) => server !== 'no_seguro');
const topupCatalogSchema = z
  .string()
  .optional()
  .transform((value, ctx): TopupCatalog | undefined => {
    if (value === undefined) return undefined;
    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'JSON inválido' });
      return z.NEVER;
    }
    const parsed = z
      .partialRecord(z.enum(regionKeys as [string, ...string[]]), topupRegionSchema)
      .safeParse(raw);
    if (!parsed.success || !Object.keys(parsed.data).length) {
      ctx.addIssue({
        code: 'custom',
        message: `{"<servidor>":{"game":"…","skus":{"<sku>":"…"}}}; servidores: ${regionKeys.join(', ')}`,
      });
      return z.NEVER;
    }
    return parsed.data;
  });

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
    /**
     * Modo reposo de las tareas: sin visitas a la API ni trabajo pendiente durante estos minutos,
     * las tareas corren solo una vez por ese intervalo para que la base de datos (Neon) pueda
     * suspenderse. 0 lo desactiva (tareas siempre cada 1-2 min).
     */
    JOBS_IDLE_MINUTES: z.coerce.number().int().min(0).max(240).default(30),
    /**
     * Cuánto espera una petición (pago, «Ya transferí», acciones del panel) a que salgan sus
     * avisos (correo, hoja, webhook) antes de responder. Lo que falte sigue en segundo plano y, si
     * el proceso se reinicia, la tarea programada lo reenvía (la cola está en la base). Por
     * defecto 300 ms; en pruebas 30 s, para comprobar los envíos al terminar cada petición.
     */
    NOTIFY_INLINE_WAIT_MS: z.coerce.number().int().min(0).max(30_000).optional(),

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

    // Ni el ID ni el secreto de Google llevan espacios: al pegar desde el celular suele colarse
    // un espacio o salto de línea (también en medio) y Google responde «The OAuth client was not
    // found» (invalid_client). Se quitan todos.
    GOOGLE_CLIENT_ID: noSpaces.optional(),
    GOOGLE_CLIENT_SECRET: noSpaces.optional(),
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
     * Nequi por transferencia, independiente de Mercado Pago (config/nequi.ts). Texto libre a
     * propósito: un valor mal escrito apaga Nequi pero nunca impide arrancar la tienda.
     */
    NEQUI_MANUAL_ENABLED: z.string().max(10).optional(),
    NEQUI_MANUAL_PHONE: z.string().max(20).optional(),
    NEQUI_MANUAL_BREB_KEY: z.string().max(60).optional(),
    NEQUI_MANUAL_HOLDER: z.string().max(80).optional(),
    NEQUI_MANUAL_REVIEW_HOURS: z.string().max(5).optional(),
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
    /**
     * true: solo se vende un paquete si hay PIN libre en el inventario (los demás se muestran
     * «Agotado»). Con PIN_AUTO_DELIVERY, ningún pago queda esperando una entrega manual.
     */
    SELL_ONLY_WITH_STOCK: z.stringbool().default(false),
    /**
     * Política de ganancia: comisión del medio de pago (Mercado Pago, % del precio; verifica la
     * tuya en tu panel de Mercado Pago) y ganancia mínima sobre el costo del proveedor. Con el costo
     * de cada paquete en UNIPIN_CATALOG, ninguna promoción baja de ese piso y un paquete que no deja
     * ganancia no se vende por el proveedor.
     */
    PAYMENT_FEE_PCT: z.coerce.number().min(0).max(20).default(4),
    MIN_MARGIN_PCT: z.coerce.number().min(0).max(100).default(5),
    /**
     * Cargo fijo por pago (pesos) e IVA sobre la comisión (%). Mercado Pago Colombia publica una
     * comisión con cargo fijo más IVA (docs/proveedor-recargas/FINANZAS.md); con 0 se calcula solo
     * con el porcentaje, como antes. Verifica los valores de tu cuenta en el panel de Mercado Pago.
     */
    PAYMENT_FEE_FIXED_COP: z.coerce.number().int().min(0).max(20_000).default(0),
    PAYMENT_FEE_TAX_PCT: z.coerce.number().min(0).max(30).default(0),
    /**
     * true: el catálogo (precios, promociones, paquetes) no se puede cambiar desde el panel, ni
     * siquiera con una sesión de administrador robada. Para cambiar precios, el dueño lo pone en
     * false en Render, hace el cambio y lo vuelve a poner en true.
     */
    CATALOG_LOCKED: z.stringbool().default(false),
    /**
     * Recarga directa al ID con un distribuidor oficial (sin PIN): `none` (apagada) o `unipin`.
     * Con un pago aprobado y el paquete y servidor en UNIPIN_CATALOG, la tienda pide la recarga
     * a UniPin y marca el pedido entregado solo cuando UniPin la confirma.
     */
    TOPUP_PROVIDER: z.enum(['none', 'unipin']).default('none'),
    /** `staging` (dev-api.unipin.com, sin diamantes reales) o `production` (api.unipin.com). */
    UNIPIN_ENV: z.enum(['staging', 'production']).default('staging'),
    UNIPIN_PARTNER_ID: noSpaces.optional(),
    UNIPIN_SECRET_KEY: noSpaces.optional(),
    UNIPIN_CATALOG: topupCatalogSchema,
    UNIPIN_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60_000).default(20_000),
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
    /**
     * Solo los 4 últimos dígitos del documento (requisito del dueño: el número completo nunca se
     * guarda en el servidor). Un valor más largo se rechaza sin repetirlo en el error.
     */
    LEGAL_ID: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'solo los 4 últimos dígitos del documento, nunca el número completo')
      .optional(),
    LEGAL_ADDRESS: legalText(160),
    LEGAL_DELIVERY_TIME: legalText(160),
    LEGAL_REFUND_TIME: legalText(160),
    LEGAL_RESPONSE_TIME: legalText(160),
    LEGAL_TAX_NOTE: legalText(200),
    LEGAL_RETENTION: legalText(160),

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
    /**
     * Apaga el envío de eventos sin tocar la URL ni la llave (p. ej. cuando el dueño dejó n8n).
     * Por defecto encendido: con URL y llave configuradas, se envían.
     */
    EVENTS_WEBHOOK_ENABLED: z.stringbool().default(true),
    /**
     * Registro auxiliar de pedidos en Google Sheets (opcional; nunca es la fuente de verdad).
     * Cuenta de servicio de Google Cloud con la hoja compartida con su correo. Van juntas.
     * La llave es el campo `private_key` del JSON de la cuenta; admite saltos de línea escritos
     * como \n (así queda al pegarla en una sola línea). Se comprueba que sea una llave legible.
     */
    GOOGLE_SHEETS_SPREADSHEET_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{20,100}$/, 'el id que aparece en la URL de la hoja')
      .optional(),
    GOOGLE_SHEETS_CLIENT_EMAIL: z
      .email()
      .refine((value) => value.endsWith('.iam.gserviceaccount.com'), {
        message: 'correo de una cuenta de servicio (…@….iam.gserviceaccount.com)',
      })
      .optional(),
    GOOGLE_SHEETS_PRIVATE_KEY: z
      .string()
      .min(100)
      .max(5000)
      .transform((value) => value.replace(/\\n/g, '\n'))
      .refine(isReadablePrivateKey, { message: 'no es una llave privada legible' })
      .optional(),
    GOOGLE_SHEETS_TAB: z
      .string()
      .regex(/^[\p{L}\p{N} _-]{1,60}$/u, 'nombre de la pestaña: letras, números, espacios, _ y -')
      .default('Pedidos'),
    /** Pestaña con los datos del jugador para entregar (ID, nickname, servidor y región). */
    GOOGLE_SHEETS_DELIVERY_TAB: z
      .string()
      .regex(/^[\p{L}\p{N} _-]{1,60}$/u, 'nombre de la pestaña: letras, números, espacios, _ y -')
      .default('Entregas'),
    /** Pestaña de pagos Nequi por verificar (lo que el cliente debe y lo que avisó). */
    GOOGLE_SHEETS_PENDING_TAB: z
      .string()
      .regex(/^[\p{L}\p{N} _-]{1,60}$/u, 'nombre de la pestaña: letras, números, espacios, _ y -')
      .default('Pagos pendientes'),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

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
    const sheets = [
      env.GOOGLE_SHEETS_SPREADSHEET_ID,
      env.GOOGLE_SHEETS_CLIENT_EMAIL,
      env.GOOGLE_SHEETS_PRIVATE_KEY,
    ];
    if (sheets.some(Boolean) && !sheets.every(Boolean)) {
      issue(
        'GOOGLE_SHEETS_SPREADSHEET_ID',
        'GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL y GOOGLE_SHEETS_PRIVATE_KEY van juntas',
      );
    }
    // Los datos del jugador nunca deben caer en la pestaña «Pedidos», que no lleva datos personales.
    if (env.GOOGLE_SHEETS_TAB.toLowerCase() === env.GOOGLE_SHEETS_DELIVERY_TAB.toLowerCase()) {
      issue('GOOGLE_SHEETS_DELIVERY_TAB', 'debe ser una pestaña distinta de GOOGLE_SHEETS_TAB');
    }
    // Cada pestaña tiene su propio formato: una fila escrita en otra rompería sus columnas.
    const pendingTab = env.GOOGLE_SHEETS_PENDING_TAB.toLowerCase();
    if (
      pendingTab === env.GOOGLE_SHEETS_TAB.toLowerCase() ||
      pendingTab === env.GOOGLE_SHEETS_DELIVERY_TAB.toLowerCase()
    ) {
      issue(
        'GOOGLE_SHEETS_PENDING_TAB',
        'debe ser una pestaña distinta de GOOGLE_SHEETS_TAB y GOOGLE_SHEETS_DELIVERY_TAB',
      );
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
    if (env.TOPUP_PROVIDER === 'unipin') {
      if (!env.UNIPIN_PARTNER_ID)
        issue('UNIPIN_PARTNER_ID', 'obligatoria con TOPUP_PROVIDER=unipin');
      if (!env.UNIPIN_SECRET_KEY)
        issue('UNIPIN_SECRET_KEY', 'obligatoria con TOPUP_PROVIDER=unipin');
      if (!env.UNIPIN_CATALOG) issue('UNIPIN_CATALOG', 'obligatoria con TOPUP_PROVIDER=unipin');
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
    // Una recarga de prueba no entrega diamantes: en producción solo se acepta la real.
    if (env.TOPUP_PROVIDER === 'unipin' && env.UNIPIN_ENV !== 'production') {
      issue('UNIPIN_ENV', 'en producción debe ser production (staging no entrega diamantes)');
    }
    // No se aceptan órdenes que no se puedan pagar: hace falta al menos un método activo, sea
    // Mercado Pago o Nequi por transferencia (ninguno depende del otro).
    if (env.CHECKOUT_ENABLED && !env.PAYMENTS_ENABLED && !nequiSettings(env).manual) {
      issue(
        'CHECKOUT_ENABLED',
        'en producción requiere un método de pago activo: PAYMENTS_ENABLED=true (Mercado Pago) o Nequi por transferencia (NEQUI_MANUAL_*)',
      );
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
  jobsIdleMinutes: number;
  /** Espera máxima de una petición a sus avisos (ver NOTIFY_INLINE_WAIT_MS). */
  notifyInlineWaitMs: number;
  flags: FeatureFlags;
  fulfillmentMode: 'manual';
  /** Catálogo bloqueado: el panel no puede crear ni cambiar paquetes ni precios. */
  catalogLocked: boolean;
  /** Ganancia garantizada: comisión del pago y margen mínimo sobre el costo del proveedor (%). */
  margin: { feePct: number; minMarginPct: number; feeFixedCop: number; feeTaxPct: number };
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
    facebook: { clientId: string; clientSecret: string; graphVersion: string } | undefined;
  };
  adminEmails: readonly string[];
  /** Ruta del panel. Sin ADMIN_PATH (desarrollo y pruebas) es /admin.html. */
  adminPath: string;
  adminSetupCode: string | undefined;
  /** Nequi, con su propia configuración (nunca la de Mercado Pago). */
  nequi: NequiSettings;
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
    sellOnlyWithStock: boolean;
  };
  /** Recarga directa al ID con un distribuidor oficial. Sin ella, la entrega es PIN o manual. */
  topup:
    | {
        provider: 'unipin';
        env: 'staging' | 'production';
        baseUrl: string;
        partnerId: string;
        secretKey: string;
        timeoutMs: number;
        catalog: TopupCatalog;
      }
    | undefined;
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
  /** Eventos de pedidos hacia una automatización externa (n8n). */
  eventsWebhook: { url: string; secret: string } | undefined;
  /** Registro auxiliar en Google Sheets (cuenta de servicio). Sin él no se escribe nada. */
  sheets:
    | {
        spreadsheetId: string;
        clientEmail: string;
        privateKey: string;
        tabs: { orders: string; deliveries: string; pending: string };
      }
    | undefined;
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
    jobsIdleMinutes: env.JOBS_IDLE_MINUTES,
    notifyInlineWaitMs: env.NOTIFY_INLINE_WAIT_MS ?? (env.NODE_ENV === 'test' ? 30_000 : 300),
    flags: {
      maintenanceMode: env.MAINTENANCE_MODE,
      checkoutEnabled: env.CHECKOUT_ENABLED,
      paymentsEnabled: env.PAYMENTS_ENABLED,
      fulfillmentEnabled: env.FULFILLMENT_ENABLED,
    },
    fulfillmentMode: env.FULFILLMENT_MODE,
    catalogLocked: env.CATALOG_LOCKED,
    margin: {
      feePct: env.PAYMENT_FEE_PCT,
      minMarginPct: env.MIN_MARGIN_PCT,
      feeFixedCop: env.PAYMENT_FEE_FIXED_COP,
      feeTaxPct: env.PAYMENT_FEE_TAX_PCT,
    },
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
    nequi: nequiSettings(env),
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
      sellOnlyWithStock: env.SELL_ONLY_WITH_STOCK,
    },
    topup:
      env.TOPUP_PROVIDER === 'unipin' &&
      env.UNIPIN_PARTNER_ID &&
      env.UNIPIN_SECRET_KEY &&
      env.UNIPIN_CATALOG
        ? {
            provider: 'unipin',
            env: env.UNIPIN_ENV,
            // Hosts del SDK oficial de UniPin (UniPinSDK/php, unipin.generate).
            baseUrl:
              env.UNIPIN_ENV === 'production'
                ? 'https://api.unipin.com/'
                : 'https://dev-api.unipin.com/',
            partnerId: env.UNIPIN_PARTNER_ID,
            secretKey: env.UNIPIN_SECRET_KEY,
            timeoutMs: env.UNIPIN_TIMEOUT_MS,
            catalog: env.UNIPIN_CATALOG,
          }
        : undefined,
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
    cronSecret: env.CRON_SECRET,
    sheets:
      env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      env.GOOGLE_SHEETS_CLIENT_EMAIL &&
      env.GOOGLE_SHEETS_PRIVATE_KEY
        ? {
            spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
            clientEmail: env.GOOGLE_SHEETS_CLIENT_EMAIL,
            privateKey: env.GOOGLE_SHEETS_PRIVATE_KEY,
            tabs: {
              orders: env.GOOGLE_SHEETS_TAB,
              deliveries: env.GOOGLE_SHEETS_DELIVERY_TAB,
              pending: env.GOOGLE_SHEETS_PENDING_TAB,
            },
          }
        : undefined,
    eventsWebhook:
      env.EVENTS_WEBHOOK_ENABLED && env.EVENTS_WEBHOOK_URL && env.EVENTS_WEBHOOK_SECRET
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
