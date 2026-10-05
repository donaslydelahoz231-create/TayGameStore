import { PREVIEW_ONLY } from './config.js';

/**
 * Estado de la interfaz. Es una vista: la fuente de verdad de precios, órdenes, pagos y
 * entregas es el servidor. Solo carrito, juego, tarifa y favoritos se guardan localmente.
 */
export const state = {
  game: 'freefire',
  tariff: 'normal',
  products: { freefire: [], roblox: [], pubg: [], 'mobile-legends': [] },
  catalogStatus: 'loading', // loading | ready | empty | error
  qty: {},
  favorites: [],
  playerUid: '',
  /** UID con formato válido aceptado por el cliente (la identidad la verifica el operador). */
  uidAccepted: false,
  /**
   * Consulta instantánea del jugador (solo con proveedor autorizado en el servidor):
   * { ref, nickname, region, uid, expiresAt, confirmed }. No se persiste.
   */
  playerLookup: null,
  customerName: '',
  customerEmail: '',
  session: null,
  /** Orden actual tal como la devuelve el servidor (PublicOrder). */
  currentOrder: null,
  purchaseHistory: [],
  serverConfig: null,
  serverReachable: null,
  previewOnly: PREVIEW_ONLY,
  storeUnlocked: false,
};

/** Estado transitorio de ejecución (no se persiste). */
export const runtime = {
  playerBusy: false,
  paymentBusy: false,
  orderBusy: false,
  pollTimer: null,
  pollStartedAt: 0,
  /** Clave de idempotencia del checkout en curso (misma clave en cada reintento). */
  checkoutKey: null,
};
