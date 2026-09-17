import type { Bar, MarketDataProvider } from '@equitywise/market-data';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import {
  compareBars,
  crossCheckBars,
  crossCheckProviders,
  lastSessionClose,
  sessionsBack,
} from './cross-check-bars.js';

vi.mock('../universe.js', () => ({
  loadIndexConstituents: async () => [
    { symbol: 'RELIANCE', kind: 'equity', name: 'Reliance', sector: 'Energy' },
    { symbol: 'TCS', kind: 'equity', name: 'TCS', sector: 'IT' },
  ],
}));

const T0 = Date.parse('2026-09-15T03:45:00.000Z'); // 09:15 IST
const bar = (offset: number, close: number, volume = 100): Bar => ({
  timestamp: T0 + offset * 60_000,
  open: close - 5,
  high: close + 10,
  low: close - 10,
  close,
  volume,
});

describe('compareBars', () => {
  it('reports identical series as fully agreeing', () => {
    const a = [bar(0, 124550), bar(1, 124600), bar(2, 124580)];
    expect(compareBars(a, [...a])).toEqual({
      compared: 3,
      mismatched: 0,
      maxPriceDeltaPaise: 0,
      volumeMismatches: 0,
      onlyA: [],
      onlyB: [],
      sample: [],
    });
  });

  it('counts a price difference in paise and a volume difference separately', () => {
    const a = [bar(0, 124550), bar(1, 124600)];
    const b = [bar(0, 124555), bar(1, 124600, 101)];
    const result = compareBars(a, b);
    expect(result.compared).toBe(2);
    expect(result.mismatched).toBe(2);
    expect(result.maxPriceDeltaPaise).toBe(5);
    expect(result.volumeMismatches).toBe(1);
    // Every price field moved by 5 on the first bar; the sample keeps the first five.
    expect(result.sample.map((m) => [m.field, m.delta])).toEqual([
      ['open', 5],
      ['high', 5],
      ['low', 5],
      ['close', 5],
      ['volume', 1],
    ]);
  });

  it('lists the timestamps only one side has — the 15:14 cut-off shows up here', () => {
    const a = [bar(0, 1), bar(1, 1), bar(2, 1)];
    const b = [bar(0, 1), bar(1, 1)];
    const result = compareBars(a, b);
    expect(result.onlyA).toEqual([T0 + 2 * 60_000]);
    expect(result.onlyB).toEqual([]);
    expect(result.compared).toBe(2);
  });
});

function provider(id: string, bars: Record<string, Bar[]>): MarketDataProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      streaming: false,
      intradayHistory: true,
      resolutions: ['1m', '1d'],
      historyStart: null,
      maxStreamSymbols: null,
      marketStatus: false,
      derivatives: false,
    },
    listInstruments: async () => [],
    fetchQuotes: async () => ({ quotes: new Map(), missing: [] }),
    fetchBars: async ({ ref, resolution }) => {
      const found = bars[`${ref.symbol}:${resolution}`];
      if (found === undefined) throw new Error(`no fixture for ${ref.symbol} ${resolution}`);
      return found;
    },
    fetchMarketStatus: async () => ({ isOpen: false, phase: 'closed', checkedAt: new Date() }),
  };
}

