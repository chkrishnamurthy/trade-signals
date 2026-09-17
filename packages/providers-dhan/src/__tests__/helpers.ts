import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, 'fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export function jsonFixture<T = unknown>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export interface RouteResponse {
  readonly status?: number;
  readonly body?: unknown;
  /** Returned verbatim instead of JSON — for the CSV master. */
  readonly text?: string;
  readonly headers?: Record<string, string>;
}

export interface RoutedFetch {
  readonly impl: typeof fetch;
  /** Every URL requested, in order. */
  readonly calls: string[];
  /** Every request body as sent, in order ('' for GET). */
  readonly bodies: string[];
  /** Every request's headers, in order. */
  readonly headers: unknown[];
}

/**
 * A `fetch` that answers by URL path.
 *
 * The adapter talks to several endpoints in one flow (master, charts,
 * quotes), so a scripted sequence would be brittle; a route table says what
 * each endpoint returns regardless of order. An unrouted path answers 404.
 */
export function routedFetch(routes: Record<string, RouteResponse>): RoutedFetch {
  const calls: string[] = [];
  const bodies: string[] = [];
  const headers: unknown[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    headers.push(init?.headers ?? {});
    const path = new URL(url).pathname;
    const spec = routes[path];
    const status = spec === undefined ? 404 : (spec.status ?? 200);
    const text =
      spec === undefined
        ? JSON.stringify({ errorMessage: `no route for ${path}` })
        : (spec.text ?? JSON.stringify(spec.body ?? {}));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(spec?.headers ?? {}),
      text: async () => text,
    } as Response;
  }) as unknown as typeof fetch;

  return { impl, calls, bodies, headers };
}
