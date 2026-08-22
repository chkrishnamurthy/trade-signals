import type { Bar } from '../types.js';

/**
 * Intraday signal domain types.
 *
 * Pure data. Prices are integer paise (CLAUDE.md hard rule 3); ratios, scores
 * and percentages are floats because they are not money. Every instant is
 * epoch milliseconds in UTC (hard rule 6) — IST appears only at the
 * presentation boundary.
 *
 * These describe a TECHNICAL SETUP and the evidence behind it. Nothing here
 * represents an order, a position, or a quantity: the levels are price levels
 * on a chart, and the user acts on them, or does not, somewhere else entirely.
 */

/**
 * Which way the setup leans.
 *
 * Deliberately NOT called `SignalDirection` — that name belongs to the daily
 * engine's five-way bullish/bearish bias, and the two mean different things.
 * This one is binary and describes which side of the market a setup favours.
 *
 * `long` / `short` in the domain model rather than buy/sell: the engine
 * observes that price structure favours one side, which is a different claim
 * from an instruction to transact. The UI labels these BUY and SELL.
 */
export type TradeDirection = 'long' | 'short';

/**
 * The recognised setup families.
 *
 * Deliberately small. Ten kinds a user can hold in their head beats thirty
 * that all blur together, and every extra kind is another thing to validate.
 */
export type SignalKind =
  | 'breakout'
  | 'breakdown'
  | 'vwap_reclaim'
  | 'vwap_breakdown'
  | 'momentum_long'
  | 'momentum_short'
  | 'trend_continuation_long'
  | 'trend_continuation_short'
  | 'reversal_long'
  | 'reversal_short';

/**
 * Where a signal is in its life.
 *
 * The distinction that earns its keep is `triggered` vs `confirmed`: a trigger
 * is one closed bar doing the thing, a confirmation is a second bar not taking
 * it back. Most intraday false starts die between those two states, and
 * collapsing them would mean surfacing every one of them.
 *
 * Terminal states are `invalidated`, `expired` and `target_met`. A signal in a
 * terminal state is history and must never be rendered as a live opportunity.
 */
export type SignalState =
  /** Conditions are lining up but nothing has triggered. */
  | 'watching'
  /** The structure is in place and only the trigger is missing. */
  | 'forming'
  /** The trigger condition closed. */
  | 'triggered'
  /** A subsequent closed bar held the trigger. */
  | 'confirmed'
  /** Confirmed and still valid. */
  | 'active'
  /** An invalidation condition fired. */
  | 'invalidated'
  /** Ran out of session, or went stale without resolving. */
  | 'expired'
  /** Reached the second technical target. */
  | 'target_met';

/** Terminal states: the setup is over, one way or another. */
export const TERMINAL_STATES: readonly SignalState[] = ['invalidated', 'expired', 'target_met'];

/** True once a signal has actually triggered rather than merely lining up. */
export const LIVE_STATES: readonly SignalState[] = ['triggered', 'confirmed', 'active'];

/** Score bands. Anything below `watch` is not surfaced at all. */
export type SignalQuality = 'exceptional' | 'strong' | 'good' | 'watch';

/**
 * Scoring categories.
 *
 * The confluence model: a setup earns points in each category independently,
 * and a high total is by construction a setup that several unrelated kinds of
 * evidence agree on. One category maxing out cannot carry a signal.
 */
export type ScoreCategory =
  | 'trend'
  | 'priceAction'
  | 'momentum'
  | 'volume'
  | 'vwap'
  | 'marketContext'
  | 'volatility'
  | 'multiTimeframe';

export const SCORE_CATEGORIES: readonly ScoreCategory[] = [
  'trend',
  'priceAction',
  'momentum',
  'volume',
  'vwap',
  'marketContext',
  'volatility',
  'multiTimeframe',
];

/**
 * How the session behaves at this point in the day.
 *
 * Intraday thresholds cannot be constant across the session: 09:20 volume is
 * always "elevated" against a session average, and a breakout at 15:20 has no
 * time left to work. Each regime carries its own multipliers in the config.
 */
