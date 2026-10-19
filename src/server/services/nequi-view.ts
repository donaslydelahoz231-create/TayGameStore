import { desc, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { nequiTransfers, type NequiTransferStatus } from '../db/schema.js';
import type { ServiceDeps } from './context.js';
import type { OrderRow } from './orders.js';

/** Lectura de las transferencias Nequi y lo que ve el comprador (sin lógica de confirmación). */

export const DEFAULT_REVIEW_HOURS = 24;

export interface NequiTransferView {
  status: NequiTransferStatus;
  senderLast4: string | null;
  customerReference: string | null;
  reportedAt: Date | null;
  nequiReference: string | null;
  amountCop: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

/** Transferencias de uno o varios pedidos, de la más reciente a la más antigua. */
export async function nequiTransfersFor(
  db: DbOrTx,
  orderIds: readonly string[],
): Promise<Map<string, NequiTransferView[]>> {
  const byOrder = new Map<string, NequiTransferView[]>();
  if (!orderIds.length) return byOrder;
  const rows = await db
    .select({
      orderId: nequiTransfers.orderId,
      status: nequiTransfers.status,
      senderLast4: nequiTransfers.senderLast4,
      customerReference: nequiTransfers.customerReference,
      reportedAt: nequiTransfers.reportedAt,
      nequiReference: nequiTransfers.nequiReference,
      amountCop: nequiTransfers.amountCop,
      reviewedAt: nequiTransfers.reviewedAt,
      rejectionReason: nequiTransfers.rejectionReason,
      createdAt: nequiTransfers.createdAt,
    })
    .from(nequiTransfers)
    .where(inArray(nequiTransfers.orderId, [...orderIds]))
    .orderBy(desc(nequiTransfers.createdAt));
  for (const { orderId, ...row } of rows) {
    byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), row]);
  }
  return byOrder;
}

/**
 * Lo que ve el comprador de un pedido Nequi. El celular del dueño solo aparece mientras el pedido
 * espera pago y Nequi está activo: después ya no hace falta mostrarlo (minimización).
 */
export function nequiCustomerView(
  deps: ServiceDeps,
  order: Pick<OrderRow, 'paymentMethod' | 'status' | 'expiresAt' | 'totalCop' | 'publicRef'>,
  latest: NequiTransferView | undefined,
) {
  if (order.paymentMethod !== 'nequi_manual') return null;
  const cfg = deps.config.nequi.manual;
  const awaiting =
    order.status === 'AWAITING_PAYMENT' && order.expiresAt.getTime() > deps.now().getTime();
  return {
    account: awaiting && cfg ? { phone: cfg.phone, holder: cfg.holder ?? null } : null,
    amountCop: order.totalCop,
    /** Lo que el cliente escribe en el mensaje de la transferencia. */
    reference: order.publicRef,
    reviewHours: cfg?.reviewHours ?? DEFAULT_REVIEW_HOURS,
    transfer: latest
      ? {
          status: latest.status,
          reportedAt: latest.reportedAt?.toISOString() ?? null,
          rejectionReason: latest.status === 'REJECTED' ? latest.rejectionReason : null,
        }
      : null,
  };
}
