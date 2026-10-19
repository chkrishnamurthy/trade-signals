import type { ShareChange } from './derive.js';
import type { DailyCloseInput, ValuePoint } from './returns.js';

/**
 * How bumpy the ride has been, from the user's own daily values and the daily
 * closes already collected. Every figure describes what happened; none predicts.
 * Pure: fractions out (0.127 is 12.7%), no clock (the caller passes today).
 *
 *   volatility      stdev(daily returns) × √252
 *   deepest fall    the biggest drop from a high to the next low (time-weighted,
 *                   so adding money is not a rise and taking it out not a fall)
 *   beta            cov(you, Nifty 50) ÷ var(Nifty 50), on days both have a close
 *   correlation     Pearson on daily returns, −1 to 1, per pair of stocks
 *   share of the    each stock's part of the portfolio's variance:
 *   ups and downs   wᵢ·(Σw)ᵢ ÷ wᵀΣw, which adds up to 1
 */

export const TRADING_DAYS = 252;
/** About six months of sessions before a portfolio or stock figure is shown. */
export const MIN_RISK_SESSIONS = 120;
/** Shared sessions a pair of stocks needs before its correlation is shown. */
export const MIN_PAIR_SESSIONS = 60;
/** The correlation grid covers at most this many of the largest holdings. */
export const MAX_CORRELATION_STOCKS = 15;

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

export interface DatedReturn {
  readonly date: string;
  /** That session's return as a fraction: 0.01 is +1%. */
  readonly r: number;
}

/** A figure, or how much history it is still waiting for. */
export type RiskFigure<T> =
  | { readonly status: 'ok'; readonly value: T; readonly sessions: number }
  | { readonly status: 'needs_history'; readonly sessions: number; readonly needed: number };

// ---------------------------------------------------------------------------
// Daily returns
// ---------------------------------------------------------------------------

/**
 * The holdings' own daily returns, with money added or taken out removed:
 * (value − money added that day) ÷ yesterday's value − 1. A day with a stale
 * price ("partial") on either side is left out and counted.
 */
export function portfolioReturns(points: readonly ValuePoint[]): {
  readonly returns: DatedReturn[];
  readonly skipped: number;
} {
  const returns: DatedReturn[] = [];
  let skipped = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const p = points[i];
    if (prev === undefined || p === undefined || prev.valuePaise <= 0) continue;
    if (p.partial || prev.partial) {
      skipped += 1;
      continue;
    }
    const flow = p.netInvestedPaise - prev.netInvestedPaise;
    returns.push({ date: p.date, r: (p.valuePaise - flow) / prev.valuePaise - 1 });
  }
  return { returns, skipped };
}

/**
 * Daily returns from raw closes. A split, bonus or consolidation between two
 * sessions is taken out: the expected price after it is the previous close
 * times the action's ratio (the price multiplier), so a 1-into-2 split is not
 * a 50% fall.
 */
export function priceReturns(
  closes: readonly DailyCloseInput[],
  changes: readonly ShareChange[] = [],
): DatedReturn[] {
  const sorted = [...closes].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const actions = changes.filter((c) => SHARE_CHANGING.has(c.kind) && c.ratio > 0);
  const out: DatedReturn[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const c = sorted[i];
    if (prev === undefined || c === undefined || prev.closePaise <= 0) continue;
    let factor = 1;
    for (const a of actions) if (a.exDate > prev.date && a.exDate <= c.date) factor *= a.ratio;
    out.push({ date: c.date, r: c.closePaise / (prev.closePaise * factor) - 1 });
  }
  return out;
}

/** Returns after `from` (exclusive). */
export function returnsSince(returns: readonly DatedReturn[], from: string): DatedReturn[] {
  return returns.filter((x) => x.date > from);
}

/** The date one year before `today`. */
export function yearBefore(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

const mean = (xs: readonly number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

/** Sample covariance (n − 1); null under two observations. */
export function covariance(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
  return sum / (n - 1);
}

/** Pearson correlation; null when either side never moves. */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  const cov = covariance(xs, ys);
  const vx = covariance(xs, xs);
  const vy = covariance(ys, ys);
  if (cov === null || vx === null || vy === null || vx <= 0 || vy <= 0) return null;
  // Rounding can carry a perfect relation a hair past ±1.
  return Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy)));
}

/** Yearly volatility: the sample standard deviation of daily returns × √252. */
export function yearlyVolatility(returns: readonly number[]): number | null {
  const v = covariance(returns, returns);
  return v === null ? null : Math.sqrt(v) * Math.sqrt(TRADING_DAYS);
}

