import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Rutas autenticadas por firma del proveedor en lugar de CSRF. */
const CSRF_EXEMPT_ROUTE_PREFIXES = ['/api/webhooks/'];
export const CSRF_HEADER = 'x-tgs-csrf';

export function cookieName(config: AppConfig, base: string): string {
  // `__Host-` exige Secure, sin Domain y Path=/: solo con un origen https.
  return config.secureCookies ? `__Host-${base}` : base;
}

export function setCookie(
  config: AppConfig,
  reply: FastifyReply,
  base: string,
  value: string,
  maxAgeSeconds: number,
): void {
  reply.setCookie(cookieName(config, base), value, {
    path: '/',
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
  });
}

export function clearCookie(config: AppConfig, reply: FastifyReply, base: string): void {
  reply.clearCookie(cookieName(config, base), {
    path: '/',
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
  });
}

export function readCookie(
  config: AppConfig,
  request: FastifyRequest,
  base: string,
): string | undefined {
  const value = request.cookies[cookieName(config, base)];
  return value && value.length <= 200 ? value : undefined;
}

function expectedOrigin(config: AppConfig, request: FastifyRequest): string {
  if (config.publicBaseUrl) return new URL(config.publicBaseUrl).origin;
  return `${request.protocol}://${request.host}`;
}

/**
 * CSRF para peticiones que modifican estado: cabecera personalizada obligatoria (un formulario
 * de otro sitio no puede añadirla sin CORS) + Origin y Sec-Fetch-Site del mismo origen.
 */
function assertSameOriginWrite(config: AppConfig, request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  const route = request.routeOptions.url;
  if (route && CSRF_EXEMPT_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))) return;
  const reject = () =>
    new AppError('CSRF_REJECTED', 403, 'Solicitud rechazada por seguridad. Recarga la página.');
  if (request.headers[CSRF_HEADER] !== '1') throw reject();
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== expectedOrigin(config, request)) throw reject();
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') throw reject();
}

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    // Fuentes de Google: hoja de estilos y archivos de fuente. Sin scripts de terceros:
    // el pago con Mercado Pago es una redirección de página completa (Checkout Pro).
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' solo para estilos: el marcado heredado usa atributos style.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        ...(config.secureCookies ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: config.secureCookies
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  });
  // En memoria del proceso: válido para UNA instancia. Con varias instancias hace falta un
  // almacén compartido (ver docs/PLAN-ARQUITECTURA.md).
  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new AppError(
        'RATE_LIMITED',
        429,
        `Demasiadas solicitudes. Espera ${Math.ceil(context.ttl / 1000)} s.`,
      ),
  });
  app.addHook('preHandler', async (request) => assertSameOriginWrite(config, request));
}

/** Límites por ruta (por IP). */
export const RATE_LIMITS = {
  checkout: { max: 10, timeWindow: '10 minutes' },
  pay: { max: 20, timeWindow: '10 minutes' },
  orderRead: { max: 120, timeWindow: '1 minute' },
  orderWrite: { max: 30, timeWindow: '10 minutes' },
  auth: { max: 20, timeWindow: '10 minutes' },
  mfa: { max: 10, timeWindow: '10 minutes' },
  webhook: { max: 600, timeWindow: '1 minute' },
  admin: { max: 300, timeWindow: '1 minute' },
  catalog: { max: 120, timeWindow: '1 minute' },
} as const;
