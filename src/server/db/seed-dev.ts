import { products } from './schema.js';
import { createDatabase } from './client.js';
import { EXAMPLE_FREEFIRE_PRODUCTS } from './seeds/catalog-example.js';

/** Carga el catálogo de ejemplo en una base de DESARROLLO. Nunca en producción. */
if (process.env.NODE_ENV === 'production') {
  console.error('db:seed:dev no se ejecuta en producción: crea el catálogo real desde el panel.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL no está configurada.');
  process.exit(1);
}
const database = createDatabase({ url, poolMax: 1 });
try {
  const inserted = await database.db
    .insert(products)
    .values(EXAMPLE_FREEFIRE_PRODUCTS)
    .onConflictDoNothing()
    .returning({ sku: products.sku });
  console.warn(`Productos de ejemplo insertados: ${inserted.length}`);
} finally {
  await database.close();
}
