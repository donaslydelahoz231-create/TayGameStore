import type { FastifyPluginAsync } from 'fastify';
import { RATE_LIMITS } from '../../plugins/security.js';
import type { ServiceDeps } from '../../services/context.js';
import { handleWebhook } from '../../services/payments.js';

export interface WebhookRoutesOptions {
  deps: ServiceDeps | undefined;
}

function header(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length <= 512 ? raw : undefined;
}

function field(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.length <= 64) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

/**
 * Notificaciones de Mercado Pago (Webhooks). Según la documentación oficial llegan por POST con
 * `?data.id=<id>&type=payment` y la cabecera `x-signature`; se responde 200 al aceptarlas.
 * El cuerpo nunca se usa como fuente de verdad: el pago se consulta a la API de Mercado Pago.
 * Exentas de CSRF y de modo mantenimiento (no deben perderse pagos en curso).
 */
export const webhookRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (app, options) => {
  app.post(
    '/api/webhooks/mercadopago',
    { config: { rateLimit: RATE_LIMITS.webhook } },
    async (request, reply) => {
      const deps = options.deps;
      if (!deps?.gateway) return reply.code(503).send({ received: false });
      const body = request.body;
      const bodyData =
        body && typeof body === 'object' ? (body as Record<string, unknown>).data : undefined;
      const result = await handleWebhook(
        deps,
        {
          topic:
            field(request.query, 'type') ?? field(request.query, 'topic') ?? field(body, 'type'),
          dataId: field(request.query, 'data.id') ?? field(bodyData, 'id'),
          requestId: header(request.headers['x-request-id']),
          signature: header(request.headers['x-signature']),
        },
        { type: 'webhook', ipHash: request.auth.ipHash, requestId: request.id },
      );
      if (!result.accepted) return reply.code(401).send({ received: false });
      return reply.code(200).send({ received: true });
    },
  );
};
