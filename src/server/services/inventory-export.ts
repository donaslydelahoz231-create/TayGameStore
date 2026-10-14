import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { inventoryCodes, orderItems, orders, payments, products } from '../db/schema.js';
import { buildXlsx, type Cell, type Sheet } from '../lib/xlsx.js';
import { audit, type Actor, type ServiceDeps } from './context.js';
import { receiptVerificationCode } from './receipts.js';

/**
 * Excel de inventario y facturas para el dueño (panel → Inventario → «Descargar Excel»).
 *
 * Todo sale de la base de datos en el momento de la descarga: nada se escribe a mano ni se
 * inventa. Solo los pedidos PAGADOS (con número de comprobante y pago aprobado por Mercado Pago)
 * aparecen como facturas; los demás pedidos van aparte y nunca se presentan como factura.
 *
 * Sin datos personales (nombre, correo, ID del jugador) y sin PIN: el archivo se puede guardar o
 * compartir con un contador sin exponer a los clientes ni el inventario canjeable.
 */

export interface InventoryRow {
  sku: string;
  name: string;
  units: number;
  priceCop: number;
  promoPriceCop: number | null;
  active: boolean;
  available: number;
  assigned: number;
  used: number;
  voided: number;
  avgCostCop: number | null;
  soldUnits: number;
  soldCop: number;
}

export interface InvoiceRow {
  number: number;
  reference: string;
  paidAt: Date | null;
  detail: string;
  quantity: number;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  status: string;
  /** Operación de Mercado Pago (para conciliar con el extracto). */
  paymentId: string | null;
  /** Código de verificación del comprobante; null si no hay llave (archivo generado fuera del servidor). */
  verificationCode: string | null;
}

export interface OrderRow {
  reference: string;
  createdAt: Date;
  status: string;
  totalCop: number;
  receiptNumber: number | null;
}

export interface InventoryData {
  generatedAt: Date;
  inventory: InventoryRow[];
  invoices: InvoiceRow[];
  orders: OrderRow[];
}

/** Estados en palabras del dueño. */
export const STATUS_LABELS: Record<string, string> = {
  AWAITING_VERIFICATION: 'Verificando jugador',
  REJECTED: 'Rechazado',
  AWAITING_PAYMENT: 'Esperando pago',
  PAID: 'Pagado · por entregar',
  DELIVERING: 'Pagado · en entrega',
  DELIVERED: 'Pagado · entregado',
  NEEDS_REVIEW: 'Pagado · en revisión',
  EXPIRED: 'Vencido sin pagar',
  REFUNDED: 'Reembolsado',
};

const label = (status: string) => STATUS_LABELS[status] ?? status;

/** Hasta cuántos pedidos (los más recientes) entran en la hoja «Pedidos». */
const MAX_ORDERS = 20_000;

