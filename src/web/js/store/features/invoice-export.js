import { cartItems, total } from '../cart-model.js';
import { $, setText } from '../dom.js';
import { money } from '../format.js';
import { state } from '../state.js';
import { toast } from '../ui.js';
import { hashCode } from './invoice.js';

// Exportación del comprobante a JPG/PDF, generada íntegramente en el navegador.
// Es una representación visual: no es un documento fiscal.

const FONT = 'Oxanium,Segoe UI,sans-serif';

function invoiceCanvas() {
  const items = cartItems(),
    W = 760,
    H = 540 + items.length * 72,
    S = 2,
    cv = document.createElement('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#151e4f');
  bg.addColorStop(0.62, '#0a1030');
  bg.addColorStop(1, '#050815');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(139,61,255,.13)';
  c.beginPath();
  c.arc(W - 30, 55, 180, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#b18cff';
  c.font = `800 34px ${FONT}`;
  c.fillText('TayGameStore', 42, 48);
  c.fillStyle = '#37d6ff';
  c.font = `800 18px ${FONT}`;
  c.textAlign = 'right';
  c.fillText($('invoiceRef').textContent, W - 42, 48);
  c.textAlign = 'left';
  c.strokeStyle = '#394780';
  c.beginPath();
  c.moveTo(42, 68);
  c.lineTo(W - 42, 68);
  c.stroke();
  let y = 100;
  const fields = [
    ['Cliente', $('invoiceClient').textContent],
    ['UID', $('invoiceUid').textContent],
    ['Nickname', $('invoiceNick').textContent],
    ['Región', $('invoiceRegion').textContent],
  ];
  c.font = `500 15px ${FONT}`;
  for (const [a, b] of fields) {
    c.fillStyle = '#8f9bc9';
    c.fillText(a, 42, y);
    c.fillStyle = '#eef2ff';
    c.font = `700 16px ${FONT}`;
    c.fillText(String(b || '—').slice(0, 42), 160, y);
    c.font = `500 15px ${FONT}`;
    y += 27;
  }
  y += 8;
  c.fillStyle = '#b18cff';
  c.font = `700 14px ${FONT}`;
  c.fillText('DETALLE', 42, y);
  c.textAlign = 'center';
  c.fillText('CANT.', W - 260, y);
  c.textAlign = 'right';
  c.fillText('TOTAL', W - 42, y);
  c.textAlign = 'left';
  y += 15;
  c.fillStyle = '#8b3dff';
  c.fillRect(42, y, W - 84, 2);
  items.forEach((it) => {
    y += 38;
    c.fillStyle = '#eef2ff';
    c.font = `700 17px ${FONT}`;
    c.fillText(it.p.name, 42, y);
    c.textAlign = 'center';
    c.fillStyle = '#37d6ff';
    c.fillText(String(it.qty), W - 260, y);
    c.textAlign = 'right';
    c.fillStyle = '#eef2ff';
    c.fillText(money(it.line), W - 42, y);
    c.textAlign = 'left';
    y += 18;
    c.fillStyle = '#26305f';
    c.fillRect(42, y, W - 84, 1);
  });
  y += 27;
  const g = c.createLinearGradient(42, 0, W - 42, 0);
  g.addColorStop(0, '#8b3dff');
  g.addColorStop(1, '#2f8bff');
  c.fillStyle = g;
  c.roundRect?.(42, y, W - 84, 62, 12);
  if (!c.roundRect) {
    c.beginPath();
    c.rect(42, y, W - 84, 62);
    c.closePath();
  }
  c.fill();
  c.fillStyle = '#fff';
  c.font = `800 21px ${FONT}`;
  c.fillText('TOTAL', 60, y + 40);
  c.textAlign = 'right';
  c.font = `800 28px ${FONT}`;
  c.fillText(money(total()), W - 60, y + 40);
  c.textAlign = 'left';
  y += 92;
  c.fillStyle = '#b18cff';
  c.font = `700 14px ${FONT}`;
  c.fillText('CÓDIGO', 42, y);
  y += 30;
  c.fillStyle = '#37d6ff';
  c.font = `800 26px ${FONT}`;
  c.fillText(hashCode(), 42, y);
  y += 36;
  c.fillStyle = '#8f9bc9';
  c.font = `500 13px ${FONT}`;
  c.fillText('Recarga por ID. Nunca solicita contraseña del juego.', 42, y);
  y += 21;
  c.fillText(
    'En demo local, el pago y la entrega son simulados; en producción provienen del backend.',
    42,
    y,
  );
  return cv;
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

export async function exportInvoice(type) {
  if (!cartItems().length) {
    toast('Agrega una recarga primero.', 'bad');
    return;
  }
  const cv = invoiceCanvas(),
    jpg = await new Promise((res, rej) =>
      cv.toBlob((b) => (b ? res(b) : rej(new Error('JPG_FAIL'))), 'image/jpeg', 0.94),
    );
  const base =
    'TGS-' + String(state.currentOrder?.reference || state.invoice).replace(/[^A-Za-z0-9_-]/g, '_');
  if (type === 'jpg') {
    saveBlob(jpg, base + '.jpg');
    setText('exportMsg', 'JPG generado correctamente.');
    toast('JPG generado.', 'good');
    return;
  }
  if (type === 'share') {
    const f = new File([jpg], base + '.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [f] }))
      return navigator.share({ title: 'Factura TayGameStore', files: [f] });
    saveBlob(jpg, base + '.jpg');
    toast('Tu navegador no permite compartir; se generó el JPG.');
    return;
  }
  const fr = new FileReader();
  fr.onload = () => {
    saveBlob(jpegToPdf(new Uint8Array(fr.result), cv.width, cv.height), base + '.pdf');
    setText('exportMsg', 'PDF generado correctamente.');
    toast('PDF generado.', 'good');
  };
  fr.readAsArrayBuffer(jpg);
}
