import { describe, expect, it } from 'vitest';
import { maskHolder } from '../../src/server/services/nequi-view.js';

// Nombres ficticios.
describe('titular de Nequi enmascarado', () => {
  it('deja ver solo el inicio de cada palabra; los conectores cortos quedan igual', () => {
    expect(maskHolder('Tienda de Prueba')).toBe('Tie*** de Pru***');
    expect(maskHolder('Ana  María de la Luz')).toBe('A*** Mar*** de la L***');
    expect(maskHolder('Titular Ficticio')).toBe('Tit*** Fic***');
  });

  it('nunca devuelve el nombre completo de una palabra de más de 2 letras', () => {
    for (const name of ['Sol', 'Luis', 'Bernardo', 'Ñoño Pérez']) {
      const masked = maskHolder(name);
      for (const word of name.split(' ')) expect(masked).not.toContain(word);
    }
  });
});
