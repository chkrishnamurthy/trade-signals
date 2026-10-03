/**
 * The screener's metric catalogue — the closed vocabulary every screen is
 * written in (docs/planning/screener-dhan-fyers-plan.md §4).
 *
 * One list drives four things that must never disagree:
 *   - the `screener_snapshots` columns (each key IS a column, snake_cased),
 *   - the filter AST (a leaf can only name a key from here),
 *   - the SQL compiler (key → column, unit → which comparisons are legal),
 *   - the UI's metric picker, labels and units.
 *
 * Wording is technical and neutral (CLAUDE.md): "Above 200 EMA", "Long
 * build-up". Nothing here says buy, sell, target or undervalued.
 *
 * Units are the STORED units. A price is integer paise; a percentage is a
 * plain number (12.5 means 12.5%); `pp` is a difference of percentages.
 * The UI converts rupee input to paise before it builds a filter.
 */

export const METRIC_CATEGORIES = [
  'price',
  'trend',
  'momentum',
  'volatility',
  'patterns',
  'relative',
  'volume',
  'delivery',
  'fno',
  'ownership',
  'events',
  'classification',
  'signals',
] as const;
export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<MetricCategory, string>> = {
  price: 'Price & returns',
  trend: 'Trend',
  momentum: 'Momentum',
  volatility: 'Volatility & range',
  patterns: 'Breakouts & patterns',
  relative: 'Relative strength',
  volume: 'Volume & liquidity',
  delivery: 'Delivery',
  fno: 'F&O',
  ownership: 'Ownership',
  events: 'Deals & events',
  classification: 'Classification',
  signals: 'Signals',
};

/**
 * How a value is stored and compared.
 *
 *   numeric units  — paise, percent, pp, ratio, multiple, count, shares, score
 *   sessions/days  — non-negative integers counting back (sessions) or ahead
 *                    (days); null means "not within the tracked window"
 *   boolean        — true/false; null when it cannot be known yet
 *   enum           — one of `options`
 *   text           — free text with options supplied by the data (industry)
 *   list           — a set of option values (index membership)
 */
export type MetricUnit =
  | 'paise'
  | 'percent'
  | 'pp'
  | 'ratio'
  | 'multiple'
  | 'count'
  | 'shares'
  | 'score'
  | 'sessions'
  | 'days'
  | 'boolean'
  | 'enum'
  | 'text'
  | 'list';

export const NUMERIC_UNITS: ReadonlySet<MetricUnit> = new Set([
  'paise',
  'percent',
  'pp',
  'ratio',
  'multiple',
  'count',
  'shares',
  'score',
  'sessions',
  'days',
]);

export interface MetricOption {
  readonly value: string;
  readonly label: string;
}

export interface MetricDefinition {
  readonly key: MetricKey;
  readonly label: string;
  readonly category: MetricCategory;
  readonly unit: MetricUnit;
  /** One sentence: what it is and where it comes from. Shown in the picker. */
  readonly description: string;
  /** Decimal places when displayed. */
  readonly decimals?: number;
  readonly options?: readonly MetricOption[];
  /** Hidden from non-admins entirely (signals are admin-only, CLAUDE.md). */
  readonly adminOnly?: boolean;
}

