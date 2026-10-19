import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInstrumentMetadata } from './sync-instrument-metadata.js';

const dbMock = vi.hoisted(() => ({ updateInstrumentMetadata: vi.fn() }));
vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  ...dbMock,
}));

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };

const equity = (symbol: string, over: Record<string, unknown> = {}) => ({
  symbol,
  name: symbol,
  kind: 'equity',
  exchange: 'NSE',
  isin: `INE${symbol}`,
  lotSize: 1,
  tickSize: 5,
  providerRef: null,
  ...over,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => equity(`S${i}`));
const context = (listing: unknown[]) =>
  ({ db: {}, provider: { listInstruments: vi.fn().mockResolvedValue(listing) } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.updateInstrumentMetadata.mockResolvedValue(3);
});

describe('syncInstrumentMetadata', () => {
  it('sends NSE equities only, with their real tick and lot', async () => {
    const listing = [
      ...many(150),
      equity('ETFX', { tickSize: 1 }),
      { ...equity('NIFTY50'), kind: 'index' },
      equity('BSEONLY', { exchange: 'BSE' }),
    ];
    const summary = await syncInstrumentMetadata(context(listing), log as never);

    expect(summary).toEqual({ listed: 153, considered: 151, updated: 3 });
    const sent = dbMock.updateInstrumentMetadata.mock.calls[0]?.[1] as {
      symbol: string;
      tickSize: number;
    }[];
    expect(sent.map((r) => r.symbol)).not.toContain('NIFTY50');
    expect(sent.map((r) => r.symbol)).not.toContain('BSEONLY');
    expect(sent.find((r) => r.symbol === 'ETFX')?.tickSize).toBe(1);
  });

  it('writes nothing from a truncated listing', async () => {
    const summary = await syncInstrumentMetadata(context(many(10)), log as never);
    expect(summary.updated).toBe(0);
    expect(dbMock.updateInstrumentMetadata).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });
});
