/** Tipos de receipt-text.js (para las pruebas en TypeScript). */
export interface ReceiptOrder {
  reference: string;
  customerName?: string;
  playerUid: string;
  playerServer?: string | null;
  status: string;
  totalCop: number;
  items?: { name: string; quantity: number }[];
  verification?: { status?: string; nickname?: string | null; region?: string | null } | null;
  payment?: { method?: string; status?: string | null } | null;
  receipt?: { number: number; verificationCode: string } | null;
}

export function receiptText(order: ReceiptOrder | null | undefined, origin: string): string;
export function storeWhatsAppDigits(value: unknown): string;
