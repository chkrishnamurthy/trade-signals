import { open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bufferSource, probeFeatherFile, probeFeatherSource } from './feather-probe.js';

/** Build a byte buffer with a Feather V2 / Arrow IPC envelope. */
function makeV2(totalSize: number, footerLen: number, trailingMagic = 'ARROW1'): Buffer {
  const buf = Buffer.alloc(totalSize);
  buf.write('ARROW1', 0, 'ascii');
  buf.writeUInt32LE(footerLen, totalSize - 10);
  buf.write(trailingMagic, totalSize - 6, 'ascii');
  return buf;
}

/** Build a byte buffer with a legacy Feather V1 envelope. */
function makeV1(totalSize: number, footerLen: number, trailingMagic = 'FEA1'): Buffer {
  const buf = Buffer.alloc(totalSize);
  buf.write('FEA1', 0, 'ascii');
  buf.writeUInt32LE(footerLen, totalSize - 8);
  buf.write(trailingMagic, totalSize - 4, 'ascii');
  return buf;
}

describe('probeFeatherSource', () => {
  it('detects a consistent Feather V2 envelope, reading only head and tail', async () => {
    const result = await probeFeatherSource(bufferSource(makeV2(100, 40)));
    expect(result.format).toBe('feather_v2_or_arrow_ipc');
    expect(result.envelopeConsistent).toBe(true);
    expect(result.footerBytes).toBe(40);
    expect(result.fileBytes).toBe(100);
    expect(result.bytesRead).toBe(16); // 6 head + 10 tail
    expect(result.schemaValidated).toBe(false);
    expect(result.compression).toBe('uninspected');
  });

  it('detects a consistent Feather V1 envelope', async () => {
    const result = await probeFeatherSource(bufferSource(makeV1(60, 20)));
    expect(result.format).toBe('feather_v1');
    expect(result.envelopeConsistent).toBe(true);
    expect(result.footerBytes).toBe(20);
    expect(result.bytesRead).toBe(14); // 6 head + 8 tail
  });

  it('rejects a V2 file whose trailing magic is wrong', async () => {
    const result = await probeFeatherSource(bufferSource(makeV2(100, 40, 'ARROWX')));
    expect(result.format).toBe('feather_v2_or_arrow_ipc');
    expect(result.envelopeConsistent).toBe(false);
  });

  it('rejects a V2 file whose declared footer overruns the body', async () => {
    // footerLen must be <= size - 18; 90 with a 100-byte file overruns.
    const result = await probeFeatherSource(bufferSource(makeV2(100, 90)));
    expect(result.envelopeConsistent).toBe(false);
  });

  it('rejects a V2 file with a zero-length footer', async () => {
    const result = await probeFeatherSource(bufferSource(makeV2(100, 0)));
    expect(result.envelopeConsistent).toBe(false);
  });

  it('reports unknown for a file that is too small to carry a V2 envelope', async () => {
    const buf = Buffer.from('ARROW1', 'ascii'); // 6 bytes, below the 18-byte minimum
    const result = await probeFeatherSource(bufferSource(buf));
    expect(result.format).toBe('unknown');
    expect(result.envelopeConsistent).toBe(false);
    expect(result.footerBytes).toBeNull();
  });

  it('reports unknown for arbitrary bytes', async () => {
    const result = await probeFeatherSource(bufferSource(Buffer.from('not a feather file here')));
    expect(result.format).toBe('unknown');
    expect(result.envelopeConsistent).toBe(false);
  });
});

describe('probeFeatherFile', () => {
  const created: string[] = [];
  afterEach(async () => {
    await Promise.all(created.map((p) => rm(p, { force: true })));
    created.length = 0;
  });

  it('inspects a 5 GiB sparse file with only a handful of byte reads', async () => {
    const size = 5 * 1024 * 1024 * 1024; // 5 GiB
    const path = join(tmpdir(), `feather-probe-sparse-${process.pid}-${Date.now()}.feather`);
    created.push(path);

    const handle = await open(path, 'w');
    try {
      // Punch a hole to `size`, then stamp only the head and tail bytes. The
      // body is never allocated on disk, so this stays instant and tiny.
      await handle.truncate(size);
      const head = Buffer.from('ARROW1', 'ascii');
      await handle.write(head, 0, head.length, 0);
      const tail = Buffer.alloc(10);
      tail.writeUInt32LE(4096, 0);
      tail.write('ARROW1', 4, 'ascii');
      await handle.write(tail, 0, tail.length, size - 10);
    } finally {
      await handle.close();
    }

    const result = await probeFeatherFile(path);
    expect(result.fileBytes).toBe(size);
    expect(result.format).toBe('feather_v2_or_arrow_ipc');
    expect(result.envelopeConsistent).toBe(true);
    expect(result.footerBytes).toBe(4096);
    expect(result.bytesRead).toBe(16);
  });
});
