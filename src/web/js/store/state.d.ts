/** Tipos mínimos de state.js (para las pruebas en TypeScript). */
export const state: {
  game: string;
  products: Record<string, Array<Record<string, unknown>>>;
  qty: Record<string, number>;
  playerUid: string;
  playerServer: string;
  uidAccepted: boolean;
  currentOrder: Record<string, unknown> | null;
  [key: string]: unknown;
};
export const runtime: Record<string, unknown>;
