import type { WatchlistRowDto } from './watchlist-types';

/**
 * The watchlist column registry.
 *
 * One declaration per column, holding everything that is not JSX: what it is
 * called, which group it belongs to, whether this application actually has a
 * source for it, and how to read a sortable/filterable value out of a row. The
 * table component supplies the cell rendering and nothing else.
 *
 * Splitting it this way is what makes the interesting half testable. Column
 * ordering, default selection, availability and the value accessors are pure
 * functions over data; rendering them is not.
 *
 * ## Columns with no data source
 *
 * Market cap, P/E, P/B, EPS and dividend yield are declared here with
 * `source: null`. This app's market-data provider serves quotes and OHLCV
 * history — it has no fundamentals feed, and neither does anything else in the
 * system. They are declared rather than omitted so that:
 *
 *   1. the "Customize columns" panel can show them as unavailable with a
 *      reason, instead of the user wondering where P/E went;
 *   2. a quick view that needs them can disable itself automatically;
 *   3. adding a fundamentals source later means filling in one accessor each,
 *      not designing the valuation columns from scratch.
 *
 * What they must never do is render a number. CLAUDE.md is explicit that this
 * product does not display a figure it cannot substantiate, and a plausible
 * invented P/E is worse than a visible gap.
 */

export type ColumnGroup =
  | 'identity'
  | 'price'
  | 'performance'
  | 'volume'
  | 'valuation'
  | 'fundamentals'
  | 'technical'
  | 'dividend'
  | 'risk'
  | 'market';

export const COLUMN_GROUP_LABEL: Record<ColumnGroup, string> = {
  identity: 'Identity',
  price: 'Price',
  performance: 'Performance',
  volume: 'Volume',
  valuation: 'Valuation',
  fundamentals: 'Fundamentals',
  technical: 'Technical indicators',
  dividend: 'Dividend',
  risk: 'Risk',
  market: 'Market information',
};

/** Display order of the groups in the customize panel. */
export const COLUMN_GROUP_ORDER: readonly ColumnGroup[] = [
  'identity',
  'price',
  'performance',
  'volume',
  'technical',
  'risk',
  'valuation',
  'fundamentals',
  'dividend',
  'market',
];

/** Where a column's number comes from. `null` = this app has no source. */
export type ColumnSource = 'quote' | 'indicators' | 'instrument' | 'derived' | null;

export interface WatchlistColumn {
  readonly id: string;
  /** Table header. Kept short — the panel carries the long form. */
  readonly label: string;
  /** Long form, shown in the customize panel and the header tooltip. */
  readonly description: string;
  readonly group: ColumnGroup;
  readonly source: ColumnSource;
  /** Right-aligns and applies tabular figures. */
  readonly numeric: boolean;
  /**
   * Always visible, never reorderable, never hideable.
   *
   * Exactly one column is pinned. A table of prices with no ticker is not a
   * denser table, it is an unreadable one.
   */
  readonly pinned?: boolean;
  /** Below this breakpoint the column is dropped rather than squeezed. */
  readonly hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Sort and filter value. `null` means the field is absent for this row and
   * sinks to the bottom in both sort directions — missing is not "smallest".
   */
  readonly value: (row: WatchlistRowDto) => number | string | null;
  /** Unit hint for the range filter, so "Price" can say ₹ and RSI cannot. */
  readonly unit?: 'paise' | 'percent' | 'ratio' | 'shares' | 'points';
}

