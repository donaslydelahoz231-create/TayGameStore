/** Tipos de servers.js (para las pruebas en TypeScript). */
export const FREE_FIRE_SERVERS: ReadonlyArray<{ value: string; label: string }>;
export const DEFAULT_SERVER: string;
export function isServer(value: unknown): boolean;
export function serverLabel(value: string | null | undefined): string;
