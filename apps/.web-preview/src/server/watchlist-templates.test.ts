import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getWatchlists: vi.fn(),
  addWatchlist: vi.fn(),
  addSymbols: vi.fn(),
}));
vi.mock('./watchlists', () => ({
  getWatchlists: mock.getWatchlists,
  addWatchlist: mock.addWatchlist,
  addSymbols: mock.addSymbols,
}));
// A small configured universe: two indices sharing a name, four sectors, one
// of which is too small to be a starter list.
vi.mock('./indices', () => {
  const nifty = {
    key: 'nifty50',
    name: 'NIFTY 50',
    ref: { symbol: 'NIFTY50', kind: 'index' },
    description: 'NSE benchmark',
    constituents: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank', kind: 'equity', sector: 'Banking' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank', kind: 'equity', sector: 'Banking' },
      { symbol: 'SBIN', name: 'SBI', kind: 'equity', sector: 'Banking' },
      { symbol: 'INFY', name: 'Infosys', kind: 'equity', sector: 'IT' },
      { symbol: 'TCS', name: 'TCS', kind: 'equity', sector: 'IT' },
      { symbol: 'WIPRO', name: 'Wipro', kind: 'equity', sector: 'IT' },
      { symbol: 'BHARTIARTL', name: 'Airtel', kind: 'equity', sector: 'Telecom' },
      { symbol: 'ODD', name: 'Odd One', kind: 'equity', sector: 'Other' },
    ],
  };
  const bank = {
    key: 'banknifty',
    name: 'BANK NIFTY',
    ref: { symbol: 'NIFTYBANK', kind: 'index' },
    description: null,
    constituents: [
      { symbol: 'HDFCBANK', name: 'HDFC Bank', kind: 'equity', sector: 'Banking' },
      { symbol: 'PNB', name: 'PNB', kind: 'equity', sector: 'PSU Banks' },
    ],
  };
  const all = new Map<string, unknown>([
    ['nifty50', nifty],
    ['banknifty', bank],
  ]);
  return {
    listIndexKeys: async () => [...all.keys()],
    getIndex: async (key: string) => all.get(key) ?? null,
  };
});

import { createFromTemplate, listTemplates, uniqueName } from './watchlist-templates';

beforeEach(() => {
  vi.clearAllMocks();
  mock.getWatchlists.mockResolvedValue([]);
  mock.addWatchlist.mockImplementation(async (name: string) => ({
    id: 42,
    name,
    position: 0,
    isDefault: true,
    count: 0,
    updatedAt: '2026-09-14T00:00:00.000Z',
  }));
  mock.addSymbols.mockImplementation(async (_id: number, symbols: readonly string[]) => ({
    added: symbols.filter((s) => s !== 'ODD'),
    duplicates: [],
    unknown: symbols.filter((s) => s === 'ODD'),
  }));
});

describe('listTemplates', () => {
  it('offers every configured index, then sectors big enough to be a list', async () => {
    const templates = await listTemplates();
    expect(templates.map((t) => t.id)).toEqual([
      'index:nifty50',
      'index:banknifty',
      'sector:banking',
      'sector:it',
    ]);
  });

  it('de-duplicates a symbol that sits in two indices within a sector', async () => {
    const banking = (await listTemplates()).find((t) => t.id === 'sector:banking');
    expect(banking?.symbols).toEqual(['HDFCBANK', 'ICICIBANK', 'SBIN']);
    expect(banking?.description).toBe('3 Banking names from the configured indices');
  });

  it('falls back to a description for an index that has none', async () => {
    const bank = (await listTemplates()).find((t) => t.id === 'index:banknifty');
    expect(bank?.description).toBe('Constituents of BANK NIFTY');
  });
});

describe('createFromTemplate', () => {
  it('creates the list and fills it in one go, reporting what went in', async () => {
    const result = await createFromTemplate('index:nifty50');
    expect(mock.addWatchlist).toHaveBeenCalledWith('NIFTY 50');
    expect(mock.addSymbols).toHaveBeenCalledWith(42, expect.arrayContaining(['HDFCBANK', 'TCS']));
    expect(result?.watchlist.count).toBe(7);
    expect(result?.added).toBe(7);
    expect(result?.unknown).toEqual(['ODD']);
  });

  it('suffixes the name when the user already has one by that name', async () => {
    mock.getWatchlists.mockResolvedValue([{ name: 'nifty 50' }, { name: 'NIFTY 50 (2)' }]);
    await createFromTemplate('index:nifty50');
    expect(mock.addWatchlist).toHaveBeenCalledWith('NIFTY 50 (3)');
  });

  it('honours a requested name', async () => {
    await createFromTemplate('sector:it', 'My IT picks');
    expect(mock.addWatchlist).toHaveBeenCalledWith('My IT picks');
  });

  it('answers null for a template that does not exist, touching nothing', async () => {
    expect(await createFromTemplate('index:nope')).toBeNull();
    expect(mock.addWatchlist).not.toHaveBeenCalled();
  });
});

describe('uniqueName', () => {
  it('is case-insensitive and counts up from 2', () => {
    const taken = new Set(['banking', 'banking (2)']);
    expect(uniqueName('Banking', taken)).toBe('Banking (3)');
    expect(uniqueName('Pharma', taken)).toBe('Pharma');
  });
});
