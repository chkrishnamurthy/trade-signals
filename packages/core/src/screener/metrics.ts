import { adx } from '../indicators/adx.js';
import { atr } from '../indicators/atr.js';
import { bollinger } from '../indicators/bollinger.js';
import { macd } from '../indicators/macd.js';
import { ema, sma } from '../indicators/moving-average.js';
import { roc } from '../indicators/roc.js';
import { rsi } from '../indicators/rsi.js';
import { stochastic } from '../indicators/stochastic.js';
import { supertrend } from '../indicators/supertrend.js';
import type { Bar, Series } from '../types.js';

/**
 * Per-stock technical metrics for one CLOSED session — the price half of a
 * screener snapshot row (docs/planning/screener-dhan-fyers-plan.md §4).
 *
 * Input contract: `bars` are closed daily bars, oldest first, already
 * split/bonus adjusted on read, and the LAST bar is the session being
 * screened. Nothing here reads past that bar, so a metric for session `i` is
 * identical whether or not later bars exist (closed-candle rule; a test pins
 * it by truncation).
 *
 * Every metric that needs more history than exists is null — never 0, never a
 * value computed off a half-warmed indicator. A series with an unexplained
 * overnight jump (an unrecorded split, most likely) returns only the
 * single-session fields and `dataIssue`, because every multi-session number
 * would otherwise describe a crash that never happened.
 */

export type EmaStack = 'bullish' | 'bearish' | 'mixed';

export interface TechnicalMetrics {
  readonly close: number;
  readonly changePct: number | null;
  readonly gapPct: number | null;
  readonly ret1w: number | null;
  readonly ret1m: number | null;
  readonly ret3m: number | null;
  readonly ret6m: number | null;
  readonly ret1y: number | null;
  readonly retYtd: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
  readonly dist52wHigh: number | null;
  readonly dist52wLow: number | null;
  readonly historyHigh: number | null;
  readonly distAth: number | null;
  readonly rangePosDay: number | null;

  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly sma50: number | null;
  readonly sma200: number | null;
  readonly closeVsEma20: number | null;
  readonly closeVsEma50: number | null;
  readonly closeVsEma200: number | null;
  readonly closeVsSma50: number | null;
  readonly closeVsSma200: number | null;
  readonly emaStack: EmaStack | null;
  readonly goldenCrossDays: number | null;
  readonly deathCrossDays: number | null;
  readonly supertrendDir: 'up' | 'down' | null;
  readonly supertrendValue: number | null;
  readonly supertrendFlipDays: number | null;
  readonly adx14: number | null;
  readonly plusDi: number | null;
  readonly minusDi: number | null;
  readonly higherHighs: boolean | null;

  readonly rsi14: number | null;
  readonly rsiAbove50Days: number | null;
  readonly rsiAbove60Days: number | null;
  readonly rsiBelow40Days: number | null;
  readonly macdLine: number | null;
  readonly macdSignal: number | null;
  readonly macdHist: number | null;
  readonly macdHistRising: boolean | null;
  readonly macdCrossUpDays: number | null;
  readonly macdCrossDownDays: number | null;
  readonly stochK: number | null;
  readonly stochD: number | null;
  readonly roc20: number | null;

  readonly atr14: number | null;
  readonly atrPct: number | null;
  readonly bbWidth: number | null;
  readonly bbSqueeze: boolean | null;
  readonly range10Pct: number | null;
  readonly range20Pct: number | null;
  readonly volatility20: number | null;
  readonly nr4: boolean | null;
  readonly nr7: boolean | null;

  readonly high20d: number | null;
  readonly low20d: number | null;
  readonly breakout20d: boolean | null;
  readonly breakdown20d: boolean | null;
  readonly breakout52w: boolean | null;
  readonly breakdown52w: boolean | null;
  readonly insideBar: boolean | null;
  readonly outsideBar: boolean | null;
  readonly bullishEngulfing: boolean | null;
  readonly bearishEngulfing: boolean | null;
  readonly hammer: boolean | null;
  readonly shootingStar: boolean | null;
  readonly doji: boolean | null;

  readonly rs1m: number | null;
  readonly rs3m: number | null;
  readonly rs6m: number | null;
  readonly rsNewHigh: boolean | null;

  readonly volume: number;
  readonly avgVolume20: number | null;
  readonly relVolume: number | null;
  readonly avgTurnover20: number | null;

