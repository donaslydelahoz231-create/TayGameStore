import { LOCAL_DEMO, PREVIEW_ONLY } from './config.js';

/** Estado de la interfaz. Se persiste parcialmente en localStorage (ver storage.js). */
export const state = {
  game: 'freefire',
  tariff: 'normal',
  products: { freefire: [], roblox: [], pubg: [], 'mobile-legends': [] },
  qty: {},
  favorites: [],
  playerUid: '',
  nickname: '',
  region: '',
  regionLabel: '',
  regionSources: [],
  verified: false,
  customerName: '',
  customerEmail: '',
  invoice: 1,
  session: null,
  currentOrder: null,
  purchaseHistory: [],
  serverConfig: null,
  checkout: null,
  authMode: 'login',
  previewOnly: PREVIEW_ONLY,
  localDemo: LOCAL_DEMO,
  storeUnlocked: false,
};

/** Estado transitorio de ejecución (no se persiste). */
export const runtime = {
  playerBusy: false,
  paymentBusy: false,
  checkoutConfig: null,
  pollTimer: null,
};