/** Percent distance from `value` to `reference`. Null-safe. */
function percentFrom(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

const COLUMNS: readonly WatchlistColumn[] = [
  {
    id: 'symbol',
    label: 'Stock',
    description: 'Ticker and company name',
    group: 'identity',
    source: 'instrument',
    numeric: false,
    pinned: true,
    value: (row) => row.symbol,
  },

  // --- Price ----------------------------------------------------------------
  {
    id: 'ltp',
    label: 'LTP',
    description: 'Last traded price',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    value: (row) => row.ltp,
  },
  {
    id: 'change',
    label: 'Change',
    description: 'Absolute change against the previous close',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'md',
    value: (row) => row.change,
  },
  {
    id: 'changePercent',
    label: 'Change %',
    description: 'Percentage change against the previous close',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'percent',
    value: (row) => row.changePercent,
  },
  {
    id: 'open',
    label: 'Open',
    description: "The session's opening price",
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.open,
  },
  {
    id: 'previousClose',
    label: 'Prev Close',
    description: 'Close of the previous session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.previousClose,
  },
  {
    id: 'dayHigh',
    label: 'Day High',
    description: 'Highest trade of the session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'md',
    value: (row) => row.dayHigh,
  },
  {
    id: 'dayLow',
    label: 'Day Low',
    description: 'Lowest trade of the session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'md',
    value: (row) => row.dayLow,
  },
  {
    id: 'averagePrice',
    label: 'Avg Price',
    description: 'Volume-weighted average price for the session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.averagePrice,
  },
  {
    id: 'dayRangePosition',
    label: 'Day Range',
    description: "Where the last price sits between the day's low and high",
    group: 'price',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'lg',
    value: (row) => {
      const { dayLow: low, dayHigh: high, ltp } = row;
      if (low === null || high === null || ltp === null || high === low) return null;
      return ((ltp - low) / (high - low)) * 100;
    },
  },

  // --- Performance ----------------------------------------------------------
  {
    id: 'high52w',
    label: '52W High',
    description: 'Highest close over the last 52 weeks',
    group: 'performance',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.high52w,
  },
  {
    id: 'low52w',
    label: '52W Low',
    description: 'Lowest close over the last 52 weeks',
    group: 'performance',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.low52w,
  },
  {
    id: 'from52wHigh',
    label: 'From 52W H',
    description: 'Distance below the 52-week high, as a percentage',
    group: 'performance',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'md',
    value: (row) => percentFrom(row.ltp, row.high52w),
  },
  {
    id: 'from52wLow',
    label: 'From 52W L',
    description: 'Distance above the 52-week low, as a percentage',
    group: 'performance',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'xl',
    value: (row) => percentFrom(row.ltp, row.low52w),
  },

  // --- Volume ---------------------------------------------------------------
  {
    id: 'volume',
    label: 'Volume',
    description: 'Shares traded in the session',
    group: 'volume',
    source: 'quote',
    numeric: true,
    unit: 'shares',
    hideBelow: 'md',
    value: (row) => row.volume,
  },
  {
    id: 'averageVolume',
    label: 'Avg Volume',
    description: 'Mean daily volume over the indicator lookback',
    group: 'volume',
    source: 'indicators',
    numeric: true,
    unit: 'shares',
    hideBelow: 'xl',
    value: (row) => row.averageVolume,
  },
  {
    id: 'relativeVolume',
    label: 'Rel Vol',
    description: 'Session volume as a multiple of the average',
    group: 'volume',
    source: 'indicators',
    numeric: true,
    unit: 'ratio',
    hideBelow: 'lg',
    value: (row) => row.relativeVolume,
  },
  {
    id: 'turnover',
    label: 'Turnover',
    description: 'Traded value for the session — last price × volume',
    group: 'volume',
    source: 'derived',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => (row.ltp === null || row.volume === null ? null : row.ltp * row.volume),
  },

  // --- Technical ------------------------------------------------------------
  {
    id: 'rsi14',
    label: 'RSI',
    description: '14-period relative strength index on daily closes',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'points',
    hideBelow: 'md',
    value: (row) => row.rsi14,
  },
  {
    id: 'ema20',
    label: 'EMA 20',
    description: '20-period exponential moving average',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.ema20,
  },
  {
    id: 'ema50',
    label: 'EMA 50',
    description: '50-period exponential moving average',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.ema50,
  },
  {
    id: 'ema200',
    label: 'EMA 200',
    description: '200-period exponential moving average',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.ema200,
  },
  {
    id: 'sma20',
    label: 'SMA 20',
    description: '20-period simple moving average',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.sma20,
  },
  {
    id: 'sma50',
    label: 'SMA 50',
    description: '50-period simple moving average',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.sma50,
  },
  {
    id: 'macdHistogram',
    label: 'MACD',
    description: 'MACD histogram — the gap between the MACD line and its signal',
    group: 'technical',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.macdHistogram,
  },
  {
    id: 'trend',
    label: 'Trend',
    description: 'How many of the 20, 50 and 200 EMAs the price is above',
    group: 'technical',
    source: 'derived',
    numeric: true,
    hideBelow: 'lg',
    value: (row) => {
      const { ltp } = row;
      if (ltp === null) return null;
      const emas = [row.ema20, row.ema50, row.ema200];
      // Null when NONE of the three is known: "0 of 3" and "we have no moving
      // averages for this name" are different facts, and only one of them is a
      // bearish reading.
      if (emas.every((ema) => ema === null)) return null;
      return emas.filter((ema) => ema !== null && ltp > ema).length;
    },
  },

  // --- Risk -----------------------------------------------------------------
  {
    id: 'atr14',
    label: 'ATR',
    description: '14-period average true range — typical daily movement',
    group: 'risk',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.atr14,
  },
  {
    id: 'atrPercent',
    label: 'ATR %',
    description: 'Average true range as a percentage of price — comparable across names',
    group: 'risk',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'xl',
    value: (row) =>
      row.atr14 === null || row.ltp === null || row.ltp === 0 ? null : (row.atr14 / row.ltp) * 100,
  },

  // --- No data source (see the module comment) -------------------------------
  {
    id: 'marketCap',
    label: 'Mkt Cap',
    description: 'Shares outstanding × price',
    group: 'valuation',
    source: null,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'peRatio',
    label: 'P/E',
    description: 'Price to trailing earnings',
    group: 'valuation',
    source: null,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'pbRatio',
    label: 'P/B',
    description: 'Price to book value',
    group: 'valuation',
    source: null,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'eps',
    label: 'EPS',
    description: 'Trailing earnings per share',
    group: 'fundamentals',
    source: null,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'dividendYield',
    label: 'Div Yield',
    description: 'Trailing dividend as a percentage of price',
    group: 'dividend',
    source: null,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },

  // --- Market information ---------------------------------------------------
  {
    id: 'sector',
    label: 'Sector',
    description: 'Sector classification from the configured index constituents',
    group: 'market',
    source: 'instrument',
    numeric: false,
    hideBelow: 'lg',
    value: (row) => row.sector,
  },
  {
    id: 'exchange',
    label: 'Exchange',
    description: 'Listing venue',
    group: 'market',
    source: 'instrument',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => row.exchange,
  },
  {
    id: 'note',
    label: 'Note',
    description: 'Your own reason for watching this name',
    group: 'market',
    source: 'instrument',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => row.note,
  },
  {
    id: 'indicatorDate',
    label: 'Data as of',
    description: 'The closed session the indicator columns describe',
    group: 'market',
    source: 'indicators',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => row.indicatorDate,
  },
  {
    id: 'quoteAt',
    label: 'Updated',
    description: 'Exchange feed time for this row’s quote',
    group: 'market',
    source: 'quote',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => row.quoteAt,
  },
];

export const WATCHLIST_COLUMNS = COLUMNS;

const BY_ID = new Map(COLUMNS.map((column) => [column.id, column]));

export function getColumn(id: string): WatchlistColumn | null {
  return BY_ID.get(id) ?? null;
}

/** The one pinned column, which every layout starts with. */
export const PINNED_COLUMN_ID = 'symbol';

/**
 * The default view: dense enough to be useful, short enough to scan.
 *
 * Deliberately eleven columns rather than everything available. A default that
 * shows twenty-four is not a more powerful product, it is one where the user's
 * first action is always to turn things off.
 */
export const DEFAULT_COLUMN_IDS: readonly string[] = [
  'symbol',
  'ltp',
  'change',
  'changePercent',
  'dayHigh',
  'dayLow',
  'volume',
  'relativeVolume',
  'rsi14',
  'from52wHigh',
  'sector',
];

/** True when this application has a source for the column at all. */
export function isColumnAvailable(column: WatchlistColumn): boolean {
  return column.source !== null;
}

/**
 * Turns stored ids into columns.
 *
 * Unknown ids are dropped rather than rejected: removing a column in code must
 * not strand a saved layout, and a stored layout is UI state, not a contract.
 * The pinned column is forced to the front whether or not it was stored, so a
 * layout saved before it was pinned still renders a ticker.
 */
export function resolveColumns(ids: readonly string[]): WatchlistColumn[] {
  const pinned = BY_ID.get(PINNED_COLUMN_ID);
  const resolved: WatchlistColumn[] = pinned === undefined ? [] : [pinned];
  const seen = new Set<string>([PINNED_COLUMN_ID]);

  for (const id of ids) {
    if (seen.has(id)) continue;
    const column = BY_ID.get(id);
    if (column === undefined) continue;
    seen.add(id);
    resolved.push(column);
  }
  return resolved;
}

/** The stored form of a layout: pinned column omitted, since it is implicit. */
export function toStoredColumnIds(columns: readonly WatchlistColumn[]): string[] {
  return columns.filter((column) => column.pinned !== true).map((column) => column.id);
}

export interface ColumnGroupListing {
  readonly group: ColumnGroup;
  readonly label: string;
  readonly columns: readonly WatchlistColumn[];
}

/**
 * Every column, grouped for the customize panel.
 *
 * `query` filters by label, description and group name, so searching
 * "dividend" finds the column and searching "moving average" finds all five.
 * Empty groups are dropped — a search that matches nothing in Volume should not
 * render an empty Volume heading.
 */
export function groupedColumns(query = ''): ColumnGroupListing[] {
  const q = query.trim().toLowerCase();

  const matches = (column: WatchlistColumn): boolean => {
    if (q === '') return true;
    const haystack =
      `${column.label} ${column.description} ${COLUMN_GROUP_LABEL[column.group]}`.toLowerCase();
    return haystack.includes(q);
  };

  const listings: ColumnGroupListing[] = [];
  for (const group of COLUMN_GROUP_ORDER) {
    const columns = COLUMNS.filter(
      (column) => column.group === group && column.pinned !== true && matches(column),
    );
    if (columns.length === 0) continue;
    listings.push({ group, label: COLUMN_GROUP_LABEL[group], columns });
  }
  return listings;
}

/** Moves `id` to sit at `toIndex` among the non-pinned columns. */
export function reorderColumnIds(ids: readonly string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  return next;
}
