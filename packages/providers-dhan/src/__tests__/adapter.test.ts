import {
  DhanFeedError,
  type DhanSession,
  InstrumentIndex,
  parseScripMaster,
} from '@equitywise/dhan';
import { isMarketDataProviderError, type Tick } from '@equitywise/market-data';
import { RateLimiter, type TickTransport } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { createDhanProvider, dropFormingBar } from '../adapter.js';
import {
  aggregateMinutes,
  aggregateWeekly,
  dailyBarTimestamp,
  inferMarketStatus,
} from '../mapping.js';
import { planResolution, SUPPORTED_RESOLUTIONS } from '../resolution.js';
import { fixture, jsonFixture, routedFetch } from './helpers.js';

const master = parseScripMaster(fixture('scrip-master-excerpt.csv'));
const index = new InstrumentIndex(master.instruments, master.futures);

const instant = (): RateLimiter =>
  new RateLimiter({
    limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
    sleep: async () => {},
  });

/** A provider over a scripted fetch, with the scrip master pre-loaded. */
function provider(
  routes: Parameters<typeof routedFetch>[0],
  extra: { now?: Date; token?: string | (() => string); download?: boolean } = {},
) {
  const stub = routedFetch(routes);
  const p = createDhanProvider({
    clientId: '1103361782',
    accessToken: extra.token ?? 'jwt',
    fetchImpl: stub.impl,
    dataRateLimiter: instant(),
    quoteRateLimiter: instant(),
    attempts: 1,
    // Pre-loaded unless a test wants to exercise the download path.
    ...(extra.download === true ? {} : { instruments: index }),
    now: () => extra.now ?? new Date('2026-09-16T12:00:00Z'), // 17:30 IST, after close
    sleep: async () => {},
  });
  return { p, stub };
}

describe('capabilities', () => {
  it('declares what Dhan can and cannot do', () => {
    const { p } = provider({});
    expect(p.id).toBe('dhan');
    expect(p.displayName).toBe('Dhan');
    expect(p.capabilities.streaming).toBe(false);
    expect(p.capabilities.marketStatus).toBe(false);
    expect(p.capabilities.intradayHistory).toBe(true);
    expect(p.capabilities.resolutions).toEqual(SUPPORTED_RESOLUTIONS);
    expect(p.capabilities.derivatives).toBe(true);
    expect(p.streamTicks).toBeUndefined();
    expect(p.fetchFuturesOpenInterest).toBeDefined();
  });

  it('plans native and derived resolutions', () => {
    expect(planResolution('1m')).toEqual({ fetch: '1', minutes: 1, derived: 'none' });
    expect(planResolution('5m')).toEqual({ fetch: '1', minutes: 5, derived: 'minutes-from-1m' });
    expect(planResolution('1h')).toEqual({ fetch: '1', minutes: 60, derived: 'minutes-from-1m' });
    expect(planResolution('1d')).toEqual({ fetch: 'D', minutes: 0, derived: 'none' });
    expect(planResolution('1w')).toEqual({ fetch: 'D', minutes: 0, derived: '1w-from-1d' });
  });

  it('refuses to build without a client id or with a literally empty token', () => {
    expect(() => createDhanProvider({ clientId: '', accessToken: 'x' })).toThrow(/DHAN_CLIENT_ID/);
    expect(() => createDhanProvider({ clientId: '1', accessToken: '' })).toThrow(
      /DHAN_ACCESS_TOKEN/,
    );
    // A getter may be empty at construction; it is checked per request.
    expect(() => createDhanProvider({ clientId: '1', accessToken: () => '' })).not.toThrow();
  });
});

