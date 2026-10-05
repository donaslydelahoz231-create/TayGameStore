import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { z } from 'zod';
import { createDatabase } from './client.js';

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
  } finally {
    await database.close();
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1]);

if (isEntryPoint) {
  const parsed = z.object({ DATABASE_URL: z.string().min(1) }).safeParse(process.env);
  if (!parsed.success) {
    console.error('DATABASE_URL no está configurada.');
    process.exit(1);
  }
  try {
    await runMigrations(parsed.data.DATABASE_URL);
    console.log('Migraciones aplicadas.');
  } catch (error) {
    console.error('Error aplicando migraciones:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
