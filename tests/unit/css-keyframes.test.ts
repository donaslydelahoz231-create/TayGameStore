import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Cada animación de la tienda tiene un nombre único. Dos `@keyframes` con el mismo nombre no dan
 * error: la última capa reemplaza en silencio a la anterior en todas partes. Así pasó con
 * «tgsScan» (2026-11-17): el barrido nuevo de la presentación borró el destello de las tarjetas de
 * los paquetes.
 */
const layersDir = new URL('../../src/web/styles/layers/', import.meta.url);

function keyframeNames(): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const file of readdirSync(layersDir).filter((name) => name.endsWith('.css'))) {
    const css = readFileSync(new URL(file, layersDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const name = match[1] ?? '';
      names.set(name, [...(names.get(name) ?? []), file]);
    }
  }
  return names;
}

describe('animaciones de la tienda', () => {
  it('no repite el nombre de ningún @keyframes entre capas', () => {
    const names = keyframeNames();
    expect(names.size).toBeGreaterThan(20);
    const repeated = [...names].filter(([, files]) => files.length > 1);
    expect(repeated).toEqual([]);
  });
});