describe('instruments', () => {
  it('lists product instruments with the id hidden in providerRef', async () => {
    const { p } = provider({});
    const all = await p.listInstruments();
    const reliance = all.find((i) => i.symbol === 'RELIANCE');
    expect(reliance).toEqual({
      symbol: 'RELIANCE',
      name: 'Reliance Industries',
      kind: 'equity',
      exchange: 'NSE',
      isin: 'INE002A01018',
      lotSize: 1,
      tickSize: 10,
      providerRef: 'NSE_EQ:2885',
    });
    expect(all.find((i) => i.symbol === 'NIFTY50')?.kind).toBe('index');
    expect(JSON.stringify(all)).not.toMatch(/securityId|dhanSymbol/);
  });

  it('downloads and caches the master when none is supplied, once for concurrent callers', async () => {
    const { p, stub } = provider(
      { '/api-data/api-scrip-master-detailed.csv': { text: fixture('scrip-master-excerpt.csv') } },
      { download: true },
    );
    const [a, b] = await Promise.all([p.listInstruments(), p.listInstruments()]);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBe(a.length);
    expect(stub.calls.filter((u) => u.includes('scrip-master'))).toHaveLength(1);
  });
});

describe('fetchBars', () => {
  it('maps daily candles onto the product convention: UTC midnight of the IST date, paise', async () => {
    const { p, stub } = provider({
      '/v2/charts/historical': { body: jsonFixture('charts-daily.json') },
    });
    const bars = await p.fetchBars({
      ref: { symbol: 'RELIANCE', kind: 'equity' },
      resolution: '1d',
      range: { from: new Date('2026-09-13T18:30:00Z'), to: new Date('2026-09-15T18:30:00Z') },
      includeForming: true, // the clock says 16 Sep; the forming rule is tested separately
    });
    expect(bars.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-14T00:00:00.000Z',
      '2026-09-15T00:00:00.000Z',
      '2026-09-16T00:00:00.000Z',
    ]);
    expect(bars[0]).toMatchObject({
      open: 123000,
      high: 124200,
      low: 122505,
      close: 123810,
      volume: 8123456,
    });
    // The request carried Dhan's id, never our symbol.
    const body = JSON.parse(stub.bodies[0] ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({
      securityId: '2885',
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
    });
  });

  it("drops today's daily bar unless includeForming is set", async () => {
    const routes = { '/v2/charts/historical': { body: jsonFixture('charts-daily.json') } };
    const request = {
      ref: { symbol: 'RELIANCE', kind: 'equity' as const },
      resolution: '1d' as const,
      range: { from: new Date('2026-09-13T18:30:00Z'), to: new Date('2026-09-15T18:30:00Z') },
    };
    // Fixture's last bar is 16 Sep; the clock says 16 Sep 17:30 IST — same trading date.
    const { p } = provider(routes);
    expect(await p.fetchBars(request)).toHaveLength(2);
    expect(await p.fetchBars({ ...request, includeForming: true })).toHaveLength(3);
    // The next morning it is closed and kept.
    const { p: later } = provider(routes, { now: new Date('2026-09-17T03:00:00Z') });
    expect(await later.fetchBars(request)).toHaveLength(3);
  });

  it('keeps intraday bars as bar-open instants and drops the forming one by duration', async () => {
    const routes = { '/v2/charts/intraday': { body: jsonFixture('charts-intraday.json') } };
    const request = {
      ref: { symbol: 'RELIANCE', kind: 'equity' as const },
      resolution: '1m' as const,
      range: { from: new Date('2026-09-16T03:45:00Z'), to: new Date('2026-09-16T03:46:00Z') },
    };
    // At 09:16:30 IST the 09:16 bar is still forming.
    const { p } = provider(routes, { now: new Date('2026-09-16T03:46:30Z') });
    const bars = await p.fetchBars(request);
    expect(bars.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-16T03:45:00.000Z',
    ]);
    expect(bars[0]).toMatchObject({ open: 124000, close: 124150, volume: 12345 });
  });

  it('serves 5m by fetching 1m and aggregating on the 09:15 grid', async () => {
    const { p, stub } = provider({
      '/v2/charts/intraday': { body: jsonFixture('charts-1m-session-start.json') },
    });
    const bars = await p.fetchBars({
      ref: { symbol: 'TCS', kind: 'equity' },
      resolution: '5m',
      range: { from: new Date('2026-09-16T03:45:00Z'), to: new Date('2026-09-16T04:00:00Z') },
    });
    // Only 1-minute bars are ever requested, whatever the resolution.
    expect(JSON.parse(stub.bodies[0] ?? '{}')).toMatchObject({ interval: '1' });
    // Fixture: 09:15…09:21 and 09:25 (IST) — the 09:22–09:24 minutes are absent.
    // → 09:15 (5 bars), 09:20 (2 bars), 09:25 (1 bar).
    expect(bars.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-16T03:45:00.000Z',
      '2026-09-16T03:50:00.000Z',
      '2026-09-16T03:55:00.000Z',
    ]);
    // Hand-computed from the fixture: open of first, max high, min low, close of last, summed volume.
    expect(bars[0]).toEqual({
      timestamp: Date.parse('2026-09-16T03:45:00Z'),
      open: 218000,
      high: 219250,
      low: 217600,
      close: 218900,
      volume: 30000,
    });
    expect(bars[1]).toEqual({
      timestamp: Date.parse('2026-09-16T03:50:00Z'),
      open: 218900,
      high: 219900,
      low: 218500,
      close: 219500,
      volume: 25000,
    });
    expect(bars[2]).toMatchObject({ open: 219500, close: 219100, volume: 9000 });
  });

  it('serves 1w by fetching daily and aggregating Monday–Friday', async () => {
    const { p, stub } = provider(
      { '/v2/charts/historical': { body: jsonFixture('charts-two-weeks.json') } },
      { now: new Date('2026-09-20T12:00:00Z') }, // a Sunday: both weeks closed
    );
    const bars = await p.fetchBars({
      ref: { symbol: 'RELIANCE', kind: 'equity' },
      resolution: '1w',
      range: { from: new Date('2026-09-06T18:30:00Z'), to: new Date('2026-09-18T18:30:00Z') },
    });
    expect(JSON.parse(stub.bodies[0] ?? '{}')).toMatchObject({ expiryCode: 0 });
    expect(bars.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-07T00:00:00.000Z', // Monday 7 Sep
      '2026-09-14T00:00:00.000Z', // Monday 14 Sep
    ]);
    expect(bars[0]).toEqual({
      timestamp: Date.parse('2026-09-07T00:00:00Z'),
      open: 120000,
      high: 123500,
      low: 119000,
      close: 122800,
      volume: 5_000_000,
    });
  });

  it('drops a weekly bar whose week is still running', async () => {
    const { p } = provider(
      { '/v2/charts/historical': { body: jsonFixture('charts-two-weeks.json') } },
      { now: new Date('2026-09-16T12:00:00Z') }, // Wednesday of the second week
    );
    const bars = await p.fetchBars({
      ref: { symbol: 'RELIANCE', kind: 'equity' },
      resolution: '1w',
      range: { from: new Date('2026-09-06T18:30:00Z'), to: new Date('2026-09-18T18:30:00Z') },
    });
    expect(bars).toHaveLength(1);
  });

  it('fails loudly on an unknown symbol, with a product error', async () => {
    const { p, stub } = provider({});
    await expect(
      p.fetchBars({
        ref: { symbol: 'NOSUCH', kind: 'equity' },
        resolution: '1d',
        range: { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T00:00:00Z') },
      }),
    ).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      failure: 'not_found',
      providerId: 'dhan',
    });
    expect(stub.calls).toHaveLength(0);
  });

  it('translates an expired token into an auth failure the product understands', async () => {
    const { p } = provider({
      '/v2/charts/historical': { status: 401, body: { errorCode: 807, errorMessage: 'expired' } },
    });
    let caught: unknown;
    try {
      await p.fetchBars({
        ref: { symbol: 'RELIANCE', kind: 'equity' },
        resolution: '1d',
        range: { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T00:00:00Z') },
      });
    } catch (error) {
      caught = error;
    }
    expect(isMarketDataProviderError(caught)).toBe(true);
    expect(caught).toMatchObject({ failure: 'auth', retryable: false });
    expect(String((caught as Error).cause)).not.toMatch(/DhanApiError: undefined/);
  });

  it('reads the token per request so a rotation takes effect immediately', async () => {
    let token = '';
    const { p, stub } = provider(
      { '/v2/charts/historical': { body: jsonFixture('charts-daily.json') } },
      { token: () => token },
    );
    const request = {
      ref: { symbol: 'RELIANCE', kind: 'equity' as const },
      resolution: '1d' as const,
      range: { from: new Date('2026-09-13T18:30:00Z'), to: new Date('2026-09-15T18:30:00Z') },
    };
    await expect(p.fetchBars(request)).rejects.toMatchObject({ failure: 'not_configured' });
    token = 'fresh';
    await p.fetchBars(request);
    expect((stub.headers[0] as Record<string, string>)['access-token']).toBe('fresh');
  });
});