export type SessionRegime =
  | 'pre_open'
  | 'opening'
  | 'early'
  | 'mid'
  | 'afternoon'
  | 'closing'
  | 'closed';

/** One piece of evidence, for or against. */
export interface Reason {
  /** Stable machine key, e.g. `vwapReclaimed`. */
  readonly key: string;
  readonly label: string;
  /** The observed value that justifies it, e.g. "1.84× normal volume". */
  readonly detail: string;
  readonly category: ScoreCategory;
  readonly polarity: 'supporting' | 'opposing' | 'context';
}

/**
 * A condition that ends the setup.
 *
 * Stored with the signal rather than recomputed, so an invalidation check is a
 * cheap comparison against a level that was fixed when the signal triggered.
 * Recomputing the rule each cycle would let a drifting level quietly move the
 * stop, which is the same as having no stop.
 */
export type InvalidationRule =
  | { readonly kind: 'price_below'; readonly level: number; readonly label: string }
  | { readonly kind: 'price_above'; readonly level: number; readonly label: string }
  | { readonly kind: 'vwap_lost'; readonly label: string }
  | { readonly kind: 'vwap_reclaimed'; readonly label: string }
  | { readonly kind: 'momentum_reversed'; readonly label: string }
  | { readonly kind: 'session_end'; readonly label: string };

/**
 * Technical price levels for a setup. NOT an order.
 *
 * Every field is a price on a chart, derived from structure and ATR. The
 * engine knows nothing about position size, capital or risk tolerance, and
 * deliberately exposes no field that would imply it does.
 */
export interface TechnicalLevels {
  /** The zone where the setup's premise is still intact, paise. */
  readonly entryLow: number;
  readonly entryHigh: number;
  /** Where the technical premise is wrong, paise. */
  readonly invalidation: number;
  readonly target1: number;
  readonly target2: number;
  /** |entry − invalidation|, paise. */
  readonly risk: number;
  /** |target1 − entry|, paise. */
  readonly reward: number;
  /** reward ÷ risk. A ratio, so a float. Null when risk is zero. */
  readonly riskReward: number | null;
  /**
   * Round-trip transaction cost per share, paise, on the target-1 path.
   *
   * Stored rather than recomputed so the UI can show the user exactly what was
   * deducted, and so a stored signal stays interpretable after the cost
   * configuration changes.
   */
  readonly costPaise: number;
  /** reward − cost. Negative means the target cannot pay for the trade. */
  readonly netReward: number;
  /** risk + cost. Costs are paid on a loser too. */
  readonly netRisk: number;
  /** netReward ÷ netRisk. The only ratio worth filtering on. */
  readonly netRiskReward: number | null;
}

/** Named support/resistance levels found for the session. */
export interface PriceLevel {
  readonly key: string;
  readonly label: string;
  /** Paise. */
  readonly price: number;
  /**
   * How much weight the level carries, 0-1.
   *
   * Previous-day high beats a two-hour-old swing high; both beat a level that
   * price only touched once. Used to decide whether a break is meaningful.
   */
  readonly significance: number;
  readonly kind: 'support' | 'resistance' | 'pivot';
}

/** Multi-timeframe trend read. */
export interface TrendRead {
  /** Timeframe length in minutes. */
  readonly minutes: number;
  readonly direction: TradeDirection | 'flat';
  /** 0-1. Derived from EMA stacking, slope and ADX. */
  readonly strength: number;
  readonly ema9: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly adx: number | null;
  readonly detail: string;
}

