import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Lector mínimo de ZIP (directorio central) para comprobar los .xlsx que genera la tienda.
 * Verifica firmas, tamaños y CRC de cada parte; lanza un error si algo no cuadra.
 */
export function unzip(file: Buffer): Map<string, string> {
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('no es un ZIP: falta el fin del directorio central');
  const count = file.readUInt16LE(end + 10);
  let pos = file.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (file.readUInt32LE(pos) !== 0x02014b50) throw new Error('entrada central inválida');
    const method = file.readUInt16LE(pos + 10);
    const crc = file.readUInt32LE(pos + 16);
    const packedSize = file.readUInt32LE(pos + 20);
    const size = file.readUInt32LE(pos + 24);
    const nameLength = file.readUInt16LE(pos + 28);
    const extra = file.readUInt16LE(pos + 30);
    const comment = file.readUInt16LE(pos + 32);
    const local = file.readUInt32LE(pos + 42);
    const name = file.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    if (file.readUInt32LE(local) !== 0x04034b50)
      throw new Error(`cabecera local inválida: ${name}`);
    const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    const packed = file.subarray(start, start + packedSize);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    if (data.length !== size) throw new Error(`tamaño distinto: ${name}`);
    if (crc32(data) !== crc) throw new Error(`CRC distinto: ${name}`);
    out.set(name, data.toString('utf8'));
    pos += 46 + nameLength + extra + comment;
  }
  return out;
}
