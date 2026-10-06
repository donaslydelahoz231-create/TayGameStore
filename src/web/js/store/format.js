export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cleanUid = (value) =>
  String(value || '')
    .replace(/\D/g, '')
    .slice(0, 12);

export const validUid = (value) => /^\d{6,12}$/.test(String(value || ''));

// Un solo formateador: toLocaleString crea uno nuevo en cada llamada y el catálogo, el
// carrito y la factura formatean decenas de precios en cada render.
const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export const money = (value) => '$ ' + COP.format(Number(value || 0)) + ' COP';