/** Lee de la base todo lo que va en el Excel (solo lectura). */
export async function collectInventoryData(
  deps: ServiceDeps,
  now: Date = deps.now(),
): Promise<InventoryData> {
  const catalog = await deps.db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      units: products.units,
      priceCop: products.priceCop,
      promoPriceCop: products.promoPriceCop,
      active: products.active,
    })
    .from(products)
    .orderBy(desc(products.active), asc(products.sortOrder), asc(products.sku));

  const stock = await deps.db
    .select({
      productId: inventoryCodes.productId,
      status: inventoryCodes.status,
      n: sql<number>`count(*)::int`,
      avgCost: sql<number | null>`round(avg(${inventoryCodes.costCop}))::int`,
    })
    .from(inventoryCodes)
    .groupBy(inventoryCodes.productId, inventoryCodes.status);

  // Vendido = pedidos con comprobante (pagados) que no se reembolsaron.
  const sold = await deps.db
    .select({
      productId: orderItems.productId,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      cop: sql<number>`coalesce(sum(${orderItems.lineTotalCop}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(isNotNull(orders.receiptNumber), ne(orders.status, 'REFUNDED')))
    .groupBy(orderItems.productId);

  const inventory = catalog.map((p): InventoryRow => {
    const lines = stock.filter((s) => s.productId === p.id);
    const count = (status: string) => lines.find((s) => s.status === status)?.n ?? 0;
    const costed = lines.filter((s) => s.avgCost !== null);
    const totalCosted = costed.reduce((acc, s) => acc + s.n, 0);
    const avgCostCop = totalCosted
      ? Math.round(costed.reduce((acc, s) => acc + (s.avgCost ?? 0) * s.n, 0) / totalCosted)
      : null;
    const sale = sold.find((s) => s.productId === p.id);
    return {
      sku: p.sku,
      name: p.name,
      units: p.units,
      priceCop: p.priceCop,
      promoPriceCop: p.promoPriceCop,
      active: p.active,
      available: count('AVAILABLE'),
      assigned: count('ASSIGNED'),
      used: count('USED'),
      voided: count('VOID'),
      avgCostCop,
      soldUnits: sale?.units ?? 0,
      soldCop: sale?.cop ?? 0,
    };
  });

  const paid = await deps.db
    .select({
      id: orders.id,
      reference: orders.publicRef,
      number: orders.receiptNumber,
      status: orders.status,
      subtotalCop: orders.subtotalCop,
      discountCop: orders.discountCop,
      totalCop: orders.totalCop,
      paymentId: payments.providerPaymentId,
      paidAt: payments.approvedAt,
    })
    .from(orders)
    .leftJoin(payments, and(eq(payments.orderId, orders.id), eq(payments.isOrderPayment, true)))
    .where(isNotNull(orders.receiptNumber))
    .orderBy(asc(orders.receiptNumber));

  const items = paid.length
    ? await deps.db
        .select({
          orderId: orderItems.orderId,
          sku: orderItems.sku,
          name: orderItems.name,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            paid.map((o) => o.id),
          ),
        )
        .orderBy(asc(orderItems.sku))
    : [];

  const keyring = deps.config.secrets.orderTokenKeys;
  const invoices = paid.map((o): InvoiceRow => {
    const lines = items.filter((i) => i.orderId === o.id);
    const number = o.number ?? 0;
    return {
      number,
      reference: o.reference,
      paidAt: o.paidAt,
      detail: lines.map((i) => `${i.name} ×${i.quantity} (${i.sku})`).join(' + '),
      quantity: lines.reduce((acc, i) => acc + i.quantity, 0),
      subtotalCop: o.subtotalCop,
      discountCop: o.discountCop,
      totalCop: o.totalCop,
      status: label(o.status),
      paymentId: o.paymentId,
      verificationCode: o.paymentId
        ? receiptVerificationCode(keyring, {
            number,
            reference: o.reference,
            totalCop: o.totalCop,
            paymentId: o.paymentId,
          })
        : null,
    };
  });

  const allOrders = await deps.db
    .select({
      reference: orders.publicRef,
      createdAt: orders.createdAt,
      status: orders.status,
      totalCop: orders.totalCop,
      receiptNumber: orders.receiptNumber,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(MAX_ORDERS);

  return {
    generatedAt: now,
    inventory,
    invoices,
    orders: allOrders.map((o) => ({ ...o, status: label(o.status) })),
  };
}

/** Fecha de Colombia (AAAA-MM-DD) para el nombre del archivo. */
export function colombiaDay(date: Date): string {
  return new Date(date.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

const cop = (value: number): Cell => ({ value, kind: 'cop' });
const int = (value: number): Cell => ({ value, kind: 'int' });

/** Arma el libro: Resumen, Inventario, Facturas y Pedidos. */
export function inventoryWorkbook(data: InventoryData): { name: string; data: Buffer } {
  const billed = data.invoices.filter((i) => i.status !== STATUS_LABELS.REFUNDED);
  const unpaid = data.orders.filter((o) => o.receiptNumber === null).length;
  const summary: Sheet = {
    name: 'Resumen',
    columns: [
      { header: 'Concepto', kind: 'text', width: 46 },
      { header: 'Valor', kind: 'text', width: 30 },
    ],
    rows: [
      ['Generado (hora de Colombia)', { value: data.generatedAt, kind: 'date' }],
      ['Paquetes en el catálogo', int(data.inventory.length)],
      ['Paquetes a la venta', int(data.inventory.filter((p) => p.active).length)],
      ['PIN disponibles', int(data.inventory.reduce((acc, p) => acc + p.available, 0))],
      ['Comprobantes emitidos (pedidos pagados)', int(data.invoices.length)],
      [
        'Último comprobante',
        data.invoices.length
          ? `N.º ${String(data.invoices[data.invoices.length - 1]?.number ?? 0).padStart(6, '0')}`
          : 'Ninguno todavía',
      ],
      ['Total facturado sin reembolsos (COP)', cop(billed.reduce((acc, i) => acc + i.totalCop, 0))],
      ['Pedidos registrados', int(data.orders.length)],
      ['Pedidos sin pagar (no son facturas)', int(unpaid)],
      [
        'Cómo comprobar una factura',
        'Tienda → Soporte → «Verificar comprobante», con la referencia y el código.',
      ],
      ['Datos personales y PIN', 'No incluidos (sin nombres, correos, ID de jugador ni PIN).'],
    ],
  };
  const inventory: Sheet = {
    name: 'Inventario',
    columns: [
      { header: 'SKU', kind: 'text', width: 12 },
      { header: 'Paquete', kind: 'text', width: 28 },
      { header: 'Diamantes', kind: 'int', width: 11 },
      { header: 'Precio (COP)', kind: 'cop', width: 14 },
      { header: 'Precio promo (COP)', kind: 'cop', width: 18 },
      { header: 'A la venta', kind: 'text', width: 11 },
      { header: 'PIN disponibles', kind: 'int', width: 15 },
      { header: 'PIN reservados', kind: 'int', width: 15 },
      { header: 'PIN entregados', kind: 'int', width: 15 },
      { header: 'PIN anulados', kind: 'int', width: 13 },
      { header: 'Costo promedio PIN (COP)', kind: 'cop', width: 23 },
      { header: 'Unidades vendidas', kind: 'int', width: 17 },
      { header: 'Vendido (COP)', kind: 'cop', width: 15 },
    ],
    rows: data.inventory.map((p) => [
      p.sku,
      p.name,
      p.units,
      p.priceCop,
      p.promoPriceCop,
      p.active ? 'Sí' : 'No',
      p.available,
      p.assigned,
      p.used,
      p.voided,
      p.avgCostCop,
      p.soldUnits,
      p.soldCop,
    ]),
  };
  const invoices: Sheet = {
    name: 'Facturas',
    columns: [
      { header: 'Comprobante N.º', kind: 'text', width: 16 },
      { header: 'Referencia', kind: 'text', width: 17 },
      { header: 'Pagado (hora de Colombia)', kind: 'date', width: 22 },
      { header: 'Detalle', kind: 'text', width: 44 },
      { header: 'Cantidad', kind: 'int', width: 10 },
      { header: 'Subtotal (COP)', kind: 'cop', width: 15 },
      { header: 'Descuento (COP)', kind: 'cop', width: 16 },
      { header: 'Total (COP)', kind: 'cop', width: 14 },
      { header: 'Estado', kind: 'text', width: 22 },
      { header: 'Operación Mercado Pago', kind: 'text', width: 22 },
      { header: 'Código de verificación', kind: 'text', width: 27 },
    ],
    rows: data.invoices.map((i) => [
      String(i.number).padStart(6, '0'),
      i.reference,
      i.paidAt,
      i.detail,
      i.quantity,
      i.subtotalCop,
      i.discountCop,
      i.totalCop,
      i.status,
      i.paymentId,
      i.verificationCode,
    ]),
  };
  const orderSheet: Sheet = {
    name: 'Pedidos',
    columns: [
      { header: 'Referencia', kind: 'text', width: 17 },
      { header: 'Creado (hora de Colombia)', kind: 'date', width: 22 },
      { header: 'Estado', kind: 'text', width: 22 },
      { header: 'Total (COP)', kind: 'cop', width: 14 },
      { header: 'Comprobante N.º', kind: 'text', width: 16 },
    ],
    rows: data.orders.map((o) => [
      o.reference,
      o.createdAt,
      o.status,
      o.totalCop,
      o.receiptNumber === null
        ? 'Sin pago (no es factura)'
        : String(o.receiptNumber).padStart(6, '0'),
    ]),
  };
  return {
    name: `TayGameStore-inventario-${colombiaDay(data.generatedAt)}.xlsx`,
    data: buildXlsx([summary, inventory, invoices, orderSheet], {
      title: 'TayGameStore · Inventario y facturas',
      created: data.generatedAt,
    }),
  };
}

/** Descarga del panel: lee la base, arma el Excel y deja constancia en el historial. */
export async function exportInventoryWorkbook(
  deps: ServiceDeps,
  actor: Actor,
): Promise<{ name: string; data: Buffer }> {
  const data = await collectInventoryData(deps);
  const file = inventoryWorkbook(data);
  await audit(deps.db, actor, {
    entityType: 'inventory',
    entityId: 'excel',
    action: 'inventory.exported',
    data: {
      packages: data.inventory.length,
      invoices: data.invoices.length,
      orders: data.orders.length,
    },
  });
  return file;
}
