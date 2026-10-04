import type { InstrumentRef, Quote } from '@equitywise/market-data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadlineIndex } from './indices';

const mock = vi.hoisted(() => ({
  provider: vi.fn(),
  status: vi.fn(),
  headlines: vi.fn(),
}));
vi.mock('./provider', () => ({ getProvider: mock.provider }));
vi.mock('./market-status', () => ({ getMarketStatus: mock.status }));
vi.mock('./indices', () => ({ getHeadlineIndices: mock.headlines }));

import {
  buildIndexStrip,
  getIndexStrip,
  getStaleIndexStrip,
  resetIndexStripCache,
} from './index-strip';

const HEADLINES: readonly HeadlineIndex[] = [
  { symbol: 'NIFTY50', name: 'NIFTY 50', kind: 'index', exchange: 'NSE', display: 'index' },
  { symbol: 'INDIAVIX', name: 'INDIA VIX', kind: 'index', exchange: 'NSE', display: 'volatility' },
];

function quote(symbol: string, ltp: number, previousClose: number): Quote {
  return {
    symbol,
    ltp,
    change: ltp - previousClose,
    changePercent: ((ltp - previousClose) / previousClose) * 100,
    open: previousClose,
    high: Math.max(ltp, previousClose),
    low: Math.min(ltp, previousClose),
    previousClose,
    averagePrice: null,
    volume: null,
    timestamp: new Date('2026-09-18T09:02:07Z'),
  };
}

describe('buildIndexStrip', () => {
  const now = new Date('2026-09-18T09:02:10Z');

  it('shapes one card per headline with a quote, in config order, paise intact', () => {
    const strip = buildIndexStrip({
      headlines: HEADLINES,
      quotes: new Map([
        ['INDIAVIX', quote('INDIAVIX', 12_89, 13_42)],
        ['NIFTY50', quote('NIFTY50', 25_312_40, 25_169_55)],
      ]),
      market: { isOpen: true, phase: 'open', checkedAt: now },
      now,
    });

    expect(strip.indices.map((i) => i.symbol)).toEqual(['NIFTY50', 'INDIAVIX']);
    const nifty = strip.indices[0];
    expect(nifty).toMatchObject({
      name: 'NIFTY 50',
      exchange: 'NSE',
      display: 'index',
      ltp: 25_312_40,
      change: 142_85,
      previousClose: 25_169_55,
      at: '2026-09-18T09:02:07.000Z',
    });
    expect(strip.indices[1]).toMatchObject({ display: 'volatility' });
    expect(strip.market).toEqual({ isOpen: true, phase: 'open' });
    expect(strip.asOf).toBe(now.toISOString());
    expect(strip.stale).toBeUndefined();
  });

  it('drops an index the provider returned no quote for rather than rendering zeros', () => {
    const strip = buildIndexStrip({
      headlines: HEADLINES,
      quotes: new Map([['NIFTY50', quote('NIFTY50', 25_312_40, 25_169_55)]]),
      market: null,
      now,
    });
    expect(strip.indices.map((i) => i.symbol)).toEqual(['NIFTY50']);
    expect(strip.market).toEqual({ isOpen: false, phase: 'unknown' });
  });
});

describe('getIndexStrip', () => {
  const now = new Date('2026-09-18T09:02:10Z');

  beforeEach(() => {
    resetIndexStripCache();
    mock.headlines.mockResolvedValue(HEADLINES);
    mock.status.mockResolvedValue({ isOpen: true, phase: 'open', checkedAt: now });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  function providerWith(fetchQuotes: (refs: readonly InstrumentRef[]) => Promise<unknown>) {
    mock.provider.mockResolvedValue({ fetchQuotes });
  }

  it('asks the provider once for all headline indices and caches the answer', async () => {
    const fetchQuotes = vi.fn(async (refs: readonly InstrumentRef[]) => ({
      quotes: new Map(refs.map((ref) => [ref.symbol, quote(ref.symbol, 100_00, 99_00)])),
      missing: [],
    }));
    providerWith(fetchQuotes);

    const first = await getIndexStrip(now);
    const second = await getIndexStrip(new Date(now.getTime() + 4_000));
    const third = await getIndexStrip(new Date(now.getTime() + 6_000));

    expect(fetchQuotes).toHaveBeenCalledTimes(2);
    expect(fetchQuotes.mock.calls[0]?.[0]).toEqual([
      { symbol: 'NIFTY50', kind: 'index', exchange: 'NSE' },
      { symbol: 'INDIAVIX', kind: 'index', exchange: 'NSE' },
    ]);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('serves the last good snapshot as stale after a provider failure', async () => {
    providerWith(async (refs) => ({
      quotes: new Map(refs.map((ref) => [ref.symbol, quote(ref.symbol, 100_00, 99_00)])),
      missing: [],
    }));
    const good = await getIndexStrip(now);

    providerWith(async () => {
      throw new Error('upstream down');
    });
    await expect(getIndexStrip(new Date(now.getTime() + 10_000))).rejects.toMatchObject({
      name: 'MarketDataError',
      code: 'UNKNOWN',
    });

    const stale = getStaleIndexStrip('UPSTREAM');
    expect(stale).toMatchObject({ indices: good.indices, stale: { reason: 'UPSTREAM' } });
  });

  it('has nothing stale to serve before the first success', async () => {
    providerWith(async () => {
      throw new Error('upstream down');
    });
    await expect(getIndexStrip(now)).rejects.toBeInstanceOf(Error);
    expect(getStaleIndexStrip('UPSTREAM')).toBeNull();
  });

  it('drops an index with no quote and names it in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    providerWith(async () => ({
      quotes: new Map([['NIFTY50', quote('NIFTY50', 100_00, 99_00)]]),
      missing: ['INDIAVIX'],
    }));

    const strip = await getIndexStrip(now);
    expect(strip.indices.map((i) => i.symbol)).toEqual(['NIFTY50']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('INDIAVIX'));
    warn.mockRestore();
  });
});
