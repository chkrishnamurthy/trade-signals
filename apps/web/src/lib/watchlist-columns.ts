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
 * ## Columns with no data source
 *
 * Fundamentals, circuit limits, delivery percentages and the indicators the
 * end-of-day pass does not compute are declared here with `source: null` and a
 * reason. This app's market-data provider serves quotes and OHLCV history; it
 * has no fundamentals feed, and neither does anything else in the system.
 * They are declared rather than omitted so that:
 *
 *   1. the "Customize columns" panel can show them as unavailable with the
 *      actual reason, instead of the user wondering where P/E went;
 *   2. a quick view that needs them can disable itself automatically;
 *   3. adding a source later means filling in one accessor each, not designing
 *      the group from scratch.
 *
 * What they must never do is render a number. CLAUDE.md is explicit that this
 * product does not display a figure it cannot substantiate, and a plausible
 * invented P/E is worse than a visible gap. For the same reason none of them
 * appears in the default layout: a column that can only ever show an em dash
 * earns its place in the panel, not in the table.
 */

export type ColumnGroup =
  | 'identity'
  | 'price'
  | 'performance'
  | 'volume'
  | 'valuation'
  | 'fundamentals'
  | 'range52w'
  | 'technical'
  | 'signals'
  | 'market';

export const COLUMN_GROUP_LABEL: Record<ColumnGroup, string> = {
  identity: 'Identity',
  price: 'Price',
  performance: 'Performance',
  volume: 'Volume & Liquidity',
  valuation: 'Valuation',
  fundamentals: 'Fundamentals',
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
  'valuation',
  'fundamentals',
  'range52w',
  'technical',
  'signals',
  'market',
];

/** Where a column's number comes from. `null` = this app has no source. */
export type ColumnSource = 'quote' | 'indicators' | 'instrument' | 'signals' | 'derived' | null;

