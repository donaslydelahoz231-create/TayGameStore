/**
 * Pedido por WhatsApp: resumen, mensaje y enlace. Funciones puras (sin DOM, estado ni red), así
 * se prueban solas (tests/unit/whatsapp-message.test.ts).
 *
 * Los precios son los del catálogo que envía el servidor (`p.price` ya trae la promoción vigente y
 * `p.normal` el precio de lista). El mensaje es una solicitud: el total y el pago los confirma
 * TayGameStore por el chat; la tienda no crea ni cobra pedidos por este canal.
 */

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const cop = (value) => '$ ' + COP.format(Number(value || 0));

/**
 * Canal para cerrar el pedido según /api/config (ORDER_CHANNEL del servidor): `checkout` (pago en
 * línea), `whatsapp` o `ambos`. Si falta o no se conoce, `checkout`: la tienda de siempre.
 */
export function orderChannel(config) {
  const channel = config?.orderChannel;
  return channel === 'whatsapp' || channel === 'ambos' ? channel : 'checkout';
}

/** Letras y números sin confusiones (sin 0/O, 1/I/L) para dictar la referencia por teléfono. */
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Referencia del pedido: `DEMO-XXXXXX` en la demostración y `WA-XXXXXX` en la tienda.
 * `randomValues` recibe un Uint8Array y lo llena (crypto.getRandomValues; inyectable en pruebas).
 */
export function orderReference(demo, randomValues) {
  const bytes = new Uint8Array(6);
  randomValues(bytes);
  let code = '';
  for (const byte of bytes) code += REF_ALPHABET[byte % REF_ALPHABET.length];
  return (demo ? 'DEMO-' : 'WA-') + code;
}

