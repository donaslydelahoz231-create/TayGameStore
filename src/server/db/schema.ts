import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Registro de auditoría append-only (plan v2, §5). Primera tabla del esquema:
 * valida el circuito de migraciones de la Fase 0. El resto de tablas llega en sus fases.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    data: jsonb('data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    check(
      'audit_events_actor_type_check',
      sql`${table.actorType} in ('system', 'customer', 'admin', 'webhook')`,
    ),
  ],
);
