import { $, setText } from '../dom.js';
import { money } from '../format.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import {
  hasReceipt,
  invoiceCode,
  invoiceLines,
  invoiceReference,
  invoiceTotal,
} from './invoice.js';
import { receiptText, storeWhatsAppDigits } from './receipt-text.js';
import { humanStatus } from './order-status.js';

// Exportación del comprobante a JPG/PDF, generada íntegramente en el navegador. Solo existe para
// pedidos pagados: número y código de verificación del servidor (sin borradores ni comprobantes
// de pedidos sin pagar). Es una representación visual: no es un documento fiscal.

const DISPLAY = 'Unbounded, Segoe UI, sans-serif';
const UI = '"Instrument Sans", Segoe UI, sans-serif';
const INK = '#141a4a';
const INK_2 = '#5b628f';
const RULE = '#dfe2f3';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

/** Divide el texto en grafemas (letras, emojis y símbolos compuestos no se parten por la mitad). */
const graphemes = (text) =>
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? Array.from(
        new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(text),
        (s) => s.segment,
      )
    : Array.from(text);

/** Recorta con «…» solo como último recurso (texto que supera `maxLines` líneas completas). */
function ellipsize(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  const parts = graphemes(text);
  let t = text;
  while (parts.length > 1 && c.measureText(t + '…').width > max) {
    parts.pop();
    t = parts.join('').trimEnd();
  }
  return t === text ? t : t + '…';
}

/**
 * Parte el texto en líneas que caben en `max` px con la fuente actual. Las palabras más largas que
 * la columna (códigos, nicks sin espacios) se parten por letras en vez de salirse. Nunca recorta lo
 * que cabe en `maxLines` líneas.
 */
function wrap(c, text, max, maxLines = 4) {
  const lines = [];
  let line = '';
  const push = (word) => {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width <= max) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = '';
    if (c.measureText(word).width <= max) {
      line = word;
      return;
    }
    let chunk = '';
    for (const g of graphemes(word)) {
      if (chunk && c.measureText(chunk + g).width > max) {
        lines.push(chunk);
        chunk = g;
      } else chunk += g;
    }
    line = chunk;
  };
  for (const word of String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean))
    push(word);
  if (line) lines.push(line);
  if (!lines.length) lines.push('—');
  if (lines.length > maxLines) {
    const rest = lines.splice(maxLines - 1).join(' ');
    lines.push(ellipsize(c, rest, max));
  }
  return lines;
}

/** Tamaño de letra más grande (de `size` hacia abajo) con el que el texto cabe en `max` px. */
function fitSize(c, text, weight, family, size, max, min = 12) {
  for (let s = size; s > min; s -= 1) {
    c.font = `${weight} ${s}px ${family}`;
    if (c.measureText(text).width <= max) return s;
  }
  c.font = `${weight} ${min}px ${family}`;
  return min;
}

function rule(c, x1, x2, y, dashed = false) {
  c.save();
  c.strokeStyle = RULE;
  c.lineWidth = 1;
  if (dashed) c.setLineDash([6, 5]);
  c.beginPath();
  c.moveTo(x1, y);
  c.lineTo(x2, y);
  c.stroke();
  c.restore();
}

/** Estado que imprime el comprobante: nunca presenta como exitosa una compra reembolsada. */
function receiptStatus(order) {
  const map = {
    PAID: ['ok', 'Pago confirmado'],
    DELIVERING: ['ok', 'Pago confirmado · Recarga en proceso'],
    DELIVERED: ['ok', 'Pago confirmado · Entregado'],
    NEEDS_REVIEW: ['warn', 'Pago registrado · En revisión'],
    REFUNDED: ['bad', 'Reembolsado'],
  };
  const [tone, text] = map[order?.status] || ['warn', humanStatus(order)];
  const palette = {
    ok: { bg: '#e7f8ef', ink: '#0b7a43', dot: '#16a34a' },
    warn: { bg: '#fff3dd', ink: '#9a4f05', dot: '#f59e0b' },
    bad: { bg: '#fdeaea', ink: '#b42318', dot: '#e5484d' },
  };
  return { text, tone, ...palette[tone] };
}

