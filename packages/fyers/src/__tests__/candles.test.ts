import { describe, expect, it } from 'vitest';
import { fetchCandles } from '../candles.js';
import { FyersHttpClient } from '../http.js';
import { RateLimiter } from '../rate-limit.js';
import { jsonFixture, type StubResponse, stubFetch } from './helpers.js';

const instantLimiter = (): RateLimiter =>
  new RateLimiter({
    limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
    sleep: async () => {},
  });

function fetcher(responses: StubResponse[]) {
  const stub = stubFetch(responses);
  return {
    stub,
    fetcher: {
      http: new FyersHttpClient({
        fetchImpl: stub.impl,
        sleep: async () => {},
        rateLimiter: instantLimiter(),
      }),
      authorization: 'APP-100:token',
    },
  };
}

describe('fetchCandles', () => {
  it('returns normalised paise candles for a range that fits one request', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-daily.json') }]);

    const candles = await fetchCandles(f, 'NSE:SBIN-EQ', 'D', {
      from: new Date('2021-05-24T00:00:00Z'),
      to: new Date('2021-05-27T00:00:00Z'),
    });

    expect(stub.calls).toHaveLength(1);
    expect(candles).toHaveLength(4);
    expect(candles[0]?.open).toBe(41700);
    expect(candles.every((c) => Number.isSafeInteger(c.close))).toBe(true);
  });

  it('sends the documented query parameters', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-daily.json') }]);
    await fetchCandles(f, 'NSE:SBIN-EQ', '15', {
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-10T00:00:00Z'),
    });

    const url = new URL(stub.calls[0] ?? '');
    expect(url.pathname).toBe('/data/history');
    expect(url.searchParams.get('resolution')).toBe('15');
    expect(url.searchParams.get('date_format')).toBe('1');
    expect(url.searchParams.get('range_from')).toBe('2026-08-01');
    expect(url.searchParams.get('range_to')).toBe('2026-08-10');
    expect(url.searchParams.get('cont_flag')).toBe('0');
    expect(url.searchParams.get('oi_flag')).toBeNull();
  });

  it('uses IST dates, so a late-UTC instant maps to the correct trading day', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-empty.json') }]);
    await fetchCandles(f, 'NSE:SBIN-EQ', 'D', {
      // 2026-08-20T20:00Z is already 2026-08-21 in IST.
      from: new Date('2026-08-20T20:00:00Z'),
      to: new Date('2026-08-20T20:00:00Z'),
    });
    expect(new URL(stub.calls[0] ?? '').searchParams.get('range_from')).toBe('2026-08-21');
  });

  it('auto-chunks a long minute range and concatenates the results', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-daily.json') }]);

    // 365 days at 100 days/request => 4 calls.
    await fetchCandles(f, 'NSE:SBIN-EQ', '5', {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-12-31T00:00:00Z'),
    });

    expect(stub.calls).toHaveLength(4);
    const ranges = stub.calls.map((c) => {
      const u = new URL(c);
      return [u.searchParams.get('range_from'), u.searchParams.get('range_to')];
    });
    expect(ranges[0]).toEqual(['2026-01-01', '2026-04-10']);
    expect(ranges[3]?.[1]).toEqual('2026-12-31');
  });

  it('deduplicates candles echoed at a chunk boundary', async () => {
    // Both chunks return the same four candles.
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-daily.json') }]);
    const candles = await fetchCandles(f, 'NSE:SBIN-EQ', '5', {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-08-01T00:00:00Z'),
    });

    expect(stub.calls.length).toBeGreaterThan(1);
    expect(candles).toHaveLength(4); // not 4 * chunks
    const timestamps = candles.map((c) => c.timestamp.getTime());
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it('returns candles in ascending timestamp order', async () => {
    const { fetcher: f } = fetcher([{ body: jsonFixture('history-daily.json') }]);
    const candles = await fetchCandles(f, 'NSE:SBIN-EQ', 'D', {
      from: new Date('2021-05-24T00:00:00Z'),
      to: new Date('2021-05-27T00:00:00Z'),
    });
    const times = candles.map((c) => c.timestamp.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('handles an empty result without failing', async () => {
    const { fetcher: f } = fetcher([{ body: jsonFixture('history-empty.json') }]);
    await expect(
      fetchCandles(f, 'NSE:SBIN-EQ', 'D', {
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-08-02T00:00:00Z'),
      }),
    ).resolves.toEqual([]);
  });

  it('passes cont_flag and oi_flag when asked', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-daily.json') }]);
    await fetchCandles(
      f,
      'NSE:SBIN-EQ',
      'D',
      { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-02T00:00:00Z') },
      { contFlag: 1, oiFlag: 1 },
    );
    const url = new URL(stub.calls[0] ?? '');
    expect(url.searchParams.get('cont_flag')).toBe('1');
    expect(url.searchParams.get('oi_flag')).toBe('1');
  });

  it('percent-encodes symbols containing an ampersand', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('history-empty.json') }]);
    await fetchCandles(f, 'NSE:M&M-EQ', 'D', {
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-02T00:00:00Z'),
    });
    // The raw query string must carry the escaped form, not a bare '&'.
    expect(stub.calls[0]).toContain('M%2526M');
  });

  it('sends the Authorization header in appId:token form', async () => {
    const stub = stubFetch([{ body: jsonFixture('history-empty.json') }]);
    const seen: string[] = [];
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      seen.push(headers?.Authorization ?? '');
      return stub.impl(input, init);
    }) as unknown as typeof fetch;

    await fetchCandles(
      {
        http: new FyersHttpClient({
          fetchImpl: spy,
          sleep: async () => {},
          rateLimiter: instantLimiter(),
        }),
        authorization: 'APP-100:tok',
      },
      'NSE:SBIN-EQ',
      'D',
      { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-02T00:00:00Z') },
    );
    expect(seen[0]).toBe('APP-100:tok');
  });

  it('recovers from a 429 mid-chunk and still returns the whole range', async () => {
    const { fetcher: f, stub } = fetcher([
      { body: jsonFixture('history-daily.json') },
      { status: 429, body: jsonFixture('rate-limited-429.json') },
      { body: jsonFixture('history-daily.json') },
    ]);

    const candles = await fetchCandles(f, 'NSE:SBIN-EQ', '5', {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    });

    expect(stub.calls.length).toBe(3); // 2 chunks, one retried
    expect(candles).toHaveLength(4);
  });
});