/** Two return series matched by date, keeping only the dates both have. */
export function alignReturns(
  a: readonly DatedReturn[],
  b: readonly DatedReturn[],
): { readonly x: number[]; readonly y: number[] } {
  const byDate = new Map(b.map((p) => [p.date, p.r]));
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a) {
    const other = byDate.get(p.date);
    if (other === undefined) continue;
    x.push(p.r);
    y.push(other);
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Drawdown
// ---------------------------------------------------------------------------

export interface DrawdownPoint {
  readonly date: string;
  /** How far below the last high, as a fraction (−0.131 is 13.1% below). */
  readonly drawdown: number;
}

export interface DeepestFall {
  /** Negative fraction: −0.131 is a fall of 13.1%. */
  readonly depth: number;
  readonly peakOn: string;
  readonly troughOn: string;
  /** First day back at the old high; null while still below it. */
  readonly recoveredOn: string | null;
}

/**
 * Chains the returns from a level of 1 on `start`, and reads how far below its
 * running high the series stood each day, and the deepest fall.
 */
export function drawdowns(
  returns: readonly DatedReturn[],
  start: string,
): { readonly series: DrawdownPoint[]; readonly deepest: DeepestFall | null } {
  const series: DrawdownPoint[] = [{ date: start, drawdown: 0 }];
  let level = 1;
  let peak = 1;
  let peakOn = start;
  let deepest: { depth: number; peakOn: string; troughOn: string; peakLevel: number } | null = null;
  let recoveredOn: string | null = null;
  for (const { date, r } of returns) {
    level *= 1 + r;
    if (level >= peak) {
      if (deepest !== null && recoveredOn === null && level >= deepest.peakLevel)
        recoveredOn = date;
      peak = level;
      peakOn = date;
    }
    const dd = level / peak - 1;
    series.push({ date, drawdown: dd });
    if (dd < 0 && (deepest === null || dd < deepest.depth)) {
      deepest = { depth: dd, peakOn, troughOn: date, peakLevel: peak };
      recoveredOn = null;
    }
  }
  return {
    series,
    deepest:
      deepest === null
        ? null
        : {
            depth: deepest.depth,
            peakOn: deepest.peakOn,
            troughOn: deepest.troughOn,
            recoveredOn,
          },
  };
}

// ---------------------------------------------------------------------------
// Beta, correlation grid, share of the ups and downs
// ---------------------------------------------------------------------------

export interface BetaResult {
  readonly beta: number;
  /** How closely you moved with the index, −1 to 1. */
  readonly correlation: number | null;
}

/** Beta of `yours` against `index` on the days both have a return. */
export function betaAgainst(
  yours: readonly DatedReturn[],
  index: readonly DatedReturn[],
  minSessions = MIN_RISK_SESSIONS,
): RiskFigure<BetaResult> {
  const { x, y } = alignReturns(yours, index);
  if (x.length < minSessions)
    return { status: 'needs_history', sessions: x.length, needed: minSessions };
  const cov = covariance(x, y);
  const varIndex = covariance(y, y);
  if (cov === null || varIndex === null || varIndex <= 0)
    return { status: 'needs_history', sessions: x.length, needed: minSessions };
  return {
    status: 'ok',
    value: { beta: cov / varIndex, correlation: correlation(x, y) },
    sessions: x.length,
  };
}

export interface CorrelationGrid {
  readonly ids: number[];
  /** cells[i][j]: correlation of ids[i] and ids[j]; null with too few shared sessions. */
  readonly cells: (number | null)[][];
}

export function correlationGrid(
  ids: readonly number[],
  series: ReadonlyMap<number, readonly DatedReturn[]>,
  minShared = MIN_PAIR_SESSIONS,
): CorrelationGrid {
  const cells = ids.map((a, i) =>
    ids.map((b, j) => {
      if (i === j) return (series.get(a)?.length ?? 0) >= minShared ? 1 : null;
      const { x, y } = alignReturns(series.get(a) ?? [], series.get(b) ?? []);
      return x.length >= minShared ? correlation(x, y) : null;
    }),
  );
  return { ids: [...ids], cells };
}

/**
 * Each stock's share of the portfolio's day-to-day variance at today's
 * weights: wᵢ·(Σw)ᵢ ÷ wᵀΣw. The shares add up to 1; a stock that rises when
 * the rest fall can have a negative share. Stocks with fewer than `minShared`
 * sessions are left out (null) and the others' weights rescaled. A pair with
 * too little shared history counts as unrelated.
 */
export function riskShares(
  series: ReadonlyMap<number, readonly DatedReturn[]>,
  weights: ReadonlyMap<number, number>,
  minShared = MIN_PAIR_SESSIONS,
): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const ids = [...weights.keys()].filter((id) => (series.get(id)?.length ?? 0) >= minShared);
  for (const id of weights.keys()) out.set(id, null);
  const total = ids.reduce((a, id) => a + (weights.get(id) ?? 0), 0);
  if (ids.length === 0 || total <= 0) return out;
  const w = ids.map((id) => (weights.get(id) ?? 0) / total);
  const cov = ids.map((a) =>
    ids.map((b) => {
      const { x, y } = alignReturns(series.get(a) ?? [], series.get(b) ?? []);
      return x.length >= minShared ? (covariance(x, y) ?? 0) : 0;
    }),
  );
  const sigmaW = cov.map((row) => row.reduce((a, c, j) => a + c * (w[j] ?? 0), 0));
  const variance = sigmaW.reduce((a, s, i) => a + s * (w[i] ?? 0), 0);
  if (variance <= 0) return out;
  for (const [i, id] of ids.entries()) out.set(id, ((w[i] ?? 0) * (sigmaW[i] ?? 0)) / variance);
  return out;
}