describe('fetchFuturesOpenInterest', () => {
  const withOi = {
    ...jsonFixture<Record<string, number[]>>('charts-daily.json'),
    open_interest: [129406500, 128790500, 126435500],
  };

  it('asks every listed contract by its own NSE_FNO id with oi on, and keeps closed sessions only', async () => {
    const { p, stub } = provider({ '/v2/charts/historical': { body: withOi } });
    const bars = await p.fetchFuturesOpenInterest?.({
      ref: { symbol: 'RELIANCE', kind: 'equity' },
      range: { from: new Date('2026-09-13T18:30:00Z'), to: new Date('2026-09-15T18:30:00Z') },
    });
    // Three contracts × (3 bars − today's forming one) = 6, ascending by date then expiry.
    expect(bars).toHaveLength(6);
    expect(bars?.slice(0, 3).map((b) => b.expiry)).toEqual([
      '2026-09-29',
      '2026-10-27',
      '2026-11-23',
    ]);
    expect(bars?.[0]).toMatchObject({
      timestamp: Date.UTC(2026, 8, 14),
      close: 123810,
      openInterest: 129_406_500,
    });
    const bodies = stub.bodies.map((b) => JSON.parse(b) as Record<string, unknown>);
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toMatchObject({
      securityId: '68777',
      exchangeSegment: 'NSE_FNO',
      instrument: 'FUTSTK',
      oi: true,
    });
  });

  it('lists the F&O underlyings that are also cash equities', async () => {
    const { p } = provider({});
    expect(await p.listDerivativeUnderlyings?.()).toEqual(['RELIANCE']);
  });

  it('is a not_found for a stock without listed futures', async () => {
    const { p } = provider({});
    await expect(
      p.fetchFuturesOpenInterest?.({
        ref: { symbol: 'TCS', kind: 'equity' },
        range: { from: new Date(0), to: new Date(1) },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => isMarketDataProviderError(error) && error.failure === 'not_found',
    );
  });
});

describe('fetchQuotes', () => {
  it('returns quotes keyed by OUR symbol and reports the unusable and the unknown as missing', async () => {
    const { p, stub } = provider({ '/v2/marketfeed/quote': { body: jsonFixture('quote.json') } });
    const result = await p.fetchQuotes([
      { symbol: 'RELIANCE', kind: 'equity' },
      { symbol: 'YESBANK', kind: 'equity' },
      { symbol: 'NIFTY50', kind: 'index' },
      { symbol: 'NOSUCH', kind: 'equity' },
    ]);
    expect([...result.quotes.keys()].sort()).toEqual(['NIFTY50', 'RELIANCE', 'YESBANK']);
    expect(result.quotes.get('RELIANCE')).toMatchObject({
      symbol: 'RELIANCE',
      ltp: 124690,
      change: 1160,
      previousClose: 123530,
      bid: 124685,
      ask: 124695,
      volume: 8123456,
    });
    expect(result.quotes.get('NIFTY50')).toMatchObject({ ltp: 2512345, change: -8730 });
    expect(result.missing).toEqual(['NOSUCH']);
    // Both segments went out in one body.
    expect(JSON.parse(stub.bodies[0] ?? '{}')).toEqual({ NSE_EQ: [2885, 11915], IDX_I: [13] });
  });

  it('asks nothing for an empty list', async () => {
    const { p, stub } = provider({});
    expect(await p.fetchQuotes([])).toEqual({ quotes: new Map(), missing: [] });
    expect(stub.calls).toHaveLength(0);
  });

  it('maps a lapsed Data API subscription to an auth failure with the renewal remedy', async () => {
    const { p } = provider({
      '/v2/marketfeed/quote': {
        status: 400,
        body: { status: 'failure', remarks: { error_code: 806, error_message: 'not subscribed' } },
      },
    });
    await expect(p.fetchQuotes([{ symbol: 'RELIANCE', kind: 'equity' }])).rejects.toMatchObject({
      failure: 'auth',
      remedy: expect.stringContaining('Data API subscription'),
    });
  });

  it('maps a 429 to a retryable rate limit with the wait', async () => {
    const { p } = provider({
      '/v2/marketfeed/quote': { status: 429, body: {}, headers: { 'retry-after': '30' } },
    });
    await expect(p.fetchQuotes([{ symbol: 'RELIANCE', kind: 'equity' }])).rejects.toMatchObject({
      failure: 'rate_limit',
      retryable: true,
      retryAfterMs: 30_000,
    });
  });
});

describe('market status (inferred)', () => {
  it('follows the NSE timetable in IST and never claims authority', async () => {
    const at = (iso: string) => inferMarketStatus(new Date(iso));
    expect(at('2026-09-16T03:30:00Z')).toMatchObject({ phase: 'pre_open', isOpen: false }); // 09:00 IST Wed
    expect(at('2026-09-16T03:45:00Z')).toMatchObject({ phase: 'open', isOpen: true }); // 09:15
    expect(at('2026-09-16T09:59:59Z')).toMatchObject({ phase: 'open', isOpen: true }); // 15:29:59
    expect(at('2026-09-16T10:00:00Z')).toMatchObject({ phase: 'post_close', isOpen: false }); // 15:30
    expect(at('2026-09-16T12:00:00Z')).toMatchObject({ phase: 'closed', isOpen: false }); // 17:30
    expect(at('2026-09-19T05:00:00Z')).toMatchObject({ phase: 'closed', isOpen: false }); // Saturday
    const { p } = provider({}, { now: new Date('2026-09-16T05:00:00Z') });
    expect(await p.fetchMarketStatus()).toMatchObject({
      phase: 'open',
      checkedAt: new Date('2026-09-16T05:00:00Z'),
    });
    expect(p.capabilities.marketStatus).toBe(false);
  });
});

describe('pure helpers', () => {
  it('moves a Dhan daily stamp (IST midnight) onto UTC midnight of the same date', () => {
    expect(new Date(dailyBarTimestamp(new Date('2026-09-15T18:30:00Z'))).toISOString()).toBe(
      '2026-09-16T00:00:00.000Z',
    );
    // And leaves an already-UTC-midnight stamp alone (05:30 IST is still the 16th).
    expect(new Date(dailyBarTimestamp(new Date('2026-09-16T00:00:00Z'))).toISOString()).toBe(
      '2026-09-16T00:00:00.000Z',
    );
  });

  it('aggregateMinutes stamps a bucket at its origin even when its first minute is missing', () => {
    const bar = (iso: string, o: number, h: number, l: number, c: number, v: number) => ({
      timestamp: Date.parse(iso),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    });
    // A lone 09:31 bar in the 09:15 half-hour, plus a lone 15:14 bar in the 15:15 one.
    const out = aggregateMinutes(
      [bar('2026-09-16T04:01:00Z', 1, 2, 1, 2, 5), bar('2026-09-16T09:44:00Z', 3, 4, 3, 4, 7)],
      30,
    );
    expect(out.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-16T03:45:00.000Z',
      '2026-09-16T09:15:00.000Z',
    ]);
    expect(out[0]).toMatchObject({ open: 1, close: 2, volume: 5 });
    // 60-minute buckets from 09:15: 09:15, 10:15, … 15:15.
    const hour = aggregateMinutes(
      [bar('2026-09-16T04:44:00Z', 1, 1, 1, 1, 1), bar('2026-09-16T04:45:00Z', 2, 2, 2, 2, 1)],
      60,
    ); // 10:14 and 10:15 IST straddle a boundary
    expect(hour.map((b) => new Date(b.timestamp).toISOString())).toEqual([
      '2026-09-16T03:45:00.000Z',
      '2026-09-16T04:45:00.000Z',
    ]);
    expect(aggregateMinutes([], 5)).toEqual([]);
    expect(() => aggregateMinutes([], 0)).toThrow(RangeError);
  });

  it('aggregateWeekly groups by Monday and merges OHLCV', () => {
    const d = (day: number, o: number, h: number, l: number, c: number) => ({
      timestamp: Date.UTC(2026, 8, day),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: 1,
    });
    const out = aggregateWeekly([d(11, 1, 5, 1, 2), d(14, 2, 6, 2, 3), d(18, 3, 4, 1, 4)]); // Fri, Mon, Fri
    expect(out).toEqual([
      { timestamp: Date.UTC(2026, 8, 11), open: 1, high: 5, low: 1, close: 2, volume: 1 },
      { timestamp: Date.UTC(2026, 8, 14), open: 2, high: 6, low: 1, close: 4, volume: 2 },
    ]);
  });

  it('dropFormingBar handles every resolution', () => {
    const b = (ts: number) => ({ timestamp: ts, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    const t = Date.parse('2026-09-16T04:00:00Z'); // 09:30 IST
    expect(dropFormingBar([b(t - 60_000), b(t)], '1m', new Date(t + 30_000))).toHaveLength(1);
    expect(dropFormingBar([b(t - 60_000), b(t)], '1m', new Date(t + 60_000))).toHaveLength(2);
    expect(dropFormingBar([b(t - 3_600_000), b(t)], '1h', new Date(t + 3_599_000))).toHaveLength(1);
    const day = Date.UTC(2026, 8, 16);
    expect(dropFormingBar([b(day)], '1d', new Date('2026-09-16T12:00:00Z'))).toHaveLength(0);
    expect(dropFormingBar([b(day)], '1d', new Date('2026-09-17T02:00:00Z'))).toHaveLength(1);
    const monday = Date.UTC(2026, 8, 14);
    expect(dropFormingBar([b(monday)], '1w', new Date('2026-09-18T12:00:00Z'))).toHaveLength(0); // Friday same week
    expect(dropFormingBar([b(monday)], '1w', new Date('2026-09-21T02:00:00Z'))).toHaveLength(1); // next Monday
    expect(dropFormingBar([], '1d', new Date())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Streaming (Phase 7)
// ---------------------------------------------------------------------------

/** A scripted transport: records what the adapter sends, lets the test inject packets. */
function fakeTransport() {
  const handlers = {
    message: [] as ((payload: unknown) => void)[],
    connect: [] as (() => void)[],
    close: [] as (() => void)[],
    error: [] as ((error: unknown) => void)[],
  };
  const transport: TickTransport<string> & {
    subscribed: string[][];
    unsubscribed: string[][];
    open(): void;
    packet(p: unknown): void;
    error(e: unknown): void;
    sessions: DhanSession[];
  } = {
    subscribed: [],
    unsubscribed: [],
    sessions: [],
    connect() {},
    close() {},
    subscribe(keys) {
      transport.subscribed.push(keys);
    },
    unsubscribe(keys) {
      transport.unsubscribed.push(keys);
    },
    on(event: keyof typeof handlers, handler: (...args: never[]) => void) {
      (handlers[event] as ((...args: never[]) => void)[]).push(handler);
    },
    open() {
      for (const h of handlers.connect) h();
    },
    packet(p) {
      for (const h of handlers.message) h(p);
    },
    error(e) {
      for (const h of handlers.error) h(e);
    },
  };
  return transport;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('streamTicks', () => {
  function streaming(token: string | (() => string) = 'jwt') {
    const transport = fakeTransport();
    const p = createDhanProvider({
      clientId: '1103361782',
      accessToken: token,
      instruments: index,
      dataRateLimiter: instant(),
      quoteRateLimiter: instant(),
      stream: {
        createTransport: (session) => {
          transport.sessions.push(session);
          return transport;
        },
      },
    });
    return { p, transport };
  }

  it('advertises the socket and its 5,000-symbol cap when streaming is enabled', () => {
    const { p } = streaming();
    expect(p.capabilities.streaming).toBe(true);
    expect(p.capabilities.maxStreamSymbols).toBe(5_000);
    expect(p.streamTicks).toBeDefined();
  });

  it('resolves symbols to security ids, streams ticks under OUR symbols, and skips unknowns', async () => {
    const { p, transport } = streaming();
    const ticks: Tick[] = [];
    const states: string[] = [];
    const subscription = p.streamTicks?.({
      refs: [
        { symbol: 'RELIANCE', kind: 'equity' },
        { symbol: 'NIFTY50', kind: 'index' },
        { symbol: 'NOSUCH', kind: 'equity' },
      ],
      onTick: (tick) => ticks.push(tick),
      onStateChange: (s) => states.push(s),
    });
    expect(subscription?.state()).toBe('connecting');
    await flush(); // the scrip master resolves; the socket opens
    transport.open();

    expect(transport.subscribed).toEqual([['NSE_EQ:2885', 'IDX_I:13']]);
    expect(states).toEqual(['live']);
    // The transport was handed the current session, never a captured one.
    expect(transport.sessions[0]).toEqual({ clientId: '1103361782', accessToken: 'jwt' });

    const at = new Date('2026-09-16T09:59:58.000Z');
    transport.packet({
      kind: 'ticker',
      ref: { segment: 'NSE_EQ', securityId: '2885' },
      ltp: 124555,
      lastTradedAt: at,
    });
    transport.packet({ kind: 'previousClose', ref: { segment: 'IDX_I', securityId: '13' } });
    transport.packet({
      kind: 'quote',
      ref: { segment: 'IDX_I', securityId: '13' },
      ltp: 2321760,
      lastTradedAt: at,
      volume: 0,
    });
    expect(ticks).toEqual([
      { symbol: 'RELIANCE', ltp: 124555, lastTradedAt: at, exchangeFeedAt: at, volumeToday: null },
      { symbol: 'NIFTY50', ltp: 2321760, lastTradedAt: at, exchangeFeedAt: at, volumeToday: 0 },
    ]);
    expect(subscription?.lastMessageAt()).not.toBeNull();

    subscription?.subscribe([{ symbol: 'TCS', kind: 'equity' }]);
    subscription?.unsubscribe([{ symbol: 'RELIANCE', kind: 'equity' }]);
    expect(transport.subscribed[1]).toEqual(['NSE_EQ:11536']);
    expect(transport.unsubscribed).toEqual([['NSE_EQ:2885']]);

    subscription?.stop();
    expect(subscription?.state()).toBe('stopped');
  });

  it('applies symbols added before the scrip master arrived', async () => {
    const { p, transport } = streaming();
    const subscription = p.streamTicks?.({ refs: [], onTick: () => {} });
    subscription?.subscribe([{ symbol: 'TCS', kind: 'equity' }]);
    await flush();
    transport.open();
    expect(transport.subscribed).toEqual([['NSE_EQ:11536']]);
  });

  it('reports feed errors in product terms: a credential disconnect is an auth failure', async () => {
    let token = 'first';
    const { p, transport } = streaming(() => token);
    const errors: unknown[] = [];
    p.streamTicks?.({
      refs: [{ symbol: 'TCS', kind: 'equity' }],
      onTick: () => {},
      onError: (e) => errors.push(e),
    });
    await flush();
    // The transport is built from the CURRENT token at connect time.
    expect(transport.sessions[0]?.accessToken).toBe('first');
    token = 'second';

    transport.error(new DhanFeedError(807, 'Access token expired'));
    expect(errors[0]).toMatchObject({
      name: 'MarketDataProviderError',
      failure: 'auth',
      providerId: 'dhan',
    });
    transport.error(new DhanFeedError(805, 'Too many requests or connections'));
    expect(errors[1]).toMatchObject({ failure: 'rate_limit' });
  });
});
