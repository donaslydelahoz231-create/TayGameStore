import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EXAMPLE_FREEFIRE_PRODUCTS } from '../db/seeds/catalog-example.js';
import { FEE_SCENARIOS, profitabilityReport, quoteSchema } from './finanzas.js';

/**
 * `npm run finanzas:margenes [-- --otros 150 --costos cotizacion.json --escenario mp-instante]`
 *
 * Los precios son los del catálogo de la tienda (iguales a producción el 13-oct-2026). Imprime
 * tablas en Markdown; no toca la base de datos ni ningún servicio externo.
 */
try {
  const { values } = parseArgs({
    options: {
      otros: { type: 'string', default: '0' },
      costos: { type: 'string' },
      escenario: { type: 'string', multiple: true },
    },
  });
  const otherCop = Number(values.otros);
  if (!Number.isSafeInteger(otherCop) || otherCop < 0) {
    throw new Error('--otros debe ser un entero de pesos ≥ 0.');
  }
  const scenarios = values.escenario?.length
    ? FEE_SCENARIOS.filter((s) => values.escenario?.includes(s.id))
    : FEE_SCENARIOS;
  if (!scenarios.length) {
    throw new Error(`Escenarios válidos: ${FEE_SCENARIOS.map((s) => s.id).join(', ')}.`);
  }
  const quote = values.costos
    ? quoteSchema.parse(JSON.parse(readFileSync(values.costos, 'utf8')))
    : undefined;
  // El informe va a la salida estándar para poder guardarlo: `… > informe.md`.
  process.stdout.write(
    profitabilityReport({
      packages: EXAMPLE_FREEFIRE_PRODUCTS.map((p) => ({
        sku: p.sku,
        units: p.units,
        priceCop: p.priceCop,
        promoPriceCop: p.promoPriceCop,
      })),
      scenarios,
      otherCop,
      quote,
    }) + '\n',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
