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

describe('createFyersProvider — BSE listings', () => {
  // Two real BSE_CM.csv rows (2026-09-25): RELIANCE in group A, 3IINFOLTD in T.
  const BSE_MASTER = [
    '1210000000500325,RELIANCE INDUSTRIES LTD.,0,1,0.05,INE002A01018,0915-1530|1815-1915:,2026-09-24,,BSE:RELIANCE-A,12,10,500325,RELIANCE,500325,-1.0,XX,1210000000500325,None,0,0.0',
    '1210000000532628,3I INFOTECH LTD.,0,1,0.01,INE748C01038,0915-1530|1815-1915:,2026-09-24,,BSE:3IINFOLTD-T,12,10,532628,3IINFOLTD,532628,-1.0,XX,1210000000532628,None,0,0.0',
  ].join('\n');

  function quoteRow(n: string, lp: number): unknown {
    return {
      n,
      s: 'ok',
      v: {
        ch: 1,
        chp: 0.1,
        lp,
        open_price: lp,
        high_price: lp,
        low_price: lp,
        prev_close_price: lp - 1,
        volume: 10,
        tt: '1622160000',
      },
    };
  }

  /** Serves the BSE master from the CDN and echoes quotes for whatever was asked. */
  function fakeUpstream(): { quoteUrls: string[]; masterHits: () => number } {
    const quoteUrls: string[] = [];
    let masterHits = 0;
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('BSE_CM.csv')) {
        masterHits += 1;
        return new Response(BSE_MASTER, { status: 200 });
      }
      quoteUrls.push(url);
      const symbols = decodeURIComponent(new URL(url).searchParams.get('symbols') ?? '').split(',');
      const d = symbols.map((s, i) => quoteRow(s, 100 + i));
      return new Response(JSON.stringify({ s: 'ok', code: 200, d }), { status: 200 });
    }) as unknown as typeof fetch;
    return { quoteUrls, masterHits: () => masterHits };
  }

  it('keys NSE and BSE quotes for the same symbol apart, with the group read from the master', async () => {
    const upstream = fakeUpstream();
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: 't' });

    const result = await provider.fetchQuotes([
      { symbol: 'RELIANCE', kind: 'equity' },
      { symbol: 'RELIANCE', kind: 'equity', exchange: 'BSE' },
      { symbol: 'SENSEX', kind: 'index', exchange: 'BSE' },
    ]);

    expect(decodeURIComponent(upstream.quoteUrls[0] ?? '')).toContain(
      'NSE:RELIANCE-EQ,BSE:RELIANCE-A,BSE:SENSEX-INDEX',
    );
    expect([...result.quotes.keys()]).toEqual(['RELIANCE', 'BSE:RELIANCE', 'BSE:SENSEX']);
    expect(result.quotes.get('RELIANCE')).toMatchObject({ symbol: 'RELIANCE', exchange: 'NSE' });
    expect(result.quotes.get('BSE:RELIANCE')).toMatchObject({
      symbol: 'RELIANCE',
      exchange: 'BSE',
    });
    expect(result.missing).toEqual([]);
  });

  it('reports a BSE name the master does not list as missing, never guessing its group', async () => {
    fakeUpstream();
    const provider = createFyersProvider({ appId: 'APP-100', accessToken: 't' });

    const result = await provider.fetchQuotes([
      { symbol: 'NOSUCH', kind: 'equity', exchange: 'BSE' },
    ]);

    expect(result.quotes.size).toBe(0);
    expect(result.missing).toEqual(['BSE:NOSUCH']);
  });

  it('downloads the BSE master once and reuses it within the TTL', async () => {
    const upstream = fakeUpstream();
    let now = 0;
    const provider = createFyersProvider({
      appId: 'APP-100',
      accessToken: 't',
      now: () => now,
      bseMasterTtlMs: 1_000,
    });
    const bse = [{ symbol: '3IINFOLTD', kind: 'equity', exchange: 'BSE' }] as const;

    await provider.fetchQuotes(bse);
    await provider.fetchQuotes(bse);
    expect(upstream.masterHits()).toBe(1);

    now = 2_000;
    await provider.fetchQuotes(bse);
    expect(upstream.masterHits()).toBe(2);
  });
});
