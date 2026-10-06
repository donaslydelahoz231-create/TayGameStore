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
 * `pg` 8 ya trata `prefer`, `require` y `verify-ca` como `verify-full` (certificado y nombre
 * del servidor verificados), pero avisa en cada arranque de que `pg` 9 los debilitará a la
 * semántica de libpq. Se fija `verify-full` de forma explícita: mismo comportamiento de hoy,
 * sin el aviso y sin bajar la seguridad al actualizar. Con `uselibpqcompat` no se toca nada.
 */
export function pinVerifiedSslMode(url: string): string {
  if (/[?&]uselibpqcompat=/i.test(url)) return url;
  return url.replace(
    /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|#|$)/,
    '$1sslmode=verify-full',
  );
}

/**
 * Pool de PostgreSQL + Drizzle. SSL se controla desde la cadena de conexión
 * (p. ej. `sslmode=require`), según exija el proveedor gestionado.
 */
export function createDatabase(options: CreateDatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: pinVerifiedSslMode(options.url),
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