/** Texto de una sola línea: sin saltos ni caracteres de control (nadie agrega líneas falsas). */
export function oneLine(value, max = 120) {
  return String(value ?? '')
    .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Resumen del pedido.
 * @param {object} input
 * @param {Array<{ p: { id: string, name: string, diamonds?: number, normal?: number, price: number }, qty: number }>} input.items
 * @param {{ name: string, email: string }} input.customer
 * @param {{ uid: string, server: string }} input.player  `server`: nombre visible del servidor.
 * @param {{ label: string | null, kind: 'transfer' | 'link' | null, paid?: boolean,
 *   last4?: string, reference?: string }} input.payment  Medio elegido: `transfer` (Nequi, el
 *   cliente transfiere y lo informa), `link` (TayGameStore le envía el enlace de pago) o null.
 * @param {string} input.reference
 * @param {boolean} input.demo
 * @param {Date} input.createdAt
 */
export function orderSummary({ items, customer, player, payment, reference, demo, createdAt }) {
  const lines = items
    .filter((x) => x && x.p && Number.isInteger(x.qty) && x.qty > 0)
    .map(({ p, qty }) => {
      const unitPrice = Math.max(0, Math.round(Number(p.price) || 0));
      // El precio de lista nunca es menor que el que se cobra: si falta, no hay descuento.
      const unitList = Math.max(unitPrice, Math.round(Number(p.normal) || 0));
      return {
        sku: oneLine(p.id, 40),
        name: oneLine(p.name, 80),
        diamonds: Math.max(0, Math.round(Number(p.diamonds) || 0)),
        qty,
        unitList,
        unitPrice,
        unitDiscount: unitList - unitPrice,
        subtotal: unitList * qty,
        discount: (unitList - unitPrice) * qty,
        total: unitPrice * qty,
      };
    });
  const sum = (key) => lines.reduce((acc, line) => acc + line[key], 0);
  return {
    reference,
    demo: Boolean(demo),
    createdAt,
    customer: { name: oneLine(customer.name, 80), email: oneLine(customer.email, 160) },
    player: { uid: oneLine(player.uid, 12), server: oneLine(player.server, 40) },
    payment: paymentInfo(payment),
    lines,
    units: lines.reduce((acc, line) => acc + line.diamonds * line.qty, 0),
    subtotal: sum('subtotal'),
    discount: sum('discount'),
    total: sum('total'),
  };
}

/** Datos del pago que informa el cliente, saneados (sin saltos ni caracteres de más). */
function paymentInfo(payment) {
  const kind = payment?.kind === 'transfer' || payment?.kind === 'link' ? payment.kind : null;
  const last4 = String(payment?.last4 ?? '').replace(/\D/g, '');
  return {
    kind,
    label: kind ? oneLine(payment?.label, 80) : null,
    paid: kind === 'transfer' && payment?.paid === true,
    last4: kind === 'transfer' && last4.length === 4 ? last4 : '',
    reference:
      kind === 'transfer'
        ? oneLine(payment?.reference, 40)
            .replace(/[^A-Za-z0-9-]/g, '')
            .slice(0, 40)
        : '',
  };
}

const DATE = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Mensaje organizado para WhatsApp (negritas con *texto*, que WhatsApp muestra en negrita). */
export function whatsappMessage(summary) {
  const out = [];
  out.push(summary.demo ? '*Pedido DEMO · TayGameStore*' : '*Pedido · TayGameStore*');
  if (summary.demo) out.push('⚠️ DEMOSTRACIÓN: pedido de prueba, no es una compra real.');
  out.push(`Referencia: ${summary.reference}`);
  out.push(`Fecha: ${DATE.format(summary.createdAt)} (hora de Colombia)`);
  out.push('');
  out.push('*Cliente*');
  out.push(`Nombre: ${summary.customer.name}`);
  out.push(`Correo: ${summary.customer.email}`);
  out.push('');
  out.push('*Jugador Free Fire*');
  out.push(`ID: ${summary.player.uid} (confirmado por el cliente)`);
  out.push(`Servidor: ${summary.player.server || 'Sin indicar'}`);
  out.push('');
  out.push('*Productos*');
  summary.lines.forEach((line, i) => {
    out.push(`${i + 1}. ${line.name}${line.diamonds ? ` (${COP.format(line.diamonds)} 💎)` : ''}`);
    out.push(`   ${line.qty} × ${cop(line.unitPrice)} = ${cop(line.total)}`);
    if (line.unitDiscount > 0) {
      out.push(`   Precio normal ${cop(line.unitList)} · descuento −${cop(line.unitDiscount)} c/u`);
    }
  });
  out.push('');
  if (summary.discount > 0) {
    out.push(`Subtotal: ${cop(summary.subtotal)}`);
    out.push(`Descuentos: −${cop(summary.discount)}`);
  }
  out.push(`*Total: ${cop(summary.total)} COP*`);
  out.push(`Diamantes en total: ${COP.format(summary.units)} 💎`);
  out.push('');
  out.push('*Pago*');
  const pay = summary.payment;
  if (pay.kind === 'transfer') {
    out.push(`Medio: ${pay.label}`);
    out.push(
      pay.paid
        ? `Estado: el cliente indica que ya transfirió el total (${cop(summary.total)})`
        : 'Estado: pago pendiente',
    );
    if (pay.last4) out.push(`Cuenta de origen: termina en ${pay.last4}`);
    out.push(`Referencia del comprobante: ${pay.reference || 'no indicada'}`);
    out.push('TayGameStore verifica el movimiento antes de entregar.');
  } else if (pay.kind === 'link') {
    out.push(`Medio: ${pay.label}`);
    out.push('Solicitud: envíenme el enlace o los datos de pago por este chat.');
  } else {
    out.push('Medio: por acordar');
    out.push('TayGameStore confirma el total y la forma de pago por este chat.');
  }
  return out.join('\n');
}

/** Número de WhatsApp válido (solo dígitos, 8 a 15) o '' si no hay uno configurado. */
export function whatsappDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : '';
}

/** Enlace oficial de WhatsApp («click to chat»): abre el chat con el mensaje escrito, sin enviarlo. */
export function whatsappUrl(number, message) {
  const digits = whatsappDigits(number);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : '';
}
