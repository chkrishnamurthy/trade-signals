import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * Node wrapper over the local pyarrow helper (`py/feather_reader.py`), which
 * reads compressed Feather V2 bodies that pure-JS apache-arrow cannot. This is
 * the plan's "native Arrow helper process": a versioned subprocess protocol,
 * JSON over stdout. Local research tooling only — never used by the deployed app.
 */

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../py/feather_reader.py', import.meta.url));
const MAX_BUFFER = 128 * 1024 * 1024; // room for a `head` dump of wide rows.

export interface NativeField {
  name: string;
  type: string;
  nullable: boolean;
}

export interface NativeSchema {
  num_rows: number;
  num_batches: number;
  fields: NativeField[];
}

export interface NativeHead {
  num_rows_total: number;
  rows: Record<string, unknown>[];
}

export interface NativeSummary {
  num_rows: number;
  time_range: { min: string; max: string };
  distinct_symbols: number;
  distinct_expiries: number;
  by_underlying: { value: string; rows: number }[];
  by_instrument_type: { value: string; rows: number }[];
}

/** One raw 1-minute bar as emitted by the Python `export` command. */
export interface NativeRawBar {
  date: string; // ISO with IST offset, e.g. "2026-08-28 09:15:00+05:30"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
}

export interface NativeExport {
  symbol: string;
  num_rows: number;
  bars: NativeRawBar[];
}

async function run<T>(command: string, path: string, extra: string[] = []): Promise<T> {
  const { stdout } = await execFileAsync('python3', [SCRIPT, command, path, ...extra], {
    maxBuffer: MAX_BUFFER,
  });
  return JSON.parse(stdout) as T;
}

export function nativeSchema(path: string): Promise<NativeSchema> {
  return run<NativeSchema>('schema', path);
}

export function nativeHead(path: string, n = 5): Promise<NativeHead> {
  return run<NativeHead>('head', path, [String(n)]);
}

export function nativeSummary(path: string): Promise<NativeSummary> {
  return run<NativeSummary>('summary', path);
}

export function nativeExport(path: string, symbol: string): Promise<NativeExport> {
  return run<NativeExport>('export', path, [symbol]);
}
