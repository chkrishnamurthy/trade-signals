import type { PaperBucket, PaperResultsDto } from '@/server/paper-trades';
import type { Tone } from './tone';

/**
 * Display rules for the signal-performance page.
 *
 * Pure functions and label maps, no JSX, so every verdict this page reaches can
 * be unit-tested against a fixture instead of being read off a screenshot.
 *
 * The page has one hard problem: it must be instantly legible to someone who
 * does not know what expectancy is, WITHOUT becoming a promise. Two rules keep
 * those in tension rather than in conflict:
 *
 *  - **No verdict below {@link MIN_TRADES_FOR_VERDICT} trades.** A grade of
 *    "poor" over eleven trades is not a finding, and dressing one up in a red
 *    badge is worse than showing nothing. Under that count every status reads
 *    "Too early", which is itself the most useful thing the page can say.
 *  - **No claimed change smaller than the noise.** `readTrend` refuses to call
 *    a direction unless the two halves differ by {@link TREND_MIN_DELTA_R},
 *    because "improving" is exactly the sentence a user would act on.
 *
 * Wording follows CLAUDE.md: BUY/SELL may label a direction and nothing else.
 * Everything here says "invalidation level", "setup", "signal" — never order,
 * position, quantity or profit.
 */

/** Below this, the page grades nothing and says so. */
export const MIN_TRADES_FOR_VERDICT = 30;

/** Below this, a single bucket is labelled unreliable rather than ranked. */
export const MIN_TRADES_PER_BUCKET = 20;

/** The smallest half-to-half difference worth calling a trend, in R. */
export const TREND_MIN_DELTA_R = 0.15;

/** Expectancy at or above this reads as a real edge. */
export const GOOD_EXPECTANCY_R = 0.15;

/** Expectancy below this reads as losing rather than flat. */
export const POOR_EXPECTANCY_R = -0.05;

/**
 * An average loss worse than this means price ran past the invalidation level.
 *
 * A signal publishes its invalidation level, and 1.0 is what losing at that
 * level costs. Consistently exceeding it is a measurement worth surfacing on
 * its own, because it is invisible in the headline expectancy.
 */
export const LOSS_OVERRUN_R = -1.15;

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type BadgeTone = 'bullish' | 'bearish' | 'neutral' | 'warning' | 'outline' | 'secondary';

export interface StrategyMeta {
  /** The setup family, without its direction. */
  readonly name: string;
  /** Plain-language explanation of what the engine saw. */
  readonly hint: string;
  readonly direction: 'long' | 'short' | null;
}

/**
 * Strategy identifiers as recorded, mapped to something readable.
 *
 * The keys are the hyphenated ids `packages/core` writes into `paper_trades`.
 * An unknown id degrades to a tidied-up version of itself rather than throwing:
 * a new strategy should appear on this page the day it ships, not the day
 * someone remembers to extend a map.
 */
const STRATEGY_META: Record<string, StrategyMeta> = {
  breakout: {
    name: 'Breakout',
    direction: 'long',
    hint: 'Price pushed up through a level that had been capping it, with volume behind the move.',
  },
  breakdown: {
    name: 'Breakdown',
    direction: 'short',
    hint: 'Price broke down through a level that had been holding it up.',
  },
  'vwap-reclaim': {
    name: 'VWAP reclaim',
    direction: 'long',
    hint: "Price climbed back above the day's average traded price and held there.",
  },
  'vwap-breakdown': {
    name: 'VWAP breakdown',
    direction: 'short',
    hint: "Price slipped below the day's average traded price and stayed below.",
  },
  'momentum-long': {
    name: 'Momentum',
    direction: 'long',
    hint: 'Price accelerated upward, with momentum indicators confirming the push.',
  },
  'momentum-short': {
    name: 'Momentum',
    direction: 'short',
    hint: 'Price accelerated downward, with momentum indicators confirming the push.',
  },
  'trend-continuation-long': {
    name: 'Trend continuation',
    direction: 'long',
    hint: 'An established uptrend resumed after pausing, rather than reversing.',
  },
  'trend-continuation-short': {
    name: 'Trend continuation',
    direction: 'short',
    hint: 'An established downtrend resumed after pausing, rather than reversing.',
  },
  'reversal-long': {
    name: 'Reversal',
    direction: 'long',
    hint: 'Price turned up after being stretched too far to the downside.',
  },
  'reversal-short': {
    name: 'Reversal',
    direction: 'short',
    hint: 'Price turned down after being stretched too far to the upside.',
  },
};

