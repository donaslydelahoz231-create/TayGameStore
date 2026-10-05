export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cleanUid = (value) =>
  String(value || '')
    .replace(/\D/g, '')
    .slice(0, 12);

export const validUid = (value) => /^\d{6,12}$/.test(String(value || ''));

export const money = (value) =>
  '$ ' + Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + ' COP';
