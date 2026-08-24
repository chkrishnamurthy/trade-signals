import { getColumn } from './watchlist-columns';
import type { RangeDto, WatchlistFilterStateDto, WatchlistRowDto } from './watchlist-types';

/**
 * Watchlist filtering — the state, the predicates, and the chips over them.
 *
 * No JSX and no React. Filtering is the part of a screening surface actually
 * worth testing and it cannot be tested through a component; the page owns the
 * state and everything derived comes from here. Same split as
 * `stocks-display.ts`, which this deliberately mirrors.
 *
 * An empty facet means "all", not "none": a watchlist with no sector selected
 * must show every row, because that is what the page looks like before anyone
 * touches it.
 *
 * Ranges are keyed by COLUMN ID rather than by a hand-written union. Declaring
 * a new numeric column in the registry therefore makes it filterable with no
 * change here, and the range reads its value through the same accessor the
 * table sorts by — so a filter can never disagree with the column it names.
 */

export const EMPTY_FILTERS: WatchlistFilterStateDto = {};

/**
 * Named predicates that are not ranges.
 *
 * Each is a pure row test plus the label its chip carries. Kept as a closed set
 * rather than free-form expressions: a filter the user can type is a filter the
 * product has to parse, and there is no version of that which is worth it here.
 */
export interface FlagDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Column ids this flag reads. A flag is unavailable if any lacks a source. */
  readonly requires: readonly string[];
  readonly test: (row: WatchlistRowDto) => boolean;
}

const FLAG_LIST: readonly FlagDefinition[] = [
  {
    id: 'above_ema20',
    label: 'Above EMA 20',
    description: 'Last price is above the 20-period exponential moving average',
    requires: ['ema20'],
    test: (row) => row.ltp !== null && row.ema20 !== null && row.ltp > row.ema20,
  },
  {
    id: 'above_ema50',
    label: 'Above EMA 50',
    description: 'Last price is above the 50-period exponential moving average',
    requires: ['ema50'],
    test: (row) => row.ltp !== null && row.ema50 !== null && row.ltp > row.ema50,
  },
  {
    id: 'above_ema200',
    label: 'Above EMA 200',
    description: 'Last price is above the 200-period exponential moving average',
    requires: ['ema200'],
    test: (row) => row.ltp !== null && row.ema200 !== null && row.ltp > row.ema200,
  },
  {
    id: 'below_ema200',
    label: 'Below EMA 200',
    description: 'Last price is below the 200-period exponential moving average',
    requires: ['ema200'],
    test: (row) => row.ltp !== null && row.ema200 !== null && row.ltp < row.ema200,
  },
  {
    id: 'ema_stacked',
    label: 'EMAs stacked up',
    description: 'Price above the 20, which is above the 50, which is above the 200',
    requires: ['ema20', 'ema50', 'ema200'],
    test: (row) => {
      const { ltp, ema20, ema50, ema200 } = row;
      if (ltp === null || ema20 === null || ema50 === null || ema200 === null) return false;
      return ltp > ema20 && ema20 > ema50 && ema50 > ema200;
    },
  },
  {
    id: 'near_52w_high',
    label: 'Within 5% of 52W high',
    description: 'Trading in the top 5% of its 52-week range',
    requires: ['high52w'],
    test: (row) => {
      if (row.ltp === null || row.high52w === null || row.high52w === 0) return false;
      return (row.high52w - row.ltp) / row.high52w <= 0.05;
    },
  },
  {
    id: 'near_52w_low',
    label: 'Within 5% of 52W low',
    description: 'Trading in the bottom 5% of its 52-week range',
    requires: ['low52w'],
    test: (row) => {
      if (row.ltp === null || row.low52w === null || row.low52w === 0) return false;
      return (row.ltp - row.low52w) / row.low52w <= 0.05;
    },
  },
  {
    id: 'volume_surge',
    label: 'Volume above 1.5×',
    description: 'Trading at more than one and a half times its average volume',
    requires: ['relativeVolume'],
    test: (row) => row.relativeVolume !== null && row.relativeVolume >= 1.5,
  },
  {
    id: 'rsi_overbought',
    label: 'RSI above 70',
    description: 'Relative strength index in conventional overbought territory',
    requires: ['rsi14'],
    test: (row) => row.rsi14 !== null && row.rsi14 > 70,
  },
  {
    id: 'rsi_oversold',
    label: 'RSI below 30',
    description: 'Relative strength index in conventional oversold territory',
    requires: ['rsi14'],
    test: (row) => row.rsi14 !== null && row.rsi14 < 30,
  },
];

export const WATCHLIST_FLAGS = FLAG_LIST;

const FLAGS_BY_ID = new Map(FLAG_LIST.map((flag) => [flag.id, flag]));

/** A flag is usable only if every column it reads has a real data source. */
export function isFlagAvailable(flag: FlagDefinition): boolean {
  return flag.requires.every((id) => {
    const column = getColumn(id);
    return column !== null && column.source !== null;
  });
}

