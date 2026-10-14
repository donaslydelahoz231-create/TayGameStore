import { describe, expect, it } from 'vitest';
import { buildXlsx, columnLetter, excelDate } from '../../src/server/lib/xlsx.js';
import { unzip } from '../support/zip.js';

const created = new Date('2026-10-14T15:30:00Z'); // 10:30 en Colombia

describe('libro de Excel (.xlsx)', () => {
  it('columnas y fechas de Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ]);
    // 2026-10-14 10:30 hora de Colombia = 46309,4375 en Excel.
    expect(excelDate(created)).toBeCloseTo(46309.4375, 6);
  });

  it('es un ZIP válido con las partes de Office Open XML y una hoja por pestaña', () => {
    const file = buildXlsx(
      [
        {
          name: 'Inventario',
          columns: [
            { header: 'SKU', kind: 'text', width: 10 },
            { header: 'Precio (COP)', kind: 'cop', width: 12 },
          ],
          rows: [['ff-110', 3800]],
        },
        { name: 'Facturas', columns: [{ header: 'N.º', kind: 'text', width: 8 }], rows: [] },
      ],
      { title: 'Prueba', created },
    );
    expect(file.subarray(0, 2).toString()).toBe('PK');
    const parts = unzip(file);
    expect([...parts.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    const workbook = parts.get('xl/workbook.xml') ?? '';
    expect(workbook).toContain('<sheet name="Inventario" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Facturas" sheetId="2" r:id="rId2"/>');
    expect(parts.get('[Content_Types].xml')).toContain('/xl/worksheets/sheet2.xml');
    expect(parts.get('docProps/core.xml')).toContain('2026-10-14T15:30:00Z');
    const sheet = parts.get('xl/worksheets/sheet1.xml') ?? '';
    // Encabezado fijo con filtro, número con formato de pesos.
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:B2"/>');
    expect(sheet).toContain('<c r="B2" s="3"><v>3800</v></c>');
    expect(sheet).toContain('<sheetProtection sheet="1"');
  });

  it('el texto nunca se vuelve fórmula y se escapa; nombres de hoja válidos y únicos', () => {
    const file = buildXlsx(
      [
        {
          name: 'Hoja: [rara]/con*nombre?muy largo para excel',
          columns: [
            { header: 'Texto', kind: 'text', width: 10 },
            { header: 'Fecha', kind: 'date', width: 10 },
            { header: 'Vacío', kind: 'int', width: 10 },
          ],
          rows: [
            ['=HYPERLINK("http://x","clic")', created, null],
            ['<b>&"\u0007', null, NaN],
          ],
        },
        { name: 'Hoja: [rara]/con*nombre?muy largo para excel', columns: [], rows: [] },
      ],
      { title: 'A & B', created },
    );
    const parts = unzip(file);
    const sheet = parts.get('xl/worksheets/sheet1.xml') ?? '';
    // Cadena en línea (t="inlineStr"): Excel la muestra como texto, no la ejecuta.
    expect(sheet).toContain(
      '<c r="A2" t="inlineStr" s="5"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;,&quot;clic&quot;)</t></is></c>',
    );
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('&lt;b&gt;&amp;&quot;');
    expect(sheet).not.toContain('\u0007');
    expect(sheet).toContain(`<c r="B2" s="4"><v>${excelDate(created)}</v></c>`);
    // Vacíos y NaN no generan celda.
    expect(sheet).not.toMatch(/r="C2"|r="B3"|r="C3"/);
    const names = [...(parts.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]+)"/g)].map(
      (m) => m[1] ?? '',
    );
    expect(names[0]).toBe('Hoja   rara  con nombre muy lar');
    expect(names[0]?.length).toBeLessThanOrEqual(31);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(2);
    expect(parts.get('docProps/core.xml')).toContain('<dc:title>A &amp; B</dc:title>');
  });

  it('un libro sin hojas no se genera', () => {
    expect(() => buildXlsx([], { title: 'x', created })).toThrow();
  });
});
