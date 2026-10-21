import { describe, expect, it } from 'vitest';
import {
  HANDLE_PATTERN,
  HANDLE_WORDS,
  handleProblem,
  profileKindLabel,
  randomHandle,
  USER_SHEET_COLUMNS,
  userSheetRow,
} from '../../src/server/services/profiles.js';

describe('nombre de usuario: formato', () => {
  it.each(['Lobo', 'HalconFugaz482', 'el_rey_ff', 'Ana', 'Ab_cd_ef_gh_ij_kl_mn'])(
    'acepta %s',
    (handle) => {
      expect(handleProblem(handle)).toBeUndefined();
    },
  );

  it.each([
    ['ab', 'muy corto'],
    ['A234567890123456789XX', 'más de 20'],
    ['1Lobo', 'empieza por número'],
    ['_Lobo', 'empieza por _'],
    ['Lobo Feroz', 'espacio'],
    ['Leñador', 'ñ'],
    ['Pantéra', 'tilde'],
    ['<script>', 'html'],
    ['=HYPERLINK', 'fórmula'],
    ['lobo@mail', 'correo'],
    ['', 'vacío'],
  ])('rechaza %s (%s)', (handle) => {
    expect(handleProblem(handle)).toBe('format');
  });

  it('rechaza números largos que podrían ser un celular o un documento', () => {
    expect(handleProblem('Lobo3001234567')).toBe('digits');
    expect(handleProblem('x1234567')).toBe('digits');
    expect(handleProblem('Lobo123456')).toBeUndefined();
  });
});

describe('nombre de usuario: nombres reservados (suplantación)', () => {
  it.each([
    'Admin',
    'el_admin',
    'AdM1n_ff',
    'X4dmin',
    'TayGameStore',
    'Tay_Game',
    'T4yGame',
    'Tay',
    'Tay_1',
    'TGS',
    'tgs_2',
    'SoporteTay',
    'Support',
    'Moderador',
    'Staff1',
    'Oficial_FF',
    'Dueno',
    'Owner',
    'Garena',
    'FreeFireLatam',
    'Fr33Fire',
    'Nequi_pagos',
    'MercadoPago',
    'Sistema',
  ])('rechaza %s', (handle) => {
    expect(handleProblem(handle)).toBe('reserved');
  });

  it.each(['Taylor', 'Tayron', 'Tgsx', 'Batayon', 'Raymundo'])('no bloquea %s', (handle) => {
    expect(handleProblem(handle)).toBeUndefined();
  });

  it('el dueño de la tienda sí puede usar un nombre reservado, pero no saltarse el formato', () => {
    expect(handleProblem('TayGameStore', { allowReserved: true })).toBeUndefined();
    expect(handleProblem('Tay Game', { allowReserved: true })).toBe('format');
    expect(handleProblem('Tay3001234567', { allowReserved: true })).toBe('digits');
  });
});

describe('nombre de usuario al azar', () => {
  it('cada combinación posible es un nombre válido y no reservado', () => {
    for (const noun of HANDLE_WORDS.nouns) {
      for (const adjective of HANDLE_WORDS.adjectives) {
        for (const number of [10, 99, 100, 504, 777, 999]) {
          const handle = `${noun}${adjective}${number}`;
          expect(handleProblem(handle), handle).toBeUndefined();
        }
      }
    }
  });

  it('genera nombres variados que cumplen el formato', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const handle = randomHandle();
      expect(handle).toMatch(HANDLE_PATTERN);
      expect(handleProblem(handle)).toBeUndefined();
      seen.add(handle);
    }
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe('pestaña «Usuarios» de la hoja', () => {
  const createdAt = new Date('2026-10-21T15:04:00Z');

  it('la fila tiene una celda por columna y solo el alias, el tipo y fechas', () => {
    const row = userSheetRow(
      {
        code: 'U-AB12CD34',
        handle: 'HalconFugaz482',
        kind: 'account',
        renames: 2,
        renamedAt: new Date('2026-10-21T16:00:00Z'),
        createdAt,
      },
      ['google', 'facebook'],
      new Date('2026-10-21T17:30:00Z'),
    );
    expect(row).toHaveLength(USER_SHEET_COLUMNS.length);
    expect(row).toEqual([
      'U-AB12CD34',
      'HalconFugaz482',
      'Cuenta (Google + Facebook)',
      '2026-10-21 10:04',
      '2026-10-21 11:00',
      2,
      '2026-10-21 12:30',
    ]);
  });

  it('invitado sin cambios de nombre: la columna del cambio queda vacía', () => {
    const row = userSheetRow(
      {
        code: 'U-0000ZZZZ',
        handle: 'LoboVeloz12',
        kind: 'guest',
        renames: 0,
        renamedAt: null,
        createdAt,
      },
      [],
      createdAt,
    );
    expect(row[2]).toBe('Invitado');
    expect(row[4]).toBe('');
    expect(row[5]).toBe(0);
  });

  it('tipo de cliente', () => {
    expect(profileKindLabel('guest', ['google'])).toBe('Invitado');
    expect(profileKindLabel('account', ['google'])).toBe('Cuenta (Google)');
    expect(profileKindLabel('account', ['facebook'])).toBe('Cuenta (Facebook)');
    expect(profileKindLabel('account', [])).toBe('Cuenta');
  });
});
