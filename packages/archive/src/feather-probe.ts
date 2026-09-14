import { open } from 'node:fs/promises';

/**
 * Read-only Feather/Arrow envelope probe. Signature check only — it reads a
 * handful of bytes from the head and tail and never touches the data body, so
 * a multi-gigabyte file is inspected as cheaply as a tiny one. It intentionally
 * does not validate the Arrow schema, decode any record batch, or inspect
 * compression: choosing and running a real reader is a separate, later stage.
 *
 * This is the TypeScript successor to `scripts/archive/feather-probe.pl`; the
 * runtime for the archive/backtesting work was fixed to TypeScript/Node.
 */

const V2_MAGIC = Buffer.from('ARROW1', 'ascii'); // 6 bytes
const V1_MAGIC = Buffer.from('FEA1', 'ascii'); // 4 bytes

// Arrow IPC "File" format (Feather V2): 6-byte magic + 2 pad bytes at the head,
// and a <int32 footer length LE><6-byte magic> trailer. The smallest possible
// well-formed file is head(8) + a non-empty footer + trailer(10) => >= 18.
const V2_TAIL = 10;
const V2_MIN_SIZE = 18;

// Legacy Feather V1: 4-byte magic at head, and a <int32 length LE><4-byte magic>
// trailer. Smallest well-formed file is head(4) + footer + trailer(8) => >= 12.
const V1_TAIL = 8;
const V1_MIN_SIZE = 12;

export type FeatherFormat = 'feather_v2_or_arrow_ipc' | 'feather_v1' | 'unknown';

export interface FeatherProbeResult {
  /** File size in bytes. */
  fileBytes: number;
  /** Detected container format from magic bytes alone. */
  format: FeatherFormat;
  /**
   * Whether head magic, trailing magic and the declared footer length are
   * mutually consistent. `false` means truncated, corrupt, or not this format.
   */
  envelopeConsistent: boolean;
  /** Declared footer length in bytes, or null when it could not be read. */
  footerBytes: number | null;
  /** How many bytes the probe actually read from disk. */
  bytesRead: number;
  /** Always false: the probe never validates the Arrow schema. */
  schemaValidated: false;
  /** Always 'uninspected': the probe never decodes the body. */
  compression: 'uninspected';
  note: string;
}

/**
 * Minimal positional-read source so the pure probe logic can be unit-tested
 * against in-memory buffers as well as real files.
 */
export interface RandomAccessSource {
  readonly size: number;
  /** Read `length` bytes starting at `offset`. May return fewer at EOF. */
  readAt(offset: number, length: number): Promise<Buffer>;
}

const NOTE =
  'Signature check only. A compatible Arrow reader must still validate schema, ' +
  'compression and record batches before any data is trusted.';

function unknown(fileBytes: number, bytesRead: number): FeatherProbeResult {
  return {
    fileBytes,
    format: 'unknown',
    envelopeConsistent: false,
    footerBytes: null,
    bytesRead,
    schemaValidated: false,
    compression: 'uninspected',
    note: NOTE,
  };
}

/** Probe an already-opened random-access source. Pure aside from the reads. */
export async function probeFeatherSource(source: RandomAccessSource): Promise<FeatherProbeResult> {
  const size = source.size;
  let bytesRead = 0;

  const headLen = Math.min(size, 6);
  const head = await source.readAt(0, headLen);
  bytesRead += head.length;

  if (head.subarray(0, 6).equals(V2_MAGIC) && size >= V2_MIN_SIZE) {
    const tail = await source.readAt(size - V2_TAIL, V2_TAIL);
    bytesRead += tail.length;
    const footerBytes = tail.length >= 4 ? tail.readUInt32LE(0) : null;
    const trailingMagicOk = tail.subarray(4, 10).equals(V2_MAGIC);
    const envelopeConsistent =
      trailingMagicOk &&
      footerBytes !== null &&
      footerBytes > 0 &&
      footerBytes <= size - V2_MIN_SIZE;
    return {
      fileBytes: size,
      format: 'feather_v2_or_arrow_ipc',
      envelopeConsistent,
      footerBytes,
      bytesRead,
      schemaValidated: false,
      compression: 'uninspected',
      note: NOTE,
    };
  }

  if (head.subarray(0, 4).equals(V1_MAGIC) && size >= V1_MIN_SIZE) {
    const tail = await source.readAt(size - V1_TAIL, V1_TAIL);
    bytesRead += tail.length;
    const footerBytes = tail.length >= 4 ? tail.readUInt32LE(0) : null;
    const trailingMagicOk = tail.subarray(4, 8).equals(V1_MAGIC);
    const envelopeConsistent =
      trailingMagicOk &&
      footerBytes !== null &&
      footerBytes > 0 &&
      footerBytes <= size - V1_MIN_SIZE;
    return {
      fileBytes: size,
      format: 'feather_v1',
      envelopeConsistent,
      footerBytes,
      bytesRead,
      schemaValidated: false,
      compression: 'uninspected',
      note: NOTE,
    };
  }

  return unknown(size, bytesRead);
}

/** Wrap an in-memory buffer as a random-access source. */
export function bufferSource(buffer: Buffer): RandomAccessSource {
  return {
    size: buffer.length,
    async readAt(offset, length) {
      return buffer.subarray(offset, offset + length);
    },
  };
}

/** Probe a file on disk, reading only its head and tail. */
export async function probeFeatherFile(path: string): Promise<FeatherProbeResult> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Input must be a regular file: ${path}`);
    }
    const source: RandomAccessSource = {
      size: stat.size,
      async readAt(offset, length) {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return buffer.subarray(0, bytesRead);
      },
    };
    return await probeFeatherSource(source);
  } finally {
    await handle.close();
  }
}
