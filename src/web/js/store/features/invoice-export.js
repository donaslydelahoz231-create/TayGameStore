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

/** Recorta el texto con «…» para que no se salga de su columna. */
function fit(c, text, max) {
  let t = String(text || '—');
  while (c.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…';
  return t;
}

/**
 * Parte el texto en líneas de hasta `max` px, como mucho `maxLines`; lo que sobre va en la última,
 * recortado con «…» solo si aun así no cabe.
 */
function linesOf(c, text, max, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text || '—')
    .trim()
    .split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines)
    lines.splice(maxLines - 1, Infinity, lines.slice(maxLines - 1).join(' '));
  return lines.map((l) => fit(c, l, max));
}

function rule(c, x1, x2, y, dashed = false) {
  c.save();
  c.strokeStyle = RULE;
  c.lineWidth = dashed ? 1.5 : 1;
  if (dashed) c.setLineDash([6, 5]);
  c.beginPath();
  c.moveTo(x1, y);
  c.lineTo(x2, y);
  c.stroke();
  c.restore();
}

/** El mismo recibo de la pantalla (44-comprobante.css), dibujado en un lienzo. */
async function invoiceCanvas() {
  await Promise.all([
    document.fonts?.load(`700 30px ${DISPLAY}`),
    document.fonts?.load(`600 16px ${UI}`),
  ]).catch(() => {});
  const logo = await loadImage(new URL('brand/tay-logo.svg', document.baseURI).href);
  // Desde aquí hasta el final todo es síncrono: la clave describe exactamente lo que se dibuja.
  const key = receiptKey(),
    base = 'Comprobante-' + invoiceReference().replace(/[^A-Za-z0-9_-]/g, '_');
  const items = invoiceLines(),
    W = 760,
    PAD = 40,
    colW = (W - PAD * 2) / 2,
    client = $('invoiceClient').textContent;
  // Un nombre que no cabe en media columna va en su propia fila (hasta dos líneas) en vez de
  // cortarse con «…»; el alto de la imagen crece lo justo.
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `700 18px ${UI}`;
  const clientLines =
    measure.measureText(client).width > colW - 24 ? linesOf(measure, client, W - PAD * 2, 2) : null;
  const clientRow = clientLines ? 62 + (clientLines.length - 1) * 22 : 0;
  const H = 760 + items.length * 64 + clientRow,
    S = 2,
    cv = document.createElement('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  c.fillStyle = '#fbfbff';
  c.fillRect(0, 0, W, H);

  // Banda de marca
  const band = c.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, '#1b1460');
  band.addColorStop(0.55, '#2a1a8a');
  band.addColorStop(1, '#163a86');
  c.fillStyle = band;
  c.fillRect(0, 0, W, 128);
  const glow = c.createRadialGradient(W, 0, 0, W, 0, 340);
  glow.addColorStop(0, 'rgba(55,214,255,.32)');
  glow.addColorStop(1, 'rgba(55,214,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, 128);
  if (logo) {
    const ratio =
      logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 999 / 160;
    c.drawImage(logo, PAD, 42, 44 * ratio, 44);
  } else {
    c.fillStyle = '#fff';
    c.font = `700 30px ${DISPLAY}`;
    c.fillText('TayGameStore', PAD, 76);
  }
  c.textAlign = 'right';
  c.fillStyle = '#bff3ff';
  c.font = `700 12px ${UI}`;
  c.fillText('COMPROBANTE', W - PAD, 48);
  c.fillStyle = '#fff';
  c.font = `700 20px ${DISPLAY}`;
  c.fillText(fit(c, $('invoiceRef').textContent, 300), W - PAD, 78);
  c.fillStyle = 'rgba(225,230,255,.85)';
  c.font = `500 14px ${UI}`;
  c.fillText($('invoiceDate').textContent, W - PAD, 102);
  c.textAlign = 'left';

  // Datos del jugador
  let y = 128;
  if (clientLines) {
    c.fillStyle = INK_2;
    c.font = `600 12px ${UI}`;
    c.fillText('CLIENTE', PAD, y + 36);
    c.fillStyle = INK;
    c.font = `700 18px ${UI}`;
    clientLines.forEach((line, i) => c.fillText(line, PAD, y + 62 + i * 22));
    y += clientRow;
  }
  const fields = [
    ...(clientLines ? [] : [['CLIENTE', client]]),
    ['UID', $('invoiceUid').textContent],
    ['NICKNAME', $('invoiceNick').textContent],
    ['REGIÓN', $('invoiceRegion').textContent],
  ];
  fields.forEach(([label, value], i) => {
    const x = PAD + (i % 2) * colW,
      top = y + 36 + Math.floor(i / 2) * 62;
    c.fillStyle = INK_2;
    c.font = `600 12px ${UI}`;
    c.fillText(label, x, top);
    c.fillStyle = INK;
    c.font = `700 18px ${UI}`;
    c.fillText(fit(c, value, colW - 24), x, top + 26);
  });
  y += 168;
  rule(c, PAD, W - PAD, y, true);

  // Detalle
  y += 34;
  c.fillStyle = INK_2;
  c.font = `600 12px ${UI}`;
  c.fillText('DETALLE', PAD, y);
  c.textAlign = 'center';
  c.fillText('CANT.', W - 230, y);
  c.textAlign = 'right';
  c.fillText('TOTAL', W - PAD, y);
  c.textAlign = 'left';
  y += 12;
  items.forEach((it) => {
    c.fillStyle = INK;
    c.font = `700 17px ${UI}`;
    c.fillText(fit(c, it.name, W - 340), PAD, y + 28);
    c.fillStyle = INK_2;
    c.font = `500 13px ${UI}`;
    c.fillText(fit(c, it.desc, W - 340), PAD, y + 48);
    c.fillStyle = INK;
    c.font = `600 16px ${UI}`;
    c.textAlign = 'center';
    c.fillText(String(it.qty), W - 230, y + 36);
    c.textAlign = 'right';
    c.font = `700 16px ${DISPLAY}`;
    c.fillText(money(it.line), W - PAD, y + 36);
    c.textAlign = 'left';
    y += 64;
    rule(c, PAD, W - PAD, y);
  });

  // Total
  y += 22;
  const dark = c.createLinearGradient(PAD, 0, W - PAD, 0);
  dark.addColorStop(0, '#141a4a');
  dark.addColorStop(1, '#221a6b');
  c.fillStyle = dark;
  roundRect(c, PAD, y, W - PAD * 2, 78, 16);
  c.fill();
  const accent = c.createLinearGradient(0, y, 0, y + 78);
  accent.addColorStop(0, '#8b3dff');
  accent.addColorStop(1, '#2f8bff');
  c.save();
  roundRect(c, PAD, y, W - PAD * 2, 78, 16);
  c.clip();
  c.fillStyle = accent;
  c.fillRect(PAD, y, 7, 78);
  c.restore();
  c.fillStyle = '#c9cff5';
  c.font = `700 13px ${UI}`;
  c.fillText('TOTAL', PAD + 28, y + 45);
  c.textAlign = 'right';
  c.fillStyle = '#fff';
  c.font = `700 30px ${DISPLAY}`;
  c.fillText(money(invoiceTotal()), W - PAD - 26, y + 50);
  c.textAlign = 'left';

  // Método y moneda
  y += 116;
  for (const [i, [label, value]] of [
    ['MÉTODO', $('invoiceMethod').textContent],
    ['MONEDA', 'COP'],
  ].entries()) {
    const x = PAD + i * colW;
    c.fillStyle = INK_2;
    c.font = `600 12px ${UI}`;
    c.fillText(label, x, y);
    c.fillStyle = INK;
    c.font = `700 17px ${UI}`;
    c.fillText(fit(c, value, colW - 24), x, y + 25);
  }

  // Verificación
  y += 52;
  c.fillStyle = '#f1eeff';
  c.strokeStyle = '#d9d2ff';
  c.lineWidth = 1;
  roundRect(c, PAD, y, W - PAD * 2, 92, 16);
  c.fill();
  c.stroke();
  c.fillStyle = '#5b21b6';
  c.font = `700 12px ${UI}`;
  c.fillText(
    invoiceCode().startsWith('N.º') ? 'COMPROBANTE Y CÓDIGO DE VERIFICACIÓN' : 'CÓDIGO',
    PAD + 22,
    y + 32,
  );
  c.font = `700 ${invoiceCode().length > 12 ? 19 : 24}px ${DISPLAY}`;
  c.fillText(fit(c, invoiceCode(), W - PAD * 2 - 44), PAD + 22, y + 68);

  // Notas
  y += 128;
  c.fillStyle = INK_2;
  c.font = `500 13px ${UI}`;
  for (const line of [
    'Recarga por ID. Nunca solicita contraseña del juego.',
    'Estado confirmado por el servidor de TayGameStore. No es una factura electrónica.',
    'Verifícalo en TayGameStore → Soporte → «Verificar comprobante».',
  ]) {
    c.fillText(line, PAD, y);
    y += 21;
  }
  const foot = c.createLinearGradient(0, 0, W, 0);
  foot.addColorStop(0, '#8b3dff');
  foot.addColorStop(1, '#37d6ff');
  c.fillStyle = foot;
  c.fillRect(0, H - 6, W, 6);
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
  return JSON.stringify([shown, invoiceCode(), invoiceLines(), invoiceTotal()]);
}

/** Dibuja el comprobante y lo pasa a JPG. Guarda solo el JPG y sus medidas, no el lienzo. */
async function drawReceiptJpg() {
  const { cv, key, base } = await invoiceCanvas();
  const jpg = await new Promise((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error('JPG_FAIL'))), 'image/jpeg', 0.94),
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
