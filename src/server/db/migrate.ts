import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { z } from 'zod';
import { createDatabase } from './client.js';
import { grantAppPrivileges } from './privileges.js';

/**
 * Aplica las migraciones pendientes. Se ejecuta como paso de despliegue,
 * nunca automáticamente al arrancar la aplicación.
 * Requiere ejecutarse desde la raíz del proyecto.
 */
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'src/server/db/migrations');

export async function runMigrations(databaseUrl: string): Promise<void> {
  const database = createDatabase({ url: databaseUrl, poolMax: 1 });
  try {
    await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
    // Solo actúa si la base ya adoptó el rol de privilegios mínimos (src/server/db/privileges.ts).
    await grantAppPrivileges(database.pool);
  } finally {
    await database.close();
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1]);

if (isEntryPoint) {
  // Con el rol de privilegios mínimos, la aplicación usa DATABASE_URL y las migraciones el rol
  // dueño de las tablas (MIGRATION_DATABASE_URL). Sin esta variable, todo usa DATABASE_URL.
  const parsed = z
    .object({
      DATABASE_URL: z.string().min(1).optional(),
      MIGRATION_DATABASE_URL: z.string().min(1).optional(),
    })
    .safeParse(process.env);
  const url = parsed.success
    ? (parsed.data.MIGRATION_DATABASE_URL ?? parsed.data.DATABASE_URL)
    : undefined;
  if (!url) {
    console.error('DATABASE_URL no está configurada.');
    process.exit(1);
  }
  try {
    await runMigrations(url);
    console.log('Migraciones aplicadas.');
  } catch (error) {
    console.error('Error aplicando migraciones:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
