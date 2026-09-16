import { RETURN_WINDOWS } from './return-windows';
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
 * ## Naming
 *
 * Headers are written out — "Change %", "Market Cap", "52W High" — rather than
 * compressed to "Chg", "Mkt Cap", "52W H". Abbreviation is only worth a column
 * of width where the term is standard financial shorthand (LTP, VWAP, RSI,
 * P/E, ATR), and nowhere else: a header nobody can read costs more than the
 * pixels it saves.
 *
 * ## Only columns with a data source
 *
 * Every column here is backed by something this application actually has —
 * the live quote, the end-of-day indicator pass, the stored daily signal, or a
 * derivation of those. Fundamentals (P/E, market cap, dividend yield…), circuit
 * limits, delivery percentages and indicators the daily pass does not compute
 * are NOT declared: CLAUDE.md is explicit that this product does not display a
 * figure it cannot substantiate, and a column that can only ever render an em
 * dash is noise in the picker, not a feature. When a source for one of them
 * lands, add the column with its accessor then — not before.
 */

export type ColumnGroup =
  | 'identity'
  | 'price'
  | 'performance'
  | 'volume'
  | 'range52w'
  | 'technical'
  | 'signals'
  | 'market';

export const COLUMN_GROUP_LABEL: Record<ColumnGroup, string> = {
  identity: 'Identity',
  price: 'Price',
  performance: 'Performance',
  volume: 'Volume & Liquidity',
  range52w: '52-Week Position',
  technical: 'Technical Indicators',
  signals: 'Trading Signals',
  market: 'Market Information',
};

/** Display order of the groups in the customize panel. */
export const COLUMN_GROUP_ORDER: readonly ColumnGroup[] = [
  'identity',
  'price',
  'performance',
  'volume',
  'range52w',
  'technical',
  'signals',
  'market',
];

/** Where a column's number comes from. */
export type ColumnSource = 'quote' | 'indicators' | 'instrument' | 'signals' | 'derived';

export interface WatchlistColumn {
  readonly id: string;
  /** Table header. Written out, not abbreviated — see the module comment. */
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

/** Where `value` sits between `low` and `high`, as 0-100. Null-safe. */
function positionIn(value: number | null, low: number | null, high: number | null): number | null {
  if (value === null || low === null || high === null || high === low) return null;
  return ((value - low) / (high - low)) * 100;
}

/** Sort order for the five signal directions: bearish low, bullish high. */
const DIRECTION_RANK: Record<string, number> = {
  strong_bearish: -2,
  bearish: -1,
  neutral: 0,
  bullish: 1,
  strong_bullish: 2,
};

/** Distance within which a name counts as sitting at its 52-week extreme. */
const NEAR_52W_BAND = 0.05;

/**
 * The trailing-return columns, one per declared window.
 *
 * Generated rather than written out eight times: every one of them is the same
 * percentage from the same kind of anchor close, and eight hand-copied blocks
 * is eight chances for 3M to quietly read the 6M field.
 */
const RETURN_COLUMNS: readonly WatchlistColumn[] = RETURN_WINDOWS.map((window, index) => ({
  id: window.id,
  label: window.label,
  description: `${window.description}, measured from that session’s close`,
  group: 'performance' as const,
  source: 'derived' as const,
  numeric: true,
  unit: 'percent' as const,
  hideBelow: index < 2 ? ('lg' as const) : ('xl' as const),
  value: (row: WatchlistRowDto) => percentFrom(row.ltp, row.returnCloses[window.id] ?? null),
}));

const COLUMNS: readonly WatchlistColumn[] = [
  {
    id: 'symbol',
    label: 'Stock',
    description: 'Company name, ticker and listing venue',
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
    description: 'Percentage change against the previous close — today’s 1D move',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'percent',
    value: (row) => row.changePercent,
  },
  {
    id: 'previousClose',
    label: 'Previous Close',
    description: 'Close of the previous session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.previousClose,
  },
  {
    id: 'open',
    label: 'Open',
    description: 'The session’s opening price',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.open,
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
    id: 'dayRange',
    label: 'Day Range',
    description:
      'The session’s low and high, with where the last price sits between them. Sorts by that position',
    group: 'price',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'md',
    value: (row) => positionIn(row.ltp, row.dayLow, row.dayHigh),
  },
  {
    id: 'averagePrice',
    label: 'VWAP',
    description: 'Volume-weighted average price for the session',
    group: 'price',
    source: 'quote',
    numeric: true,
    unit: 'paise',
    hideBelow: 'xl',
    value: (row) => row.averagePrice,
  },

  // --- Performance ----------------------------------------------------------
  ...RETURN_COLUMNS,

  // --- Volume & liquidity ---------------------------------------------------
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
    hideBelow: 'lg',
    value: (row) => row.averageVolume,
  },
  {
    id: 'volumeChangePercent',
    label: 'Volume Change %',
    description:
      'Session volume against the previous session’s total. Partial, and so negative, until the close',
    group: 'volume',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'xl',
    value: (row) => percentFrom(row.volume, row.previousVolume),
  },
  {
    id: 'relativeVolume',
    label: 'Relative Volume',
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

  // --- 52-week position -----------------------------------------------------
  {
    id: 'range52w',
    label: '52W Range',
    description:
      'The 52-week low and high, with where the last price sits between them. Sorts by that position',
    group: 'range52w',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'lg',
    value: (row) => positionIn(row.ltp, row.low52w, row.high52w),
  },
  {
    id: 'high52w',
    label: '52W High',
    description: 'Highest close over the last 52 weeks',
    group: 'range52w',
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
    group: 'range52w',
    source: 'indicators',
    numeric: true,
    unit: 'paise',
    hideBelow: 'lg',
    value: (row) => row.low52w,
  },
  {
    id: 'from52wHigh',
    label: '% From 52W High',
    description: 'Distance below the 52-week high, as a percentage',
    group: 'range52w',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'md',
    value: (row) => percentFrom(row.ltp, row.high52w),
  },
  {
    id: 'from52wLow',
    label: '% From 52W Low',
    description: 'Distance above the 52-week low, as a percentage',
    group: 'range52w',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'xl',
    value: (row) => percentFrom(row.ltp, row.low52w),
  },
  {
    id: 'near52wHigh',
    label: 'Near 52W High',
    description: 'Whether the price is within 5% of the 52-week high',
    group: 'range52w',
    source: 'derived',
    numeric: false,
    hideBelow: 'xl',
    // 1 / 0 rather than a boolean so the column sorts, and null when there is
    // no 52-week high at all — "not near it" and "we do not know" differ.
    value: (row) => {
      const distance = percentFrom(row.ltp, row.high52w);
      return distance === null ? null : distance >= -NEAR_52W_BAND * 100 ? 1 : 0;
    },
  },
  {
    id: 'near52wLow',
    label: 'Near 52W Low',
    description: 'Whether the price is within 5% of the 52-week low',
    group: 'range52w',
    source: 'derived',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => {
      const distance = percentFrom(row.ltp, row.low52w);
      return distance === null ? null : distance <= NEAR_52W_BAND * 100 ? 1 : 0;
    },
  },

  // --- Technical indicators -------------------------------------------------
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
    id: 'atr14',
    label: 'ATR',
    description: '14-period average true range — typical daily movement',
    group: 'technical',
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
    group: 'technical',
    source: 'derived',
    numeric: true,
    unit: 'percent',
    hideBelow: 'xl',
    value: (row) =>
      row.atr14 === null || row.ltp === null || row.ltp === 0 ? null : (row.atr14 / row.ltp) * 100,
  },

