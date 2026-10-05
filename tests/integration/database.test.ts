import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDatabase, type Database } from '../../src/server/db/client.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import { buildTestApp } from '../helpers.js';

/**
 * Requiere TEST_DATABASE_URL apuntando a una base de datos desechable cuyo nombre
 * termine en "_test": la prueba borra y recrea su esquema.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL no está definida: las pruebas de integración necesitan PostgreSQL.',
  );
}
const databaseName = new URL(url).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Por seguridad, la base de pruebas debe terminar en "_test" (recibido: ${databaseName}).`,
  );
}

let database: Database;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(
    'drop schema if exists drizzle cascade; drop schema public cascade; create schema public;',
  );
  await admin.end();
  await runMigrations(url);
  database = createDatabase({ url, poolMax: 2 });
});

afterAll(async () => {
  await database?.close();
});

describe('PostgreSQL + migraciones', () => {
  it('crea audit_events', async () => {
    const result = await database.pool.query<{ exists: boolean }>(
      "select to_regclass('public.audit_events') is not null as exists",
    );
    expect(result.rows[0]?.exists).toBe(true);
  });

  it('las migraciones son idempotentes', async () => {
    await expect(runMigrations(url)).resolves.toBeUndefined();
  });

  it('acepta un evento válido y rechaza un actor_type inválido', async () => {
    await database.pool.query(
      "insert into audit_events (entity_type, entity_id, action, actor_type) values ('system', 'boot', 'test', 'system')",
    );
    await expect(
      database.pool.query(
        "insert into audit_events (entity_type, entity_id, action, actor_type) values ('x', 'y', 'z', 'hacker')",
      ),
    ).rejects.toThrow(/audit_events_actor_type_check/);
  });

  it('/api/ready responde 200 con una base de datos real', async () => {
    const app = await buildTestApp({ database });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/ready' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
