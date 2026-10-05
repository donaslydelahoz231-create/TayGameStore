import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ApiErrorBody, ErrorCode } from '../../shared/errors.js';

/** Error de aplicación con código estable. `message` se muestra al cliente: no debe contener datos internos. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

const GENERIC_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'La solicitud no es válida.',
  VALIDATION_ERROR: 'Los datos enviados no son válidos.',
  UNAUTHORIZED: 'Debes iniciar sesión.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  CSRF_REJECTED: 'Solicitud rechazada por seguridad. Recarga la página.',
  NOT_FOUND: 'Recurso no encontrado.',
  METHOD_NOT_ALLOWED: 'Método no permitido.',
  CONFLICT: 'El recurso cambió. Recarga e inténtalo de nuevo.',
  IDEMPOTENCY_CONFLICT: 'Esta solicitud ya se usó con otros datos.',
  INVALID_STATE: 'La operación no es válida en el estado actual.',
  PRICE_CHANGED: 'Los precios cambiaron. Revisa tu pedido.',
  PRODUCT_UNAVAILABLE: 'Un producto ya no está disponible.',
  LIMIT_EXCEEDED: 'Se superó un límite permitido.',
  BLOCKED: 'No es posible procesar esta solicitud.',
  ORDER_EXPIRED: 'El pedido expiró.',
  PAYLOAD_TOO_LARGE: 'La solicitud es demasiado grande.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de contenido no soportado.',
  RATE_LIMITED: 'Demasiadas solicitudes. Inténtalo más tarde.',
  MAINTENANCE_MODE: 'La tienda está en mantenimiento. Inténtalo más tarde.',
  CHECKOUT_DISABLED: 'Las compras no están habilitadas en este momento.',
  PAYMENTS_DISABLED: 'Los pagos no están habilitados en este momento.',
  FULFILLMENT_DISABLED: 'Las entregas están pausadas.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'El proveedor de pagos no responde. Inténtalo más tarde.',
  AUTH_NOT_CONFIGURED: 'El acceso con este proveedor no está configurado.',
  PLAYER_LOOKUP_UNAVAILABLE: 'La consulta de jugadores no está disponible ahora.',
  PLAYER_NOT_FOUND: 'No encontramos ese ID de jugador.',
  PLAYER_LOOKUP_EXPIRED: 'La verificación del jugador caducó. Vuelve a consultar el ID.',
  MFA_REQUIRED: 'Se requiere verificación en dos pasos.',
  MFA_INVALID: 'Código de verificación inválido.',
  INVALID_SIGNATURE: 'Firma inválida.',
  SERVICE_UNAVAILABLE: 'Servicio no disponible. Inténtalo más tarde.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado.',
};

const CLIENT_ERROR_CODES: Partial<Record<number, ErrorCode>> = {
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ErrorCode,
  message: string = GENERIC_MESSAGES[code],
): FastifyReply {
  const body: ApiErrorBody = { error: { code, message, requestId: request.id } };
  return reply.code(statusCode).header('cache-control', 'no-store').send(body);
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      const level = error.statusCode >= 500 ? 'warn' : 'info';
      request.log[level]({ code: error.code }, error.message);
      return sendError(reply, request, error.statusCode, error.code, error.message);
    }

    if (error instanceof ZodError) {
      request.log.info({ issues: error.issues.length }, 'validation error');
      return sendError(reply, request, 400, 'VALIDATION_ERROR');
    }

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      const code =
        'validation' in error && error.validation
          ? 'VALIDATION_ERROR'
          : (CLIENT_ERROR_CODES[statusCode] ?? 'BAD_REQUEST');
      request.log.info({ code, statusCode }, 'client error');
      return sendError(reply, request, statusCode, code);
    }

    // Errores inesperados: detalle solo en logs, nunca en la respuesta.
    request.log.error({ err: error }, 'unhandled error');
    return sendError(reply, request, 500, 'INTERNAL_ERROR');
  });

  app.setNotFoundHandler((request, reply) => sendError(reply, request, 404, 'NOT_FOUND'));
}
