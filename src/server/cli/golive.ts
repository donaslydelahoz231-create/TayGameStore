import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_PAGES, LEGAL_PLACEHOLDER } from '../app.js';
import { ConfigError, loadConfig } from '../config/env.js';

/**
 * Comprobación antes de vender con dinero real (`npm run golive:check`).
 *
 *   npm run golive:check -- --entorno            variables del servidor (.env o el entorno)
 *   npm run golive:check -- --url https://…      la tienda publicada, desde fuera
 *
 * Solo lee: no crea pedidos, no paga, no escribe en la base de datos y nunca imprime valores de
 * variables (solo sus nombres).
 */

export type Level = 'ok' | 'falta' | 'aviso';
export interface Check {
  level: Level;
  label: string;
}

const ok = (label: string): Check => ({ level: 'ok', label });
const missing = (label: string): Check => ({ level: 'falta', label });
const warn = (label: string): Check => ({ level: 'aviso', label });

export class GoLiveUsageError extends Error {}

export const USAGE = [
  'Uso:',
  '  npm run golive:check -- --entorno          revisa las variables de producción del servidor',
  '  npm run golive:check -- --url <https://…>  revisa la tienda publicada',
].join('\n');

/** Variables de producción (las que tendrá el servidor en el hosting). */
export function checkEnvironment(source: NodeJS.ProcessEnv, webRoot: string): Check[] {
  let config;
  try {
    config = loadConfig(source);
  } catch (error) {
    if (error instanceof ConfigError) {
      return [
        ...error.issues.map((issue) => missing(`Configuración inválida: ${issue}`)),
        warn('Corrige lo anterior y vuelve a ejecutar para revisar el resto'),
      ];
    }
    throw error;
  }
  const checks: Check[] = [];
  const need = (condition: boolean, good: string, bad: string) =>
    checks.push(condition ? ok(good) : missing(bad));

  need(
    config.env === 'production',
    'NODE_ENV=production',
    'NODE_ENV debe ser production (hoy no se exigen las claves ni https)',
  );
  need(
    !config.flags.maintenanceMode,
    'Tienda abierta (MAINTENANCE_MODE apagado)',
    'MAINTENANCE_MODE está activo: la tienda no vende',
  );
  need(
    config.flags.checkoutEnabled && config.flags.paymentsEnabled,
    'Pedidos y pagos activos (CHECKOUT_ENABLED y PAYMENTS_ENABLED)',
    'Activa CHECKOUT_ENABLED=true y PAYMENTS_ENABLED=true',
  );
  need(
    config.mercadoPago?.mode === 'production',
    'Mercado Pago en producción (MP_MODE=production): cobros reales, sin "Modo prueba"',
    'MP_MODE debe ser production: con sandbox los clientes ven "Modo prueba" y no se cobra dinero real',
  );
  if (
    config.mercadoPago?.mode === 'production' &&
    config.mercadoPago.accessToken.startsWith('TEST-')
  ) {
    checks.push(
      missing('MP_ACCESS_TOKEN es una credencial de prueba (TEST-…): usa la de producción'),
    );
  }
  need(
    config.publicBaseUrl?.startsWith('https://') ?? false,
    'PUBLIC_BASE_URL con https (webhook de Mercado Pago y retorno del cliente)',
    'PUBLIC_BASE_URL debe ser la dirección https definitiva de la tienda',
  );
  need(
    Boolean(config.google) && config.adminEmails.length > 0 && config.adminPath !== '/admin.html',
    'Panel del dueño: Google + ADMIN_EMAILS + ADMIN_PATH secreta',
    'Configura GOOGLE_CLIENT_ID/SECRET, ADMIN_EMAILS y ADMIN_PATH para poder entregar pedidos',
  );

  const pending = LEGAL_PAGES.filter((page) => {
    const file = path.join(webRoot, page);
    return !existsSync(file) || readFileSync(file, 'utf8').includes(LEGAL_PLACEHOLDER);
  });
  need(
    pending.length === 0,
    'Términos y privacidad completos',
    `Completa los campos "${LEGAL_PLACEHOLDER}" de: ${pending.join(', ')}`,
  );

  checks.push(
    config.support.whatsapp || config.support.email
      ? ok('Contacto de soporte publicado')
      : warn('Sin SUPPORT_WHATSAPP ni SUPPORT_EMAIL: el cliente no tiene a quién escribir'),
  );
  checks.push(
    config.ownerNotify.telegram
      ? ok('Aviso al celular por Telegram cuando entra un pago')
      : warn(
          'Sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID: solo el panel abierto avisa de pagos nuevos',
        ),
  );
  checks.push(
    warn(
      'Entrega manual: cada pedido pagado se entrega desde el panel (no hay distribuidor ' +
        'autorizado conectado para recargar automáticamente)',
    ),
  );
  return checks;
}

