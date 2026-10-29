import { describe, expect, it } from 'vitest';
import { FULFILLMENT_STATUSES } from '../../src/server/db/schema.js';
import {
  nextSheetStep,
  parseSheetCommand,
  SHEET_COMMAND_OPTIONS,
} from '../../src/server/services/sheet-commands.js';

describe('cambios de estado desde la hoja: qué entiende la tienda', () => {
  it('las tres opciones de la lista se entienden, con o sin emoji, tildes o mayúsculas', () => {
    expect(SHEET_COMMAND_OPTIONS.map(parseSheetCommand)).toEqual(['start', 'deliver', 'fail']);
    expect(parseSheetCommand('  ENTREGADO ')).toBe('deliver');
    expect(parseSheetCommand('completado')).toBe('deliver');
    expect(parseSheetCommand('en   proceso')).toBe('start');
    expect(parseSheetCommand('No se pudo entregar')).toBe('fail');
  });

  it('nada de pagos ni texto libre: lo demás no se entiende', () => {
    for (const text of ['Pago confirmado', 'Pagado', 'Reembolsar', 'entregado ya', '', '=1+1']) {
      expect(parseSheetCommand(text)).toBeUndefined();
    }
  });
});

describe('cambios de estado desde la hoja: pasos del panel', () => {
  it('«Entregado» toma, inicia y termina la entrega, un paso cada vez', () => {
    expect(nextSheetStep('READY_FOR_FULFILLMENT', 'deliver')).toBe('claim');
    expect(nextSheetStep('CLAIMED', 'deliver')).toBe('start');
    expect(nextSheetStep('DELIVERING', 'deliver')).toBe('deliver');
    expect(nextSheetStep('DELIVERED', 'deliver')).toBe('done');
  });

  it('«En proceso» se queda en curso y «No se pudo entregar» pasa a revisión', () => {
    expect(nextSheetStep('DELIVERING', 'start')).toBe('done');
    expect(nextSheetStep('DELIVERING', 'fail')).toBe('fail');
    expect(nextSheetStep('FAILED', 'fail')).toBe('done');
  });

  it('nunca deshace una entrega ni salta una revisión o un pedido cancelado', () => {
    expect(nextSheetStep('DELIVERED', 'start')).toHaveProperty('blocked');
    expect(nextSheetStep('DELIVERED', 'fail')).toHaveProperty('blocked');
    expect(nextSheetStep('FAILED', 'deliver')).toHaveProperty('blocked');
    for (const target of ['start', 'deliver', 'fail'] as const) {
      expect(nextSheetStep('CANCELLED', target)).toHaveProperty('blocked');
    }
  });

  it('cubre todos los estados de una entrega', () => {
    for (const status of FULFILLMENT_STATUSES) {
      expect(nextSheetStep(status, 'deliver')).toBeDefined();
    }
  });
});