export const METRIC_KEYS = [
  // Price & returns
  'close',
  'changePct',
  'gapPct',
  'ret1w',
  'ret1m',
  'ret3m',
  'ret6m',
  'ret1y',
  'retYtd',
  'dist52wHigh',
  'dist52wLow',
  'distAth',
  'rangePosDay',
  // Trend
  'closeVsEma20',
  'closeVsEma50',
  'closeVsEma200',
  'closeVsSma50',
  'closeVsSma200',
  'emaStack',
  'goldenCrossDays',
  'deathCrossDays',
  'supertrendDir',
  'supertrendFlipDays',
  'adx14',
  'plusDi',
  'minusDi',
  'higherHighs',
  // Momentum
  'rsi14',
  'rsiAbove50Days',
  'rsiAbove60Days',
  'rsiBelow40Days',
  'macdHist',
  'macdHistRising',
  'macdCrossUpDays',
  'macdCrossDownDays',
  'stochK',
  'stochD',
  'roc20',
  // Volatility & range
  'atr14',
  'atrPct',
  'bbWidth',
  'bbSqueeze',
  'range10Pct',
  'range20Pct',
  'volatility20',
  'nr4',
  'nr7',
  // Breakouts & patterns
  'breakout20d',
  'breakdown20d',
  'breakout52w',
  'breakdown52w',
  'insideBar',
  'outsideBar',
  'bullishEngulfing',
  'bearishEngulfing',
  'hammer',
  'shootingStar',
  'doji',
  // Relative strength
  'rsRank',
  'rs1m',
  'rs3m',
  'rs6m',
  'rsNewHigh',
  // Volume & liquidity
  'volume',
  'avgVolume20',
  'relVolume',
  'turnover',
  'avgTurnover20',
  'trades',
  // Delivery
  'deliveryPct',
  'avgDelivery20',
  'deliveryVsAvg',
  'deliveryRatio',
  'deliveryQty',
  // F&O
  'fnoEligible',
  'futOi',
  'futOiChgPct',
  'oiBuildup',
  'oiBuildupStreak',
  // Ownership
  'promoterPct',
  'promoterChgQoq',
  'publicPct',
  'publicChgQoq',
  'promoterStreak',
  // Deals & events
  'bulkDeals20d',
  'blockDeals20d',
  'resultsInDays',
  'exDateInDays',
  'announcements7d',
  'listedDays',
  // Classification
  'industry',
  'series',
  'indexKeys',
  'sizeBucket',
  // Signals (admin-only)
  'signalDirection',
  'signalStrength',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

const BUILDUP_OPTIONS: readonly MetricOption[] = [
  { value: 'long_buildup', label: 'Long build-up' },
  { value: 'short_covering', label: 'Short covering' },
  { value: 'short_buildup', label: 'Short build-up' },
  { value: 'long_unwinding', label: 'Long unwinding' },
];

export const INDEX_OPTIONS: readonly MetricOption[] = [
  { value: 'nifty50', label: 'Nifty 50' },
  { value: 'niftynext50', label: 'Nifty Next 50' },
  { value: 'nifty100', label: 'Nifty 100' },
  { value: 'nifty200', label: 'Nifty 200' },
  { value: 'nifty500', label: 'Nifty 500' },
  { value: 'niftymidcap150', label: 'Nifty Midcap 150' },
  { value: 'niftysmallcap250', label: 'Nifty Smallcap 250' },
  { value: 'niftymicrocap250', label: 'Nifty Microcap 250' },
  { value: 'niftytotalmarket', label: 'Nifty Total Market' },
];

export const SIZE_OPTIONS: readonly MetricOption[] = [
  { value: 'large', label: 'Large (Nifty 100)' },
  { value: 'mid', label: 'Mid (Midcap 150)' },
  { value: 'small', label: 'Small (Smallcap 250)' },
  { value: 'micro', label: 'Micro (Microcap 250)' },
  { value: 'other', label: 'Outside these indices' },
];

type Def = Omit<MetricDefinition, 'key'>;

const DEFINITIONS: Readonly<Record<MetricKey, Def>> = {
  close: {
    label: 'Close',
    category: 'price',
    unit: 'paise',
    decimals: 2,
    description: 'Closing price of the last closed session, split/bonus adjusted.',
  },
  changePct: {
    label: 'Change %',
    category: 'price',
    unit: 'percent',
    decimals: 2,
    description: 'Close vs the previous session’s close.',
  },
  gapPct: {
    label: 'Gap %',
    category: 'price',
    unit: 'percent',
    decimals: 2,
    description: 'Open vs the previous session’s close.',
  },
  ret1w: {
    label: '1W return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 5 sessions ago.',
  },
  ret1m: {
    label: '1M return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 21 sessions ago.',
  },
  ret3m: {
    label: '3M return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 63 sessions ago.',
  },
  ret6m: {
    label: '6M return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 126 sessions ago.',
  },
  ret1y: {
    label: '1Y return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 252 sessions ago.',
  },
  retYtd: {
    label: 'YTD return',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs the last close of the previous calendar year.',
  },
  dist52wHigh: {
    label: 'From 52W high',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'How far the close is below the 52-week high (0 = at the high).',
  },
  dist52wLow: {
    label: 'From 52W low',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description: 'How far the close is above the 52-week low.',
  },
  distAth: {
    label: 'From stored-history high',
    category: 'price',
    unit: 'percent',
    decimals: 1,
    description:
      'Distance below the highest high in the stored history (about two years), not a lifetime high.',
  },
  rangePosDay: {
    label: 'Close in day’s range',
    category: 'price',
    unit: 'percent',
    decimals: 0,
    description: 'Where the close sits between the session low (0) and high (100).',
  },

  closeVsEma20: {
    label: 'Close vs EMA 20',
    category: 'trend',
    unit: 'percent',
    decimals: 1,
    description: 'Distance of the close from the 20-session EMA.',
  },
  closeVsEma50: {
    label: 'Close vs EMA 50',
    category: 'trend',
    unit: 'percent',
    decimals: 1,
    description: 'Distance of the close from the 50-session EMA.',
  },
  closeVsEma200: {
    label: 'Close vs EMA 200',
    category: 'trend',
    unit: 'percent',
    decimals: 1,
    description: 'Distance of the close from the 200-session EMA.',
  },
  closeVsSma50: {
    label: 'Close vs SMA 50',
    category: 'trend',
    unit: 'percent',
    decimals: 1,
    description: 'Distance of the close from the 50-session simple average.',
  },
  closeVsSma200: {
    label: 'Close vs SMA 200',
    category: 'trend',
    unit: 'percent',
    decimals: 1,
    description: 'Distance of the close from the 200-session simple average.',
  },
  emaStack: {
    label: 'EMA stack',
    category: 'trend',
    unit: 'enum',
    description: 'Bullish when close > EMA 20 > EMA 50 > EMA 200; bearish when fully inverted.',
    options: [
      { value: 'bullish', label: 'Bullish' },
      { value: 'bearish', label: 'Bearish' },
      { value: 'mixed', label: 'Mixed' },
    ],
  },
  goldenCrossDays: {
    label: 'EMA 50 crossed above EMA 200',
    category: 'trend',
    unit: 'sessions',
    description: 'Sessions since the 50 EMA crossed above the 200 EMA (within the last 20).',
  },
  deathCrossDays: {
    label: 'EMA 50 crossed below EMA 200',
    category: 'trend',
    unit: 'sessions',
    description: 'Sessions since the 50 EMA crossed below the 200 EMA (within the last 20).',
  },
  supertrendDir: {
    label: 'Supertrend (10, 3)',
    category: 'trend',
    unit: 'enum',
    description: 'Direction of the Supertrend line.',
    options: [
      { value: 'up', label: 'Up' },
      { value: 'down', label: 'Down' },
    ],
  },
  supertrendFlipDays: {
    label: 'Supertrend flipped',
    category: 'trend',
    unit: 'sessions',
    description: 'Sessions since the Supertrend last changed direction (within the last 20).',
  },
  adx14: {
    label: 'ADX (14)',
    category: 'trend',
    unit: 'score',
    decimals: 1,
    description: 'Trend strength, direction-blind. Above 25 is commonly read as trending.',
  },
  plusDi: {
    label: '+DI (14)',
    category: 'trend',
    unit: 'score',
    decimals: 1,
    description: 'Positive directional indicator.',
  },
  minusDi: {
    label: '−DI (14)',
    category: 'trend',
    unit: 'score',
    decimals: 1,
    description: 'Negative directional indicator.',
  },
  higherHighs: {
    label: 'Higher highs and lows',
    category: 'trend',
    unit: 'boolean',
    description: 'The last 10 sessions made a higher high AND a higher low than the 10 before.',
  },

  rsi14: {
    label: 'RSI (14)',
    category: 'momentum',
    unit: 'score',
    decimals: 1,
    description: 'Wilder’s relative strength index, 0–100.',
  },
  rsiAbove50Days: {
    label: 'RSI crossed above 50',
    category: 'momentum',
    unit: 'sessions',
    description: 'Sessions since RSI (14) crossed above 50 (within the last 10).',
  },
  rsiAbove60Days: {
    label: 'RSI crossed above 60',
    category: 'momentum',
    unit: 'sessions',
    description: 'Sessions since RSI (14) crossed above 60 (within the last 10).',
  },
  rsiBelow40Days: {
    label: 'RSI crossed below 40',
    category: 'momentum',
    unit: 'sessions',
    description: 'Sessions since RSI (14) crossed below 40 (within the last 10).',
  },
  macdHist: {
    label: 'MACD histogram',
    category: 'momentum',
    unit: 'paise',
    decimals: 2,
    description: 'MACD (12, 26, 9) line minus its signal line.',
  },
  macdHistRising: {
    label: 'MACD histogram rising',
    category: 'momentum',
    unit: 'boolean',
    description: 'The histogram is higher than in the previous session.',
  },
  macdCrossUpDays: {
    label: 'MACD crossed above signal',
    category: 'momentum',
    unit: 'sessions',
    description: 'Sessions since the MACD line crossed above its signal (within the last 10).',
  },
  macdCrossDownDays: {
    label: 'MACD crossed below signal',
    category: 'momentum',
    unit: 'sessions',
    description: 'Sessions since the MACD line crossed below its signal (within the last 10).',
  },
  stochK: {
    label: 'Stochastic %K (14)',
    category: 'momentum',
    unit: 'score',
    decimals: 1,
    description: 'Close’s position in the 14-session range, 0–100.',
  },
  stochD: {
    label: 'Stochastic %D (3)',
    category: 'momentum',
    unit: 'score',
    decimals: 1,
    description: '3-session average of %K.',
  },
  roc20: {
    label: 'Rate of change (20)',
    category: 'momentum',
    unit: 'percent',
    decimals: 1,
    description: 'Close vs 20 sessions ago.',
  },

  atr14: {
    label: 'ATR (14)',
    category: 'volatility',
    unit: 'paise',
    decimals: 2,
    description: 'Average true range, Wilder-smoothed.',
  },
  atrPct: {
    label: 'ATR %',
    category: 'volatility',
    unit: 'percent',
    decimals: 2,
    description: 'ATR (14) as a percentage of the close.',
  },
  bbWidth: {
    label: 'Bollinger width',
    category: 'volatility',
    unit: 'percent',
    decimals: 1,
    description: 'Width of the 20-session, 2σ Bollinger Bands as a percentage of the middle band.',
  },
  bbSqueeze: {
    label: 'Bollinger squeeze',
    category: 'volatility',
    unit: 'boolean',
    description: 'Band width is at its narrowest of the last 126 sessions.',
  },
  range10Pct: {
    label: '10-session range',
    category: 'volatility',
    unit: 'percent',
    decimals: 1,
    description:
      '(Highest high − lowest low) of the last 10 sessions, as a percentage of the lowest low.',
  },
  range20Pct: {
    label: '20-session range',
    category: 'volatility',
    unit: 'percent',
    decimals: 1,
    description:
      '(Highest high − lowest low) of the last 20 sessions, as a percentage of the lowest low.',
  },
  volatility20: {
    label: 'Volatility (20, ann.)',
    category: 'volatility',
    unit: 'percent',
    decimals: 1,
    description: 'Standard deviation of daily log returns over 20 sessions, annualised.',
  },
  nr4: {
    label: 'NR4',
    category: 'volatility',
    unit: 'boolean',
    description: 'Today’s range is the narrowest of the last 4 sessions.',
  },
  nr7: {
    label: 'NR7',
    category: 'volatility',
    unit: 'boolean',
    description: 'Today’s range is the narrowest of the last 7 sessions.',
  },

  breakout20d: {
    label: 'Closed above 20-session high',
    category: 'patterns',
    unit: 'boolean',
    description: 'Close is above the highest high of the previous 20 sessions.',
  },
  breakdown20d: {
    label: 'Closed below 20-session low',
    category: 'patterns',
    unit: 'boolean',
    description: 'Close is below the lowest low of the previous 20 sessions.',
  },
  breakout52w: {
    label: 'Closed above 52-week high',
    category: 'patterns',
    unit: 'boolean',
    description: 'Close is above the highest high of the previous 251 sessions.',
  },
  breakdown52w: {
    label: 'Closed below 52-week low',
    category: 'patterns',
    unit: 'boolean',
    description: 'Close is below the lowest low of the previous 251 sessions.',
  },
  insideBar: {
    label: 'Inside bar',
    category: 'patterns',
    unit: 'boolean',
    description: 'Today’s high and low are inside the previous session’s range.',
  },
  outsideBar: {
    label: 'Outside bar',
    category: 'patterns',
    unit: 'boolean',
    description: 'Today’s range engulfs the previous session’s range.',
  },
  bullishEngulfing: {
    label: 'Bullish engulfing',
    category: 'patterns',
    unit: 'boolean',
    description: 'An up candle whose body covers the previous down candle’s body.',
  },
  bearishEngulfing: {
    label: 'Bearish engulfing',
    category: 'patterns',
    unit: 'boolean',
    description: 'A down candle whose body covers the previous up candle’s body.',
  },
  hammer: {
    label: 'Hammer',
    category: 'patterns',
    unit: 'boolean',
    description: 'Small body near the high with a lower shadow at least twice the body.',
  },
  shootingStar: {
    label: 'Shooting star',
    category: 'patterns',
    unit: 'boolean',
    description: 'Small body near the low with an upper shadow at least twice the body.',
  },
  doji: {
    label: 'Doji',
    category: 'patterns',
    unit: 'boolean',
    description: 'Body is at most 10% of the session’s range.',
  },

  rsRank: {
    label: 'RS rank (3M)',
    category: 'relative',
    unit: 'score',
    decimals: 0,
    description: 'Percentile (1–99) of the 3-month return across every screened stock.',
  },
  rs1m: {
    label: 'RS vs Nifty 50 (1M)',
    category: 'relative',
    unit: 'pp',
    decimals: 1,
    description: '1-month return minus the Nifty 50’s, in percentage points.',
  },
  rs3m: {
    label: 'RS vs Nifty 50 (3M)',
    category: 'relative',
    unit: 'pp',
    decimals: 1,
    description: '3-month return minus the Nifty 50’s, in percentage points.',
  },
  rs6m: {
    label: 'RS vs Nifty 50 (6M)',
    category: 'relative',
    unit: 'pp',
    decimals: 1,
    description: '6-month return minus the Nifty 50’s, in percentage points.',
  },
  rsNewHigh: {
    label: 'RS line at 52-week high',
    category: 'relative',
    unit: 'boolean',
    description: 'Price ÷ Nifty 50 is at its highest of the last 252 sessions.',
  },

  volume: {
    label: 'Volume',
    category: 'volume',
    unit: 'shares',
    decimals: 0,
    description: 'Shares traded in the session.',
  },
  avgVolume20: {
    label: 'Avg volume (20)',
    category: 'volume',
    unit: 'shares',
    decimals: 0,
    description: 'Mean volume of the previous 20 sessions, excluding today.',
  },
  relVolume: {
    label: 'Relative volume',
    category: 'volume',
    unit: 'multiple',
    decimals: 1,
    description: 'Volume ÷ its 20-session average.',
  },
  turnover: {
    label: 'Turnover',
    category: 'volume',
    unit: 'paise',
    decimals: 0,
    description: 'Value traded in the session (NSE bhavcopy).',
  },
  avgTurnover20: {
    label: 'Avg turnover (20)',
    category: 'volume',
    unit: 'paise',
    decimals: 0,
    description: 'Mean of close × volume over the previous 20 sessions.',
  },
  trades: {
    label: 'Trades',
    category: 'volume',
    unit: 'count',
    decimals: 0,
    description: 'Number of trades in the session (NSE bhavcopy).',
  },

  deliveryPct: {
    label: 'Delivery %',
    category: 'delivery',
    unit: 'percent',
    decimals: 1,
    description: 'Delivered ÷ traded quantity for the session (NSE bhavcopy).',
  },
  avgDelivery20: {
    label: 'Avg delivery % (20)',
    category: 'delivery',
    unit: 'percent',
    decimals: 1,
    description: 'Mean delivery % of the previous 20 sessions with data.',
  },
  deliveryVsAvg: {
    label: 'Delivery vs average',
    category: 'delivery',
    unit: 'pp',
    decimals: 1,
    description: 'Delivery % minus its 20-session average, in percentage points.',
  },
  deliveryRatio: {
    label: 'Delivery ÷ average',
    category: 'delivery',
    unit: 'multiple',
    decimals: 2,
    description: 'Delivery % divided by its 20-session average.',
  },
  deliveryQty: {
    label: 'Delivered quantity',
    category: 'delivery',
    unit: 'shares',
    decimals: 0,
    description: 'Shares delivered in the session.',
  },

  fnoEligible: {
    label: 'In F&O',
    category: 'fno',
    unit: 'boolean',
    description: 'Has stock futures with open interest recorded in the last 5 sessions.',
  },
  futOi: {
    label: 'Futures OI',
    category: 'fno',
    unit: 'shares',
    decimals: 0,
    description: 'Total futures open interest across expiries (Dhan).',
  },
  futOiChgPct: {
    label: 'Futures OI change',
    category: 'fno',
    unit: 'percent',
    decimals: 1,
    description: 'Change in total futures OI vs the previous session.',
  },
  oiBuildup: {
    label: 'OI build-up',
    category: 'fno',
    unit: 'enum',
    description:
      'Price change × OI change: long build-up, short covering, short build-up or long unwinding.',
    options: BUILDUP_OPTIONS,
  },
  oiBuildupStreak: {
    label: 'Build-up streak',
    category: 'fno',
    unit: 'sessions',
    description: 'Consecutive sessions in the same build-up state.',
  },

  promoterPct: {
    label: 'Promoter holding',
    category: 'ownership',
    unit: 'percent',
    decimals: 2,
    description: 'Promoter and promoter-group holding, latest quarter (NSE shareholding pattern).',
  },
  promoterChgQoq: {
    label: 'Promoter holding QoQ',
    category: 'ownership',
    unit: 'pp',
    decimals: 2,
    description: 'Change in promoter holding vs the previous quarter.',
  },
  publicPct: {
    label: 'Public holding',
    category: 'ownership',
    unit: 'percent',
    decimals: 2,
    description: 'Public shareholding, latest quarter.',
  },
  publicChgQoq: {
    label: 'Public holding QoQ',
    category: 'ownership',
    unit: 'pp',
    decimals: 2,
    description: 'Change in public holding vs the previous quarter.',
  },
  promoterStreak: {
    label: 'Promoter holding streak',
    category: 'ownership',
    unit: 'count',
    decimals: 0,
    description: 'Consecutive quarters of promoter increase (positive) or decrease (negative).',
  },

  bulkDeals20d: {
    label: 'Bulk deals (4 weeks)',
    category: 'events',
    unit: 'count',
    decimals: 0,
    description: 'Bulk deals reported in the last 4 weeks.',
  },
  blockDeals20d: {
    label: 'Block deals (4 weeks)',
    category: 'events',
    unit: 'count',
    decimals: 0,
    description: 'Block deals reported in the last 4 weeks.',
  },
  resultsInDays: {
    label: 'Results board meeting in',
    category: 'events',
    unit: 'days',
    description: 'Days until the next board meeting to consider results (within 30).',
  },
  exDateInDays: {
    label: 'Ex-date in',
    category: 'events',
    unit: 'days',
    description: 'Days until the next ex-date (within 30).',
  },
  announcements7d: {
    label: 'Announcements (7 days)',
    category: 'events',
    unit: 'count',
    decimals: 0,
    description: 'Corporate announcements filed in the last 7 days.',
  },
  listedDays: {
    label: 'Days since listing',
    category: 'events',
    unit: 'days',
    description: 'Calendar days since the listing date on NSE.',
  },

  industry: {
    label: 'Industry',
    category: 'classification',
    unit: 'text',
    description: 'NSE index industry (Nifty Total Market constituents); others are Unclassified.',
  },
  series: {
    label: 'Series',
    category: 'classification',
    unit: 'enum',
    description: 'NSE trading series.',
    options: [
      { value: 'EQ', label: 'EQ (rolling)' },
      { value: 'BE', label: 'BE (trade-to-trade)' },
      { value: 'BZ', label: 'BZ (trade-to-trade)' },
    ],
  },
  indexKeys: {
    label: 'Index membership',
    category: 'classification',
    unit: 'list',
    description: 'NSE indices the stock belongs to.',
    options: INDEX_OPTIONS,
  },
  sizeBucket: {
    label: 'Size (by index)',
    category: 'classification',
    unit: 'enum',
    description: 'Large/mid/small/micro by NSE index membership, not by market cap.',
    options: SIZE_OPTIONS,
  },

  signalDirection: {
    label: 'Signal direction',
    category: 'signals',
    unit: 'enum',
    adminOnly: true,
    description: 'Direction of the latest end-of-day EquityWise signal.',
    options: [
      { value: 'bullish', label: 'Bullish' },
      { value: 'bearish', label: 'Bearish' },
      { value: 'neutral', label: 'Neutral' },
    ],
  },
  signalStrength: {
    label: 'Signal strength',
    category: 'signals',
    unit: 'score',
    decimals: 0,
    adminOnly: true,
    description:
      'Strength of the latest end-of-day signal, with its factor breakdown on the stock page.',
  },
};

export const METRIC_CATALOGUE: readonly MetricDefinition[] = METRIC_KEYS.map((key) => ({
  key,
  ...DEFINITIONS[key],
}));

const BY_KEY = new Map<string, MetricDefinition>(METRIC_CATALOGUE.map((d) => [d.key, d]));

export function isMetricKey(value: string): value is MetricKey {
  return BY_KEY.has(value);
}

export function metricDefinition(key: MetricKey): MetricDefinition {
  const def = BY_KEY.get(key);
  if (def === undefined) throw new Error(`Unknown metric ${key}`);
  return def;
}

/** The catalogue a given viewer may see: admin-only metrics are absent, not disabled. */
export function catalogueFor(isAdmin: boolean): readonly MetricDefinition[] {
  return isAdmin ? METRIC_CATALOGUE : METRIC_CATALOGUE.filter((d) => d.adminOnly !== true);
}
