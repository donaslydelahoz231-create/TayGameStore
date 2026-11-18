/** Tipos de whatsapp-message.js (para las pruebas en TypeScript). */
export interface WhatsAppItem {
  p: { id: string; name: string; diamonds?: number; normal?: number; price: number };
  qty: number;
}

export interface WhatsAppLine {
  sku: string;
  name: string;
  diamonds: number;
  qty: number;
  unitList: number;
  unitPrice: number;
  unitDiscount: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface WhatsAppPayment {
  kind: 'transfer' | 'link' | null;
  label: string | null;
  paid: boolean;
  last4: string;
  reference: string;
}

export interface WhatsAppSummary {
  reference: string;
  demo: boolean;
  createdAt: Date;
  customer: { name: string; email: string };
  player: { uid: string; server: string };
  payment: WhatsAppPayment;
  lines: WhatsAppLine[];
  units: number;
  subtotal: number;
  discount: number;
  total: number;
}

export function orderChannel(
  config: { orderChannel?: unknown } | null | undefined,
): 'checkout' | 'whatsapp' | 'ambos';
export function orderReference(demo: boolean, randomValues: (bytes: Uint8Array) => unknown): string;
export function oneLine(value: unknown, max?: number): string;
export function orderSummary(input: {
  items: WhatsAppItem[];
  customer: { name: string; email: string };
  player: { uid: string; server: string };
  payment: {
    kind: 'transfer' | 'link' | null;
    label: string | null;
    paid?: boolean;
    last4?: string;
    reference?: string;
  };
  reference: string;
  demo: boolean;
  createdAt: Date;
}): WhatsAppSummary;
export function whatsappMessage(summary: WhatsAppSummary): string;
export function whatsappDigits(value: unknown): string;
export function whatsappUrl(number: unknown, message: string): string;
