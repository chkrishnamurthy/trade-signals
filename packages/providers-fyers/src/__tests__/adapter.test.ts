import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFyersProvider } from '../adapter.js';

/**
 * Credential rotation.
 *
 * The worker refreshes its token daily while the process keeps running. The
 * provider must therefore read the credential per request rather than capture
 * it — a provider rebuilt on each rotation would take a fresh rate limiter and
 * circuit breaker with it, and both track state (per-account budget, edge bans)
 * that a new credential does not reset.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Captures the Authorization header of every outgoing request. */
function captureAuth(): () => string[] {
  const seen: string[] = [];
  globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push(headers.get('Authorization') ?? '');
    return new Response(JSON.stringify({ s: 'ok', marketStatus: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  return () => seen;
}

describe('createFyersProvider credential handling', () => {
  it('sends the token the getter returns AT THE TIME OF THE REQUEST', async () => {
    const seen = captureAuth();
    let token = 'first-token';
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: () => token });

    await provider.fetchMarketStatus().catch(() => null);
    token = 'rotated-token';
    await provider.fetchMarketStatus().catch(() => null);

    // Same provider instance, two different credentials on the wire.
    expect(seen()).toEqual(['APP-100:first-token', 'APP-100:rotated-token']);
  });

  it('still accepts a plain string credential', async () => {
    const seen = captureAuth();
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: 'static-token' });

    await provider.fetchMarketStatus().catch(() => null);

    expect(seen()).toEqual(['APP-100:static-token']);
  });

  it('rejects an empty literal token at construction', () => {
    expect(() => createFyersProvider({ appId: 'APP-100', accessToken: '' })).toThrow(
      /FYERS_ACCESS_TOKEN/,
    );
  });

  it('tolerates a getter that is empty at construction', () => {
    // The worker builds its provider before the first refresh has run, so an
    // empty getter must not be a construction-time error.
    expect(() => createFyersProvider({ appId: 'APP-100', accessToken: () => '' })).not.toThrow();
  });

  it('fails a request made while the getter is still empty', async () => {
    captureAuth();
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: () => '' });

    // Deliberately not sent upstream: an unauthenticated request comes back as
    // an opaque authorisation error that hides the missing refresh.
    await expect(provider.fetchMarketStatus()).rejects.toThrow(/FYERS_ACCESS_TOKEN/);
  });
});

describe('closed intraday candles', () => {
  it('drops a forming minute against the injected clock but retains it when explicitly requested', async () => {
    const start = Date.parse('2026-09-11T03:45:00Z');
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        s: 'ok',
        candles: [
          [start / 1000, 100, 102, 99, 101, 500],
          [start / 1000 + 60, 101, 103, 100, 102, 600],
        ],
      }),
    );
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: 'test-token' });
    const request = {
      ref: { symbol: 'SBIN', kind: 'equity' as const },
      resolution: '1m' as const,
      range: { from: new Date(start), to: new Date(start + 90_000) },
      now: new Date(start + 90_000),
    };
    expect((await provider.fetchBars(request)).map((b) => b.timestamp)).toEqual([start]);
    expect(await provider.fetchBars({ ...request, includeForming: true })).toHaveLength(2);
  });
});