  /** Last 60 closes, paise, oldest first — the results-table sparkline. */
  readonly spark: readonly number[];
  readonly dataIssue: 'unadjusted_gap' | null;
}

/** Sessions per period. A "month" is 21 sessions, a year 252. */
export const SESSIONS = { w1: 5, m1: 21, m3: 63, m6: 126, y1: 252 } as const;

/** Windows for "crossed within N sessions" metrics. */
const CROSS_WINDOW = { ema: 20, oscillator: 10 } as const;

/** An overnight move this large with no recorded corporate action is treated as bad data. */
export const GAP_GUARD_RATIO = 0.6;

const SPARK_LENGTH = 60;

export function computeTechnicalMetrics(
  bars: readonly Bar[],
  benchmark: readonly Bar[] | null = null,
): TechnicalMetrics | null {
  const n = bars.length;
  const last = bars[n - 1];
  if (last === undefined) return null;
  const prev = bars[n - 2];

  const closes = bars.map((b) => b.close);
  const spark = closes.slice(-SPARK_LENGTH);

  const dataIssue = findUnexplainedGap(bars) === null ? null : 'unadjusted_gap';
  if (dataIssue !== null) return singleSessionOnly(last, spark);

  const ema20s = ema(closes, 20);
  const ema50s = ema(closes, 50);
  const ema200s = ema(closes, 200);
  const sma50s = sma(closes, 50);
  const sma200s = sma(closes, 200);
  const rsis = rsi(closes, 14);
  const macdResult = macd(closes);
  const stoch = stochastic(bars, 14, 3);
  const st = supertrend(bars, 10, 3);
  const adxResult = adx(bars, 14);
  const atrs = atr(bars, 14);
  const bb = bollinger(closes, 20, 2);

  const ema20 = valueAt(ema20s, n - 1);
  const ema50 = valueAt(ema50s, n - 1);
  const ema200 = valueAt(ema200s, n - 1);
  const atr14 = valueAt(atrs, n - 1);
  const hist = valueAt(macdResult.histogram, n - 1);
  const histPrev = valueAt(macdResult.histogram, n - 2);
  const stDir = st.direction[n - 1] ?? null;

  const year = bars.slice(-SESSIONS.y1);
  const high52w = n >= 2 ? Math.max(...year.map((b) => b.high)) : null;
  const low52w = n >= 2 ? Math.min(...year.map((b) => b.low)) : null;
  const historyHigh = Math.max(...bars.map((b) => b.high));

  const prior20 = bars.slice(-21, -1);
  const prior52w = bars.slice(-SESSIONS.y1, -1);
  const high20d = prior20.length === 20 ? Math.max(...prior20.map((b) => b.high)) : null;
  const low20d = prior20.length === 20 ? Math.min(...prior20.map((b) => b.low)) : null;
  const fullYearPrior = prior52w.length === SESSIONS.y1 - 1;

  const priorVolumes = bars.slice(-21, -1).map((b) => b.volume);
  const avgVolume20 = priorVolumes.length >= 10 ? mean(priorVolumes) : null;
  const priorTurnover = bars.slice(-21, -1).map((b) => b.close * b.volume);
  const avgTurnover20 = priorTurnover.length >= 10 ? Math.round(mean(priorTurnover)) : null;

  const widths = bb.width;
  const width = valueAt(widths, n - 1);

  return {
    close: last.close,
    changePct: prev === undefined ? null : pct(last.close, prev.close),
    gapPct: prev === undefined ? null : pct(last.open, prev.close),
    ret1w: returnOver(closes, SESSIONS.w1),
    ret1m: returnOver(closes, SESSIONS.m1),
    ret3m: returnOver(closes, SESSIONS.m3),
    ret6m: returnOver(closes, SESSIONS.m6),
    ret1y: returnOver(closes, SESSIONS.y1),
    retYtd: returnYtd(bars),
    high52w,
    low52w,
    dist52wHigh: high52w === null ? null : pct(last.close, high52w),
    dist52wLow: low52w === null ? null : pct(last.close, low52w),
    historyHigh,
    distAth: pct(last.close, historyHigh),
    rangePosDay:
      last.high > last.low ? ((last.close - last.low) / (last.high - last.low)) * 100 : null,

    ema20,
    ema50,
    ema200,
    sma50: valueAt(sma50s, n - 1),
    sma200: valueAt(sma200s, n - 1),
    closeVsEma20: ema20 === null ? null : pct(last.close, ema20),
    closeVsEma50: ema50 === null ? null : pct(last.close, ema50),
    closeVsEma200: ema200 === null ? null : pct(last.close, ema200),
    closeVsSma50: maybePct(last.close, valueAt(sma50s, n - 1)),
    closeVsSma200: maybePct(last.close, valueAt(sma200s, n - 1)),
    emaStack: emaStack(last.close, ema20, ema50, ema200),
    goldenCrossDays: crossDays(ema50s, ema200s, 'up', CROSS_WINDOW.ema),
    deathCrossDays: crossDays(ema50s, ema200s, 'down', CROSS_WINDOW.ema),
    supertrendDir: stDir === null ? null : stDir === 1 ? 'up' : 'down',
    supertrendValue: valueAt(st.value, n - 1),
    supertrendFlipDays: flipDays(st.direction, CROSS_WINDOW.ema),
    adx14: valueAt(adxResult.adx, n - 1),
    plusDi: valueAt(adxResult.plusDi, n - 1),
    minusDi: valueAt(adxResult.minusDi, n - 1),
    higherHighs: higherHighsAndLows(bars),

    rsi14: valueAt(rsis, n - 1),
    rsiAbove50Days: thresholdCrossDays(rsis, 50, 'up', CROSS_WINDOW.oscillator),
    rsiAbove60Days: thresholdCrossDays(rsis, 60, 'up', CROSS_WINDOW.oscillator),
    rsiBelow40Days: thresholdCrossDays(rsis, 40, 'down', CROSS_WINDOW.oscillator),
    macdLine: valueAt(macdResult.macd, n - 1),
    macdSignal: valueAt(macdResult.signal, n - 1),
    macdHist: hist,
    macdHistRising: hist === null || histPrev === null ? null : hist > histPrev,
    macdCrossUpDays: crossDays(macdResult.macd, macdResult.signal, 'up', CROSS_WINDOW.oscillator),
    macdCrossDownDays: crossDays(
      macdResult.macd,
      macdResult.signal,
      'down',
      CROSS_WINDOW.oscillator,
    ),
    stochK: valueAt(stoch.k, n - 1),
    stochD: valueAt(stoch.d, n - 1),
    roc20: valueAt(roc(closes, 20), n - 1),

    atr14,
    atrPct: atr14 === null ? null : (atr14 / last.close) * 100,
    bbWidth: width,
    bbSqueeze: squeeze(widths, 126),
    range10Pct: rangePct(bars, 10),
    range20Pct: rangePct(bars, 20),
    volatility20: annualisedVolatility(closes, 20),
    nr4: narrowestRange(bars, 4),
    nr7: narrowestRange(bars, 7),

    high20d,
    low20d,
    breakout20d: high20d === null ? null : last.close > high20d,
    breakdown20d: low20d === null ? null : last.close < low20d,
    breakout52w: fullYearPrior ? last.close > Math.max(...prior52w.map((b) => b.high)) : null,
    breakdown52w: fullYearPrior ? last.close < Math.min(...prior52w.map((b) => b.low)) : null,
    ...candlePatterns(last, prev),

    ...relativeStrength(bars, benchmark),

    volume: last.volume,
    avgVolume20: avgVolume20 === null ? null : Math.round(avgVolume20),
    relVolume: avgVolume20 === null || avgVolume20 === 0 ? null : last.volume / avgVolume20,
    avgTurnover20,

    spark,
    dataIssue: null,
  };
}

