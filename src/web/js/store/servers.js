/**
 * Servidores (regiones) de Free Fire que el cliente puede elegir. Deben coincidir con
 * FREE_FIRE_SERVERS de src/server/db/schema.ts (lo comprueba tests/unit/servers.test.ts).
 * La recarga se entrega en el servidor de la cuenta: el cliente lo declara y el operador
 * lo confirma antes de entregar; nadie lo adivina ni lo consulta con fuentes no autorizadas.
 */
export const FREE_FIRE_SERVERS = [
  { value: 'latam', label: 'Latinoamérica' },
  { value: 'brasil', label: 'Brasil' },
  { value: 'norteamerica', label: 'Norteamérica' },
  { value: 'europa', label: 'Europa' },
  { value: 'oriente_medio', label: 'Oriente Medio' },
  { value: 'india', label: 'India' },
  { value: 'asia', label: 'Asia' },
  { value: 'no_seguro', label: 'No estoy seguro' },
];

export const DEFAULT_SERVER = 'latam';

export function isServer(value) {
  return FREE_FIRE_SERVERS.some((s) => s.value === value);
}

/** Nombre visible del servidor; '' si no hay o no es válido. */
export function serverLabel(value) {
  return FREE_FIRE_SERVERS.find((s) => s.value === value)?.label ?? '';
}
