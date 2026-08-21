import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, 'fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export function jsonFixture<T = unknown>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export interface StubResponse {
  readonly status?: number;
  readonly body: unknown;
  /** When set, the body is returned verbatim instead of JSON-stringified. */
  readonly text?: string;
}

export interface StubFetch {
  readonly impl: typeof fetch;
  /** Every URL requested, in order. */
  readonly calls: string[];
}

/**
 * A `fetch` that replays a scripted sequence of responses.
 *
 * The last entry repeats once the script runs out, so a test can say
 * "429 twice, then 200" without padding.
 */
export function stubFetch(responses: StubResponse[]): StubFetch {
  const calls: string[] = [];
  let index = 0;

  const impl = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input.toString());
    const spec = responses[Math.min(index, responses.length - 1)] ?? { body: {} };
    index += 1;
    const status = spec.status ?? 200;
    const text = spec.text ?? JSON.stringify(spec.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as unknown as typeof fetch;

  return { impl, calls };
}

/** Collapses all sleeping, and records how long each sleep would have been. */
export function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}
