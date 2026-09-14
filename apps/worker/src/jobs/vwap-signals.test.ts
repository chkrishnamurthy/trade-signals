import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createSignalJobs } from './vwap-signals.js';

const mock = vi.hoisted(() => ({
  record: vi.fn(),
  insert: vi.fn(),
  publish: vi.fn(),
  instruments: vi.fn(),
  stored: vi.fn(),
  aggregated: vi.fn(),
  refresh: vi.fn(),
  enabled: true,
}));
vi.mock('node:fs/promises', () => ({
  readFile: async () =>
    `enabled: ${mock.enabled}\nuniverse: nifty50\nhistoryDays: 14\nhistoryConcurrency: 4\nobservationModel: sampled_quotes_5s\nstrategyRevision: 1`,
}));
vi.mock('../universe.js', () => ({
  loadIndexConstituents: async () => [
    { symbol: 'SBIN', kind: 'equity', name: 'State Bank', sector: 'Bank' },
  ],
}));
vi.mock('./refresh-credential.js', () => ({ refreshProviderCredential: mock.refresh }));
vi.mock('@equitywise/db', () => ({
  getDailyBars: vi.fn(async () => []),
  getScannerQuote: vi.fn(),
  getSignalBars: mock.aggregated,
  getSignalMinutes: mock.stored,
  insertSignalMinutes: mock.insert,
  invalidateProviderCredential: vi.fn(),
  listCorporateActions: vi.fn(async () => []),
  markPaperEquity: vi.fn(),
  observeSignalPrice: vi.fn(),
  publishVwapSignal: mock.publish,
  reconcileSignalDeadlines: vi.fn(),
  recordSignalScan: mock.record,
  registerStrategy: vi.fn(async () => 1),
  signalUniverseInstruments: mock.instruments,
  withSignalScanLock: async (db: unknown, run: (db: unknown) => Promise<void>) => run(db),
}));

const now = Date.parse('2026-09-11T04:30:02Z');
function setup(isOpen = true) {
  const fetchBars = vi.fn(async () => []);
  const fetchMarketStatus = vi.fn(async () => ({
    isOpen,
    phase: isOpen ? 'open' : 'closed',
    checkedAt: new Date(now),
  }));
  const context = {
    db: {},
    providerId: 'test',
    provider: { fetchBars, fetchMarketStatus },
  } as unknown as WorkerContext;
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  return { jobs: createSignalJobs(context, log), fetchBars, fetchMarketStatus };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  mock.enabled = true;
  mock.instruments.mockResolvedValue([{ id: 1, symbol: 'NIFTY50', kind: 'index', tickSize: 5 }]);
  mock.stored.mockResolvedValue([]);
  mock.aggregated.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('shared signal scanner', () => {
  it('respects disabled configuration without requesting provider data', async () => {
    mock.enabled = false;
    const { jobs, fetchMarketStatus, fetchBars } = setup();
    await jobs.scan();
    expect(fetchMarketStatus).not.toHaveBeenCalled();
    expect(fetchBars).not.toHaveBeenCalled();
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.record).toHaveBeenCalled();
  });
  it('suppresses scanning when the authoritative market status is closed', async () => {
    const { jobs, fetchBars } = setup(false);
    await jobs.scan();
    expect(fetchBars).not.toHaveBeenCalled();
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.record.mock.calls[0]?.[1].phase).toBe('closed');
  });
  it('requests only closed history and suppresses all stock evaluation if NIFTY coverage is missing', async () => {
    const { jobs, fetchBars } = setup();
    await jobs.scan();
    expect(fetchBars).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ resolution: '1m', includeForming: false, now: new Date(now) }),
    );
    expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.record.mock.calls[0]?.[1]).toMatchObject({
      benchmarkReady: false,
      reasons: { BENCHMARK_UNAVAILABLE: 1 },
      evaluated: 0,
    });
  });
});
