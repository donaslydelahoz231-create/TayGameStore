// Constantes y banderas de ejecución del frontend.

const params = new URLSearchParams(location.search);

/** Modo demo local: `file:` o `?demo=1`. Simula jugador y pago (se retira en la Fase 2). */
export const LOCAL_DEMO = location.protocol === 'file:' || params.get('demo') === '1';

/** Vista previa visual: `file:` o `?present=1`. */
export const PREVIEW_ONLY = location.protocol === 'file:' || params.get('present') === '1';

// Soporte: deja estos valores vacíos hasta configurar los canales reales.
// En producción se recomienda enviarlos desde /api/config para mantenerlos bajo control del propietario.
export const TGS_PUBLIC_SUPPORT = Object.freeze({ whatsapp: '', email: '' });

export const STORAGE_KEY = 'tgs_ui_v5';
export const FAVORITES_KEY = 'tgs_favorites_v3';
export const INVOICE_SEQ_KEY = 'tgs_invoice_seq_v4';

export const GAME_INFO = {
  freefire: { name: 'Free Fire', sub: 'Diamantes' },
  roblox: { name: 'Roblox', sub: 'Robux' },
  pubg: { name: 'PUBG Mobile', sub: 'UC' },
  'mobile-legends': { name: 'Mobile Legends', sub: 'Diamantes' },
};

/** Estados finales de una orden: el seguimiento deja de consultar al backend. */
export const FINAL_ORDER_STATUSES = ['FULFILLED', 'DECLINED', 'VOIDED', 'ERROR'];

/**
 * Catálogo de respaldo con precios fijos. Comportamiento heredado del HTML original:
 * se muestra si /api/catalog no devuelve productos. Se elimina en la Fase 2
 * (los precios deben salir del backend).
 */
export const FALLBACK_FREEFIRE = [
  {
    id: 'demo-110',
    name: '100 + 10 Diamantes',
    desc: '110 diamantes totales',
    tag: '+10% Extra',
    diamonds: 110,
    normal: 4000,
    promo: 3800,
    providerAvailable: false,
  },
  {
    id: 'demo-341',
    name: '310 + 31 Diamantes',
    desc: '341 diamantes totales',
    tag: 'Popular',
    diamonds: 341,
    normal: 11000,
    promo: 10500,
    providerAvailable: false,
  },
  {
    id: 'demo-572',
    name: '520 + 52 Diamantes',
    desc: '572 diamantes totales',
    tag: 'Top ventas',
    diamonds: 572,
    normal: 18000,
    promo: 17000,
    providerAvailable: false,
  },
  {
    id: 'demo-1166',
    name: '1.060 + 106 Diamantes',
    desc: '1.166 diamantes totales',
    tag: '+10% Extra',
    diamonds: 1166,
    normal: 33000,
    promo: 31000,
    providerAvailable: false,
  },
  {
    id: 'demo-2398',
    name: '2.180 + 218 Diamantes',
    desc: '2.398 diamantes totales',
    tag: 'Ahorro',
    diamonds: 2398,
    normal: 65000,
    promo: 60000,
    providerAvailable: false,
  },
  {
    id: 'demo-6160',
    name: '5.600 + 560 Diamantes',
    desc: '6.160 diamantes totales',
    tag: 'Elite',
    diamonds: 6160,
    normal: 150000,
    promo: 138000,
    providerAvailable: false,
  },
];
