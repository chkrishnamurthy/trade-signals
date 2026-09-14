import { type RecordBatch, RecordBatchFileReader, type Schema } from 'apache-arrow';

/**
 * Thin, bounded wrapper over apache-arrow's File reader for Feather V2 / Arrow
 * IPC files. It deliberately reads *selected* record batches, never the whole
 * table via `read_all()`: one compressed batch can exceed available RAM, so
 * every decode is gated by an explicit byte budget.
 *
 * Codec note (apache-arrow 17): the JS package registers no compression codecs.
 * Uncompressed Feather V2 reads correctly; a batch whose body is LZ4- or
 * ZSTD-compressed cannot be decoded by pure JS and surfaces as a clear error
 * here. Decoding such files needs a native Arrow reader — a decision for the
 * ingestion stage once a real sample confirms the on-disk compression.
 */

export interface FieldDescription {
  name: string;
  type: string;
  nullable: boolean;
}

export interface SchemaDescription {
  fields: FieldDescription[];
  numRecordBatches: number;
}

/** Raised when decoding a batch would exceed the configured byte budget. */
export class DecodedBatchBudgetError extends Error {
  constructor(
    readonly batchIndex: number,
    readonly declaredBytes: number,
    readonly maxDecodedBytes: number,
  ) {
    super(
      `Record batch ${batchIndex} needs ${declaredBytes} bytes, over the ${maxDecodedBytes}-byte budget`,
    );
    this.name = 'DecodedBatchBudgetError';
  }
}

/** Raised when a batch cannot be decoded (typically unsupported compression). */
export class UnsupportedBatchError extends Error {
  constructor(
    readonly batchIndex: number,
    cause: unknown,
  ) {
    super(
      `Record batch ${batchIndex} could not be decoded by apache-arrow (JS). ` +
        'The most likely cause is LZ4/ZSTD body compression, which the JS package ' +
        'cannot decode; a native Arrow reader is required for such files.',
      { cause },
    );
    this.name = 'UnsupportedBatchError';
  }
}

/**
 * Open a Feather V2 / Arrow IPC file from an in-memory buffer. The whole buffer
 * must be resident, so callers must bound the file size before loading it (the
 * probe reports `fileBytes`); genuinely huge archives need a streaming reader,
 * added when a real sample proves the format.
 */
export function openFeatherBytes(bytes: Uint8Array): RecordBatchFileReader {
  const reader = RecordBatchFileReader.from(bytes);
  // `from` may hand back a stream reader for the streaming format; the File
  // format (random batch access, a footer) is what this wrapper requires.
  if (!(reader instanceof RecordBatchFileReader)) {
    throw new Error('Input is not an Arrow IPC File (Feather V2) — got a stream, not a file');
  }
  reader.open();
  return reader;
}

function describeType(schema: Schema, index: number): FieldDescription {
  const field = schema.fields[index];
  if (!field) {
    throw new Error(`No field at index ${index}`);
  }
  return { name: field.name, type: String(field.type), nullable: field.nullable };
}

/** Read only the schema and batch count — no batch bodies are decoded. */
export function describeSchema(reader: RecordBatchFileReader): SchemaDescription {
  const schema = reader.schema;
  const fields = schema.fields.map((_, index) => describeType(schema, index));
  return { fields, numRecordBatches: reader.numRecordBatches };
}

export interface ReadBatchOptions {
  /** Reject any batch whose declared byte length exceeds this. */
  maxDecodedBytes: number;
}

/**
 * Decode a single record batch by index, refusing to allocate past the budget.
 * The budget is checked against the batch's declared body length from the file
 * footer *before* the batch body is decoded, so an oversized batch is rejected
 * without materialising it.
 */
export function readBatch(
  reader: RecordBatchFileReader,
  batchIndex: number,
  options: ReadBatchOptions,
): RecordBatch {
  if (batchIndex < 0 || batchIndex >= reader.numRecordBatches) {
    throw new RangeError(
      `Batch index ${batchIndex} out of range (0..${reader.numRecordBatches - 1})`,
    );
  }

  const block = reader.footer?.getRecordBatch(batchIndex);
  if (block) {
    const declaredBytes = Number(block.bodyLength);
    if (declaredBytes > options.maxDecodedBytes) {
      throw new DecodedBatchBudgetError(batchIndex, declaredBytes, options.maxDecodedBytes);
    }
  }

  let batch: RecordBatch | null;
  try {
    batch = reader.readRecordBatch(batchIndex);
  } catch (cause) {
    throw new UnsupportedBatchError(batchIndex, cause);
  }
  if (!batch) {
    throw new UnsupportedBatchError(batchIndex, new Error('reader returned no batch'));
  }
  return batch;
}