  // --- Trading signals ------------------------------------------------------
  {
    id: 'signal',
    label: 'Signal',
    description: 'The daily engine’s latest direction for this name',
    group: 'signals',
    source: 'signals',
    numeric: false,
    // Ranked rather than alphabetical: sorting a signal column by the word
    // "bearish" first is not what anyone means by sorting it.
    value: (row) => (row.signal === null ? null : (DIRECTION_RANK[row.signal.direction] ?? null)),
  },
  {
    id: 'signalStrength',
    label: 'Signal Strength',
    description: 'Conviction behind the daily signal, 0-100 with 50 neutral',
    group: 'signals',
    source: 'signals',
    numeric: true,
    unit: 'points',
    hideBelow: 'lg',
    value: (row) => row.signal?.strength ?? null,
  },
  {
    id: 'signalSetups',
    label: 'Setups',
    description: 'Named daily setups behind the signal, such as a golden cross',
    group: 'signals',
    source: 'signals',
    numeric: false,
    hideBelow: 'xl',
    value: (row) => {
      const setups = row.signal?.setups ?? [];
      return setups.length === 0 ? null : setups.join(', ');
    },
  },
  {
    id: 'trend',
    label: 'Trend',
    description: 'How many of the 20, 50 and 200 EMAs the price is above',
    group: 'signals',
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
  // A "Note" column belongs here — the row DTO carries `note` and the free-text
  // filter already searches it — but it is deliberately not registered: nothing
  // in the app can SET a note yet, so the column could only ever render blank.
  // Register it the day an editor exists, not before (a column that can only
  // show an em dash earns its place in the panel, not in the table).
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
 * Nine columns rather than the forty available. A default that shows everything
 * is not a more powerful product, it is one where the user's first action is
 * always to turn things off.
 */
export const DEFAULT_COLUMN_IDS: readonly string[] = [
  'symbol',
  'ltp',
  'changePercent',
  'dayRange',
  'volume',
  'averageVolume',
  'range52w',
  'rsi14',
  'signal',
];

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
 * "dividend" finds the column, "moving average" finds all the averages, and
 * "stop" finds the invalidation level it was looking for. Empty groups are
 * dropped — a search that matches nothing in Valuation should not render an
 * empty Valuation heading.
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
