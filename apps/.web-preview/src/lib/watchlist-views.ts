import type { SortRuleDto, WatchlistFilterStateDto } from './watchlist-types';

/**
 * Quick views — predefined table configurations.
 *
 * A quick view changes how the watchlist is PRESENTED: which columns, which
 * sort, which filters. It never changes which stocks are in the list. That
 * distinction is the whole point of the feature — "Top Gainers" is a lens on
 * the names you chose, not a different set of names, and a user who clicks it
 * must never wonder whether they just lost a stock.
 *
 * These live in code rather than in the database because they are product
 * decisions, not user data. The user's own saved configurations are
 * `watchlist_views` rows and are a separate thing.
 *
 * Each view declares the columns it needs. A view whose columns have no data
 * source in this application reports itself unavailable rather than silently
 * rendering a table of em dashes — and becomes available on its own the day a
 * source is added.
 */

export interface QuickView {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Ordered column ids, excluding the pinned ticker. */
  readonly columns: readonly string[];
  readonly sort: readonly SortRuleDto[];
  readonly filters: WatchlistFilterStateDto;
}

const PRICE_CORE = ['ltp', 'change', 'changePercent'] as const;

const VIEWS: readonly QuickView[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'The default balance of price, volume and trend',
    columns: [
      'ltp',
      'changePercent',
      'dayRange',
      'volume',
      'averageVolume',
      'range52w',
      'rsi14',
      'signal',
    ],
    sort: [],
    filters: {},
  },
  {
    id: 'top_gainers',
    label: 'Top gainers',
    description: 'Advancing names, strongest first',
    columns: [...PRICE_CORE, 'open', 'dayHigh', 'volume', 'relativeVolume', 'sector'],
    sort: [{ columnId: 'changePercent', direction: 'desc' }],
    filters: { direction: 'advancing' },
  },
  {
    id: 'top_losers',
    label: 'Top losers',
    description: 'Declining names, weakest first',
    columns: [...PRICE_CORE, 'open', 'dayLow', 'volume', 'relativeVolume', 'sector'],
    sort: [{ columnId: 'changePercent', direction: 'asc' }],
    filters: { direction: 'declining' },
  },
  {
    id: 'most_active',
    label: 'Most active',
    description: 'Ranked by traded value, with volume against its average',
    columns: [...PRICE_CORE, 'volume', 'averageVolume', 'relativeVolume', 'turnover'],
    sort: [{ columnId: 'turnover', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'near_52w_high',
    label: '52W high',
    description: 'Closest to the top of the 52-week range',
    columns: [...PRICE_CORE, 'range52w', 'high52w', 'from52wHigh', 'relativeVolume', 'rsi14'],
    sort: [{ columnId: 'from52wHigh', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'near_52w_low',
    label: '52W low',
    description: 'Closest to the bottom of the 52-week range',
    columns: [...PRICE_CORE, 'range52w', 'low52w', 'from52wLow', 'relativeVolume', 'rsi14'],
    sort: [{ columnId: 'from52wLow', direction: 'asc' }],
    filters: {},
  },
  {
    id: 'strong_momentum',
    label: 'Strong momentum',
    description: 'Price above all three EMAs, on above-average volume',
    columns: [
      ...PRICE_CORE,
      'trend',
      'ema20',
      'ema50',
      'ema200',
      'relativeVolume',
      'rsi14',
      'macdHistogram',
    ],
    sort: [{ columnId: 'changePercent', direction: 'desc' }],
    filters: { flags: ['ema_stacked', 'volume_surge'] },
  },
  {
    id: 'oversold',
    label: 'Oversold',
    description: 'RSI below 30 — a technical reading, not a recommendation',
    columns: [...PRICE_CORE, 'rsi14', 'from52wLow', 'relativeVolume', 'atrPercent'],
    sort: [{ columnId: 'rsi14', direction: 'asc' }],
    filters: { flags: ['rsi_oversold'] },
  },
  {
    id: 'volatility',
    label: 'Volatility',
    description: 'Typical daily range, comparable across price levels',
    columns: [...PRICE_CORE, 'atr14', 'atrPercent', 'dayRange', 'relativeVolume'],
    sort: [{ columnId: 'atrPercent', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Trailing returns from one week out to five years',
    columns: [
      'ltp',
      'changePercent',
      'return1w',
      'return1m',
      'return3m',
      'return6m',
      'returnYtd',
      'return1y',
    ],
    sort: [{ columnId: 'return1m', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'daily_signals',
    label: 'Daily signals',
    description: 'The daily engine’s latest verdict, strongest first',
    columns: ['ltp', 'changePercent', 'signal', 'signalStrength', 'signalSetups', 'trend', 'rsi14'],
    sort: [{ columnId: 'signalStrength', direction: 'desc' }],
    filters: {},
  },
];

export const QUICK_VIEWS = VIEWS;

const BY_ID = new Map(VIEWS.map((view) => [view.id, view]));

export function getQuickView(id: string): QuickView | null {
  return BY_ID.get(id) ?? null;
}