export function strategyMeta(id: string): StrategyMeta {
  const known = STRATEGY_META[id];
  if (known !== undefined) return known;
  const words = id.replace(/[-_]/g, ' ').trim();
  return {
    name: words.charAt(0).toUpperCase() + words.slice(1),
    hint: 'A setup family this page does not have a description for yet.',
    direction: null,
  };
}

export interface OutcomeMeta {
  readonly label: string;
  readonly hint: string;
  readonly tone: BadgeTone;
}

/**
 * How a paper trade ended, in words a newcomer can act on.
 *
 * "Invalidation level" is kept — it is the term the rest of the product uses
 * and it is accurate — but the hint says what it means in plain language, so
 * nobody has to already know.
 */
const OUTCOME_META: Record<string, OutcomeMeta> = {
  target1: {
    label: 'Reached its target',
    hint: 'Price travelled all the way to the first target before hitting the invalidation level.',
    tone: 'bullish',
  },
  target2: {
    label: 'Reached second target',
    hint: 'Price ran past the first target and reached the second.',
    tone: 'bullish',
  },
  stop: {
    label: 'Proven wrong',
    hint: 'Price moved against the setup as far as its invalidation level, so the premise was wrong.',
    tone: 'bearish',
  },
  session_close: {
    label: 'Ran out of time',
    hint: 'Neither the target nor the invalidation level was reached before the session ended.',
    tone: 'neutral',
  },
  unresolved: {
    label: 'Still running',
    hint: 'Triggered and still live. Excluded from every statistic on this page — it has no outcome yet.',
    tone: 'outline',
  },
};

export function outcomeMeta(reason: string): OutcomeMeta {
  return (
    OUTCOME_META[reason] ?? {
      label: reason,
      hint: 'An outcome this page does not have a description for yet.',
      tone: 'neutral',
    }
  );
}

/** Session phases, with the clock times they cover. */
const REGIME_META: Record<string, { label: string; hint: string }> = {
  opening: {
    label: 'Opening',
    hint: 'First 30 minutes, 09:15–09:45. The noisiest part of the day.',
  },
  early: { label: 'Morning', hint: '09:45–11:30, once the opening auction has settled.' },
  mid: { label: 'Midday', hint: '11:30–13:30, typically the quietest stretch.' },
  afternoon: { label: 'Afternoon', hint: '13:30–15:00.' },
  closing: {
    label: 'Final half hour',
    hint: '15:00–15:30. Thin and fast; no new signals are raised here.',
  },
  pre_open: { label: 'Pre-open', hint: 'Before 09:15.' },
  closed: { label: 'Closed', hint: 'Outside market hours.' },
};

export function regimeMeta(regime: string): { label: string; hint: string } {
  return REGIME_META[regime] ?? { label: regime, hint: 'A session phase without a description.' };
}

export function directionLabel(direction: string): string {
  if (direction === 'long') return 'BUY signals';
  if (direction === 'short') return 'SELL signals';
  return direction;
}

/**
 * Turns `"60–69 watch"` into `"Watch (60–69)"`.
 *
 * The band name leads because that is what the reader is comparing; the range
 * is the supporting detail, not the identity.
 */