// ---------------------------------------------------------------------------
// Building blocks — exported for direct tests
// ---------------------------------------------------------------------------

/** (a ÷ b − 1) × 100, or null when b is zero. */
export function pct(a: number, b: number): number | null {
  return b === 0 ? null : (a / b - 1) * 100;
}

function maybePct(a: number, b: number | null): number | null {
  return b === null ? null : pct(a, b);
}

function valueAt(series: Series, index: number): number | null {
  if (index < 0) return null;
  const value = series[index];
  return value === undefined ? null : value;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Return over `sessions` sessions; null without enough history. */
export function returnOver(closes: readonly number[], sessions: number): number | null {
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - sessions];
  if (now === undefined || then === undefined) return null;
  return pct(now, then);
}

/** Return since the last close of the previous calendar year (bars are stamped at UTC midnight). */
export function returnYtd(bars: readonly Bar[]): number | null {
  const last = bars[bars.length - 1];
  if (last === undefined) return null;
  const year = new Date(last.timestamp).getUTCFullYear();
  for (let i = bars.length - 2; i >= 0; i -= 1) {
    const bar = bars[i];
    if (bar === undefined) continue;
    if (new Date(bar.timestamp).getUTCFullYear() < year) return pct(last.close, bar.close);
  }
  return null;
}

