import { describe, expect, it } from 'vitest';
import {
  activeStockFilterChips,
  applyStockFilters,
  DEFAULT_STOCK_FILTERS,
  removeStockFilter,
  type StockFilterState,
  toggleStockFacet,
} from './stocks-display';
import type { StockRowDto } from './stocks-types';

/**
 * Rows are hand-built rather than fixtures from the wire: the point of these
 * tests is the filter logic, and a realistic quote payload would bury it.
 * Prices are integer paise, as everywhere else.
 */
function row(overrides: Partial<StockRowDto> & Pick<StockRowDto, 'symbol'>): StockRowDto {
  return {
    name: overrides.symbol,
    sector: 'Banking',
    indices: ['nifty50'],
    ltp: 100_000,
    change: null,
    changePercent: 1,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    averagePrice: null,
    volume: null,
    timestamp: null,
    relativeVolume: null,
    turnover: null,
    ...overrides,
  };
}

const HDFCBANK = row({
  symbol: 'HDFCBANK',
  name: 'HDFC Bank',
  sector: 'Banking',
  indices: ['nifty50', 'banknifty'],
  changePercent: 1.2,
});
const INFY = row({ symbol: 'INFY', name: 'Infosys', sector: 'IT', changePercent: -0.6 });
const PNB = row({
  symbol: 'PNB',
  name: 'Punjab National Bank',
  sector: 'PSU Banks',
  indices: ['banknifty'],
  changePercent: 0.4,
});
const FLAT = row({ symbol: 'FLAT', name: 'No Change Ltd', sector: 'IT', changePercent: null });

const ALL = [HDFCBANK, INFY, PNB, FLAT];

const symbolsOf = (rows: readonly StockRowDto[]): string[] => rows.map((r) => r.symbol);

describe('applyStockFilters', () => {
  it('returns everything when no facet is set', () => {
    expect(applyStockFilters(ALL, DEFAULT_STOCK_FILTERS)).toHaveLength(4);
  });

  it('unions selected sectors rather than intersecting them', () => {
    const filters: StockFilterState = { ...DEFAULT_STOCK_FILTERS, sectors: ['IT', 'PSU Banks'] };
    expect(symbolsOf(applyStockFilters(ALL, filters))).toEqual(['INFY', 'PNB', 'FLAT']);
  });

  it('matches a row when any of its indices is selected', () => {
    const filters: StockFilterState = { ...DEFAULT_STOCK_FILTERS, indices: ['banknifty'] };
    // HDFCBANK sits in both indices and must survive a banknifty-only filter.
    expect(symbolsOf(applyStockFilters(ALL, filters))).toEqual(['HDFCBANK', 'PNB']);
  });

  it('matches free text against symbol, company name and sector', () => {
    const bySymbol = { ...DEFAULT_STOCK_FILTERS, query: 'infy' };
    const byName = { ...DEFAULT_STOCK_FILTERS, query: 'punjab' };
    const bySector = { ...DEFAULT_STOCK_FILTERS, query: 'psu' };

    expect(symbolsOf(applyStockFilters(ALL, bySymbol))).toEqual(['INFY']);
    expect(symbolsOf(applyStockFilters(ALL, byName))).toEqual(['PNB']);
    expect(symbolsOf(applyStockFilters(ALL, bySector))).toEqual(['PNB']);
  });

  it('ignores surrounding whitespace and case in the query', () => {
    const filters = { ...DEFAULT_STOCK_FILTERS, query: '  HDFC  ' };
    expect(symbolsOf(applyStockFilters(ALL, filters))).toEqual(['HDFCBANK']);
  });

  it('treats a null change as neither advancing nor declining', () => {
    const advancing = { ...DEFAULT_STOCK_FILTERS, direction: 'advancing' as const };
    const declining = { ...DEFAULT_STOCK_FILTERS, direction: 'declining' as const };

    expect(symbolsOf(applyStockFilters(ALL, advancing))).toEqual(['HDFCBANK', 'PNB']);
    expect(symbolsOf(applyStockFilters(ALL, declining))).toEqual(['INFY']);
    // FLAT appears in neither, and is not silently filed under declining.
    expect(symbolsOf(applyStockFilters(ALL, advancing))).not.toContain('FLAT');
    expect(symbolsOf(applyStockFilters(ALL, declining))).not.toContain('FLAT');
  });

  it('applies facets together', () => {
    const filters: StockFilterState = {
      query: 'bank',
      sectors: ['Banking', 'PSU Banks'],
      indices: ['banknifty'],
      direction: 'advancing',
    };
    expect(symbolsOf(applyStockFilters(ALL, filters))).toEqual(['HDFCBANK', 'PNB']);
  });
});

describe('activeStockFilterChips', () => {
  it('emits nothing for the default state', () => {
    expect(activeStockFilterChips(DEFAULT_STOCK_FILTERS)).toEqual([]);
  });

  it('names an index by its display name when one is known', () => {
    const filters: StockFilterState = { ...DEFAULT_STOCK_FILTERS, indices: ['banknifty'] };
    const chips = activeStockFilterChips(filters, new Map([['banknifty', 'NIFTY BANK']]));
    expect(chips).toEqual([{ id: 'index:banknifty', label: 'NIFTY BANK' }]);
  });

  it('falls back to the key when no display name is supplied', () => {
    const filters: StockFilterState = { ...DEFAULT_STOCK_FILTERS, indices: ['banknifty'] };
    expect(activeStockFilterChips(filters)[0]?.label).toBe('banknifty');
  });

  it('does not emit a chip for a whitespace-only query', () => {
    expect(activeStockFilterChips({ ...DEFAULT_STOCK_FILTERS, query: '   ' })).toEqual([]);
  });
});

describe('removeStockFilter', () => {
  const filters: StockFilterState = {
    query: 'bank',
    sectors: ['Banking', 'IT'],
    indices: ['nifty50', 'banknifty'],
    direction: 'advancing',
  };

  it('clears exactly the facet a chip stands for', () => {
    const chips = activeStockFilterChips(filters);
    let next = filters;
    for (const chip of chips) next = removeStockFilter(next, chip.id);
    expect(next).toEqual(DEFAULT_STOCK_FILTERS);
  });

  it('removes one value from a multi-select without touching the others', () => {
    expect(removeStockFilter(filters, 'sector:IT').sectors).toEqual(['Banking']);
    expect(removeStockFilter(filters, 'index:nifty50').indices).toEqual(['banknifty']);
  });

  it('leaves the state alone for an id it does not recognise', () => {
    expect(removeStockFilter(filters, 'nonsense')).toBe(filters);
    expect(removeStockFilter(filters, 'unknown:thing')).toBe(filters);
  });

  it('handles a sector name containing a colon', () => {
    const withColon: StockFilterState = { ...DEFAULT_STOCK_FILTERS, sectors: ['Oil: Upstream'] };
    const chip = activeStockFilterChips(withColon)[0];
    expect(chip).toBeDefined();
    expect(removeStockFilter(withColon, chip?.id ?? '').sectors).toEqual([]);
  });
});

describe('toggleStockFacet', () => {
  it('adds a value that is absent and removes one that is present', () => {
    expect(toggleStockFacet([], 'IT')).toEqual(['IT']);
    expect(toggleStockFacet(['IT', 'Banking'], 'IT')).toEqual(['Banking']);
  });
});
