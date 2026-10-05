import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createHarness,
  resetDatabase,
  testDatabaseUrl,
  type Harness,
} from '../support/integration.js';

/**
 * Calidad del esquema real (tras aplicar TODAS las migraciones): índices, consultas frecuentes
 * y restricciones. Detecta regresiones que ninguna prueba funcional vería con pocas filas.
 */
let h: Harness;

beforeAll(async () => {
  await resetDatabase(testDatabaseUrl());
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});

describe('calidad de la base de datos', () => {
  it('toda clave foránea tiene un índice que empieza por su columna', async () => {
    const result = await h.database.db.execute<{ tabla: string; columna: string }>(sql`
      select c.conrelid::regclass::text as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and not exists (
          select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
        )`);
    expect(result.rows).toEqual([]);
  });

  it.each([
    [
      'pedido por referencia pública',
      sql`select * from orders where public_ref = 'TGS-0000000000'`,
    ],
    [
      'pedidos de un navegador invitado',
      sql`select * from orders where guest_hash = 'x' order by created_at desc limit 50`,
    ],
    [
      'partidas de varios pedidos',
      sql`select * from order_items where order_id = any(array['00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid])`,
    ],
    [
      'pago por id de Mercado Pago (deduplicación)',
      sql`select * from payments where provider = 'mercadopago' and provider_payment_id = '1'`,
    ],
    ['sesión por hash del token', sql`select * from sessions where token_hash = 'x'`],
    [
      'identidad social',
      sql`select * from user_identities where provider = 'discord' and subject = '1'`,
    ],
    [
      'bloqueo por tipo y valor',
      sql`select * from blocklist where kind = 'ip_hash' and value = 'x'`,
    ],
    [
      'auditoría de una entidad',
      sql`select * from audit_events where entity_type = 'user' and entity_id = 'x' order by created_at desc`,
    ],
  ])('la consulta frecuente "%s" puede usar un índice', async (_name, query) => {
    // Con pocas filas PostgreSQL prefiere leer la tabla entera; se desactiva para comprobar que
    // EXISTE un camino por índice (el que usará cuando la tabla crezca).
    const plan = await h.database.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const result = await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${query}`);
      return result.rows.map((row) => row['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
    expect(plan).not.toMatch(/Seq Scan/);
  });

  it('las columnas de dinero no aceptan valores negativos ni nulos', async () => {
    const result = await h.database.db.execute<{ tabla: string; columna: string }>(sql`
      select table_name as tabla, column_name as columna
      from information_schema.columns
      where table_schema = 'public' and column_name like '%_cop' and is_nullable = 'YES'
        and table_name in ('orders', 'order_items', 'products')
        and column_name not in ('promo_price_cop')`);
    expect(result.rows).toEqual([]);
    await expect(
      h.database.db.execute(
        sql`insert into products (sku, game, name, units, price_cop) values ('neg', 'freefire', 'x', 1, -5)`,
      ),
    ).rejects.toThrow();
  });
});