/** Everything the engine read, kept so the UI can explain without recomputing. */
export interface IntradaySnapshot {
  /** Close of the last CLOSED bar on the trigger timeframe, paise. */
  readonly price: number;
  readonly lastBarAt: number;
  /** High and low of the last CLOSED trigger bar, paise. Drives MFE/MAE. */
  readonly lastBarHigh: number;
  readonly lastBarLow: number;
  readonly dayOpen: number | null;
  readonly dayHigh: number | null;
  readonly dayLow: number | null;
  readonly previousClose: number | null;
  readonly previousHigh: number | null;
  readonly previousLow: number | null;
  readonly openingRangeHigh: number | null;
  readonly openingRangeLow: number | null;
  readonly vwap: number | null;
  /** Percent, signed. Positive means the session's average price is rising. */
  readonly vwapSlopePercent: number | null;
  /** Percent of price. Signed: positive means above VWAP. */
  readonly vwapDistancePercent: number | null;
  readonly ema9: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly rsi: number | null;
  readonly macdHistogram: number | null;
  readonly adx: number | null;
  readonly plusDi: number | null;
  readonly minusDi: number | null;
  readonly atr: number | null;
  /** ATR as a percent of price. The comparable volatility measure. */
  readonly atrPercent: number | null;
  readonly rocFast: number | null;
  readonly rocSlow: number | null;
  /** Cumulative session volume ÷ the same-minute historical average. */
  readonly relativeVolume: number | null;
  /** This bar's volume ÷ the same-slot historical average. */
  readonly barRelativeVolume: number | null;
  readonly sessionVolume: number;
  /** Signed gap vs previous close, percent. */
  readonly gapPercent: number | null;
  /** Signed session change vs previous close, percent. */
  readonly changePercent: number | null;
  readonly trends: readonly TrendRead[];
  readonly levels: readonly PriceLevel[];
}

/** How much the data can be trusted. A signal never fires on failing data. */
export interface DataQuality {
  /** True when everything below is clean enough to evaluate. */
  readonly usable: boolean;
  readonly barsAvailable: number;
  readonly barsRequired: number;
  /** Minutes between the last closed bar and the evaluation instant. */
  readonly stalenessMinutes: number;
  /** 1m bars missing from the session up to the last bar. */
  readonly missingBars: number;
  /** Bars whose OHLC is internally inconsistent. */
  readonly invalidBars: number;
  readonly issues: readonly string[];
}

/** One scored category of the confluence model. */
export interface ScoreComponent {
  readonly category: ScoreCategory;
  readonly label: string;
  /** 0-1 within the category. */
  readonly score: number;
  /** Maximum points the category can contribute. */
  readonly weight: number;
  /** score × weight. */
  readonly points: number;
  readonly detail: string;
}

/** A strategy's structured verdict on one symbol. */
export interface StrategyEvidence {
  readonly strategy: string;
  readonly kind: SignalKind;
  readonly direction: TradeDirection;
  /**
   * What this setup is anchored to, e.g. `level:previousHigh`.
   *
   * Two evaluations describing the same setup must produce the same anchor —
   * that is what makes deduplication exact rather than heuristic. A breakout
   * of the previous-day high at 10:15 and the same breakout still holding at
   * 10:45 share an anchor and are therefore one signal, not thirty.
   */
  readonly anchor: string;
  /** True when the trigger condition closed on the last CLOSED bar. */
  readonly triggered: boolean;
  /** 0-1: how completely this strategy's own preconditions are met. */
  readonly conviction: number;
  readonly reasons: readonly Reason[];
  readonly invalidations: readonly InvalidationRule[];
  readonly levels: TechnicalLevels | null;
  readonly triggerMinutes: number;
  readonly setupMinutes: number;
  readonly trendMinutes: number;
}

/**
 * How the final score was arrived at, step by step.
 *
 * Stored so the UI can show the whole arithmetic. The category points do not
 * sum to the score — conviction scales the total and the regime applies a flat
 * penalty — and a breakdown whose numbers visibly do not add up is worse than
 * no breakdown at all. Every term is here, so the reader can check it.
 */
