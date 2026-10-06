import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { Db, DbOrTx } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { AppError } from '../plugins/errors.js';
import type { Mailer } from '../integrations/notify/email.js';
import type { OrderEventSink } from '../integrations/notify/events.js';
import type { OwnerNotifier } from '../integrations/notify/owner.js';
import type { PaymentGateway } from '../integrations/payments/gateway.js';

/** Dependencias compartidas por los servicios de dominio. */
export interface ServiceDeps {
  db: Db;
  config: AppConfig;
  now: () => Date;
  gateway: PaymentGateway | undefined;
  log: FastifyBaseLogger;
  /** Aviso al dueño cuando un pedido queda pagado. Opcional: sin él, solo avisa el panel. */
  notifier?: OwnerNotifier | undefined;
  /** Correo saliente (SMTP). Opcional: sin él no se envían correos. */
  mailer?: Mailer | undefined;
  /** Eventos de pedidos hacia la automatización del dueño (n8n). Opcional. */
  events?: OrderEventSink | undefined;
}

/** Quién ejecuta una acción. Nunca se toma del cuerpo de la petición. */
export interface Actor {
  type: 'system' | 'customer' | 'admin' | 'webhook';
  userId?: string | undefined;
  ipHash?: string | undefined;
  requestId?: string | undefined;
}

export const SYSTEM_ACTOR: Actor = { type: 'system' };

export interface AuditInput {
  entityType:
    | 'order'
    | 'payment'
    | 'payment_attempt'
    | 'fulfillment'
    | 'product'
    | 'blocklist'
    | 'inventory'
    | 'user'
    | 'session'
    | 'webhook';
  entityId: string;
  action: string;
  fromStatus?: string | null | undefined;
  toStatus?: string | null | undefined;
  /** Metadatos mínimos: nunca tokens, cookies, secretos ni datos de pago completos. */
  data?: Record<string, string | number | boolean | null | undefined>;
}

export async function audit(db: DbOrTx, actor: Actor, input: AuditInput): Promise<void> {
  const data: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input.data ?? {})) {
    if (value !== undefined) data[key] = value;
  }
  if (actor.requestId) data.requestId = actor.requestId;
  await db.insert(auditEvents).values({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorType: actor.type,
    actorId: actor.userId ?? null,
    data,
    ipHash: actor.ipHash ?? null,
  });
}

export const notFound = () => new AppError('NOT_FOUND', 404, 'Recurso no encontrado.');
export const invalidState = (message: string) => new AppError('INVALID_STATE', 409, message);