function inRange(value: number | null, range: RangeDto): boolean {
  // A row the exchange gave us nothing for cannot satisfy a numeric bound.
  // Treating null as 0 would file every unquoted name under "price below 100".
  if (value === null) return false;
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

/** True when a range actually constrains anything. */
export function isRangeActive(range: RangeDto | undefined): range is RangeDto {
  return range !== undefined && (range.min !== null || range.max !== null);
}

function haystack(row: WatchlistRowDto): string {
  return `${row.symbol} ${row.name} ${row.sector ?? ''} ${row.note ?? ''}`.toLowerCase();
}

export function applyWatchlistFilters(
  rows: readonly WatchlistRowDto[],
  filters: WatchlistFilterStateDto,
): WatchlistRowDto[] {
  const query = (filters.query ?? '').trim().toLowerCase();
  const sectors = filters.sectors ?? [];
  const exchanges = filters.exchanges ?? [];
  const direction = filters.direction ?? 'all';
  const ranges = Object.entries(filters.ranges ?? {}).filter(([, range]) => isRangeActive(range));
  const flags = (filters.flags ?? [])
    .map((id) => FLAGS_BY_ID.get(id))
    .filter((flag): flag is FlagDefinition => flag !== undefined);

  return rows.filter((row) => {
    if (query !== '' && !haystack(row).includes(query)) return false;
    if (sectors.length > 0 && (row.sector === null || !sectors.includes(row.sector))) return false;
    if (exchanges.length > 0 && !exchanges.includes(row.exchange)) return false;

    if (direction !== 'all') {
      const change = row.changePercent;
      // Null is neither advancing nor declining — it is unknown, and grouping it
      // with "declining" would report a loss the exchange never printed.
      if (change === null) return false;
      if (direction === 'advancing' && change <= 0) return false;
      if (direction === 'declining' && change >= 0) return false;
      if (direction === 'unchanged' && change !== 0) return false;
    }

    for (const [columnId, range] of ranges) {
      const column = getColumn(columnId);
      if (column === null) continue;
      const value = column.value(row);
      if (typeof value === 'string') continue;
      if (!inRange(value, range)) return false;
    }

    for (const flag of flags) {
      if (!flag.test(row)) return false;
    }

    return true;
  });
}

export interface FilterChip {
  readonly id: string;
  readonly label: string;
}

const DIRECTION_LABEL: Record<string, string> = {
  advancing: 'Advancing',
  declining: 'Declining',
  unchanged: 'Unchanged',
};

/** Formats a bound for a chip, in the column's own unit. */
function boundLabel(columnId: string, value: number): string {
  const column = getColumn(columnId);
  switch (column?.unit) {
    case 'paise':
      return `₹${(value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${value}%`;
    case 'ratio':
      return `${value}×`;
    default:
      return String(value);
  }
}

/**
 * The removable chips shown under the filter bar.
 *
 * Ids are namespaced (`sector:Banking`, `range:rsi14`) so `removeWatchlistFilter`
 * can route a click back to the right facet without the caller tracking which
 * control produced which chip.
 */
export function activeFilterChips(filters: WatchlistFilterStateDto): FilterChip[] {
  const chips: FilterChip[] = [];

  const query = (filters.query ?? '').trim();
  if (query !== '') chips.push({ id: 'query', label: `"${query}"` });

  for (const sector of filters.sectors ?? []) {
    chips.push({ id: `sector:${sector}`, label: sector });
  }
  for (const exchange of filters.exchanges ?? []) {
    chips.push({ id: `exchange:${exchange}`, label: exchange });
  }

  const direction = filters.direction ?? 'all';
  if (direction !== 'all') {
    chips.push({ id: `direction:${direction}`, label: DIRECTION_LABEL[direction] ?? direction });
  }

  for (const [columnId, range] of Object.entries(filters.ranges ?? {})) {
    if (!isRangeActive(range)) continue;
    const label = getColumn(columnId)?.label ?? columnId;
    const { min, max } = range;
    const text =
      min !== null && max !== null
        ? `${label} ${boundLabel(columnId, min)}–${boundLabel(columnId, max)}`
        : min !== null
          ? `${label} ≥ ${boundLabel(columnId, min)}`
          : `${label} ≤ ${boundLabel(columnId, max ?? 0)}`;
    chips.push({ id: `range:${columnId}`, label: text });
  }

  for (const flagId of filters.flags ?? []) {
    const flag = FLAGS_BY_ID.get(flagId);
    if (flag === undefined) continue;
    chips.push({ id: `flag:${flagId}`, label: flag.label });
  }

  return chips;
}

/** Clears the one facet a chip stands for, leaving the rest untouched. */
export function removeWatchlistFilter(
  filters: WatchlistFilterStateDto,
  id: string,
): WatchlistFilterStateDto {
  if (id === 'query') return { ...filters, query: '' };

  const separator = id.indexOf(':');
  if (separator === -1) return filters;
  const facet = id.slice(0, separator);
  const value = id.slice(separator + 1);

  switch (facet) {
    case 'sector':
      return { ...filters, sectors: (filters.sectors ?? []).filter((s) => s !== value) };
    case 'exchange':
      return { ...filters, exchanges: (filters.exchanges ?? []).filter((e) => e !== value) };
    case 'direction':
      return { ...filters, direction: 'all' };
    case 'flag':
      return { ...filters, flags: (filters.flags ?? []).filter((f) => f !== value) };
    case 'range': {
      const ranges = { ...(filters.ranges ?? {}) };
      delete ranges[value];
      return { ...filters, ranges };
    }
    default:
      return filters;
  }
}

/** Adds or removes one value from a multi-select facet. */
export function toggleFacet(selected: readonly string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((entry) => entry !== value)
    : [...selected, value];
}

export function setRange(
  filters: WatchlistFilterStateDto,
  columnId: string,
  range: RangeDto,
): WatchlistFilterStateDto {
  const ranges = { ...(filters.ranges ?? {}) };
  if (!isRangeActive(range)) delete ranges[columnId];
  else ranges[columnId] = range;
  return { ...filters, ranges };
}

export function countActiveFilters(filters: WatchlistFilterStateDto): number {
  return activeFilterChips(filters).length;
}