describe('crossCheckBars', () => {
  const range = { from: new Date(T0), to: new Date(T0 + 3 * 60_000) };
  const now = new Date(T0 + 60 * 60_000);

  it('compares every ref at every resolution and totals the result', async () => {
    const a = provider('a', { 'X:1m': [bar(0, 10), bar(1, 11)], 'X:1d': [bar(0, 20)] });
    const b = provider('b', { 'X:1m': [bar(0, 10), bar(1, 12)], 'X:1d': [bar(0, 20)] });
    const report = await crossCheckBars(a, b, {
      refs: [{ symbol: 'X', kind: 'equity' }],
      resolutions: ['1m', '1d'],
      range,
      now,
    });
    expect(report.providerA).toBe('a');
    expect(report.entries.map((e) => [e.resolution, e.comparison?.mismatched])).toEqual([
      ['1m', 1],
      ['1d', 0],
    ]);
    expect(report.totals).toEqual({
      compared: 3,
      mismatched: 1,
      onlyA: 0,
      onlyB: 0,
      maxPriceDeltaPaise: 1,
      failed: 0,
    });
  });

  it('records a failed fetch as an entry and keeps going', async () => {
    const a = provider('a', { 'X:1d': [bar(0, 20)] });
    const b = provider('b', { 'X:1d': [bar(0, 20)] });
    const report = await crossCheckBars(a, b, {
      refs: [
        { symbol: 'MISSING', kind: 'equity' },
        { symbol: 'X', kind: 'equity' },
      ],
      resolutions: ['1d'],
      range,
      now,
    });
    expect(report.totals.failed).toBe(1);
    expect(report.entries[0]?.error).toMatch(/no fixture for MISSING/);
    expect(report.entries[1]?.comparison?.compared).toBe(1);
  });
});

describe('crossCheckProviders', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
  log.child.mockReturnValue(log);

  it('skips with a remedy when the worker holds only one provider', async () => {
    const context = {
      providers: new Map([['fyers', provider('fyers', {})]]),
    } as unknown as WorkerContext;
    expect(await crossCheckProviders(context, log as unknown as Logger)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      'cross-check needs both providers configured',
      expect.objectContaining({ held: ['fyers'] }),
    );
  });

  it('samples the index plus its constituents over closed sessions only', async () => {
    const seen: string[] = [];
    const spy = (id: string): MarketDataProvider => ({
      ...provider(id, {}),
      fetchBars: async ({ ref, resolution, range: r, now: at }) => {
        seen.push(`${id}:${ref.symbol}:${resolution}`);
        // Both sides asked for identical instants, ending at a session close.
        expect(r.to.toISOString()).toBe('2026-09-15T10:00:00.000Z');
        expect(at?.toISOString()).toBe('2026-09-16T01:00:00.000Z');
        return [];
      },
    });
    const context = {
      providers: new Map([
        ['fyers', spy('fyers')],
        ['dhan', spy('dhan')],
      ]),
    } as unknown as WorkerContext;

    // 06:30 IST on the 16th: the 15th is the last closed session.
    const report = await crossCheckProviders(context, log as unknown as Logger, {
      now: new Date('2026-09-16T01:00:00.000Z'),
      sampleSize: 1,
    });
    expect(report?.entries.map((e) => `${e.symbol}:${e.resolution}`)).toEqual([
      'NIFTY50:1d',
      'RELIANCE:1d',
      'NIFTY50:1m',
      'RELIANCE:1m',
    ]);
    expect(seen).toHaveLength(8);
  });
});

describe('session helpers', () => {
  it('lastSessionClose skips the weekend and an unfinished session', () => {
    // Saturday 19 Sep 2026 → Friday the 18th.
    expect(lastSessionClose(new Date('2026-09-19T05:00:00.000Z')).toISOString()).toBe(
      '2026-09-18T10:00:00.000Z',
    );
    // Wednesday 16 Sep 12:00 IST — today's session is not over → Tuesday.
    expect(lastSessionClose(new Date('2026-09-16T06:30:00.000Z')).toISOString()).toBe(
      '2026-09-15T10:00:00.000Z',
    );
    // 16:00 IST the same day → today.
    expect(lastSessionClose(new Date('2026-09-16T10:30:00.000Z')).toISOString()).toBe(
      '2026-09-16T10:00:00.000Z',
    );
  });

  it('sessionsBack counts weekday sessions only', () => {
    // From Tuesday the 15th, five sessions back = Wednesday the 9th (skipping the 12th/13th).
    expect(sessionsBack(new Date('2026-09-15T10:00:00.000Z'), 5).toISOString()).toBe(
      '2026-09-09T03:45:00.000Z',
    );
    expect(sessionsBack(new Date('2026-09-15T10:00:00.000Z'), 1).toISOString()).toBe(
      '2026-09-15T03:45:00.000Z',
    );
  });
});
