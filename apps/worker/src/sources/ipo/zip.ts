import { inflateRawSync } from 'node:zlib';

/**
 * A minimal, defensive ZIP reader for exchange document bundles (NSE ships an
 * RHP as `RHP_<SYMBOL>.zip` holding `RHP.pdf` and `GID.pdf`). Stored and
 * deflated entries only; ZIP64 and encrypted entries are refused. Every
 * entry's declared size is capped before it is inflated, and its CRC-32 is
 * checked after, so a malformed or hostile archive fails loudly instead of
 * eating memory.
 */

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly size: number;
  /** Inflates and verifies the entry. */
  readonly read: () => Uint8Array;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** The archive's entries (directories skipped). `maxEntryBytes` caps any one inflated entry. */
export function readZip(bytes: Uint8Array, maxEntryBytes: number): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      eocd = at;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive (no end-of-directory record)');
  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff)
    throw new Error('ZIP64 archives are not supported');

  const entries: ZipEntry[] = [];
  let at = directoryOffset;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL)
      throw new Error('corrupt zip central directory');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const expectedCrc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;

    entries.push({
      name,
      compressedSize,
      size,
      read: () => {
        if (flags & 1) throw new Error(`${name}: encrypted zip entries are not supported`);
        if (size > maxEntryBytes)
          throw new Error(`${name}: ${size} bytes exceeds the ${maxEntryBytes}-byte cap`);
        if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL)
          throw new Error(`${name}: corrupt local header`);
        const start =
          localOffset +
          30 +
          view.getUint16(localOffset + 26, true) +
          view.getUint16(localOffset + 28, true);
        const raw = bytes.subarray(start, start + compressedSize);
        if (raw.length !== compressedSize) throw new Error(`${name}: truncated entry`);
        let data: Uint8Array;
        if (method === 0) data = raw;
        else if (method === 8)
          data = new Uint8Array(inflateRawSync(raw, { maxOutputLength: maxEntryBytes }));
        else throw new Error(`${name}: compression method ${method} is not supported`);
        if (data.length !== size || crc32(data) !== expectedCrc)
          throw new Error(`${name}: checksum mismatch`);
        return data;
      },
    });
  }
  return entries;
}
