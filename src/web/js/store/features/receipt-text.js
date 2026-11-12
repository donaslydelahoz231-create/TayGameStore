import { money } from '../format.js';
import { serverLabel } from '../servers.js';
import { humanStatus } from './order-status.js';

/**
 * Texto del comprobante para compartir o enviar a la tienda: un dato por línea, para que el dueño
 * copie cada uno (pedido, ID del jugador, total, código) sin tener que recortar una frase. Solo
 * datos del propio pedido y de su comprobante: nunca datos del dueño ni de la cuenta de pago.
 * Devuelve '' si el pedido no tiene comprobante (solo los pedidos pagados lo tienen).
 */
export function receiptText(order, origin) {
  if (!order?.receipt) return '';
  const number = String(order.receipt.number).padStart(6, '0');
  const verified = ['VERIFIED', 'CONFIRMED'].includes(order.verification?.status);
  const nickname = verified ? order.verification?.nickname : '';
  const server = (verified ? order.verification?.region : '') || serverLabel(order.playerServer);
  const method = order.payment?.method === 'nequi_manual' ? 'Nequi' : 'Mercado Pago';
  const items = (order.items ?? []).map((i) => `• ${i.quantity}× ${i.name}`);
  return [
    `Comprobante TayGameStore N.º ${number}`,
    `Pedido: ${order.reference}`,
    ...(order.customerName ? [`Cliente: ${order.customerName}`] : []),
    `ID Free Fire: ${order.playerUid}`,
    ...(nickname ? [`Nickname: ${nickname}`] : []),
    ...(server ? [`Servidor: ${server}`] : []),
    'Paquetes:',
    ...items,
    `Total: ${money(order.totalCop)}`,
    `Pago: ${method} · ${humanStatus(order)}`,
    `Código de verificación: ${order.receipt.verificationCode}`,
    `Verifícalo en ${origin} → Soporte → «Verificar comprobante».`,
  ].join('\n');
}

/** Dígitos del WhatsApp de la tienda para wa.me (8 a 15); '' si no está configurado. */
export function storeWhatsAppDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : '';
}