/** Fecha y hora del pedido (hora local del cliente, como en la pantalla). */
function receiptDate(order) {
  const when = new Date(order?.createdAt || Date.now());
  const time = when.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return `${$('invoiceDate')?.textContent || ''} · ${time}`;
}

/** Jugador: el nick en grande y, debajo y en pequeño, su ID y su región (lo que se tenga). */
function playerField(nick, uid, region) {
  const known = (v) => v && v !== '—';
  const details = [known(uid) ? `ID ${uid}` : '', known(region) ? region : ''].filter(Boolean);
  if (known(nick)) return [nick, details.join(' · ')];
  return [details[0] || '—', details.slice(1).join(' · ')];
}

/** Ícono del estado dentro de un círculo: ✓ (confirmado), ! (en revisión) o × (reembolsado). */
function statusIcon(c, x, y, r, status) {
  c.save();
  c.fillStyle = status.dot;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#fff';
  c.fillStyle = '#fff';
  c.lineWidth = 2.4;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  if (status.tone === 'ok') {
    c.moveTo(x - r * 0.42, y + r * 0.02);
    c.lineTo(x - r * 0.1, y + r * 0.34);
    c.lineTo(x + r * 0.45, y - r * 0.3);
    c.stroke();
  } else if (status.tone === 'bad') {
    const k = r * 0.34;
    c.moveTo(x - k, y - k);
    c.lineTo(x + k, y + k);
    c.moveTo(x + k, y - k);
    c.lineTo(x - k, y + k);
    c.stroke();
  } else {
    c.moveTo(x, y - r * 0.45);
    c.lineTo(x, y + r * 0.1);
    c.stroke();
    c.beginPath();
    c.arc(x, y + r * 0.42, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Rombos de diamante, apenas visibles, en la banda de la marca. */
function diamonds(c, W, H) {
  c.save();
  c.strokeStyle = 'rgba(160,220,255,.16)';
  c.lineWidth = 1.2;
  for (const [x, y, s] of [
    [W * 0.52, 30, 9],
    [W * 0.58, 70, 6],
    [W * 0.63, 22, 5],
    [W * 0.47, 92, 7],
    [W * 0.69, 104, 10],
    [W * 0.9, 128, 8],
    [W * 0.78, 132, 5],
  ]) {
    if (y + s > H) continue;
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s * 0.8, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s * 0.8, y);
    c.closePath();
    c.stroke();
  }
  c.restore();
}

/**
 * Dibuja el comprobante en `c` y devuelve sus medidas. Se llama dos veces: primero sobre un lienzo
 * de 1×1 solo para medir (el alto, el de la tarjeta y la altura de las muescas salen del contenido
 * real) y luego sobre el lienzo definitivo con esas medidas (`d.geom`). Cada texto se mide antes de
 * dibujarse: lo largo se parte en líneas y las columnas se calculan con el ancho real de los
 * importes, así nada se sale, se encima ni se recorta.
 */
function paintReceipt(c, d) {
  const { W } = d;
  const geom = { perfs: [] };
  const BAND = 150,
    CARD_X = 28,
    CARD_Y = 100,
    CARD_W = W - CARD_X * 2,
    PAD = CARD_X + 32,
    inner = W - PAD * 2;

  // Banda de la marca con rombos discretos; logo y número del comprobante.
  const band = c.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#1b1460');
  band.addColorStop(0.6, '#2a1a8a');
  band.addColorStop(1, '#1d3a8a');
  c.fillStyle = band;
  c.fillRect(0, 0, W, BAND);
  diamonds(c, W, BAND);
  let logoRight;
  if (d.logo) {
    const h = 30;
    const ratio =
      d.logo.naturalWidth && d.logo.naturalHeight
        ? d.logo.naturalWidth / d.logo.naturalHeight
        : 999 / 160;
    c.drawImage(d.logo, CARD_X + 4, 32, h * ratio, h);
    logoRight = CARD_X + 4 + h * ratio;
  } else {
    c.fillStyle = '#fff';
    c.font = `700 22px ${DISPLAY}`;
    c.fillText('TayGameStore', CARD_X + 4, 56);
    logoRight = CARD_X + 4 + c.measureText('TayGameStore').width;
  }
  const headMax = W - CARD_X - 4 - logoRight - 28;
  c.textAlign = 'right';
  c.fillStyle = '#bff3ff';
  c.font = `700 11px ${UI}`;
  c.fillText('COMPROBANTE DE PAGO', W - CARD_X - 4, 38);
  c.fillStyle = '#fff';
  fitSize(c, d.number, 700, DISPLAY, 20, headMax);
  c.fillText(d.number, W - CARD_X - 4, 66);
  c.textAlign = 'left';

  // Tarjeta tipo ticket (con sombra suave) y sus muescas, con las medidas de la primera pasada.
  if (d.geom) {
    c.save();
    c.shadowColor = 'rgba(20,26,74,.14)';
    c.shadowBlur = 26;
    c.shadowOffsetY = 8;
    c.fillStyle = '#fff';
    roundRect(c, CARD_X, CARD_Y, CARD_W, d.geom.cardEnd - CARD_Y, 18);
    c.fill();
    c.restore();
    for (const py of d.geom.perfs) {
      c.fillStyle = d.bg;
      for (const x of [CARD_X, CARD_X + CARD_W]) {
        c.beginPath();
        c.arc(x, py, 11, 0, Math.PI * 2);
        c.fill();
      }
      rule(c, CARD_X + 20, CARD_X + CARD_W - 20, py, true);
    }
  }
  const perforation = (py) => geom.perfs.push(py);

  // 1. Estado con ícono y fecha.
  let y = CARD_Y + 34;
  statusIcon(c, PAD + 13, y, 13, d.status);
  c.font = `700 15px ${UI}`;
  const statusLines = wrap(c, d.status.text, inner - 40, 2);
  c.fillStyle = d.status.ink;
  statusLines.forEach((line, j) => c.fillText(line, PAD + 36, y + 5 + j * 20));
  y += 5 + (statusLines.length - 1) * 20 + 22;
  c.fillStyle = INK_2;
  c.font = `500 13px ${UI}`;
  for (const line of wrap(c, d.date, inner - 36, 2)) {
    c.fillText(line, PAD + 36, y);
    y += 18;
  }

  // 2. Total, protagonista.
  y += 18;
  c.fillStyle = INK_2;
  c.font = `700 11px ${UI}`;
  c.fillText(d.refunded ? 'TOTAL (REEMBOLSADO)' : 'TOTAL PAGADO', PAD, y);
  const size = fitSize(c, d.total, 700, DISPLAY, 36, inner, 16);
  y += size + 8;
  const ink = c.createLinearGradient(PAD, 0, PAD + c.measureText(d.total).width, 0);
  // Reembolsado: el importe en gris, para que no se lea como un pago vigente.
  ink.addColorStop(0, d.refunded ? '#5b628f' : '#2a1a8a');
  ink.addColorStop(1, d.refunded ? '#8e93b5' : '#7c3aed');
  c.fillStyle = ink;
  c.fillText(d.total, PAD, y);
  y += 26;
  perforation(y);

  // 3. Datos: cliente, método de pago, jugador y pedido.
  y += 28;
  const GAP = 28;
  const colW = (inner - GAP) / 2;
  const rows = [];
  for (let i = 0; i < d.fields.length; i += 2) rows.push(d.fields.slice(i, i + 2));
  const LABEL = 18,
    LINE = 21,
    SUB = 17,
    ROW_GAP = 16;
  const laid = rows.map((row) =>
    row.map(([label, value, sub]) => {
      c.font = `700 16px ${UI}`;
      const lines = wrap(c, value, colW, 3);
      c.font = `500 12.5px ${UI}`;
      const subs = sub ? wrap(c, sub, colW, 2) : [];
      return {
        label,
        lines,
        subs,
        h: LABEL + 4 + lines.length * LINE + (subs.length ? 2 + subs.length * SUB : 0),
      };
    }),
  );
  const rowH = laid.map((row) => Math.max(...row.map((f) => f.h)));
  let ry = y - 12;
  laid.forEach((row, r) => {
    row.forEach((f, i) => {
      const x = PAD + i * (colW + GAP);
      c.fillStyle = INK_2;
      c.font = `700 11px ${UI}`;
      c.fillText(f.label, x, ry + 12);
      c.fillStyle = INK;
      c.font = `700 16px ${UI}`;
      f.lines.forEach((line, j) => c.fillText(line, x, ry + LABEL + 4 + 15 + j * LINE));
      c.fillStyle = INK_2;
      c.font = `500 12.5px ${UI}`;
      const subTop = ry + LABEL + 4 + f.lines.length * LINE + 2;
      f.subs.forEach((line, j) => c.fillText(line, x, subTop + 13 + j * SUB));
    });
    ry += rowH[r] + ROW_GAP;
  });
  y = ry - ROW_GAP + 10;

  // 4. Detalle: columnas medidas con el importe más largo; el nombre se parte en líneas.
  y += 26;
  c.font = `700 15px ${DISPLAY}`;
  const valueW = Math.max(...d.items.map((it) => c.measureText(money(it.line)).width), 60);
  c.font = `600 15px ${UI}`;
  const qtyW = Math.max(...d.items.map((it) => c.measureText(String(it.qty)).width), 44);
  const COL_GAP = 22;
  const nameW = inner - valueW - qtyW - COL_GAP * 2;
  const qtyX = PAD + nameW + COL_GAP + qtyW / 2;
  c.fillStyle = INK_2;
  c.font = `700 11px ${UI}`;
  c.fillText('DETALLE', PAD, y);
  c.textAlign = 'center';
  c.fillText('CANT.', qtyX, y);
  c.textAlign = 'right';
  c.fillText('VALOR', W - PAD, y);
  c.textAlign = 'left';
  y += 12;
  rule(c, PAD, W - PAD, y);
  d.items.forEach((it, index) => {
    c.font = `700 16px ${UI}`;
    const name = wrap(c, it.name, nameW, 3);
    c.font = `500 12.5px ${UI}`;
    const sub = it.qty > 1 ? wrap(c, `${money(Math.round(it.line / it.qty))} c/u`, nameW, 1) : [];
    const top = y + 14;
    c.fillStyle = INK;
    c.font = `700 16px ${UI}`;
    name.forEach((line, j) => c.fillText(line, PAD, top + 15 + j * 21));
    c.fillStyle = INK_2;
    c.font = `500 12.5px ${UI}`;
    sub.forEach((line, j) => c.fillText(line, PAD, top + 15 + name.length * 21 + 2 + j * 17));
    c.fillStyle = INK;
    c.font = `600 15px ${UI}`;
    c.textAlign = 'center';
    c.fillText(String(it.qty), qtyX, top + 15);
    c.textAlign = 'right';
    c.font = `700 15px ${DISPLAY}`;
    c.fillText(money(it.line), W - PAD, top + 15);
    c.textAlign = 'left';
    y = top + name.length * 21 + (sub.length ? 2 + sub.length * 17 : 0) + 12;
    if (index < d.items.length - 1) rule(c, PAD, W - PAD, y);
  });
  y += 14;
  perforation(y);

  // 5. Verificación con el sello de la tienda.
  y += 32;
  const SEAL = 34;
  const textW = inner - SEAL * 2 - 20;
  const top = y;
  c.fillStyle = INK_2;
  c.font = `700 11px ${UI}`;
  c.fillText('CÓDIGO DE VERIFICACIÓN', PAD, y);
  c.fillStyle = '#5b21b6';
  const codeSize = fitSize(c, d.code, 700, DISPLAY, 19, textW, 12);
  y += codeSize + 10;
  c.fillText(d.code, PAD, y);
  c.fillStyle = INK_2;
  c.font = `500 12.5px ${UI}`;
  for (const line of wrap(c, `Verifícalo o pide ayuda en ${d.host} → Soporte.`, textW, 2)) {
    y += 20;
    c.fillText(line, PAD, y);
  }
  const sx = W - PAD - SEAL,
    sy = Math.max(top - 4 + SEAL / 1.2, (top + y) / 2 - 4);
  c.save();
  c.strokeStyle = 'rgba(91,33,182,.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(sx, sy, SEAL, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([3, 3]);
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(sx, sy, SEAL - 6, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  c.fillStyle = 'rgba(91,33,182,.85)';
  c.textAlign = 'center';
  c.font = `700 15px ${DISPLAY}`;
  c.fillText('TGS', sx, sy + 2);
  c.font = `700 8px ${UI}`;
  c.fillText('ORIGINAL', sx, sy + 15);
  c.textAlign = 'left';
  y = Math.max(y, sy + SEAL) + 28;
  geom.cardEnd = y;

  // 6. Nota al pie, fuera de la tarjeta.
  y += 28;
  c.fillStyle = INK_2;
  c.font = `500 12px ${UI}`;
  c.textAlign = 'center';
  for (const line of wrap(
    c,
    'Recarga por ID · Nunca pedimos tu contraseña del juego · No es una factura electrónica',
    W - CARD_X * 2,
    2,
  )) {
    c.fillText(line, W / 2, y);
    y += 17;
  }
  c.textAlign = 'left';
  y += 12;
  const foot = c.createLinearGradient(0, 0, W, 0);
  foot.addColorStop(0, '#8b3dff');
  foot.addColorStop(1, '#37d6ff');
  c.fillStyle = foot;
  c.fillRect(0, y, W, 4);
  geom.H = y + 4;
  return geom;
}

/** El comprobante del pedido pagado, dibujado en un lienzo del alto justo de su contenido. */
async function invoiceCanvas() {
  await Promise.all([
    document.fonts?.load(`700 30px ${DISPLAY}`),
    document.fonts?.load(`600 16px ${UI}`),
    document.fonts?.load(`500 16px ${UI}`),
  ]).catch(() => {});
  const logo = await loadImage(new URL('brand/tay-logo.svg', document.baseURI).href);
  // Desde aquí hasta el final todo es síncrono: la clave describe exactamente lo que se dibuja.
  const key = receiptKey(),
    base = 'Comprobante-' + invoiceReference().replace(/[^A-Za-z0-9_-]/g, '_');
  const order = state.currentOrder;
  const text = (id) => $(id)?.textContent?.trim() || '—';
  const d = {
    W: 760,
    bg: '#eef0f9',
    geom: null,
    logo,
    number: `N.º ${String(order.receipt.number).padStart(6, '0')}`,
    code: order.receipt.verificationCode,
    date: receiptDate(order),
    status: receiptStatus(order),
    refunded: order.status === 'REFUNDED',
    host: location.host || 'TayGameStore',
    fields: [
      ['CLIENTE', text('invoiceClient')],
      ['MÉTODO DE PAGO', text('invoiceMethod')],
      ['JUGADOR', ...playerField(text('invoiceNick'), text('invoiceUid'), text('invoiceRegion'))],
      ['PEDIDO', invoiceReference()],
    ],
    items: invoiceLines(),
    total: money(invoiceTotal()),
  };
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  d.geom = paintReceipt(probe.getContext('2d'), d);
  const H = Math.ceil(d.geom.H);
  const S = 2,
    cv = document.createElement('canvas');
  cv.width = d.W * S;
  cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  c.fillStyle = d.bg;
  c.fillRect(0, 0, d.W, H);
  paintReceipt(c, d);
  return { cv, key, base };
}

function saveBlob(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(u);
    a.remove();
  }, 900);
}

/** Construye un PDF de una página que contiene el JPEG del comprobante (DCTDecode). */
function jpegToPdf(jpegBytes, width, height) {
  const enc = new TextEncoder(),
    parts = [],
    off = [];
  let len = 0;
  const put = (v) => {
      const z = typeof v === 'string' ? enc.encode(v) : v;
      parts.push(z);
      len += z.length;
    },
    obj = (n, s) => {
      off[n] = len;
      put(n + ' 0 obj\n' + s + '\nendobj\n');
    };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const pw = 420,
    ph = Math.round(((pw * height) / width) * 100) / 100;
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  off[4] = len;
  put(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  );
  put(jpegBytes);
  put('\nendstream\nendobj\n');
  const stream = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const xr = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += ('0000000000' + off[i]).slice(-10) + ' 00000 n \n';
  put(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  const out = new Uint8Array(len);
  let pos = 0;
  parts.forEach((z) => {
    out.set(z, pos);
    pos += z.length;
  });
  return new Blob([out], { type: 'application/pdf' });
}

/**
 * Texto que acompaña al comprobante: un dato por línea (pedido, ID, paquetes, total, pago y
 * código para verificarlo), listo para copiar. Solo datos del propio pedido (receipt-text.js).
 */
export function receiptShareText() {
  return receiptText(state.currentOrder, location.origin);
}

/** WhatsApp oficial de la tienda (SUPPORT_WHATSAPP) en dígitos; '' si no está configurado. */
export function storeWhatsApp() {
  return storeWhatsAppDigits(state.serverConfig?.support?.whatsapp);
}

/**
 * Opciones para enviar el JPG descargado. Con `store` (dígitos del WhatsApp de la tienda) el enlace
 * abre directamente el chat de TayGameStore; sin él, el cliente elige a quién enviarlo.
 */
function showSharePanel(text, store = '') {
  const panel = $('sharePanel');
  if (!panel) return;
  const subject = 'Comprobante TayGameStore ' + invoiceReference();
  $('shareWa').href = 'https://wa.me/' + store + '?text=' + encodeURIComponent(text);
  setText('shareWaLabel', store ? 'WhatsApp de TayGameStore' : 'WhatsApp');
  $('shareMail').href =
    'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
  panel.dataset.ref = invoiceReference();
  panel.hidden = false;
  setText('exportMsg', 'JPG descargado: adjúntalo al enviarlo por WhatsApp o correo.');
  $('shareWa').focus({ preventScroll: true });
}

/** Copia el texto del comprobante para pegarlo donde el cliente quiera. */
export async function copyShareText() {
  const text = receiptShareText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('Datos del comprobante copiados.', 'good');
  } catch {
    toast('No se pudo copiar: compártelo por WhatsApp o correo.', 'bad');
  }
}

/** Todo lo que dibuja el comprobante: si algo cambia, la imagen preparada ya no sirve. */
function receiptKey() {
  if (!hasReceipt()) return '';
  const shown = [
    'invoiceRef',
    'invoiceDate',
    'invoiceClient',
    'invoiceUid',
    'invoiceNick',
    'invoiceRegion',
    'invoiceMethod',
  ].map((id) => $(id)?.textContent ?? '');
  const order = state.currentOrder;
  return JSON.stringify([
    shown,
    invoiceCode(),
    invoiceLines(),
    invoiceTotal(),
    order?.status,
    order?.createdAt,
  ]);
}

/** Dibuja el comprobante y lo pasa a JPG. Guarda solo el JPG y sus medidas, no el lienzo. */
async function drawReceiptJpg() {
  const { cv, key, base } = await invoiceCanvas();
  const jpg = await new Promise((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error('JPG_FAIL'))), 'image/jpeg', 0.9),
  );
  const { width, height } = cv;
  // Safari libera la memoria del lienzo (unos 15 MB) en cuanto mide 0.
  cv.width = cv.height = 0;
  return { jpg, base, key, width, height };
}

