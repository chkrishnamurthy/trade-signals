import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUY_SIGNAL_AT,
  buySession,
  dailyBars,
  SESSION_OPEN,
} from '../../../../packages/core/src/intraday/fixture.js';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createIntradayJobs } from './intraday-orb.js';

const mock = vi.hoisted(() => ({
  record: vi.fn(),
  insert: vi.fn(),
  publish: vi.fn(),
  exclude: vi.fn(),
  instruments: vi.fn(),
  stored: vi.fn(),
  aggregated: vi.fn(),
  daily: vi.fn(),
  listed: vi.fn(),
  has: vi.fn(),
  refresh: vi.fn(),
  enabled: true,
}));
vi.mock('node:fs/promises', () => ({
  readFile: async () =>
    `enabled: ${mock.enabled}\nuniverse: nifty50\nhistoryDays: 14\nhistoryConcurrency: 4\ncapitalPaise: 50000000\nstrategyRevision: 1`,
}));
vi.mock('../universe.js', () => ({
  loadIndexConstituents: async () => [
    { symbol: 'RELIANCE', kind: 'equity', name: 'Reliance Industries', sector: 'Energy' },
  ],
}));
vi.mock('./refresh-credential.js', () => ({ refreshProviderCredential: mock.refresh }));
vi.mock('@equitywise/db', async () => {
  const actual = await vi.importActual<typeof import('@equitywise/db')>('@equitywise/db');
  return {
    getDailyBars: mock.daily,
    getSignalBars: mock.aggregated,
    getSignalMinutes: mock.stored,
    hasIntradaySignal: mock.has,
    insertSignalMinutes: mock.insert,
    intradayBookFromSignals: actual.intradayBookFromSignals,
    invalidateProviderCredential: vi.fn(),
    listCorporateActions: vi.fn(async () => []),
    listIntradaySignals: mock.listed,
    observeIntradayPrice: vi.fn(),
    publishIntradaySignal: mock.publish,
    reconcileIntradayDeadlines: vi.fn(),
    recordIntradayExclusion: mock.exclude,
    recordIntradayScan: mock.record,
    registerStrategy: vi.fn(async () => 7),
    signalUniverseInstruments: mock.instruments,
    withIntradayScanLock: async (db: unknown, run: (db: unknown) => Promise<void>) => run(db),
  };
});

const now = BUY_SIGNAL_AT + 2_000; // 09:50:02 IST on the fixture session
function setup(isOpen = true) {
  const fetchBars = vi.fn(async () => []);
  const fetchMarketStatus = vi.fn(async () => ({
    isOpen,
    phase: isOpen ? 'open' : 'closed',
    checkedAt: new Date(Date.now()),
  }));
  const context = {
    db: {},
    providerId: 'test',
    providerIdFor: () => 'test',
    providers: new Map([['test', { fetchBars, fetchMarketStatus }]]),
    provider: { fetchBars, fetchMarketStatus },
  } as unknown as WorkerContext;
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  return { jobs: createIntradayJobs(context, log), fetchBars, fetchMarketStatus };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  mock.enabled = true;
  mock.instruments.mockResolvedValue([
    { id: 1, symbol: 'NIFTY50', kind: 'index', tickSize: 5 },
    { id: 2, symbol: 'RELIANCE', kind: 'equity', tickSize: 5 },
  ]);
  mock.stored.mockResolvedValue([]);
  mock.has.mockResolvedValue(false);
  mock.listed.mockResolvedValue([]);
  mock.publish.mockResolvedValue(11);
  // Benchmark: previous close 25,000.00; 09:25 candle closes at 25,050.00 → +20 bps.
  mock.daily.mockImplementation(async (_db: unknown, q: { instrumentId: number }) =>
    q.instrumentId === 1
      ? [
          {
            timestamp: 0,
            open: 2_500_000,
            high: 2_500_000,
            low: 2_500_000,
            close: 2_500_000,
            volume: 0,
          },
        ]
      : dailyBars(),
  );
  mock.aggregated.mockImplementation(async (_db: unknown, id: number) =>
    id === 1
      ? [
          {
            timestamp: SESSION_OPEN,
            open: 2_500_000,
            high: 2_505_000,
            low: 2_500_000,
            close: 2_505_000,
            volume: 1,
          },
          {
            timestamp: SESSION_OPEN + 300_000,
            open: 2_505_000,
            high: 2_505_000,
            low: 2_505_000,
            close: 2_505_000,
            volume: 1,
          },
          {
            timestamp: SESSION_OPEN + 600_000,
            open: 2_505_000,
            high: 2_505_000,
            low: 2_505_000,
            close: 2_505_000,
            volume: 1,
          },
        ]
      : buySession(),
  );
});
afterEach(() => vi.useRealTimers());

