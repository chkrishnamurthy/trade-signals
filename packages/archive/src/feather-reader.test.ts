import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { bufferSource, probeFeatherSource } from './feather-probe.js';
import {
  DecodedBatchBudgetError,
  describeSchema,
  openFeatherBytes,
  readBatch,
} from './feather-reader.js';

/** A small, uncompressed Feather V2 buffer for round-trip tests. */
function makeUncompressedFeather(): Uint8Array {
  const table = tableFromArrays({
    close: Int32Array.from([124550, 124600, 124575]),
    volume: Float64Array.from([1000, 2000, 1500]),
  });
  return tableToIPC(table, 'file');
}

describe('feather reader (uncompressed round trip)', () => {
  it('describes the schema without decoding batch bodies', () => {
    const reader = openFeatherBytes(makeUncompressedFeather());
    const schema = describeSchema(reader);
    expect(schema.numRecordBatches).toBe(1);
    expect(schema.fields.map((f) => f.name)).toEqual(['close', 'volume']);
    expect(schema.fields[0]?.type).toContain('Int32');
    expect(schema.fields[1]?.type).toContain('Float64');
  });

  it('reads a selected batch within the byte budget', () => {
    const reader = openFeatherBytes(makeUncompressedFeather());
    const batch = readBatch(reader, 0, { maxDecodedBytes: 1_000_000 });
    expect(batch.numRows).toBe(3);
    expect(batch.getChild('close')?.get(0)).toBe(124550);
    expect(batch.getChild('volume')?.get(1)).toBe(2000);
  });

  it('refuses to decode a batch that exceeds the byte budget', () => {
    const reader = openFeatherBytes(makeUncompressedFeather());
    expect(() => readBatch(reader, 0, { maxDecodedBytes: 4 })).toThrow(DecodedBatchBudgetError);
  });

  it('rejects an out-of-range batch index', () => {
    const reader = openFeatherBytes(makeUncompressedFeather());
    expect(() => readBatch(reader, 5, { maxDecodedBytes: 1_000_000 })).toThrow(RangeError);
  });
});

describe('probe agrees with a real apache-arrow file', () => {
  it('reports a consistent V2 envelope for a generated Feather file', async () => {
    const bytes = makeUncompressedFeather();
    const result = await probeFeatherSource(bufferSource(Buffer.from(bytes)));
    expect(result.format).toBe('feather_v2_or_arrow_ipc');
    expect(result.envelopeConsistent).toBe(true);
    expect(result.fileBytes).toBe(bytes.length);
  });
});
