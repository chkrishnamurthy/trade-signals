import type { MarketDataProvider } from '@equitywise/market-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshLatestQuotes } from './quote-cache.js';

const dbMock = vi.hoisted(() => ({
  listAllWatchedInstruments: vi.fn(),
  recordFeedIngestion: vi.fn(),
  upsertLatestQuotes: vi.fn(),
}));

vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  listAllWatchedInstruments: dbMock.listAllWatchedInstruments,
  recordFeedIngestion: dbMock.recordFeedIngestion,
  upsertLatestQuotes: dbMock.upsertLatestQuotes,
}));

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
};

function context(provider: Partial<MarketDataProvider>) {
  return {
    db: {},
    provider,
    providerId: 'dhan',
    providerIdFor: () => 'dhan',
    providers: new Map(),
    credentialStrategies: [],
    setAccessToken: vi.fn(),
    close: vi.fn(),
  } as never;
}

describe('refreshLatestQuotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.recordFeedIngestion.mockResolvedValue(undefined);
    dbMock.upsertLatestQuotes.mockResolvedValue(1);
  });

  it('fetches watched instruments and writes latest quote snapshots', async () => {
    dbMock.listAllWatchedInstruments.mockResolvedValue([
      { id: 1, symbol: 'RELIANCE', exchange: 'NSE', kind: 'equity' },
    ]);
    const fetchQuotes = vi.fn(async () => ({
      quotes: new Map([
        [
          'RELIANCE',
          {
            symbol: 'RELIANCE',
            ltp: 250_00,
            change: 100,
            changePercent: 0.4,
            open: 249_00,
            high: 251_00,
            low: 248_00,
            previousClose: 249_00,
            averagePrice: null,
            bid: null,
            ask: null,
            volume: 1234,
            timestamp: new Date('2026-10-05T04:00:00Z'),
          },
        ],
      ]),
      missing: [],
    }));

    const result = await refreshLatestQuotes(context({ fetchQuotes }), log);

    expect(fetchQuotes).toHaveBeenCalledWith([
      { symbol: 'RELIANCE', exchange: 'NSE', kind: 'equity' },
    ]);
    expect(dbMock.upsertLatestQuotes).toHaveBeenCalledWith({}, [
      expect.objectContaining({
        instrumentId: 1,
        symbol: 'RELIANCE',
        source: 'dhan',
        ltpPaise: 250_00,
        changePercent: 0.4,
        volume: 1234,
      }),
    ]);
    expect(dbMock.recordFeedIngestion).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        feed: 'provider-latest-quotes',
        succeeded: true,
        fetched: 1,
        written: 1,
      }),
    );
    expect(result).toMatchObject({ requested: 1, fetched: 1, written: 1, missing: 0 });
  });
});
