import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export interface Database {
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  url: string;
  poolMax: number;
  onPoolError?: (error: Error) => void;
}

/**
 * Pool de PostgreSQL + Drizzle. SSL se controla desde la cadena de conexión
 * (p. ej. `sslmode=require`), según exija el proveedor gestionado.
 */
export function createDatabase(options: CreateDatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.poolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Sin este listener, un error de un cliente inactivo tumba el proceso.
  pool.on('error', (error) => options.onPoolError?.(error));

  return {
    db: drizzle({ client: pool, schema }),
    pool,
    async ping() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}

export type Db = NodePgDatabase<typeof schema>;
/** Transacción de Drizzle (mismo API que `Db`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
