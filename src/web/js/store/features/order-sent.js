import { $, setText } from '../dom.js';

/**
 * Pestaña flotante «Compra exitosa» con el mensaje de espera debajo (pedido del dueño, 2026-11-18:
 * «que el usuario presione el botón de verificación de pago y salga la pestaña de compra exitosa y
 * el mensaje de espera, y a la vez me llegue el mensaje a WhatsApp»). La muestran los dos botones
 * con los que el cliente confirma su transferencia Nequi: «Confirmar pago y enviar» (envío desde la
 * tienda) y «Ya transferí» (pago con «Pagar»). El aviso al WhatsApp del dueño lo manda el servidor
 * en ese mismo momento (CallMeBot), sin que el cliente haga nada más.
 *
 * Dice que la compra quedó hecha y enviada, no que el pago esté aprobado: el texto de espera lo
 * aclara y el pedido sigue «por verificar» hasta que el dueño ve el dinero en su app Nequi.
 */

/** Minutos de espera que la tienda le indica al cliente (pedido del dueño, 2026-11-18). */
export const WAIT_MINUTES = 30;
/** La pestaña se cierra sola después de este tiempo (o con su ×). */
const VISIBLE_MS = 15_000;

let timer = 0;

export function showOrderSent(order) {
  const box = $('orderSent');
  if (!box || !order) return;
  setText('orderSentTitle', 'Compra exitosa');
  setText(
    'orderSentWait',
    `Tu recarga llegará al ID ${order.playerUid} en un máximo de ${WAIT_MINUTES} minutos, apenas verifiquemos tu pago.`,
  );
  box.hidden = false;
  box.classList.remove('is-in');
  // Reinicia la entrada si ya estaba visible (un segundo aviso).
  void box.offsetWidth;
  box.classList.add('is-in');
  clearTimeout(timer);
  timer = window.setTimeout(hideOrderSent, VISIBLE_MS);
}

export function hideOrderSent() {
  clearTimeout(timer);
  const box = $('orderSent');
  if (box) box.hidden = true;
}
