import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isProbePath, type AbuseShield, type StrikeKind } from '../services/shield.js';
import { AppError } from './errors.js';

/** Nunca se bloquean: Mercado Pago (firma propia) y las sondas de salud del hosting. */
const EXEMPT_PREFIXES = ['/api/webhooks/', '/api/health', '/api/ready'];

function isExemptPath(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0] ?? '';
  return EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isExempt(request: FastifyRequest): boolean {
  if (isExemptPath(request)) return true;
  // Un administrador con MFA nunca se queda fuera de su propio panel (podría desbloquearse).
  const session = request.auth.session;
  return Boolean(session?.isAdmin && session.mfaVerified);
}

/**
 * Engancha el escudo anti-abuso al ciclo de cada petición. Debe registrarse después del
 * contexto de la petición (necesita `request.auth.ipHash` y la sesión).
 */
export function registerShield(app: FastifyInstance, shield: AbuseShield): void {
  const strike = async (request: FastifyRequest, kind: StrikeKind) => {
    // Sin contexto (otro hook rechazó la petición antes, p. ej. mantenimiento): sin huella.
    if (!request.auth || isExempt(request)) return;
    try {
      await shield.strike(request.auth.ipHash, kind, { path: request.url });
    } catch (error) {
      request.log.error({ err: error }, 'escudo: no se pudo registrar la señal');
    }
  };

  // Contención: una huella bloqueada no llega a ninguna ruta (tampoco a los estáticos).
  app.addHook('onRequest', async (request) => {
    // Las rutas exentas no consultan la lista: la sonda de salud cada pocos minutos despertaría
    // la base de datos (Neon cobra por tiempo encendido) sin que el resultado cambie nada.
    if (isExemptPath(request)) return;
    try {
      await shield.refresh();
    } catch (error) {
      request.log.error({ err: error }, 'escudo: no se pudieron recargar los bloqueos');
    }
    if (request.auth && !isExempt(request) && shield.isBlocked(request.auth.ipHash)) {
      throw new AppError('BLOCKED', 403, 'Acceso restringido temporalmente.');
    }
  });

  // Señales que se conocen por el código de error.
  app.addHook('onError', async (request, _reply, error) => {
    if (!(error instanceof AppError)) return;
    if (error.code === 'CSRF_REJECTED') void strike(request, 'csrf');
    if (error.code === 'MFA_INVALID') void strike(request, 'mfa_failed');
  });

  // Señales que se conocen por la respuesta (ya enviada: no retrasan al cliente).
  app.addHook('onResponse', async (request, reply) => {
    const status = reply.statusCode;
    if (status === 429) return strike(request, 'rate_limited');
    if (status !== 404) return;
    if (isProbePath(request.url)) return strike(request, 'probe');
    // 404 en la API: enumeración de pedidos o recursos (el 404 es uniforme a propósito).
    if (request.url.startsWith('/api/')) return strike(request, 'not_found');
  });
}
