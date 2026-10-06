/** Tipos de order-status.js (para las pruebas en TypeScript). */
interface OrderLike {
  status: string;
  verification?: { status: string } | null;
  payment?: { status: string | null } | null;
}
export function paymentInProgress(order: OrderLike | null | undefined): boolean;
export function humanStatus(order: OrderLike | null | undefined): string;
export function historyStatusClass(status: string): 'ok' | 'bad' | 'warn';
