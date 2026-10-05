import { daysHeldBetween, orderEntries, type PortfolioEntry } from './derive.js';
import {
  type CashFlow,
  MIN_YEARS_FOR_XIRR,
  moneyIn,
  type PriceLookup,
  type ReturnStatus,
  type ValuePoint,
  xirr,
} from './returns.js';

/**
 * How the user's money would have done in an index, and how the holdings did
 * apart from when money was added (time-weighted). Pure; paise in, fractions out.
 */

export interface BenchmarkResult {
  readonly investedPaise: number;
  readonly withdrawnPaise: number;
  /** What the replayed index units are worth today. */
  readonly valuePaise: number;
  readonly simpleReturn: number | null;
  readonly xirr: number | null;
  /** `no_history`: the index series starts after the first entry, so there is no fair comparison. */
  readonly status: ReturnStatus | 'no_history';
  /** First date the index has a close for, as far as the caller loaded it. */
  readonly indexFrom: string | null;
}

/**
 * Replays the user's money into an index on the same dates (a "modified public
 * market equivalent"): money in buys index units at that day's close; taking
 * money out sells the same FRACTION of the index units as it did of the
 * holdings, so a well-chosen sale cannot leave the index owing units. Dividends
 * are not replayed, because a price index pays none.
 */
export function benchmarkReplay(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly priceOn: PriceLookup;
  /** Index close on or before a date, paise; null before the series starts. */
  readonly indexOn: (date: string) => number | null;
  /** First date the index has a close for. */
  readonly indexFrom: string | null;
  /**
   * What the holdings were worth at the end of a day, after its entries. Gives
   * the fraction a removal took out; without it, the same rupees are taken out
   * of the index, never more than it holds.
   */
  readonly valueAfter?: (date: string) => number | null;
  readonly today: string;
}): BenchmarkResult | null {
  const ordered = orderEntries(input.entries);
  const first = ordered[0];
  const todayClose = input.indexOn(input.today);
  if (first === undefined || todayClose === null) return null;
  let units = 0;
  let invested = 0;
  let withdrawn = 0;
  // Money put in before the index history starts has nowhere fair to go:
  // counting it at a later close would show the index as flat for that time.
  if (input.indexOn(first.tradeDate) === null) {
    return {
      investedPaise: 0,
      withdrawnPaise: 0,
      valuePaise: 0,
      simpleReturn: null,
      xirr: null,
      status: 'no_history',
      indexFrom: input.indexFrom,
    };
  }
  const flows: CashFlow[] = [];
  // A day's removals are taken together, after that day's additions (the order
  // `orderEntries` gives).
  const removedOn = new Map<string, number>();
  for (const e of ordered)
    if (e.kind === 'remove')
      removedOn.set(e.tradeDate, (removedOn.get(e.tradeDate) ?? 0) + e.amountPaise);
  for (const e of ordered) {
    const close = input.indexOn(e.tradeDate) ?? todayClose;
    if (e.kind !== 'remove') {
      const amount = moneyIn(e, input.priceOn);
      units += amount / close;
      invested += amount;
      flows.push({ date: e.tradeDate, amountPaise: -amount });
      continue;
    }
    const proceeds = removedOn.get(e.tradeDate);
    if (proceeds === undefined) continue; // that day's removals are already taken
    removedOn.delete(e.tradeDate);
    const indexValue = units * close;
    const after = input.valueAfter?.(e.tradeDate) ?? null;
    const fraction =
      after !== null && after + proceeds > 0
        ? proceeds / (after + proceeds)
        : indexValue > 0
          ? Math.min(1, proceeds / indexValue)
          : 0;
    const out = Math.round(fraction * indexValue);
    units -= fraction * units;
    withdrawn += out;
    flows.push({ date: e.tradeDate, amountPaise: out });
  }
  const value = Math.round(units * todayClose);
  flows.push({ date: input.today, amountPaise: value });
  const years = daysHeldBetween(first.tradeDate, input.today) / 365;
  const gain = value + withdrawn - invested;
  const base = {
    investedPaise: invested,
    withdrawnPaise: withdrawn,
    valuePaise: value,
    simpleReturn: invested > 0 ? gain / invested : null,
    indexFrom: input.indexFrom,
  };
  if (years < MIN_YEARS_FOR_XIRR) return { ...base, xirr: null, status: 'too_short' };
  const rate = xirr(flows);
  return rate === null
    ? { ...base, xirr: null, status: 'no_solution' }
    : { ...base, xirr: rate, status: 'ok' };
}

export interface GrowthPoint {
  readonly date: string;
  /** Starts at 100. */
  readonly value: number;
}

/**
 * Growth of 100 for the holdings themselves, ignoring when money was added or
 * taken out: each day's return is (value − money added that day) ÷ yesterday's
 * value − 1, and the days are chained. Needs the daily (unsampled) series.
 */
export function timeWeightedGrowth(points: readonly ValuePoint[]): GrowthPoint[] {
  const out: GrowthPoint[] = [];
  let growth = 100;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    const prev = points[i - 1];
    if (prev !== undefined && prev.valuePaise > 0) {
      const flow = p.netInvestedPaise - prev.netInvestedPaise;
      growth *= (p.valuePaise - flow) / prev.valuePaise;
    }
    out.push({ date: p.date, value: growth });
  }
  return out;
}

/** An index rebased to 100 on `from` (its close on or before that day); empty when it has none. */
export function indexGrowth(
  closes: readonly { readonly date: string; readonly closePaise: number }[],
  from: string,
  to: string,
): GrowthPoint[] {
  const base = [...closes].filter((c) => c.date <= from).at(-1)?.closePaise;
  if (base === undefined || base <= 0) return [];
  const points = closes
    .filter((c) => c.date >= from && c.date <= to)
    .map((c) => ({ date: c.date, value: (c.closePaise / base) * 100 }));
  // Start at 100 on the start day itself, even when the index has no close that day.
  return points[0]?.date === from ? points : [{ date: from, value: 100 }, ...points];
}

export type PeriodKey = '1M' | '3M' | '6M' | '1Y' | 'all';

const MONTHS: Record<Exclude<PeriodKey, 'all'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  // 31 Mar less one month is 28 (or 29) Feb, not 3 Mar.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months + 1, 0));
  const target = new Date(
    Date.UTC(
      lastDay.getUTCFullYear(),
      lastDay.getUTCMonth(),
      Math.min(d.getUTCDate(), lastDay.getUTCDate()),
    ),
  );
  return target.toISOString().slice(0, 10);
}

/**
 * Return over each period from a growth series: end value ÷ value at the
 * period's start − 1. Null for a period longer than the series.
 */
export function periodReturns(
  series: readonly GrowthPoint[],
  today: string,
): Record<PeriodKey, number | null> {
  const first = series[0];
  const last = series.at(-1);
  const result: Record<PeriodKey, number | null> = {
    '1M': null,
    '3M': null,
    '6M': null,
    '1Y': null,
    all: null,
  };
  if (first === undefined || last === undefined) return result;
  result.all = last.value / first.value - 1;
  for (const key of Object.keys(MONTHS) as Exclude<PeriodKey, 'all'>[]) {
    const start = monthsBefore(today, MONTHS[key]);
    if (start < first.date) continue;
    const at = [...series].filter((p) => p.date <= start).at(-1);
    if (at !== undefined && at.value > 0) result[key] = last.value / at.value - 1;
  }
  return result;
}
