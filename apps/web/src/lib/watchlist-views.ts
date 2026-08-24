import { getColumn } from './watchlist-columns';
import { isFlagAvailable, WATCHLIST_FLAGS } from './watchlist-filters';
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
      ...PRICE_CORE,
      'dayHigh',
      'dayLow',
      'volume',
      'relativeVolume',
      'rsi14',
      'from52wHigh',
      'sector',
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
    columns: [...PRICE_CORE, 'high52w', 'from52wHigh', 'relativeVolume', 'rsi14'],
    sort: [{ columnId: 'from52wHigh', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'near_52w_low',
    label: '52W low',
    description: 'Closest to the bottom of the 52-week range',
    columns: [...PRICE_CORE, 'low52w', 'from52wLow', 'relativeVolume', 'rsi14'],
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
    columns: [...PRICE_CORE, 'atr14', 'atrPercent', 'dayRangePosition', 'relativeVolume'],
    sort: [{ columnId: 'atrPercent', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'high_dividend',
    label: 'High dividend',
    description: 'Ranked by trailing dividend yield',
    columns: [...PRICE_CORE, 'dividendYield', 'eps', 'marketCap', 'sector'],
    sort: [{ columnId: 'dividendYield', direction: 'desc' }],
    filters: {},
  },
  {
    id: 'valuation',
    label: 'Valuation',
    description: 'Earnings and book multiples against market cap',
    columns: [...PRICE_CORE, 'peRatio', 'pbRatio', 'eps', 'marketCap', 'sector'],
    sort: [{ columnId: 'peRatio', direction: 'asc' }],
    filters: {},
  },
];

export const QUICK_VIEWS = VIEWS;

const BY_ID = new Map(VIEWS.map((view) => [view.id, view]));

export function getQuickView(id: string): QuickView | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Column ids the view needs that this application cannot supply.
 *
 * Empty means the view works. Non-empty is rendered as the reason it is
 * disabled, so "High dividend" explains itself instead of just being greyed.
 */
export function missingSourcesFor(view: QuickView): string[] {
  const missing = new Set<string>();

  for (const id of view.columns) {
    const column = getColumn(id);
    if (column !== null && column.source === null) missing.add(column.label);
  }
  for (const rule of view.sort) {
    const column = getColumn(rule.columnId);
    if (column !== null && column.source === null) missing.add(column.label);
  }
  for (const flagId of view.filters.flags ?? []) {
    const flag = WATCHLIST_FLAGS.find((entry) => entry.id === flagId);
    if (flag !== undefined && !isFlagAvailable(flag)) missing.add(flag.label);
  }
  return [...missing];
}

export function isQuickViewAvailable(view: QuickView): boolean {
  return missingSourcesFor(view).length === 0;
}