/**
 * Imagen preparada de antemano. En el celular, «Compartir» y «Enviar a TayGameStore» solo abren
 * el menú de compartir dentro del toque del cliente: si la imagen se dibujara después del toque
 * (fuentes, logo, JPG), Safari podría rechazarlo por haber pasado el gesto. Se dibuja en cuanto el
 * comprobante aparece y se reutiliza mientras no cambie nada de lo que muestra.
 */
let prepared = null;
let preparing = 0;

function prepareReceiptImage() {
  const key = receiptKey();
  if (!key || prepared?.key === key) return;
  const entry = { key, promise: drawReceiptJpg() };
  prepared = entry;
  entry.promise.catch(() => {
    if (prepared === entry) prepared = null; // Se vuelve a dibujar al pulsar.
  });
}

/** Tras cada render: si hay comprobante, prepara su imagen sin frenar la página. */
export function scheduleReceiptImage() {
  if (!hasReceipt() || preparing) return;
  preparing = setTimeout(() => {
    preparing = 0;
    prepareReceiptImage();
  }, 300);
}

/** Imagen JPG del comprobante (la misma de «JPG»), sus medidas y el nombre base de sus archivos. */
async function receiptJpg() {
  const key = receiptKey();
  if (key && prepared?.key === key) {
    const ready = await prepared.promise.catch(() => null);
    if (ready?.key === key) return ready;
  }
  return drawReceiptJpg();
}

