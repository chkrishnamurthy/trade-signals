import {
  adjustedShares,
  daysHeldBetween,
  orderEntries,
  type PortfolioEntry,
  type Realisation,
  type ShareChange,
} from './derive.js';

/**
 * Returns on a user's own entries: realised gains by year, dividends received,
 * money-weighted yearly return (XIRR) and value over time. Pure; money is
 * integer paise, ratios are fractions.
 *
 * Returns count from each entry's own date (`tradeDate`). An opening balance
 * with no purchase history is counted from the day it was entered, at that day's
 * close (the market value of the shares then), so XIRR reads "since you started
 * tracking". The purchase date (`acquiredOn`) affects holding period only.
 */

// ---------------------------------------------------------------------------
// Realised gains
// ---------------------------------------------------------------------------

/** Indian financial year of a date: 2025-04-01 … 2026-03-31 is "2025-26". */
export function financialYear(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export interface RealisedTotals {
  readonly shortTermPaise: number;
  readonly longTermPaise: number;
  /** Same-day round trips: shown apart, never as capital gains. */
  readonly intradayPaise: number;
  readonly totalPaise: number;
  readonly proceedsPaise: number;
  readonly costPaise: number;
  readonly count: number;
}

export interface RealisedSummary extends RealisedTotals {
  /** Newest financial year first. */
  readonly byYear: readonly ({ readonly year: string } & RealisedTotals)[];
  readonly byInstrument: ReadonlyMap<number, RealisedTotals>;
}

function addTo(t: Mutable<RealisedTotals>, r: Realisation): void {
  if (r.intraday) t.intradayPaise += r.gainPaise;
  else if (r.term === 'long') t.longTermPaise += r.gainPaise;
  else t.shortTermPaise += r.gainPaise;
  t.totalPaise += r.gainPaise;
  t.proceedsPaise += r.proceedsPaise;
  t.costPaise += r.costPaise;
  t.count += 1;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const emptyTotals = (): Mutable<RealisedTotals> => ({
  shortTermPaise: 0,
  longTermPaise: 0,
  intradayPaise: 0,
  totalPaise: 0,
  proceedsPaise: 0,
  costPaise: 0,
  count: 0,
});

export function summariseRealised(realisations: readonly Realisation[]): RealisedSummary {
  const all = emptyTotals();
  const years = new Map<string, Mutable<RealisedTotals>>();
  const instruments = new Map<number, Mutable<RealisedTotals>>();
  for (const r of realisations) {
    addTo(all, r);
    const fy = financialYear(r.removedOn);
    const y = years.get(fy) ?? emptyTotals();
    addTo(y, r);
    years.set(fy, y);
    const i = instruments.get(r.instrumentId) ?? emptyTotals();
    addTo(i, r);
    instruments.set(r.instrumentId, i);
  }
  return {
    ...all,
    byYear: [...years].sort(([a], [b]) => (a < b ? 1 : -1)).map(([year, t]) => ({ year, ...t })),
    byInstrument: instruments,
  };
}

// ---------------------------------------------------------------------------
// Shares held on a date, and dividends
// ---------------------------------------------------------------------------

/**
 * Shares of one instrument held at the end of `date`, restated on `date`'s own
 * basis (splits up to and including `date` applied, later ones not). Entries
 * after `date` are ignored.
 */
export function sharesHeldAt(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
  instrumentId: number,
  date: string,
): number {
  const mine = changes.filter((c) => c.instrumentId === instrumentId);
  let held = 0;
  for (const e of orderEntries(entries)) {
    if (e.instrumentId !== instrumentId || e.tradeDate > date) continue;
    const shares = adjustedShares(e.shares, e.tradeDate, mine, date);
    held += e.kind === 'remove' ? -shares : shares;
  }
  return Math.max(held, 0);
}

export interface DividendRecordInput {
  readonly instrumentId: number;
  readonly exDate: string;
  /** Per share, paise; null when the source did not state it. */
  readonly amountPaise: number | null;
}

export interface DividendReceived {
  readonly instrumentId: number;
  readonly exDate: string;
  /** Per share, paise (interim and special on one day added up); null when unknown. */
  readonly perSharePaise: number | null;
  readonly shares: number;
  /** Shares × per share; null when the per-share amount is unknown. */
  readonly amountPaise: number | null;
}

const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Dividends the user's entries were entitled to: shares held at the close of
 * the day before each ex-date (shares added on the ex-date do not qualify),
 * on the ex-date's basis.
 */
export function dividendsReceived(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
  records: readonly DividendRecordInput[],
): DividendReceived[] {
  const grouped = new Map<
    string,
    { instrumentId: number; exDate: string; perShare: number | null; unknown: boolean }
  >();
  for (const r of records) {
    const key = `${r.instrumentId}|${r.exDate}`;
    const cur = grouped.get(key) ?? {
      instrumentId: r.instrumentId,
      exDate: r.exDate,
      perShare: null,
      unknown: false,
    };
    if (r.amountPaise === null) cur.unknown = true;
    else cur.perShare = (cur.perShare ?? 0) + r.amountPaise;
    grouped.set(key, cur);
  }
  const out: DividendReceived[] = [];
  for (const g of grouped.values()) {
    const before = dayBefore(g.exDate);
    const mine = changes.filter((c) => c.instrumentId === g.instrumentId);
    // Held at the close before the ex-date, restated on the ex-date's basis.
    let held = 0;
    for (const e of orderEntries(entries)) {
      if (e.instrumentId !== g.instrumentId || e.tradeDate > before) continue;
      const shares = adjustedShares(e.shares, e.tradeDate, mine, g.exDate);
      held += e.kind === 'remove' ? -shares : shares;
    }
    if (held <= 0) continue;
    const perShare = g.unknown && g.perShare === null ? null : g.perShare;
    out.push({
      instrumentId: g.instrumentId,
      exDate: g.exDate,
      perSharePaise: perShare,
      shares: held,
      amountPaise: perShare === null ? null : perShare * held,
    });
  }
  return out.sort((a, b) =>
    a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : a.instrumentId - b.instrumentId,
  );
}

// ---------------------------------------------------------------------------
// XIRR
// ---------------------------------------------------------------------------

export interface CashFlow {
  readonly date: string;
  /** Negative = money the user put in; positive = money out to them (or value today). */
  readonly amountPaise: number;
}

/**
 * The yearly rate r at which Σ amount ÷ (1 + r)^(days/365) = 0, found by
 * bisection between −99.99% and +1,000% a year. Null when the flows do not
 * include both money in and money out, or the sum does not change sign in that
 * range (no rate explains the flows).
 */
export function xirr(flows: readonly CashFlow[]): number | null {
  const real = flows.filter((f) => f.amountPaise !== 0);
  if (!real.some((f) => f.amountPaise < 0) || !real.some((f) => f.amountPaise > 0)) return null;
  const first = real.reduce((a, f) => (f.date < a ? f.date : a), real[0]?.date ?? '');
  const years = real.map((f) => daysHeldBetween(first, f.date) / 365);
  const npv = (rate: number) =>
    real.reduce((sum, f, i) => sum + f.amountPaise / (1 + rate) ** (years[i] ?? 0), 0);
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// The whole picture
// ---------------------------------------------------------------------------

/** A close for an instrument on (or the last session before) a date, raw, in paise. */
export type PriceLookup = (instrumentId: number, date: string) => number | null;

/** Money a holding put in on its own date: cost for an addition; market value for an opening. */
export function moneyIn(entry: PortfolioEntry, priceOn: PriceLookup): number {
  if (entry.kind === 'add') return entry.amountPaise;
  const close = priceOn(entry.instrumentId, entry.tradeDate);
  return close === null ? entry.amountPaise : entry.shares * close;
}

export type ReturnStatus = 'ok' | 'too_short' | 'no_solution' | 'empty';

export interface ReturnSummary {
  /** Date of the first entry; returns are "since" this. */
  readonly trackingSince: string | null;
  readonly years: number;
  readonly investedPaise: number;
  readonly withdrawnPaise: number;
  readonly dividendsPaise: number;
  readonly valuePaise: number;
  /** value + withdrawn + dividends − invested. */
  readonly gainPaise: number;
  /** gain ÷ invested; null with nothing invested. */
  readonly simpleReturn: number | null;
  /** Yearly, money-weighted; only when status is 'ok'. */
  readonly xirr: number | null;
  readonly status: ReturnStatus;
}

/** Money-weighted history shorter than this gives no yearly figure. */
export const MIN_YEARS_FOR_XIRR = 1;

export function summariseReturns(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly dividends: readonly DividendReceived[];
  /** Today's value of what is held, in paise. */
  readonly valuePaise: number;
  readonly today: string;
  readonly priceOn: PriceLookup;
}): ReturnSummary {
  const ordered = orderEntries(input.entries);
  const first = ordered[0];
  if (first === undefined) {
    return {
      trackingSince: null,
      years: 0,
      investedPaise: 0,
      withdrawnPaise: 0,
      dividendsPaise: 0,
      valuePaise: input.valuePaise,
      gainPaise: 0,
      simpleReturn: null,
      xirr: null,
      status: 'empty',
    };
  }
  const flows: CashFlow[] = [];
  let invested = 0;
  let withdrawn = 0;
  for (const e of ordered) {
    if (e.kind === 'remove') {
      withdrawn += e.amountPaise;
      flows.push({ date: e.tradeDate, amountPaise: e.amountPaise });
    } else {
      const amount = moneyIn(e, input.priceOn);
      invested += amount;
      flows.push({ date: e.tradeDate, amountPaise: -amount });
    }
  }
  let dividends = 0;
  for (const d of input.dividends) {
    if (d.amountPaise === null) continue;
    dividends += d.amountPaise;
    flows.push({ date: d.exDate, amountPaise: d.amountPaise });
  }
  flows.push({ date: input.today, amountPaise: input.valuePaise });

  const gain = input.valuePaise + withdrawn + dividends - invested;
  const years = daysHeldBetween(first.tradeDate, input.today) / 365;
  const base = {
    trackingSince: first.tradeDate,
    years,
    investedPaise: invested,
    withdrawnPaise: withdrawn,
    dividendsPaise: dividends,
    valuePaise: input.valuePaise,
    gainPaise: gain,
    simpleReturn: invested > 0 ? gain / invested : null,
  };
  if (years < MIN_YEARS_FOR_XIRR) return { ...base, xirr: null, status: 'too_short' };
  const rate = xirr(flows);
  return rate === null
    ? { ...base, xirr: null, status: 'no_solution' }
    : { ...base, xirr: rate, status: 'ok' };
}

// ---------------------------------------------------------------------------
// Value over time
// ---------------------------------------------------------------------------

export interface DailyCloseInput {
  readonly date: string;
  readonly closePaise: number;
}

export interface ValuePoint {
  readonly date: string;
  readonly valuePaise: number;
  /** Money put in minus money taken out, up to and including this day. */
  readonly netInvestedPaise: number;
  /** True when a held stock had no close for more than `STALE_SESSIONS` sessions. */
  readonly partial: boolean;
}

/** A held stock with no close for longer than this marks its days "partial". */
export const STALE_SESSIONS = 5;

/**
 * Daily value of what was held, from the first entry to `to`: on each session,
 * the shares held that day on that day's basis × that day's raw close. A day with
 * no close for a stock carries its last close forward; before its first close,
 * the stock is valued at what was paid for it, and the day is partial.
 */
export function valueSeries(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly changes: readonly ShareChange[];
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  readonly to: string;
  readonly priceOn: PriceLookup;
}): ValuePoint[] {
  const ordered = orderEntries(input.entries);
  const first = ordered[0];
  if (first === undefined) return [];
  const dates = new Set<string>();
  for (const list of input.closes.values()) {
    for (const c of list) if (c.date >= first.tradeDate && c.date <= input.to) dates.add(c.date);
  }
  const sessions = [...dates].sort();
  if (sessions.length === 0) return [];

  const instruments = [...new Set(ordered.map((e) => e.instrumentId))];
  const byInstrument = new Map(
    instruments.map((id) => [id, ordered.filter((e) => e.instrumentId === id)]),
  );
  const changesBy = new Map(
    instruments.map((id) => [id, input.changes.filter((c) => c.instrumentId === id)]),
  );
  const closeIndex = new Map(
    instruments.map((id) => [
      id,
      new Map((input.closes.get(id) ?? []).map((c) => [c.date, c.closePaise])),
    ]),
  );
  const lastClose = new Map<number, { price: number; age: number }>();
  const points: ValuePoint[] = [];
  let net = 0;
  let nextEntry = 0;

  for (const date of sessions) {
    while (nextEntry < ordered.length && (ordered[nextEntry]?.tradeDate ?? '') <= date) {
      const e = ordered[nextEntry];
      if (e !== undefined) net += e.kind === 'remove' ? -e.amountPaise : moneyIn(e, input.priceOn);
      nextEntry++;
    }
    let value = 0;
    let partial = false;
    for (const id of instruments) {
      const close = closeIndex.get(id)?.get(date);
      const prior = lastClose.get(id);
      if (close !== undefined) lastClose.set(id, { price: close, age: 0 });
      else if (prior !== undefined) lastClose.set(id, { price: prior.price, age: prior.age + 1 });
      let held = 0;
      let paid = 0;
      for (const e of byInstrument.get(id) ?? []) {
        if (e.tradeDate > date) break;
        const shares = adjustedShares(e.shares, e.tradeDate, changesBy.get(id) ?? [], date);
        held += e.kind === 'remove' ? -shares : shares;
        if (e.kind !== 'remove') paid += e.amountPaise;
      }
      if (held <= 0) continue;
      const known = lastClose.get(id);
      if (known === undefined) {
        value += paid;
        partial = true;
        continue;
      }
      if (known.age > STALE_SESSIONS) partial = true;
      value += held * known.price;
    }
    points.push({ date, valuePaise: value, netInvestedPaise: net, partial });
  }
  return points;
}

/**
 * Every session for the last `dailyDays`, and the last session of each week
 * before that, so a long history stays light to draw.
 */
export function samplePoints<T extends { readonly date: string }>(
  points: readonly T[],
  to: string,
  dailyDays = 365,
): T[] {
  const cutoff = new Date(Date.parse(`${to}T00:00:00Z`) - dailyDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const out: T[] = [];
  const weekOf = (date: string) => {
    const d = new Date(`${date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
    return monday.toISOString().slice(0, 10);
  };
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === undefined) continue;
    if (p.date >= cutoff) {
      out.push(p);
      continue;
    }
    const next = points[i + 1];
    if (next === undefined || weekOf(next.date) !== weekOf(p.date)) out.push(p);
  }
  return out;
}

/** Dividends received in the last 365 days ÷ cost of the shares now held. */
export function dividendYieldOnCost(
  dividends: readonly DividendReceived[],
  instrumentId: number,
  costPaise: number,
  today: string,
): number | null {
  if (costPaise <= 0) return null;
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const sum = dividends
    .filter(
      (d) =>
        d.instrumentId === instrumentId &&
        d.exDate > from &&
        d.exDate <= today &&
        d.amountPaise !== null,
    )
    .reduce((a, d) => a + (d.amountPaise ?? 0), 0);
  return sum / costPaise;
}