export function emaStack(
  close: number,
  e20: number | null,
  e50: number | null,
  e200: number | null,
): EmaStack | null {
  if (e20 === null || e50 === null || e200 === null) return null;
  if (close > e20 && e20 > e50 && e50 > e200) return 'bullish';
  if (close < e20 && e20 < e50 && e50 < e200) return 'bearish';
  return 'mixed';
}

/**
 * Sessions since series `a` crossed `b` in `direction`, if that happened within
 * `window` sessions AND the crossed state still holds today. 0 = crossed today.
 * A cross that has already reversed is not reported: "crossed above within 3
 * sessions" should not match a stock now back below.
 */
export function crossDays(
  a: Series,
  b: Series,
  direction: 'up' | 'down',
  window: number,
): number | null {
  const n = a.length;
  const above = (i: number): boolean | null => {
    const x = valueAt(a, i);
    const y = valueAt(b, i);
    return x === null || y === null ? null : x > y;
  };
  const holds = above(n - 1);
  if (holds === null || holds !== (direction === 'up')) return null;
  for (let i = n - 1; i >= Math.max(1, n - window); i -= 1) {
    const now = above(i);
    const before = above(i - 1);
    if (now === null || before === null) return null;
    if (direction === 'up' && now && !before) return n - 1 - i;
    if (direction === 'down' && !now && before) return n - 1 - i;
  }
  return null;
}

/** {@link crossDays} against a constant level (RSI 50/60/40). */
export function thresholdCrossDays(
  series: Series,
  level: number,
  direction: 'up' | 'down',
  window: number,
): number | null {
  const flat: Series = series.map((v) => (v === null ? null : level));
  return crossDays(series, flat, direction, window);
}

/** Sessions since a ±1 direction series last changed, within `window`. */
export function flipDays(direction: readonly (1 | -1 | null)[], window: number): number | null {
  const n = direction.length;
  for (let i = n - 1; i >= Math.max(1, n - window); i -= 1) {
    const now = direction[i];
    const before = direction[i - 1];
    if (now === null || now === undefined || before === null || before === undefined) return null;
    if (now !== before) return n - 1 - i;
  }
  return null;
}

/** Last 10 sessions made a higher high AND a higher low than the 10 before. */
export function higherHighsAndLows(bars: readonly Bar[]): boolean | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-10);
  const before = bars.slice(-20, -10);
  return (
    Math.max(...recent.map((b) => b.high)) > Math.max(...before.map((b) => b.high)) &&
    Math.min(...recent.map((b) => b.low)) > Math.min(...before.map((b) => b.low))
  );
}

/** Band width at its narrowest of the last `window` defined values. */
export function squeeze(widths: Series, window: number): boolean | null {
  const defined = widths.slice(-window).filter((w): w is number => w !== null);
  const today = widths[widths.length - 1];
  if (today === null || today === undefined || defined.length < window) return null;
  return today <= Math.min(...defined);
}

/** (Highest high − lowest low) of the last `sessions` bars as a % of the lowest low. */
export function rangePct(bars: readonly Bar[], sessions: number): number | null {
  if (bars.length < sessions) return null;
  const window = bars.slice(-sessions);
  const hi = Math.max(...window.map((b) => b.high));
  const lo = Math.min(...window.map((b) => b.low));
  return lo === 0 ? null : ((hi - lo) / lo) * 100;
}

/** Sample σ of daily log returns over `sessions`, annualised (×√252), as a percentage. */
export function annualisedVolatility(closes: readonly number[], sessions: number): number | null {
  if (closes.length < sessions + 1) return null;
  const window = closes.slice(-(sessions + 1));
  const logs: number[] = [];
  for (let i = 1; i < window.length; i += 1) {
    const a = window[i - 1];
    const b = window[i];
    if (a === undefined || b === undefined || a <= 0 || b <= 0) return null;
    logs.push(Math.log(b / a));
  }
  const m = mean(logs);
  const variance = logs.reduce((sum, r) => sum + (r - m) ** 2, 0) / (logs.length - 1);
  return Math.sqrt(variance) * Math.sqrt(SESSIONS.y1) * 100;
}

