import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { FeatureFlags } from '../config/env.js';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rutas que siguen aceptando escrituras en mantenimiento: las notificaciones de
 * pagos en curso no deben perderse. Se compara con el patrón de ruta registrado,
 * no con la URL cruda (que controla el cliente).
 */
const MAINTENANCE_EXEMPT_ROUTE_PREFIXES = ['/api/webhooks/'];

function maintenanceError(): AppError {
  return new AppError(
    'MAINTENANCE_MODE',
    503,
    'La tienda está en mantenimiento. Inténtalo más tarde.',
  );
}

/** En modo mantenimiento solo se permiten lecturas (catálogo, estado de órdenes, health). */
export function registerMaintenanceGuard(app: FastifyInstance, flags: FeatureFlags): void {
  app.addHook('onRequest', async (request) => {
    if (!flags.maintenanceMode || SAFE_METHODS.has(request.method)) return;
    const route = request.routeOptions.url;
    if (route && MAINTENANCE_EXEMPT_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix)))
      return;
    throw maintenanceError();
  });
}

/** Exige CHECKOUT_ENABLED y que no haya mantenimiento. */
export function assertCheckoutEnabled(flags: FeatureFlags): void {
  if (flags.maintenanceMode) throw maintenanceError();
  if (!flags.checkoutEnabled) {
    throw new AppError(
      'CHECKOUT_DISABLED',
      503,
      'Las compras no están habilitadas en este momento.',
    );
  }
}

/** preHandler para las rutas de compra: exige CHECKOUT_ENABLED y que no haya mantenimiento. */
export function requireCheckoutEnabled(flags: FeatureFlags): preHandlerAsyncHookHandler {
  return async () => assertCheckoutEnabled(flags);
}
