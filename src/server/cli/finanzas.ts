import { z } from 'zod';
import {
  breakEvenPrice,
  feeFor,
  maxProviderBase,
  maxProviderCost,
  unitEconomics,
  usdToCop,
  type FeeModel,
} from '../domain/profitability.js';

/**
 * Informe de rentabilidad de los paquetes (`npm run finanzas:margenes`). Solo calcula: no lee la
 * base de datos, no llama a ningún proveedor y no cambia precios. Sin un archivo de costos
 * cotizados muestra únicamente los costos MÁXIMOS admisibles, nunca costos inventados.
 */

export interface PackageRow {
  sku: string;
  units: number;
  priceCop: number;
  promoPriceCop: number | null;
}

export interface FeeScenario {
  id: string;
  label: string;
  fee: FeeModel;
}

/**
 * Escenarios de comisión. Mercado Pago Colombia (Checkout Pro) publica 3,29 % + $800 + IVA con el
 * dinero al instante y 2,79 % + $800 + IVA a 14 días (página oficial vista el 13-oct-2026 por el
 * buscador; confirmar en el panel de la cuenta). El de 4 % es el supuesto actual del código.
 */
export const FEE_SCENARIOS: readonly FeeScenario[] = [
  {
    id: 'mp-instante',
    label: 'Mercado Pago al instante: 3,29 % + $800 + IVA 19 %',
    fee: { pct: 3.29, fixedCop: 800, taxPct: 19 },
  },
  {
    id: 'mp-14-dias',
    label: 'Mercado Pago a 14 días: 2,79 % + $800 + IVA 19 %',
    fee: { pct: 2.79, fixedCop: 800, taxPct: 19 },
  },
  {
    id: 'solo-4',
    label: 'Supuesto anterior del código: 4 % sin cargo fijo',
    fee: { pct: 4, fixedCop: 0, taxPct: 0 },
  },
];

export const TARGET_MARGINS = [5, 10, 15] as const;

/** Costos cotizados por un proveedor (archivo JSON). Sin él no se calcula beneficio. */
export const quoteSchema = z.strictObject({
  provider: z.string().min(1),
  source: z.string().min(1),
  /** true solo si el proveedor lo confirmó por escrito; si no, el informe lo marca «indicativo». */
  confirmed: z.boolean(),
  trmCop: z.number().positive().optional(),
  fxSpreadPct: z.number().min(0).max(20).default(0),
  surchargePct: z.number().min(0).max(100).default(0),
  costs: z.record(
    z.string(),
    z.union([
      z.strictObject({ usd: z.number().positive() }),
      z.strictObject({ cop: z.number().int().positive() }),
    ]),
  ),
});
export type ProviderQuote = z.infer<typeof quoteSchema>;

export interface ReportOptions {
  packages: readonly PackageRow[];
  scenarios: readonly FeeScenario[];
  otherCop: number;
  quote?: ProviderQuote | undefined;
}

const cop = (n: number) => `$${new Intl.NumberFormat('es-CO').format(n)}`;
const units = (n: number) => `${new Intl.NumberFormat('es-CO').format(n)} 💎`;
const pct = (n: number) =>
  `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n)} %`;

function prices(p: PackageRow): { label: string; price: number }[] {
  return [
    { label: 'Normal', price: p.priceCop },
    ...(p.promoPriceCop === null ? [] : [{ label: 'TAY RADAR', price: p.promoPriceCop }]),
  ];
}

function costCop(quote: ProviderQuote, sku: string): number | null {
  const entry = quote.costs[sku];
  if (!entry) return null;
  if ('cop' in entry) return entry.cop;
  if (quote.trmCop === undefined)
    throw new Error('El archivo de costos en dólares necesita trmCop.');
  return usdToCop(entry.usd, quote.trmCop, quote.fxSpreadPct);
}

