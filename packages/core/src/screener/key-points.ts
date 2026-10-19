/**
 * "What stands out" — the stock page's computed key points
 * (docs/planning/stock-header-redesign-plan.md §5.6).
 *
 * Deterministic rules over one stored snapshot row. Each point states a fact
 * and the number behind it, names the metric that is its evidence and the tab
 * that shows it, and carries a fixed salience so the order never depends on
 * anything but the values. No point predicts, recommends or judges value
 * (CLAUDE.md wording rules; enforced by a test over every template).
 */

import { formatPaise } from '@equitywise/shared';

export type KeyPointTone = 'bullish' | 'bearish' | 'neutral' | 'info' | 'warning';
export type KeyPointTab = 'technicals' | 'delivery' | 'fno' | 'ownership' | 'events';

export interface KeyPoint {
  readonly id: string;
  readonly text: string;
  readonly tone: KeyPointTone;
  /** The evidence: a catalogue key (or snapshot field) the text is computed from. */
  readonly metric: string;
  readonly tab: KeyPointTab;
  readonly salience: number;
}

export const KEY_POINT_LIMIT = 6;

type Values = Readonly<Record<string, unknown>>;

function num(values: Values, key: string): number | null {
  const v = values[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pct(value: number, decimals = 1): string {
  return `${Math.abs(value).toFixed(decimals)}%`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ago(sessions: number): string {
  return sessions === 0 ? 'today' : `${plural(sessions, 'session', 'sessions')} ago`;
}

const BUILDUP_LABELS: Readonly<Record<string, [string, KeyPointTone]>> = {
  long_buildup: ['Long build-up', 'bullish'],
  short_covering: ['Short covering', 'bullish'],
  short_buildup: ['Short build-up', 'bearish'],
  long_unwinding: ['Long unwinding', 'bearish'],
};

/**
 * The points for one snapshot row, most salient first, at most `limit`.
 * An empty row (no snapshot) gives no points.
 */
export function keyPoints(values: Values | null, limit: number = KEY_POINT_LIMIT): KeyPoint[] {
  if (values === null) return [];
  const out: KeyPoint[] = [];
  const add = (p: KeyPoint) => out.push(p);

  if (typeof values.dataIssue === 'string' && values.dataIssue !== '') {
    add({
      id: 'data-issue',
      text: 'The stored history has an overnight jump with no recorded split or bonus; history-based readings are withheld.',
      tone: 'warning',
      metric: 'dataIssue',
      tab: 'technicals',
      salience: 99,
    });
  }

  // Position in the 52-week range: one point, the most specific that applies.
  const high = num(values, 'high52w');
  const low = num(values, 'low52w');
  const fromHigh = num(values, 'dist52wHigh');
  const fromLow = num(values, 'dist52wLow');
  if (values.breakout52w === true) {
    add({
      id: 'range-52w',
      text: 'Closed above its previous 52-week high.',
      tone: 'bullish',
      metric: 'breakout52w',
      tab: 'technicals',
      salience: 100,
    });
  } else if (values.breakdown52w === true) {
    add({
      id: 'range-52w',
      text: 'Closed below its previous 52-week low.',
      tone: 'bearish',
      metric: 'breakdown52w',
      tab: 'technicals',
      salience: 100,
    });
  } else if (fromHigh !== null && fromHigh >= -3) {
    add({
      id: 'range-52w',
      text: `Within ${pct(fromHigh)} of its 52-week high${high === null ? '' : ` of ${formatPaise(high)}`}.`,
      tone: 'bullish',
      metric: 'dist52wHigh',
      tab: 'technicals',
      salience: 80,
    });
  } else if (fromLow !== null && fromLow <= 3) {
    add({
      id: 'range-52w',
      text: `Within ${pct(fromLow)} of its 52-week low${low === null ? '' : ` of ${formatPaise(low)}`}.`,
      tone: 'bearish',
      metric: 'dist52wLow',
      tab: 'technicals',
      salience: 75,
    });
  } else if (fromHigh !== null && fromHigh <= -25) {
    add({
      id: 'range-52w',
      text: `${pct(fromHigh)} below its 52-week high${high === null ? '' : ` of ${formatPaise(high)}`}.`,
      tone: 'bearish',
      metric: 'dist52wHigh',
      tab: 'technicals',
      salience: 60,
    });
  }

  const golden = num(values, 'goldenCrossDays');
  const death = num(values, 'deathCrossDays');
  if (golden !== null && golden <= 5) {
    add({
      id: 'cross',
      text: `EMA 50 crossed above EMA 200 ${ago(golden)}.`,
      tone: 'bullish',
      metric: 'goldenCrossDays',
      tab: 'technicals',
      salience: 72,
    });
  } else if (death !== null && death <= 5) {
    add({
      id: 'cross',
      text: `EMA 50 crossed below EMA 200 ${ago(death)}.`,
      tone: 'bearish',
      metric: 'deathCrossDays',
      tab: 'technicals',
      salience: 72,
    });
  }

  const delivery = num(values, 'deliveryPct');
  const deliveryAvg = num(values, 'avgDelivery20');
  const deliveryRatio = num(values, 'deliveryRatio');
  if (delivery !== null && deliveryAvg !== null && deliveryRatio !== null && deliveryRatio >= 1.5) {
    add({
      id: 'delivery',
      text: `Delivery ${pct(delivery, 0)} of traded quantity, against a 20-session average of ${pct(deliveryAvg, 0)}.`,
      tone: 'info',
      metric: 'deliveryRatio',
      tab: 'delivery',
      salience: 70,
    });
  }

  const relVolume = num(values, 'relVolume');
  if (relVolume !== null && relVolume >= 2) {
    add({
      id: 'volume',
      text: `Volume ${relVolume.toFixed(1)}× its 20-session average.`,
      tone: 'info',
      metric: 'relVolume',
      tab: 'technicals',
      salience: 65,
    });
  }

  const results = num(values, 'resultsInDays');
  if (results !== null && results <= 14) {
    add({
      id: 'results',
      text:
        results === 0
          ? 'Board meeting to consider results today.'
          : `Board meeting to consider results in ${plural(results, 'day', 'days')}.`,
      tone: 'info',
      metric: 'resultsInDays',
      tab: 'events',
      salience: 62,
    });
  }

  const promoterChg = num(values, 'promoterChgQoq');
  if (promoterChg !== null && Math.abs(promoterChg) >= 0.5) {
    add({
      id: 'promoter',
      text: `Promoter holding ${promoterChg > 0 ? 'up' : 'down'} ${Math.abs(promoterChg).toFixed(2)} pp from the previous quarter.`,
      tone: promoterChg > 0 ? 'bullish' : 'bearish',
      metric: 'promoterChgQoq',
      tab: 'ownership',
      salience: 58,
    });
  }

  const rsRank = num(values, 'rsRank');
  const rs3m = num(values, 'rs3m');
  if (rsRank !== null && rs3m !== null && (rsRank >= 80 || rsRank <= 20)) {
    const ahead = rs3m >= 0;
    add({
      id: 'relative-strength',
      text: `${ahead ? 'Outperformed' : 'Trailed'} the Nifty 50 by ${Math.abs(rs3m).toFixed(1)} pp over 3 months; RS rank ${Math.round(rsRank)} of 100.`,
      tone: rsRank >= 80 ? 'bullish' : 'bearish',
      metric: 'rsRank',
      tab: 'technicals',
      salience: 55,
    });
  }

  const buildup = values.oiBuildup;
  const streak = num(values, 'oiBuildupStreak');
  if (typeof buildup === 'string' && streak !== null && streak >= 2) {
    const entry = BUILDUP_LABELS[buildup];
    if (entry !== undefined) {
      add({
        id: 'oi',
        text: `${entry[0]} in stock futures for ${plural(streak, 'session', 'sessions')} running.`,
        tone: entry[1],
        metric: 'oiBuildup',
        tab: 'fno',
        salience: 52,
      });
    }
  }

  const flip = num(values, 'supertrendFlipDays');
  if (flip !== null && flip <= 3 && typeof values.supertrendDir === 'string') {
    const up = values.supertrendDir === 'up';
    add({
      id: 'supertrend',
      text: `Supertrend (10, 3) turned ${up ? 'up' : 'down'} ${ago(flip)}.`,
      tone: up ? 'bullish' : 'bearish',
      metric: 'supertrendFlipDays',
      tab: 'technicals',
      salience: 50,
    });
  }

  const exDate = num(values, 'exDateInDays');
  if (exDate !== null && exDate <= 14) {
    add({
      id: 'ex-date',
      text: exDate === 0 ? 'Ex-date today.' : `Ex-date in ${plural(exDate, 'day', 'days')}.`,
      tone: 'info',
      metric: 'exDateInDays',
      tab: 'events',
      salience: 48,
    });
  }

  if (values.bbSqueeze === true) {
    add({
      id: 'squeeze',
      text: 'Bollinger band width is at its narrowest of the last 126 sessions.',
      tone: 'neutral',
      metric: 'bbSqueeze',
      tab: 'technicals',
      salience: 45,
    });
  }

  const rsi = num(values, 'rsi14');
  if (rsi !== null && (rsi >= 70 || rsi <= 30)) {
    add({
      id: 'rsi',
      text: `RSI (14) at ${rsi.toFixed(0)}, ${rsi >= 70 ? 'above 70' : 'below 30'}.`,
      tone: 'neutral',
      metric: 'rsi14',
      tab: 'technicals',
      salience: 44,
    });
  }

  const deals = (num(values, 'bulkDeals20d') ?? 0) + (num(values, 'blockDeals20d') ?? 0);
  if (deals > 0) {
    add({
      id: 'deals',
      text: `${plural(deals, 'bulk or block deal', 'bulk and block deals')} reported in the last 4 weeks.`,
      tone: 'info',
      metric: 'bulkDeals20d',
      tab: 'delivery',
      salience: 40,
    });
  }

  const dividend = num(values, 'dividendTtm');
  const dividendYield = num(values, 'dividendYield');
  if (dividend !== null && dividend > 0 && dividendYield !== null) {
    add({
      id: 'dividend',
      text: `${formatPaise(dividend)} a share in dividends over the last 12 months, ${dividendYield.toFixed(2)}% of the close.`,
      tone: 'info',
      metric: 'dividendYield',
      tab: 'events',
      salience: 35,
    });
  }

  const listed = num(values, 'listedDays');
  if (listed !== null && listed < 365) {
    add({
      id: 'listing',
      text: `Listed ${plural(listed, 'day', 'days')} ago; readings that need a year of history are not available yet.`,
      tone: 'info',
      metric: 'listedDays',
      tab: 'events',
      salience: 30,
    });
  }

  return out.sort((a, b) => b.salience - a.salience).slice(0, limit);
}
