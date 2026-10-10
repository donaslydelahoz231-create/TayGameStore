import { describe, expect, it } from 'vitest';
import { FREE_FIRE_SERVERS as SERVER_LIST } from '../../src/server/db/schema.js';
import {
  DEFAULT_SERVER,
  FREE_FIRE_SERVERS,
  isServer,
  serverLabel,
} from '../../src/web/js/store/servers.js';

describe('servidores de Free Fire en la tienda', () => {
  it('la lista del navegador coincide con la que acepta el servidor, en el mismo orden', () => {
    expect(FREE_FIRE_SERVERS.map((s) => s.value)).toEqual([...SERVER_LIST]);
  });

  it('el servidor por defecto es válido y los valores desconocidos no tienen nombre', () => {
    expect(isServer(DEFAULT_SERVER)).toBe(true);
    expect(isServer('marte')).toBe(false);
    expect(serverLabel('brasil')).toBe('Brasil');
    expect(serverLabel('marte')).toBe('');
    expect(serverLabel(null)).toBe('');
  });
});
