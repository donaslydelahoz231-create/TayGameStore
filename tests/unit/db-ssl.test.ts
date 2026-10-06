import { describe, expect, it } from 'vitest';
import { pinVerifiedSslMode } from '../../src/server/db/client.js';

describe('modo SSL de la base de datos', () => {
  const base = 'postgres://usuario:cl%40ve@host.example:5432/tienda';

  it.each(['prefer', 'require', 'verify-ca'])('fija verify-full en lugar de %s', (mode) => {
    expect(pinVerifiedSslMode(`${base}?sslmode=${mode}`)).toBe(`${base}?sslmode=verify-full`);
    expect(pinVerifiedSslMode(`${base}?channel_binding=require&sslmode=${mode}&x=1`)).toBe(
      `${base}?channel_binding=require&sslmode=verify-full&x=1`,
    );
  });

  it('no toca disable, no-verify, verify-full ni cadenas sin sslmode', () => {
    for (const url of [
      `${base}?sslmode=disable`,
      `${base}?sslmode=no-verify`,
      `${base}?sslmode=verify-full`,
      base,
    ]) {
      expect(pinVerifiedSslMode(url)).toBe(url);
    }
  });

  it('respeta a quien pide la semántica de libpq', () => {
    const url = `${base}?uselibpqcompat=true&sslmode=require`;
    expect(pinVerifiedSslMode(url)).toBe(url);
  });

  it('solo cambia el parámetro, no la clave ni otros valores parecidos', () => {
    const url = 'postgres://u:sslmode=require@h/db?channel_binding=require';
    expect(pinVerifiedSslMode(url)).toBe(url);
  });
});