// ---------------------------------------------------------------------------
// The Risk tab's numbers
// ---------------------------------------------------------------------------

export interface StockRisk {
  readonly instrumentId: number;
  /** Sessions with a return in the last year. */
  readonly sessions: number;
  readonly volatility: number | null;
  readonly deepestFall: DeepestFall | null;
  /** Share of the portfolio's ups and downs; null without enough history. */
  readonly share: number | null;
}

export interface RiskSummary {
  /** Sessions with a return, all history. */
  readonly sessions: number;
  /** Days left out because a price was stale. */
  readonly skippedDays: number;
  readonly volatility: {
    readonly oneYear: RiskFigure<number>;
    readonly all: RiskFigure<number>;
  };
  readonly deepestFall: RiskFigure<DeepestFall>;
  /** How far below its last high the portfolio stood each session. */
  readonly drawdown: DrawdownPoint[];
  /** Against Nifty 50, over the last year. */
  readonly beta: RiskFigure<BetaResult>;
  readonly stocks: StockRisk[];
  readonly correlation: CorrelationGrid;
}

const figure = <T>(value: T | null, sessions: number, needed: number): RiskFigure<T> =>
  value === null || sessions < needed
    ? { status: 'needs_history', sessions, needed }
    : { status: 'ok', value, sessions };

export function summariseRisk(input: {
  /** The daily (unsampled) value series. */
  readonly points: readonly ValuePoint[];
  /** Nifty 50 daily closes. */
  readonly indexCloses: readonly DailyCloseInput[];
  /** Raw daily closes of each held stock, reaching back at least a year. */
  readonly stockCloses: ReadonlyMap<number, readonly DailyCloseInput[]>;
  readonly changes: readonly ShareChange[];
  /** Today's weight of each held stock (any scale; rescaled to add to 1). */
  readonly weights: ReadonlyMap<number, number>;
  readonly today: string;
}): RiskSummary {
  const yearAgo = yearBefore(input.today);
  const { returns, skipped } = portfolioReturns(input.points);
  const lastYear = returnsSince(returns, yearAgo);
  const start = input.points[0]?.date ?? input.today;
  const { series, deepest } = drawdowns(returns, start);

  const indexReturns = priceReturns(input.indexCloses);
  const stockSeries = new Map<number, DatedReturn[]>();
  for (const id of input.weights.keys()) {
    const changes = input.changes.filter((c) => c.instrumentId === id);
    stockSeries.set(
      id,
      returnsSince(priceReturns(input.stockCloses.get(id) ?? [], changes), yearAgo),
    );
  }
  const shares = riskShares(stockSeries, input.weights);
  const byWeight = [...input.weights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => id);

  const stocks: StockRisk[] = byWeight.map((id) => {
    const rs = stockSeries.get(id) ?? [];
    const enough = rs.length >= MIN_RISK_SESSIONS;
    return {
      instrumentId: id,
      sessions: rs.length,
      volatility: enough ? yearlyVolatility(rs.map((x) => x.r)) : null,
      deepestFall: enough ? drawdowns(rs, yearAgo).deepest : null,
      share: shares.get(id) ?? null,
    };
  });

  return {
    sessions: returns.length,
    skippedDays: skipped,
    volatility: {
      oneYear: figure(
        yearlyVolatility(lastYear.map((x) => x.r)),
        lastYear.length,
        MIN_RISK_SESSIONS,
      ),
      all: figure(yearlyVolatility(returns.map((x) => x.r)), returns.length, MIN_RISK_SESSIONS),
    },
    deepestFall:
      deepest === null && returns.length >= MIN_RISK_SESSIONS
        ? // Never below a high: a fall of nothing, not a missing figure.
          {
            status: 'ok',
            value: { depth: 0, peakOn: start, troughOn: start, recoveredOn: null },
            sessions: returns.length,
          }
        : figure(deepest, returns.length, MIN_RISK_SESSIONS),
    drawdown: series,
    beta: betaAgainst(lastYear, indexReturns),
    stocks,
    correlation: correlationGrid(byWeight.slice(0, MAX_CORRELATION_STOCKS), stockSeries),
  };
}
