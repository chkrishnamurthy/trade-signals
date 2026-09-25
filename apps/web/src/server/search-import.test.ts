import type { Instrument } from '@equitywise/market-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock('./provider', () => ({ getProvider: mock.provider }));
// `config/indices.yaml` is read relative to the app's cwd, which the root test
// run is not; a one-index universe is enough to prove the symbol path.
vi.mock('./indices', () => ({
  listIndexKeys: async () => ['nifty50'],
  getIndex: async () => ({
    ref: { symbol: 'NIFTY50', exchange: 'NSE', kind: 'index' },
    name: 'NIFTY 50',
    constituents: [{ symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' }],
  }),
}));

import { normaliseName, resolveImport, resolveSymbol, searchSymbols } from './search';

function instrument(
  symbol: string,
  name: string,
  isin: string | null,
  exchange: 'NSE' | 'BSE' = 'NSE',
): Instrument {
  return {
    symbol,
    name,
    kind: 'equity',
    exchange,
    isin,
    lotSize: 1,
    tickSize: 5,
    providerRef: null,
  };
}

const universe: Instrument[] = [
  // BSE rows first on purpose: the primary listing must win by rule, not by
  // the order a provider happens to return rows in.
  instrument('RELIANCE', 'RELIANCE INDUSTRIES LTD.', 'INE002A01018', 'BSE'),
  instrument('TATASTEEL', 'TATA STEEL LTD.', 'INE081A01020', 'BSE'),
  instrument('7SEASL', '7SEAS ENTERTAINMENT LIMITED', 'INE454F01010', 'BSE'),
  instrument('RELIANCE', 'RELIANCE INDUSTRIES LTD', 'INE002A01018'),
  instrument('TCS', 'TATA CONSULTANCY SERV LT', 'INE467B01029'),
  instrument('TATAMOTORS', 'TATA MOTORS LIMITED', 'INE155A01022'),
  instrument('TATASTEEL', 'TATA STEEL LIMITED', 'INE081A01020'),
  instrument('HDFCBANK', 'HDFC BANK LTD', 'INE040A01034'),
];

beforeEach(() => {
  vi.clearAllMocks();
  mock.provider.mockResolvedValue({
    listInstruments: async () => universe,
  });
});

describe('normaliseName', () => {
  it('drops punctuation and corporate suffixes so broker and provider names meet', () => {
    expect(normaliseName('Reliance Industries Ltd.')).toBe('RELIANCE INDUSTRIES');
    expect(normaliseName('RELIANCE INDUSTRIES LIMITED')).toBe('RELIANCE INDUSTRIES');
    expect(normaliseName('HDFC Bank')).toBe('HDFC BANK');
  });
});

describe('resolveImport', () => {
  it('resolves by symbol first, then ISIN, then name — and says which', async () => {
    const results = await resolveImport([
      { symbol: 'RELIANCE' },
      { isin: 'INE040A01034' },
      { name: 'Tata Motors' },
    ]);
    expect(results).toEqual([
      { status: 'matched', symbol: 'RELIANCE', name: 'Reliance Industries', via: 'symbol' },
      { status: 'matched', symbol: 'HDFCBANK', name: 'HDFC BANK LTD', via: 'isin' },
      { status: 'matched', symbol: 'TATAMOTORS', name: 'TATA MOTORS LIMITED', via: 'name' },
    ]);
  });

  it('resolves a Groww-style row by ISIN even when the name would not match', async () => {
    const [result] = await resolveImport([
      { isin: 'INE467B01029', name: 'Tata Consultancy Services' },
    ]);
    expect(result).toEqual({
      status: 'matched',
      symbol: 'TCS',
      name: 'TATA CONSULTANCY SERV LT',
      via: 'isin',
    });
  });

  it('asks rather than guesses when a name prefix fits several companies', async () => {
    const [result] = await resolveImport([{ name: 'Tata' }]);
    expect(result?.status).toBe('ambiguous');
    if (result?.status === 'ambiguous') {
      expect(result.candidates.map((c) => c.symbol).sort()).toEqual([
        'TATAMOTORS',
        'TATASTEEL',
        'TCS',
      ]);
    }
  });

  it('reports what it cannot place as unknown, in input order', async () => {
    const results = await resolveImport([{ symbol: 'NOSUCH' }, { isin: 'INE000000000' }]);
    expect(results.map((r) => r.status)).toEqual(['unknown', 'unknown']);
  });

  it('names a BSE-only company by its BSE listing key, by ISIN or by name', async () => {
    const results = await resolveImport([
      { isin: 'INE454F01010' },
      { name: '7Seas Entertainment' },
    ]);
    expect(results).toEqual([
      { status: 'matched', symbol: 'BSE:7SEASL', name: '7SEAS ENTERTAINMENT LIMITED', via: 'isin' },
      { status: 'matched', symbol: 'BSE:7SEASL', name: '7SEAS ENTERTAINMENT LIMITED', via: 'name' },
    ]);
  });

  it('prefers the NSE listing of a dual-listed company by ISIN', async () => {
    const [result] = await resolveImport([{ isin: 'INE081A01020' }]);
    expect(result).toMatchObject({ status: 'matched', symbol: 'TATASTEEL' });
  });

  it('still resolves symbols from the configured universe when the provider is down', async () => {
    mock.provider.mockRejectedValue(new Error('no credential'));
    // A fresh module: the instrument master is cached for hours once loaded,
    // and this test is about the process that never managed to load it.
    vi.resetModules();
    const fresh = await import('./search');
    const results = await fresh.resolveImport([{ symbol: 'RELIANCE' }, { isin: 'INE002A01018' }]);
    expect(results[0]?.status).toBe('matched');
    expect(results[1]?.status).toBe('unknown');
  });
});

describe('resolveSymbol across exchanges', () => {
  it('resolves a bare symbol to the NSE listing, and a BSE key to the BSE one', async () => {
    expect(await resolveSymbol('TATASTEEL')).toMatchObject({ exchange: 'NSE' });
    expect(await resolveSymbol('BSE:TATASTEEL')).toMatchObject({
      symbol: 'TATASTEEL',
      exchange: 'BSE',
    });
  });

  it('resolves a bare BSE-only symbol to its BSE listing', async () => {
    expect(await resolveSymbol('7seasl')).toMatchObject({ symbol: '7SEASL', exchange: 'BSE' });
  });

  it('never answers an explicit NSE key with a BSE-only listing', async () => {
    expect(await resolveSymbol('NSE:7SEASL')).toBeNull();
  });
});

describe('searchSymbols across exchanges', () => {
  it('shows a dual-listed company once, under NSE, with both listings', async () => {
    const hits = await searchSymbols('TATASTEEL');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      symbol: 'TATASTEEL',
      key: 'TATASTEEL',
      exchange: 'NSE',
      listings: ['NSE', 'BSE'],
    });
  });

  it('shows a BSE-only company under its BSE listing key', async () => {
    const [hit] = await searchSymbols('7SEAS');
    expect(hit).toMatchObject({ key: 'BSE:7SEASL', exchange: 'BSE', listings: ['BSE'] });
  });

  it('searches one exchange when the query names it', async () => {
    const hits = await searchSymbols('BSE:RELI');
    expect(hits.map((h) => h.key)).toEqual(['BSE:RELIANCE']);
  });
});
