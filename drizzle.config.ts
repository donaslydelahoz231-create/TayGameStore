import { defineConfig } from 'drizzle-kit';

// Solo se usa para generar migraciones (`npm run db:generate`); no necesita conexión.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  strict: true,
  verbose: true,
});
