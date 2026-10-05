// Constantes del frontend. Precios, estados y disponibilidad vienen SIEMPRE del servidor.

/** Abierto como archivo local: solo vista previa visual (no hay servidor). */
export const PREVIEW_ONLY = location.protocol === 'file:';

// Canales de soporte: los define el servidor en /api/config (SUPPORT_WHATSAPP, SUPPORT_EMAIL).
export const TGS_PUBLIC_SUPPORT = Object.freeze({ whatsapp: '', email: '' });

/** Preferencias de interfaz (sin datos personales ni órdenes). */
export const STORAGE_KEY = 'tgs_ui_v6';
export const FAVORITES_KEY = 'tgs_favorites_v3';
/** Última referencia de pedido de este navegador: permite recuperarlo tras recargar. */
export const LAST_ORDER_KEY = 'tgs_last_order_v1';
/** Claves antiguas que guardaban datos personales u órdenes: se borran al arrancar. */
export const LEGACY_KEYS = ['tgs_ui_v5', 'tgs_invoice_seq_v4'];

export const GAME_INFO = {
  freefire: { name: 'Free Fire', sub: 'Diamantes' },
  roblox: { name: 'Roblox', sub: 'Robux' },
  pubg: { name: 'PUBG Mobile', sub: 'UC' },
  'mobile-legends': { name: 'Mobile Legends', sub: 'Diamantes' },
};

/** Estados finales de una orden: el seguimiento deja de consultar al servidor. */
export const FINAL_ORDER_STATUSES = ['DELIVERED', 'REJECTED', 'EXPIRED', 'REFUNDED'];

/** Máximo de unidades por producto (el servidor lo vuelve a validar). */
export const DEFAULT_MAX_UNITS = 5;