interface Fetched {
  status: number;
  headers: Headers;
  json: unknown;
}

/** La tienda publicada, vista desde fuera como la vería un cliente. */
export async function checkRemote(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<Check[]> {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new GoLiveUsageError(`URL inválida.\n${USAGE}`);
  }
  if (base.protocol !== 'https:') return [missing('La tienda debe publicarse con https')];
  const origin = base.origin;

  const get = async (pathname: string): Promise<Fetched | undefined> => {
    try {
      const res = await fetchImpl(origin + pathname, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: res.status, headers: res.headers, json };
    } catch {
      return undefined;
    }
  };

  const checks: Check[] = [];
  const home = await get('/');
  if (!home) return [missing(`${origin} no responde`)];
  checks.push(
    home.status === 200 ? ok('La tienda carga (/)') : missing(`/ responde ${home.status}`),
  );
  checks.push(
    home.headers.get('content-security-policy') && home.headers.get('strict-transport-security')
      ? ok('Cabeceras de seguridad (CSP y HSTS)')
      : missing('Faltan cabeceras de seguridad (CSP/HSTS): ¿la sirve este servidor?'),
  );

  const ready = await get('/api/ready');
  checks.push(
    ready?.status === 200
      ? ok('Base de datos conectada (/api/ready)')
      : missing(
          `/api/ready no está listo (${ready?.status ?? 'sin respuesta'}): revisa DATABASE_URL`,
        ),
  );

  const config = (await get('/api/config'))?.json as
    | {
        maintenanceMode?: boolean;
        checkoutEnabled?: boolean;
        paymentsEnabled?: boolean;
        paymentsMode?: string | null;
      }
    | undefined;
  if (!config) {
    checks.push(missing('/api/config no responde'));
  } else {
    checks.push(
      config.paymentsEnabled && config.checkoutEnabled && !config.maintenanceMode
        ? ok('Ventas abiertas y pagos activos')
        : missing('La tienda publicada no acepta pedidos o pagos (revisa las variables)'),
    );
    checks.push(
      config.paymentsMode === 'production'
        ? ok('Mercado Pago en producción: cobros reales')
        : missing(
            `Mercado Pago en modo "${config.paymentsMode ?? 'apagado'}": los clientes ven ` +
              '"Modo prueba" y no se cobra dinero real',
          ),
    );
  }

  const catalog = (await get('/api/catalog?game=freefire'))?.json as
    { products?: unknown[] } | undefined;
  const count = catalog?.products?.length ?? 0;
  checks.push(
    count > 0
      ? ok(`Catálogo con ${count} paquete(s) a la venta`)
      : missing('El catálogo está vacío: crea los paquetes y precios en el panel'),
  );

  const legacy = await get('/admin.html');
  checks.push(
    legacy?.status === 404
      ? ok('El panel no está en una dirección pública (/admin.html → 404)')
      : missing('/admin.html responde: configura ADMIN_PATH'),
  );

  // El webhook no se prueba enviando una firma falsa: dejaría una alerta de seguridad real.
  checks.push(
    warn(
      `En Mercado Pago (Tus integraciones → Webhooks, modo productivo) la URL debe ser ` +
        `${origin}/api/webhooks/mercadopago con el evento "Pagos"`,
    ),
  );
  return checks;
}

const MARK: Record<Level, string> = { ok: 'OK    ', falta: 'FALTA ', aviso: 'AVISO ' };

/** Imprime el informe. Devuelve true si no falta nada obligatorio. */
export function report(title: string, checks: readonly Check[], out: (line: string) => void) {
  out(title);
  for (const check of checks) out(`  ${MARK[check.level]}${check.label}`);
  return checks.every((check) => check.level !== 'falta');
}