export function profitabilityReport(options: ReportOptions): string {
  const lines: string[] = [];
  const out = (line = '') => lines.push(line);
  const otherNote = options.otherCop ? `, otros costos ${cop(options.otherCop)} por pedido` : '';

  out('### Margen bruto antes de comisiones (C máximo = P × (1 − r))');
  out();
  out('No descuenta la comisión del pago ni otros costos: sirve solo como techo.');
  out();
  out('| Paquete | Precio | Tarifa | C máx. 5 % | C máx. 10 % | C máx. 15 % |');
  out('|---|---|---|---:|---:|---:|');
  for (const p of options.packages) {
    for (const { label, price } of prices(p)) {
      const cells = TARGET_MARGINS.map((r) =>
        cop(maxProviderCost(price, r, { pct: 0, fixedCop: 0, taxPct: 0 }, 0)),
      );
      out(`| ${units(p.units)} | ${cop(price)} | ${label} | ${cells.join(' | ')} |`);
    }
  }

  for (const scenario of options.scenarios) {
    out();
    out(`### Margen neto: ${scenario.label}${otherNote}`);
    out();
    out('C máximo = P × (1 − r) − F − O. Un valor negativo significa que ese margen es imposible.');
    out();
    out(
      '| Paquete | Tarifa | Precio | Comisión F | Neto P − F − O | C máx. 5 % | C máx. 10 % | C máx. 15 % |',
    );
    out('|---|---|---:|---:|---:|---:|---:|---:|');
    for (const p of options.packages) {
      for (const { label, price } of prices(p)) {
        const fee = feeFor(price, scenario.fee);
        const cells = TARGET_MARGINS.map((r) =>
          cop(maxProviderCost(price, r, scenario.fee, options.otherCop)),
        );
        out(
          `| ${units(p.units)} | ${label} | ${cop(price)} | ${cop(fee)} (${pct((fee / price) * 100)}) | ${cop(price - fee - options.otherCop)} | ${cells.join(' | ')} |`,
        );
      }
    }
  }

  const quote = options.quote;
  if (quote) {
    out();
    out(
      `### Con costos de ${quote.provider} (${quote.confirmed ? 'CONFIRMADOS por escrito' : 'INDICATIVOS, sin confirmar'})`,
    );
    out();
    out(`Fuente: ${quote.source}.`);
    if (quote.trmCop !== undefined)
      out(
        `Conversión: TRM ${cop(quote.trmCop)} por dólar + ${pct(quote.fxSpreadPct)} de sobrecosto; recargo del proveedor ${pct(quote.surchargePct)}.`,
      );
    for (const scenario of options.scenarios) {
      out();
      out(`**${scenario.label}${otherNote}**`);
      out();
      out(
        '| Paquete | Tarifa | Precio | Costo C | Comisión F | Beneficio | Margen | Equilibrio | ¿Rentable al 5 %? |',
      );
      out('|---|---|---:|---:|---:|---:|---:|---:|---|');
      for (const p of options.packages) {
        const base = costCop(quote, p.sku);
        for (const { label, price } of prices(p)) {
          if (base === null) {
            out(
              `| ${units(p.units)} | ${label} | ${cop(price)} | sin cotización | — | — | — | — | — |`,
            );
            continue;
          }
          const unit = unitEconomics({
            priceCop: price,
            providerBaseCop: base,
            providerSurchargePct: quote.surchargePct,
            fee: scenario.fee,
            otherCop: options.otherCop,
          });
          const breakEven = breakEvenPrice(unit.providerTotalCop, scenario.fee, options.otherCop);
          out(
            `| ${units(p.units)} | ${label} | ${cop(price)} | ${cop(unit.providerTotalCop)} | ${cop(unit.feeCop)} | ${cop(unit.profitCop)} | ${pct(unit.marginPct)} | ${cop(breakEven)} | ${unit.marginPct >= 5 ? 'Sí' : 'NO'} |`,
          );
        }
      }
    }
  }

  out();
  out('Recargo del proveedor: si cobra un % sobre su tarifa base, la tarifa base máxima es');
  out(
    'C máximo ÷ (1 + recargo). Ejemplo: 110 💎 en TAY RADAR al 15 % bruto → C máx. ' +
      `${cop(maxProviderCost(3800, 15, { pct: 0, fixedCop: 0, taxPct: 0 }, 0))}; con recargo de 5 % → base máx. ` +
      `${cop(maxProviderBase(maxProviderCost(3800, 15, { pct: 0, fixedCop: 0, taxPct: 0 }, 0), 5))}.`,
  );
  return lines.join('\n');
}
