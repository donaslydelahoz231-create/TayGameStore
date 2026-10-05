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
  NOT_FOUND: 'Recurso no encontrado.',
  METHOD_NOT_ALLOWED: 'Método no permitido.',
  PAYLOAD_TOO_LARGE: 'La solicitud es demasiado grande.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de contenido no soportado.',
  RATE_LIMITED: 'Demasiadas solicitudes. Inténtalo más tarde.',
  MAINTENANCE_MODE: 'La tienda está en mantenimiento. Inténtalo más tarde.',
  CHECKOUT_DISABLED: 'Las compras no están habilitadas en este momento.',
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