export interface ScoreArithmetic {
  /** Sum of every category's points. */
  readonly categoryPoints: number;
  /** Sum of every category's weight. 100 with the default weights. */
  readonly maxPoints: number;
  /** 0-1: how completely the strategy's own preconditions were met. */
  readonly conviction: number;
  /** Points deducted for the session regime. */
  readonly regimePenalty: number;
  /** The published score, 0-100. */
  readonly score: number;
}

/** A scored, surfaceable setup. */
export interface SignalCandidate {
  readonly kind: SignalKind;
  readonly direction: TradeDirection;
  readonly strategy: string;
  /** 0-100. Technical setup strength — NOT a probability of profit. */
  readonly score: number;
  readonly quality: SignalQuality;
  readonly triggered: boolean;
  readonly components: readonly ScoreComponent[];
  /** The full arithmetic behind `score`. */
  readonly scoring: ScoreArithmetic;
  readonly reasons: readonly Reason[];
  readonly invalidations: readonly InvalidationRule[];
  readonly levels: TechnicalLevels;
  readonly triggerMinutes: number;
  readonly setupMinutes: number;
  readonly trendMinutes: number;
  /**
   * A stable identity for the setup, independent of when it was scored.
   *
   * Two evaluations that describe the same setup produce the same key, which
   * is what lets deduplication work without heuristics.
   */
  readonly setupKey: string;
}

/** What the wider market is doing, and how much it supports each direction. */
export interface MarketContext {
  /** Index symbol, e.g. `NIFTY50`. */
  readonly benchmark: string;
  readonly benchmarkTrend: TrendRead | null;
  /** Percent change on the session. */
  readonly benchmarkChangePercent: number | null;
  readonly benchmarkAboveVwap: boolean | null;
  readonly bankNiftyChangePercent: number | null;
  /** Advancing ÷ total across the analysed universe, 0-1. Null when unknown. */
  readonly breadth: number | null;
  /** Mean change% of the symbol's own sector. */
  readonly sectorChangePercent: number | null;
  readonly sector: string | null;
  /** India VIX level, and whether it is rising. */
  readonly volatilityIndex: number | null;
  readonly volatilityRising: boolean | null;
  /** −1 (hostile) … +1 (supportive) for a LONG. Shorts read the inverse. */
  readonly longSupport: number;
  readonly notes: readonly string[];
}

/** The engine's full answer for one symbol at one instant. */
export interface IntradayEvaluation {
  readonly symbol: string;
  /** The evaluation instant, UTC ms. */
  readonly evaluatedAt: number;
  readonly regime: SessionRegime;
  readonly snapshot: IntradaySnapshot;
  readonly dataQuality: DataQuality;
  /** Scored candidates, strongest first. Empty when nothing qualifies. */
  readonly candidates: readonly SignalCandidate[];
  /** Why nothing qualified, when nothing did. */
  readonly rejections: readonly string[];
}

/** Bars for one symbol, at every timeframe the engine needs. */
export interface SymbolBars {
  /** Today's 1m bars, CLOSED only, ascending. */
  readonly minute: readonly Bar[];
  /**
   * Prior sessions' 1m bars, ascending — the indicator warm-up series.
   *
   * Without these, a 15m EMA-20 needs 300 minutes of a 375-minute session and
   * is therefore unusable until nearly the close: the higher-timeframe trend
   * reads "flat" all morning and every trend-aware strategy silently never
   * fires. Real intraday charts are continuous across sessions and so is this.
   *
   * Used ONLY to warm indicators. Everything session-scoped — VWAP, the day's
   * extremes, the opening range, the volume comparison, price structure — is
   * computed from `minute` alone.
   */
  readonly history: readonly Bar[];
  /** Previous sessions' daily bars, ascending. Newest is yesterday. */
  readonly daily: readonly Bar[];
  /**
   * Per-minute-of-session average volume from prior sessions.
   *
   * Index 0 is the 09:15 bar. This is what makes relative volume honest at
   * 09:30 — comparing against a full-day average would call every morning a
   * volume surge and every afternoon a drought.
   */
  readonly volumeProfile: readonly number[];
}