/** Today's range strictly narrower than each of the previous `sessions − 1`. */
export function narrowestRange(bars: readonly Bar[], sessions: number): boolean | null {
  if (bars.length < sessions) return null;
  const window = bars.slice(-sessions);
  const today = window[window.length - 1];
  if (today === undefined) return null;
  const range = today.high - today.low;
  return window.slice(0, -1).every((b) => range < b.high - b.low);
}

export interface CandlePatterns {
  readonly insideBar: boolean | null;
  readonly outsideBar: boolean | null;
  readonly bullishEngulfing: boolean | null;
  readonly bearishEngulfing: boolean | null;
  readonly hammer: boolean | null;
  readonly shootingStar: boolean | null;
  readonly doji: boolean | null;
}

/**
 * Single- and two-candle structure. Descriptions of price, not calls:
 *   - hammer: body ≤ 35% of range, lower shadow ≥ 2× body, upper shadow ≤ 15% of range
 *   - shooting star: the mirror image
 *   - doji: body ≤ 10% of range
 *   - engulfing: today's body covers yesterday's opposite-coloured body, and is larger
 */
export function candlePatterns(today: Bar, yesterday: Bar | undefined): CandlePatterns {
  const range = today.high - today.low;
  const body = Math.abs(today.close - today.open);
  const upper = today.high - Math.max(today.open, today.close);
  const lower = Math.min(today.open, today.close) - today.low;
  const flat = range <= 0;

  const single = {
    hammer: flat ? false : body <= 0.35 * range && lower >= 2 * body && upper <= 0.15 * range && body > 0,
    shootingStar: flat
      ? false
      : body <= 0.35 * range && upper >= 2 * body && lower <= 0.15 * range && body > 0,
    doji: flat ? false : body <= 0.1 * range,
  };

  if (yesterday === undefined) {
    return {
      insideBar: null,
      outsideBar: null,
      bullishEngulfing: null,
      bearishEngulfing: null,
      ...single,
    };
  }

  const prevBody = Math.abs(yesterday.close - yesterday.open);
  const todayUp = today.close > today.open;
  const todayDown = today.close < today.open;
  const prevUp = yesterday.close > yesterday.open;
  const prevDown = yesterday.close < yesterday.open;

  return {
    insideBar: today.high < yesterday.high && today.low > yesterday.low,
    outsideBar: today.high > yesterday.high && today.low < yesterday.low,
    bullishEngulfing:
      prevDown &&
      todayUp &&
      today.open <= yesterday.close &&
      today.close >= yesterday.open &&
      body > prevBody,
    bearishEngulfing:
      prevUp &&
      todayDown &&
      today.open >= yesterday.close &&
      today.close <= yesterday.open &&
      body > prevBody,
    ...single,
  };
}

interface RelativeStrength {
  readonly rs1m: number | null;
  readonly rs3m: number | null;
  readonly rs6m: number | null;
  readonly rsNewHigh: boolean | null;
}

/**
 * Stock return minus benchmark return over the same sessions, aligned by
 * timestamp. A benchmark missing either endpoint yields null rather than a
 * comparison across different dates.
 */
export function relativeStrength(
  bars: readonly Bar[],
  benchmark: readonly Bar[] | null,
): RelativeStrength {
  const none = { rs1m: null, rs3m: null, rs6m: null, rsNewHigh: null };
  if (benchmark === null || benchmark.length === 0) return none;
  const byTime = new Map(benchmark.map((b) => [b.timestamp, b.close]));
  const last = bars[bars.length - 1];
  if (last === undefined) return none;
  const benchNow = byTime.get(last.timestamp);
  if (benchNow === undefined) return none;

  const over = (sessions: number): number | null => {
    const then = bars[bars.length - 1 - sessions];
    if (then === undefined) return null;
    const benchThen = byTime.get(then.timestamp);
    if (benchThen === undefined) return null;
    const stock = pct(last.close, then.close);
    const bench = pct(benchNow, benchThen);
    return stock === null || bench === null ? null : stock - bench;
  };

  const ratios: number[] = [];
  for (const bar of bars.slice(-SESSIONS.y1)) {
    const b = byTime.get(bar.timestamp);
    if (b !== undefined && b > 0) ratios.push(bar.close / b);
  }
  const today = ratios[ratios.length - 1];
  const rsNewHigh =
    ratios.length >= 120 && today !== undefined ? today >= Math.max(...ratios) : null;

  return { rs1m: over(SESSIONS.m1), rs3m: over(SESSIONS.m3), rs6m: over(SESSIONS.m6), rsNewHigh };
}

