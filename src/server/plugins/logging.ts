import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../config/env.js';

/** Cabeceras y campos que nunca deben aparecer en los logs. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-order-token"]',
  'res.headers["set-cookie"]',
];

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Reutiliza el `x-request-id` entrante solo si tiene un formato seguro
 * (evita inyección en logs); si no, genera uno nuevo.
 */
export function generateRequestId(request: IncomingMessage): string {
  const incoming = request.headers['x-request-id'];
  if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}

export function buildLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  const base = {
    level: config.logLevel,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  };
  if (config.logPretty) {
    // pino-pretty es dependencia de desarrollo: solo se usa en desarrollo local.
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    };
  }
  return base;
}
