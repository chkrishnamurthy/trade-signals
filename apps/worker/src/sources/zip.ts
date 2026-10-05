import { inflateRawSync } from 'node:zlib';

/**
 * Reads the first file in a ZIP archive (NSE's old bhavcopy is one CSV in a zip).
 * Handles "stored" and "deflate" entries, which is all those archives use; no
 * dependency beyond Node's zlib. Throws on anything else, never guesses.
 */
export function firstZipEntry(bytes: Uint8Array): { name: string; data: Buffer } {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50)
    throw new Error('zip: no local file header');
  const flags = buf.readUInt16LE(6);
  const method = buf.readUInt16LE(8);
  let compressedSize = buf.readUInt32LE(18);
  const nameLength = buf.readUInt16LE(26);
  const extraLength = buf.readUInt16LE(28);
  const name = buf.subarray(30, 30 + nameLength).toString('utf8');
  const start = 30 + nameLength + extraLength;
  // Sizes written after the data (bit 3): read them from the central directory.
  if ((flags & 0x08) !== 0 || compressedSize === 0) {
    const central = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (central < 0) throw new Error('zip: no central directory');
    compressedSize = buf.readUInt32LE(central + 20);
  }
  const raw = buf.subarray(start, start + compressedSize);
  if (method === 0) return { name, data: Buffer.from(raw) };
  if (method === 8) return { name, data: inflateRawSync(raw) };
  throw new Error(`zip: compression method ${method} is not supported`);
}
