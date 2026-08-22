import type { StockRowDto } from './stocks-types';

/**
 * Filter state for the stocks list, and the pure functions over it.
 *
 * No JSX and no React, deliberately — filtering is the part of a screening
 * surface that is actually worth testing, and it cannot be tested through a
 * component. The page owns the state; everything derived comes from here.
 *
 * An empty facet means "all", not "none". Selecting no sectors must show every
 * stock, because that is what the page looks like before you touch it.
 */

export type StockDirectionFilter = 'all' | 'advancing' | 'declining';

export interface StockFilterState {
  readonly query: string;
  readonly sectors: readonly string[];
  readonly indices: readonly string[];
  readonly direction: StockDirectionFilter;
}

export const DEFAULT_STOCK_FILTERS: StockFilterState = {
  query: '',
  sectors: [],
  indices: [],
  direction: 'all',
};

/** Free-text haystack: ticker, company name and sector all match. */
function haystack(row: StockRowDto): string {
  return `${row.symbol} ${row.name} ${row.sector}`.toLowerCase();
}

export function applyStockFilters(
  rows: readonly StockRowDto[],
  filters: StockFilterState,
): StockRowDto[] {
  const query = filters.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (query !== '' && !haystack(row).includes(query)) return false;
    if (filters.sectors.length > 0 && !filters.sectors.includes(row.sector)) return false;
    if (filters.indices.length > 0 && !row.indices.some((key) => filters.indices.includes(key))) {
      return false;
    }

    if (filters.direction !== 'all') {
      const change = row.changePercent;
      // A stock the exchange gave us no change for is neither advancing nor
      // declining. Treating null as 0 would file it under "declining".
      if (change === null) return false;
      if (filters.direction === 'advancing' && change <= 0) return false;
      if (filters.direction === 'declining' && change >= 0) return false;
    }

    return true;
  });
}

export interface StockFilterChip {
  readonly id: string;
  readonly label: string;
}

const DIRECTION_LABEL: Record<Exclude<StockDirectionFilter, 'all'>, string> = {
  advancing: 'Advancing',
  declining: 'Declining',
};

/**
 * The removable chips shown under the filter bar.
 *
 * Ids are namespaced (`sector:Banking`) so `removeStockFilter` can route a
 * click back to the right facet without the caller tracking which control
 * produced which chip.
 */
export function activeStockFilterChips(
  filters: StockFilterState,
  indexNames: ReadonlyMap<string, string> = new Map(),
): StockFilterChip[] {
  const chips: StockFilterChip[] = [];

  const query = filters.query.trim();
  if (query !== '') chips.push({ id: 'query', label: `"${query}"` });

  for (const sector of filters.sectors) chips.push({ id: `sector:${sector}`, label: sector });
  for (const key of filters.indices) {
    chips.push({ id: `index:${key}`, label: indexNames.get(key) ?? key });
  }
  if (filters.direction !== 'all') {
    chips.push({ id: `direction:${filters.direction}`, label: DIRECTION_LABEL[filters.direction] });
  }

  return chips;
}

/** Clears the one facet a chip stands for, leaving the rest untouched. */
export function removeStockFilter(filters: StockFilterState, id: string): StockFilterState {
  if (id === 'query') return { ...filters, query: '' };

  const separator = id.indexOf(':');
  if (separator === -1) return filters;
  const facet = id.slice(0, separator);
  const value = id.slice(separator + 1);

  switch (facet) {
    case 'sector':
      return { ...filters, sectors: filters.sectors.filter((s) => s !== value) };
    case 'index':
      return { ...filters, indices: filters.indices.filter((k) => k !== value) };
    case 'direction':
      return { ...filters, direction: 'all' };
    default:
      return filters;
  }
}

/** Adds or removes one value from a multi-select facet. */
export function toggleStockFacet(selected: readonly string[], value: string): readonly string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}
