import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Libro de Excel (.xlsx) mínimo y sin dependencias: Office Open XML dentro de un ZIP.
 *
 * Solo lo que necesita la tienda: varias hojas, encabezado fijo y con filtro, columnas de texto,
 * enteros, pesos colombianos y fechas en hora de Colombia. El texto va como «cadena en línea»,
 * así que Excel nunca lo interpreta como fórmula (sin inyección de fórmulas). Las hojas quedan
 * protegidas sin contraseña: se pueden filtrar y ordenar, pero no se editan por accidente.
 */

export type ColumnKind = 'text' | 'int' | 'cop' | 'date';
export type CellValue = string | number | Date | null | undefined;
/** Una celda puede llevar su propio formato (p. ej. la hoja «Resumen», con valores mixtos). */
export type Cell = CellValue | { value: CellValue; kind: ColumnKind };

export interface SheetColumn {
  header: string;
  kind: ColumnKind;
  /** Ancho en caracteres. */
  width: number;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: Cell[][];
}

export interface WorkbookMeta {
  title: string;
  created: Date;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Colombia no tiene horario de verano: UTC−5 todo el año. */
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
const STYLE: Record<ColumnKind | 'header', number> = {
  header: 1,
  int: 2,
  cop: 3,
  date: 4,
  text: 5,
};
const MAX_TEXT = 32_767; // límite de Excel por celda

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function escapeXml(text: string): string {
  return (
    text
      // XML 1.0 no admite caracteres de control: se quitan (salvo tabulador y saltos de línea).
      .replace(/[\p{Cc}\uFFFE\uFFFF]/gu, (ch) =>
        ch === '\t' || ch === '\n' || ch === '\r' ? ch : '',
      )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

/** 0 → A, 25 → Z, 26 → AA… */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Fecha de Excel (días desde 1899-12-30) en hora de Colombia. */
export function excelDate(date: Date): number {
  return (date.getTime() + COLOMBIA_OFFSET_MS) / 86_400_000 + 25_569;
}

/** Nombre de hoja válido para Excel: sin []:*?/\, máximo 31 caracteres y sin repetir. */
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    let name =
      sheet.name
        .replace(/[[\]:*?/\\]/g, ' ')
        .trim()
        .slice(0, 31) || `Hoja ${i + 1}`;
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i + 1}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref: string, cell: Cell, columnKind: ColumnKind): string {
  const { value, kind } =
    cell !== null && typeof cell === 'object' && !(cell instanceof Date)
      ? cell
      : { value: cell, kind: columnKind };
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `<c r="${ref}" s="${STYLE.date}"><v>${excelDate(value)}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const style = kind === 'cop' ? STYLE.cop : kind === 'int' ? STYLE.int : 0;
    return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
  }
  const text = escapeXml(value.slice(0, MAX_TEXT));
  return `<c r="${ref}" t="inlineStr" s="${STYLE.text}"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(sheet: Sheet, first: boolean): string {
  const lastCol = columnLetter(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;
  const range = `A1:${lastCol}${lastRow}`;
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.max(4, Math.min(c.width, 80))}" customWidth="1"/>`,
    )
    .join('');
  const header = sheet.columns
    .map(
      (c, i) =>
        `<c r="${columnLetter(i)}1" t="inlineStr" s="${STYLE.header}"><is><t xml:space="preserve">${escapeXml(c.header)}</t></is></c>`,
    )
    .join('');
  const body = sheet.rows
    .map((row, r) => {
      const cells = sheet.columns
        .map((column, i) => cellXml(`${columnLetter(i)}${r + 2}`, row[i], column.kind))
        .join('');
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join('');
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}">` +
    `<dimension ref="${range}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ''}>` +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    '<sheetProtection sheet="1" objects="1" scenarios="1" sort="0" autoFilter="0"/>' +
    `<autoFilter ref="${range}"/>` +
    '</worksheet>'
  );
}

const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="&quot;$ &quot;#,##0"/>' +
  '<numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/>' +
  '</numFmts>' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF5B2BD9"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Fecha y hora en formato MS-DOS (las del ZIP), en hora de Colombia. */
function dosDateTime(date: Date): { time: number; day: number } {
  const local = new Date(date.getTime() + COLOMBIA_OFFSET_MS);
  const year = Math.max(local.getUTCFullYear(), 1980);
  return {
    time: (local.getUTCHours() << 11) | (local.getUTCMinutes() << 5) | (local.getUTCSeconds() >> 1),
    day: ((year - 1980) << 9) | ((local.getUTCMonth() + 1) << 5) | local.getUTCDate(),
  };
}

/** ZIP con compresión DEFLATE y nombres en UTF-8. */
function zip(entries: ZipEntry[], when: Date): Buffer {
  const { time, day } = dosDateTime(when);
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const packed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // creado por
    central.writeUInt16LE(20, 6); // versión necesaria
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // el resto de campos queda en 0
    directory.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralDirectory, end]);
}

/** Construye el archivo .xlsx completo. */
export function buildXlsx(sheets: Sheet[], meta: WorkbookMeta): Buffer {
  if (!sheets.length) throw new Error('un libro necesita al menos una hoja');
  const names = sheetNames(sheets);
  const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;
  const workbook =
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<sheets>' +
    names
      .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets><definedNames>' +
    sheets
      .map((sheet, i) => {
        const last = `$${columnLetter(Math.max(sheet.columns.length - 1, 0))}$${sheet.rows.length + 1}`;
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(quoted(names[i] ?? ''))}!$A$1:${last}</definedName>`;
      })
      .join('') +
    '</definedNames></workbook>';
  const workbookRels =
    XML_HEAD +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${names.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    '</Relationships>';
  const contentTypes =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';
  const rootRels =
    XML_HEAD +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/>` +
    '</Relationships>';
  const created = meta.created.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core =
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(meta.title)}</dc:title><dc:creator>TayGameStore</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    '</cp:coreProperties>';
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
    { name: '_rels/.rels', data: Buffer.from(rootRels) },
    { name: 'docProps/core.xml', data: Buffer.from(core) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels) },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML) },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml({ ...sheet, name: names[i] ?? sheet.name }, i === 0)),
    })),
  ];
  return zip(entries, meta.created);
}