export function scoreBandLabel(raw: string): string {
  const match = /^(\S+)\s+(.*)$/.exec(raw);
  if (match === null) return raw;
  const [, range, name] = match;
  if (range === undefined || name === undefined || name === '') return raw;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${range})`;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export type Grade = 'good' | 'mixed' | 'poor' | 'unknown';

export interface Status {
  readonly grade: Grade;
  /** Two or three words, shown in a badge. */
  readonly label: string;
  readonly tone: BadgeTone;
}

const UNKNOWN: Status = { grade: 'unknown', label: 'Too early', tone: 'outline' };

function graded(grade: Grade, label: string): Status {
  const tone: BadgeTone =
    grade === 'good'
      ? 'bullish'
      : grade === 'poor'
        ? 'bearish'
        : grade === 'mixed'
          ? 'warning'
          : 'outline';
  return { grade, label, tone };
}

/** The headline grade: does the engine make or lose money per signal? */
export function expectancyStatus(expectancyR: number, trades: number): Status {
  if (trades < MIN_TRADES_FOR_VERDICT) return UNKNOWN;
  if (expectancyR >= GOOD_EXPECTANCY_R) return graded('good', 'Profitable');
  if (expectancyR > POOR_EXPECTANCY_R) return graded('mixed', 'Breaking even');
  return graded('poor', 'Losing');
}

/**
 * Win rate against the rate this win/loss geometry actually needs.
 *
 * Judged against breakeven rather than against 50%, because a 33% win rate is
 * excellent on a 3:1 payoff and disastrous on a 1:1 one. The margin of error
 * widens the "too close to call" band, so a lead inside the noise is never
 * reported as clearing the bar.
 */
export function winRateStatus(
  hitRate: number,
  breakevenHitRate: number | null,
  trades: number,
  marginOfErrorPoints: number | null,
): Status {
  if (trades < MIN_TRADES_FOR_VERDICT || breakevenHitRate === null) return UNKNOWN;
  const gapPoints = (hitRate - breakevenHitRate) * 100;
  const noise = marginOfErrorPoints ?? 0;
  if (gapPoints > noise) return graded('good', 'Above breakeven');
  if (gapPoints < -noise) return graded('poor', 'Below breakeven');
  return graded('mixed', 'Too close to call');
}

/** Gross winnings against gross losses. */
export function profitFactorStatus(profitFactor: number | null, trades: number): Status {
  if (trades < MIN_TRADES_FOR_VERDICT || profitFactor === null) return UNKNOWN;
  if (profitFactor >= 1.3) return graded('good', 'Winners dominate');
  if (profitFactor >= 1) return graded('mixed', 'Marginal');
  return graded('poor', 'Losers dominate');
}

/** How much weight the numbers on this page can carry. */
export function sampleStatus(trades: number): Status {
  if (trades === 0) return UNKNOWN;
  if (trades >= 200) return graded('good', 'Solid sample');
  if (trades >= MIN_TRADES_FOR_VERDICT) return graded('mixed', 'Indicative');
  return { grade: 'unknown', label: 'Anecdote', tone: 'warning' };
}

export interface Verdict {
  readonly grade: Grade;
  /** The answer to "how is it doing?", in four words or fewer. */
  readonly headline: string;
  /** One sentence of plain language, no jargon and no R. */
  readonly detail: string;
  readonly tone: Tone;
}

/**
 * The single sentence at the top of the page.
 *
 * Deliberately says "the average signal", not "you would have made": the
 * application does not know the user's capital or whether they took the trade,
 * and the difference is the whole reason this page is allowed to exist.
 */
export function overallVerdict(results: PaperResultsDto): Verdict {
  const { summary } = results;
  const status = expectancyStatus(summary.expectancyR, summary.trades);
  const magnitude = Math.abs(summary.expectancyR).toFixed(2);
  const sessions = `${results.sessions} ${results.sessions === 1 ? 'session' : 'sessions'}`;

  if (summary.trades === 0) {
    return {
      grade: 'unknown',
      headline: 'Nothing graded yet',
      detail:
        'No signal has triggered and been resolved, so there is nothing to measure. An empty page means no data, not poor performance.',
      tone: 'neutral',
    };
  }

  if (status.grade === 'unknown') {
    return {
      grade: 'unknown',
      headline: 'Too early to judge',
      detail: `Only ${summary.trades} ${summary.trades === 1 ? 'signal' : 'signals'} across ${sessions} have been graded — far too few to tell skill from luck. Treat everything below as a preview, and change nothing on the strength of it.`,
      tone: 'neutral',
    };
  }

  if (status.grade === 'good') {
    return {
      grade: 'good',
      headline: 'Making money',
      detail: `Over ${summary.trades} graded signals the average one gained about ${magnitude} times the amount it risked, after transaction costs. That is a real edge on this sample.`,
      tone: 'bullish',
    };
  }

  if (status.grade === 'mixed') {
    return {
      grade: 'mixed',
      headline: 'Roughly breaking even',
      detail: `Over ${summary.trades} graded signals the average result is within a rounding error of zero after costs. The engine is neither earning nor destroying value at the moment.`,
      tone: 'neutral',
    };
  }

  return {
    grade: 'poor',
    headline: 'Losing money',
    detail: `Over ${summary.trades} graded signals across ${sessions} the average one lost about ${magnitude} times the amount it risked, after transaction costs. Every strategy would need to improve, or the setup geometry change, before this is worth acting on.`,
    tone: 'bearish',
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface RankedBucket {
  readonly label: string;
  readonly trades: number;
  readonly hitRate: number;
  readonly expectancyR: number;
  readonly profitFactor: number | null;
  readonly tone: Tone;
  /** False when the bucket is too thin to draw a conclusion from. */
  readonly reliable: boolean;
  /** 0–1, for a comparison bar. Relative to the largest magnitude in the set. */
  readonly share: number;
}

function rank(buckets: readonly PaperBucket[]): RankedBucket[] {
  const widest = Math.max(...buckets.map((entry) => Math.abs(entry.expectancyR)), 0.0001);
  return buckets.map((entry) => ({
    ...entry,
    tone: entry.expectancyR > 0 ? 'bullish' : entry.expectancyR < 0 ? 'bearish' : 'neutral',
    reliable: entry.trades >= MIN_TRADES_PER_BUCKET,
    share: Math.min(1, Math.abs(entry.expectancyR) / widest),
  }));
}

/** Every bucket, best first, with bar widths on a shared scale. */
export function rankBest(buckets: readonly PaperBucket[]): RankedBucket[] {
  return rank(buckets).sort((a, b) => b.expectancyR - a.expectancyR);
}

/**
 * Splits a set into what is working and what is not.
 *
 * Thin buckets are kept in the listing but flagged, not silently dropped: a
 * strategy with four trades is not evidence, and hiding it would also hide the
 * fact that it has barely fired.
 */
export function splitByOutcome(buckets: readonly PaperBucket[]): {
  readonly working: RankedBucket[];
  readonly failing: RankedBucket[];
} {
  const ranked = rankBest(buckets);
  return {
    working: ranked.filter((entry) => entry.expectancyR > 0),
    failing: ranked.filter((entry) => entry.expectancyR <= 0).reverse(),
  };
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface Trend {
  readonly direction: 'improving' | 'declining' | 'flat' | 'unknown';
  readonly recentR: number | null;
  readonly earlierR: number | null;
  readonly recentSessions: number;
  readonly earlierSessions: number;
  /** Plain sentence, safe to render as-is. */
  readonly detail: string;
}

const FLAT: Trend = {
  direction: 'unknown',
  recentR: null,
  earlierR: null,
  recentSessions: 0,
  earlierSessions: 0,
  detail: 'Not enough sessions yet to say whether results are improving or getting worse.',
};

/** Trade-weighted mean expectancy over a set of session buckets. */
function weightedExpectancy(buckets: readonly PaperBucket[]): number | null {
  const trades = buckets.reduce((sum, entry) => sum + entry.trades, 0);
  if (trades === 0) return null;
  const total = buckets.reduce((sum, entry) => sum + entry.expectancyR * entry.trades, 0);
  return total / trades;
}

/**
 * Recent sessions against the ones before them.
 *
 * Trade-weighted, so a session with one signal in it cannot swing the reading
 * as hard as a session with twenty. Refuses to name a direction unless the two
 * halves differ by more than {@link TREND_MIN_DELTA_R} — the page must not tell
 * anyone things are improving on the strength of noise.
 */
export function readTrend(bySession: readonly PaperBucket[]): Trend {
  if (bySession.length < 6) return FLAT;

  const half = Math.floor(bySession.length / 2);
  const earlier = bySession.slice(0, bySession.length - half);
  const recent = bySession.slice(bySession.length - half);

  const recentR = weightedExpectancy(recent);
  const earlierR = weightedExpectancy(earlier);
  if (recentR === null || earlierR === null) return FLAT;

  const delta = recentR - earlierR;
  const shape = {
    recentR,
    earlierR,
    recentSessions: recent.length,
    earlierSessions: earlier.length,
  };
  const move = Math.abs(delta).toFixed(2);

  if (delta > TREND_MIN_DELTA_R) {
    return {
      ...shape,
      direction: 'improving',
      detail: `The last ${recent.length} sessions are running ${move}R per signal better than the ${earlier.length} before them.`,
    };
  }
  if (delta < -TREND_MIN_DELTA_R) {
    return {
      ...shape,
      direction: 'declining',
      detail: `The last ${recent.length} sessions are running ${move}R per signal worse than the ${earlier.length} before them.`,
    };
  }
  return {
    ...shape,
    direction: 'flat',
    detail: `The last ${recent.length} sessions are within ${TREND_MIN_DELTA_R}R per signal of the ${earlier.length} before them — no real change.`,
  };
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: 'high' | 'medium' | 'info';
}

/**
 * What a reader should look at first, in severity order.
 *
 * This is the page's answer to "is anything wrong?". It is derived, never
 * hand-maintained, and each item names the measurement behind it so nobody has
 * to trust the label alone.
 */
export function attentionItems(results: PaperResultsDto): AttentionItem[] {
  const { summary, marginOfErrorPoints } = results;
  const items: AttentionItem[] = [];
  if (summary.trades === 0) return items;

  if (summary.trades < MIN_TRADES_FOR_VERDICT) {
    items.push({
      id: 'sample',
      severity: 'high',
      title: `Only ${summary.trades} graded ${summary.trades === 1 ? 'signal' : 'signals'}`,
      detail: `Nothing on this page is conclusive below about ${MIN_TRADES_FOR_VERDICT}. The fastest way to make it useful is more triggered signals, not a change to the configuration.`,
    });
  }

  if (
    summary.breakevenHitRate !== null &&
    summary.hitRate < summary.breakevenHitRate &&
    summary.trades >= MIN_TRADES_FOR_VERDICT
  ) {
    const gap = ((summary.breakevenHitRate - summary.hitRate) * 100).toFixed(1);
    const noise =
      marginOfErrorPoints === null
        ? ''
        : ` The margin of error here is ±${marginOfErrorPoints.toFixed(0)} points.`;
    items.push({
      id: 'breakeven',
      severity: 'high',
      title: `Win rate is ${gap} points short of breakeven`,
      detail: `With the current sizes of wins and losses, ${(summary.breakevenHitRate * 100).toFixed(1)}% of signals need to work just to cover costs. ${(summary.hitRate * 100).toFixed(1)}% do.${noise}`,
    });
  }

  if (summary.averageLossR < LOSS_OVERRUN_R && summary.losses >= MIN_TRADES_PER_BUCKET) {
    items.push({
      id: 'loss-overrun',
      severity: 'high',
      title: 'Losses are running past the invalidation level',
      detail: `A signal that fails at its published invalidation level costs 1.00 times the risk it named. The average loss here is ${Math.abs(summary.averageLossR).toFixed(2)} times, so price is travelling well beyond that level before the exit is recorded.`,
    });
  }

  const failing = splitByOutcome(results.byStrategy).failing.filter(
    (entry) => entry.reliable && entry.expectancyR <= -0.2,
  );
  if (failing.length > 0) {
    const named = failing
      .slice(0, 3)
      .map(
        (entry) =>
          `${strategyMeta(entry.label).name} (${entry.expectancyR.toFixed(2)}R over ${entry.trades})`,
      )
      .join(', ');
    items.push({
      id: 'failing-strategies',
      severity: 'medium',
      title: `${failing.length} ${failing.length === 1 ? 'setup type is' : 'setup types are'} losing consistently`,
      detail: `On enough trades to mean something: ${named}. These are the buckets to examine before any others.`,
    });
  }

  if (results.open > 0) {
    items.push({
      id: 'open',
      severity: 'info',
      title: `${results.open} ${results.open === 1 ? 'signal is' : 'signals are'} still running`,
      detail:
        'Shown in the table below but excluded from every statistic on this page. A signal with no outcome cannot be counted as a win or a loss.',
    });
  }

  return items;
}