describe('intraday ORB scanner', () => {
  it('respects disabled configuration without requesting provider data', async () => {
    mock.enabled = false;
    const { jobs, fetchMarketStatus, fetchBars } = setup();
    await jobs.scan();
    expect(fetchMarketStatus).not.toHaveBeenCalled();
    expect(fetchBars).not.toHaveBeenCalled();
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.record.mock.calls[0]?.[1].phase).toBe('paused');
  });
  it('does not scan when the market is closed', async () => {
    const { jobs, fetchBars } = setup(false);
    await jobs.scan();
    expect(fetchBars).not.toHaveBeenCalled();
    expect(mock.record.mock.calls[0]?.[1].phase).toBe('closed');
  });
  it('waits while the opening range forms and stops after 14:30', async () => {
    vi.setSystemTime(SESSION_OPEN + 15 * 60_000 + 2_000); // 09:30:02
    const { jobs, fetchBars } = setup();
    await jobs.scan();
    expect(fetchBars).not.toHaveBeenCalled();
    expect(mock.record.mock.calls[0]?.[1].message).toMatch(/Opening range forming/);
    vi.setSystemTime(SESSION_OPEN + 320 * 60_000 + 2_000); // 14:35:02
    await jobs.scan();
    expect(fetchBars).not.toHaveBeenCalled();
  });
  it('publishes the fixture signal as a taken trade with the strategy version', async () => {
    const { jobs, fetchBars } = setup();
    await jobs.scan();
    expect(fetchBars).toHaveBeenCalledTimes(2); // benchmark + one stock, closed history only
    expect(fetchBars).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: '1m', includeForming: false, now: new Date(now) }),
    );
    expect(mock.publish).toHaveBeenCalledOnce();
    expect(mock.publish.mock.calls[0]?.[1]).toMatchObject({
      instrumentId: 2,
      strategyVersionId: 7,
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries',
      publishedAt: now,
      skipReason: null,
      evidence: expect.objectContaining({
        direction: 'BUY',
        levels: expect.objectContaining({ ref: 295_640 }),
      }),
    });
    expect(mock.record.mock.calls[0]?.[1]).toMatchObject({ evaluated: 1, published: 1 });
    // The same candle is not evaluated twice within its window.
    await jobs.scan();
    expect(mock.publish).toHaveBeenCalledOnce();
  });
  it('publishes but does not take a signal once the day’s trade limit is reached', async () => {
    const taken = (id: number) => ({
      id,
      instrumentId: 100 + id,
      symbol: `S${id}`,
      companyName: 'x',
      strategyVersionId: 7,
      publishedAt: now - 60_000,
      evidence: {},
      projection: {
        taken: true,
        endedAt: now - 1,
        fill: 100,
        remainingShares: 0,
        resolution: 'OBSERVED',
        shares: 1,
      },
      realisedNetPaise: 0,
      markNetPaise: 0,
      initialRiskPaise: 1,
      lastPrice: null,
      quoteAt: null,
    });
    mock.listed.mockResolvedValue([1, 2, 3, 4, 5].map(taken));
    const { jobs } = setup();
    await jobs.scan();
    expect(mock.publish.mock.calls[0]?.[1]).toMatchObject({ skipReason: 'DAILY_LIMIT' });
  });
  it('records a session exclusion when the index gapped', async () => {
    mock.daily.mockImplementation(async (_db: unknown, q: { instrumentId: number }) =>
      q.instrumentId === 1
        ? [
            {
              timestamp: 0,
              open: 2_400_000,
              high: 2_400_000,
              low: 2_400_000,
              close: 2_400_000,
              volume: 0,
            },
          ]
        : dailyBars(),
    ); // 25,050 vs 24,000 → +437 bps
    const { jobs } = setup();
    await jobs.scan();
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.exclude.mock.calls[0]?.[1]).toMatchObject({
      symbol: 'RELIANCE',
      reason: 'INDEX_SHOCK',
    });
    expect(mock.record.mock.calls[0]?.[1].reasons).toEqual({ INDEX_SHOCK: 1 });
  });
});