/**
 * Index of the most recent bar (within the last year) whose open moved more
 * than the gap guard from the previous close, or null. On adjusted data this
 * is almost always a split or bonus the corporate-action feed missed.
 */
export function findUnexplainedGap(bars: readonly Bar[], lookback = 260): number | null {
  for (let i = bars.length - 1; i >= Math.max(1, bars.length - lookback); i -= 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (bar === undefined || prev === undefined || prev.close <= 0) continue;
    const ratio = bar.open / prev.close;
    if (ratio < GAP_GUARD_RATIO || ratio > 1 / GAP_GUARD_RATIO) return i;
  }
  return null;
}

/**
 * Percentile ranks 1–99 of the non-null values (ties share the mean rank).
 * Nulls stay null. One value ranks 50.
 */
export function percentileRanks(values: readonly (number | null)[]): (number | null)[] {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .filter((x): x is { value: number; index: number } => x.value !== null);
  const out: (number | null)[] = values.map(() => null);
  const m = indexed.length;
  if (m === 0) return out;
  if (m === 1) {
    const only = indexed[0];
    if (only !== undefined) out[only.index] = 50;
    return out;
  }
  indexed.sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < m) {
    let j = i;
    while (j + 1 < m && indexed[j + 1]?.value === indexed[i]?.value) j += 1;
    const position = (i + j) / 2;
    const rank = Math.round(1 + (98 * position) / (m - 1));
    for (let k = i; k <= j; k += 1) {
      const item = indexed[k];
      if (item !== undefined) out[item.index] = rank;
    }
    i = j + 1;
  }
  return out;
}

function singleSessionOnly(last: Bar, spark: readonly number[]): TechnicalMetrics {
  const nulls = {
    changePct: null,
    gapPct: null,
    ret1w: null,
    ret1m: null,
    ret3m: null,
    ret6m: null,
    ret1y: null,
    retYtd: null,
    high52w: null,
    low52w: null,
    dist52wHigh: null,
    dist52wLow: null,
    historyHigh: null,
    distAth: null,
    ema20: null,
    ema50: null,
    ema200: null,
    sma50: null,
    sma200: null,
    closeVsEma20: null,
    closeVsEma50: null,
    closeVsEma200: null,
    closeVsSma50: null,
    closeVsSma200: null,
    emaStack: null,
    goldenCrossDays: null,
    deathCrossDays: null,
    supertrendDir: null,
    supertrendValue: null,
    supertrendFlipDays: null,
    adx14: null,
    plusDi: null,
    minusDi: null,
    higherHighs: null,
    rsi14: null,
    rsiAbove50Days: null,
    rsiAbove60Days: null,
    rsiBelow40Days: null,
    macdLine: null,
    macdSignal: null,
    macdHist: null,
    macdHistRising: null,
    macdCrossUpDays: null,
    macdCrossDownDays: null,
    stochK: null,
    stochD: null,
    roc20: null,
    atr14: null,
    atrPct: null,
    bbWidth: null,
    bbSqueeze: null,
    range10Pct: null,
    range20Pct: null,
    volatility20: null,
    nr4: null,
    nr7: null,
    high20d: null,
    low20d: null,
    breakout20d: null,
    breakdown20d: null,
    breakout52w: null,
    breakdown52w: null,
    insideBar: null,
    outsideBar: null,
    bullishEngulfing: null,
    bearishEngulfing: null,
    hammer: null,
    shootingStar: null,
    doji: null,
    rs1m: null,
    rs3m: null,
    rs6m: null,
    rsNewHigh: null,
    avgVolume20: null,
    relVolume: null,
    avgTurnover20: null,
  } as const;
  return {
    ...nulls,
    close: last.close,
    rangePosDay:
      last.high > last.low ? ((last.close - last.low) / (last.high - last.low)) * 100 : null,
    volume: last.volume,
    spark,
    dataIssue: 'unadjusted_gap',
  };
}