export interface WatchlistColumn {
  readonly id: string;
  /** Table header. Written out, not abbreviated — see the module comment. */
  readonly label: string;
  /** Long form, shown in the customize panel and the header tooltip. */
  readonly description: string;
  readonly group: ColumnGroup;
  readonly source: ColumnSource;
  /**
   * Why this application cannot supply the column. Set only when `source` is
   * null, and shown verbatim in the customize panel — "no data source" without
   * a reason just moves the user's question one step along.
   */
  readonly unavailableReason?: string;
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

// --- Reasons a column cannot be supplied ------------------------------------

const NO_FUNDAMENTALS =
  'No fundamentals feed — this application’s data provider serves quotes and OHLCV history only';
const NO_CIRCUITS = 'The quote feed does not carry the exchange’s circuit limits';
const NO_DELIVERY =
  'Delivery figures come from the exchange’s end-of-day bhavcopy, which this application does not ingest';
const NOT_COMPUTED = 'Not part of the stored end-of-day indicator set';
const PER_SIGNAL_ONLY =
  'The intraday engine publishes levels per signal, not per stock — open the signal for them';
const NO_INTRADAY_ENGINE =
  'The intraday engine that published live setups has been removed — no source currently writes these levels';

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
  {
    id: 'upperCircuit',
    label: 'Upper Circuit',
    description: 'Highest price the exchange will accept today',
    group: 'price',
    source: null,
    unavailableReason: NO_CIRCUITS,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'lowerCircuit',
    label: 'Lower Circuit',
    description: 'Lowest price the exchange will accept today',
    group: 'price',
    source: null,
    unavailableReason: NO_CIRCUITS,
    numeric: true,
    unit: 'paise',
    value: () => null,
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
  {
    id: 'deliveryPercent',
    label: 'Delivery %',
    description: 'Share of traded volume that settled as delivery rather than intraday',
    group: 'volume',
    source: null,
    unavailableReason: NO_DELIVERY,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },

  // --- Valuation (no source — see the module comment) ------------------------
  {
    id: 'marketCap',
    label: 'Market Cap',
    description: 'Shares outstanding × price',
    group: 'valuation',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
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
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'forwardPeRatio',
    label: 'Forward P/E',
    description: 'Price to forecast earnings',
    group: 'valuation',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
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
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'pegRatio',
    label: 'PEG',
    description: 'Price/earnings against the earnings growth rate',
    group: 'valuation',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'evEbitda',
    label: 'EV/EBITDA',
    description: 'Enterprise value against operating earnings',
    group: 'valuation',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'dividendYield',
    label: 'Dividend Yield',
    description: 'Trailing dividend as a percentage of price',
    group: 'valuation',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },

  // --- Fundamentals (no source) ---------------------------------------------
  {
    id: 'eps',
    label: 'EPS',
    description: 'Trailing earnings per share',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'epsGrowth',
    label: 'EPS Growth',
    description: 'Year-on-year growth in earnings per share',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'revenue',
    label: 'Revenue',
    description: 'Trailing twelve-month revenue',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'revenueGrowth',
    label: 'Revenue Growth',
    description: 'Year-on-year growth in revenue',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'profitGrowth',
    label: 'Profit Growth',
    description: 'Year-on-year growth in net profit',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'roe',
    label: 'ROE',
    description: 'Return on equity',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'roce',
    label: 'ROCE',
    description: 'Return on capital employed',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'debtToEquity',
    label: 'Debt/Equity',
    description: 'Borrowings against shareholders’ funds',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'promoterHolding',
    label: 'Promoter Holding',
    description: 'Share of equity held by the promoter group',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
  },
  {
    id: 'promoterPledge',
    label: 'Promoter Pledge',
    description: 'Share of the promoter holding pledged against borrowing',
    group: 'fundamentals',
    source: null,
    unavailableReason: NO_FUNDAMENTALS,
    numeric: true,
    unit: 'percent',
    value: () => null,
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
    id: 'sma100',
    label: 'SMA 100',
    description: '100-period simple moving average',
    group: 'technical',
    source: null,
    unavailableReason: NOT_COMPUTED,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'sma200',
    label: 'SMA 200',
    description: '200-period simple moving average',
    group: 'technical',
    source: null,
    unavailableReason: `${NOT_COMPUTED} — the 200-period EMA is stored instead`,
    numeric: true,
    unit: 'paise',
    value: () => null,
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
  {
    id: 'adx14',
    label: 'ADX',
    description: '14-period average directional index — trend strength',
    group: 'technical',
    source: null,
    unavailableReason: NOT_COMPUTED,
    numeric: true,
    unit: 'points',
    value: () => null,
  },
  {
    id: 'stochastic',
    label: 'Stochastic',
    description: 'Stochastic oscillator %K',
    group: 'technical',
    source: null,
    unavailableReason: NOT_COMPUTED,
    numeric: true,
    unit: 'points',
    value: () => null,
  },
  {
    id: 'bollingerBands',
    label: 'Bollinger Bands',
    description: 'Position between the upper and lower Bollinger bands',
    group: 'technical',
    source: null,
    unavailableReason: NOT_COMPUTED,
    numeric: true,
    unit: 'percent',
    value: () => null,
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
  {
    id: 'momentum',
    label: 'Momentum',
    description: 'Rate of change in price over a trailing window',
    group: 'signals',
    source: null,
    unavailableReason:
      'Needs a momentum series across sessions, which the watchlist does not load — RSI and the MACD histogram are the stored readings',
    numeric: true,
    unit: 'points',
    value: () => null,
  },
  // The live intraday setup columns. The engine that WROTE these was removed,
  // so nothing currently populates them — they are declared `source: null` with
  // a reason (like the fundamentals columns) rather than advertised as available
  // and then rendering an em dash for every row forever. The row DTO still
  // carries `setup`, and the read stays wired in the DB layer, so restoring
  // these is a one-line-each change the day an engine repopulates the table.
  {
    id: 'setupState',
    label: 'Setup',
    description:
      'Today’s live intraday setup and its state — breakout, VWAP reclaim, momentum and the rest',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: false,
    value: () => null,
  },
  {
    id: 'setupScore',
    label: 'Setup Score',
    description: 'Confluence score of today’s live intraday setup, 0-100',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: true,
    unit: 'points',
    value: () => null,
  },
  {
    id: 'entryZone',
    label: 'Entry Zone',
    description: 'Technical entry zone of the live setup, as a price band',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'setupTarget',
    label: 'Target',
    description: 'First target level of the live setup',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'setupInvalidation',
    label: 'Invalidation',
    description: 'The level at which the live setup stops being valid',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'setupRiskReward',
    label: 'Net R:R',
    description:
      'Reward-to-risk of the live setup, NET of the modelled round-trip transaction cost',
    group: 'signals',
    source: null,
    unavailableReason: NO_INTRADAY_ENGINE,
    numeric: true,
    unit: 'ratio',
    value: () => null,
  },
  {
    id: 'support',
    label: 'Support',
    description: 'Nearest support level below the price',
    group: 'signals',
    source: null,
    unavailableReason: PER_SIGNAL_ONLY,
    numeric: true,
    unit: 'paise',
    value: () => null,
  },
  {
    id: 'resistance',
    label: 'Resistance',
    description: 'Nearest resistance level above the price',
    group: 'signals',
    source: null,
    unavailableReason: PER_SIGNAL_ONLY,
    numeric: true,
    unit: 'paise',
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
 * Nine columns rather than the sixty available, and every one of them backed by
 * a real source. A default that shows everything is not a more powerful
 * product, it is one where the user's first action is always to turn things
 * off; a default that shows a column this app cannot fill is worse still.
 *
 * Market Cap and P/E belong in this list on merit and are deliberately absent:
 * there is no fundamentals feed, so both would be a column of em dashes. They
 * are one click away in the customize panel, and they will join the default the
 * day a source exists.
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