/**
 * «Enviar a TayGameStore»: el cliente manda al WhatsApp de la tienda la imagen del comprobante y
 * sus datos en texto, sin escribir nada. En el celular se abre el menú de compartir con la imagen
 * y el texto adjuntos (elige el chat de TayGameStore). Donde no se pueden compartir archivos
 * (computador): se descarga la imagen, se copia el texto y se abre el chat de la tienda con el
 * texto escrito. Nada se envía solo: el cliente pulsa enviar en WhatsApp.
 */
export async function sendReceiptToStore() {
  if (!hasReceipt()) {
    toast('El comprobante se emite cuando se confirma el pago.', 'bad');
    return;
  }
  const store = storeWhatsApp();
  if (!store) {
    toast('La tienda no tiene WhatsApp configurado. Usa «Compartir» o «Copiar datos».', 'bad');
    return;
  }
  const { jpg, base } = await receiptJpg();
  const file = new File([jpg], base + '.jpg', { type: 'image/jpeg' });
  const text = receiptShareText();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: 'Comprobante TayGameStore', text, files: [file] });
      setText(
        'exportMsg',
        'Elige el chat de TayGameStore en WhatsApp: la imagen va con tus datos.',
      );
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // El cliente cerró el menú de compartir.
    }
  }
  saveBlob(jpg, base + '.jpg');
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // Sin permiso de portapapeles: el texto ya va escrito en el chat y queda «Copiar datos».
  }
  showSharePanel(text, store);
  // Abre el chat de la tienda; si el navegador lo bloquea, queda el botón del panel.
  window.open($('shareWa').href, '_blank', 'noopener');
  setText(
    'exportMsg',
    'Se abrió el chat de TayGameStore con tus datos escritos: adjunta el JPG descargado y envía.' +
      (copied ? ' El texto también quedó copiado.' : ''),
  );
}

export async function exportInvoice(type) {
  if (!hasReceipt()) {
    toast('El comprobante se emite cuando Mercado Pago confirma el pago.', 'bad');
    return;
  }
  const { jpg, base, width, height } = await receiptJpg();
  if (type === 'jpg') {
    saveBlob(jpg, base + '.jpg');
    setText('exportMsg', 'JPG generado correctamente.');
    toast('JPG generado.', 'good');
    return;
  }
  if (type === 'share') {
    const file = new File([jpg], base + '.jpg', { type: 'image/jpeg' });
    const text = receiptShareText();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: 'Comprobante TayGameStore', text, files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // El cliente cerró el menú de compartir.
      }
    }
    // Sin menú de compartir con archivos (computador, algunos navegadores): se descarga el JPG y
    // se ofrecen WhatsApp, correo o copiar los datos para adjuntarlo.
    saveBlob(jpg, base + '.jpg');
    showSharePanel(text);
    return;
  }
  const fr = new FileReader();
  fr.onload = () => {
    saveBlob(jpegToPdf(new Uint8Array(fr.result), width, height), base + '.pdf');
    setText('exportMsg', 'PDF generado correctamente.');
    toast('PDF generado.', 'good');
  };
  fr.readAsArrayBuffer(jpg);
}
