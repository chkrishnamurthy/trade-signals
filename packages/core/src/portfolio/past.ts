import type { ShareChange } from './derive.js';
import { type DailyCloseInput, STALE_SESSIONS, type ValuePoint } from './returns.js';

/**
 * "Today's shares at past prices": what the shares held now would have been worth
 * on each past session, with no money added or taken out. It exists so a new
 * portfolio (or one typed in today) still has a year of history to draw, and it
 * is always labelled as past prices, never as the user's own record.
 *
 * Share counts at a past date are derived from today's count by undoing every
 * split, bonus or consolidation with an ex-date after that date, so raw closes
 * and share counts are always on the same basis. Pure; paise in, paise out.
 */

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

export interface HeldNow {
  readonly instrumentId: number;
  /** Shares held today, on today's basis. */
  readonly shares: number;
}

export interface PastSeries {
  readonly points: ValuePoint[];
  /** First session of the series; null when no day had a price for every stock. */
  readonly from: string | null;
  /** Stocks left out because they have no price in the window. */
  readonly leftOut: number;
}

/** Shares held on `date`, given today's count and the changes after that date. */
export function sharesOn(
  sharesNow: number,
  date: string,
  changes: readonly ShareChange[],
  today: string,
): number {
  let factor = 1;
  for (const c of changes) {
    if (!SHARE_CHANGING.has(c.kind) || c.ratio <= 0) continue;
    if (c.exDate > date && c.exDate <= today) factor *= c.ratio;
  }
  return sharesNow * factor;
}

export function pastSeries(input: {
  readonly held: readonly HeldNow[];
  readonly changes: readonly ShareChange[];
  /** Raw daily closes, ascending by date. */
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  /** First session wanted (inclusive). */
  readonly from: string;
  readonly to: string;
}): PastSeries {
  const priced = input.held.filter(
    (h) => h.shares > 0 && (input.closes.get(h.instrumentId)?.length ?? 0) > 0,
  );
  const leftOut = input.held.filter((h) => h.shares > 0).length - priced.length;
  if (priced.length === 0) return { points: [], from: null, leftOut };

  const index = new Map(
    priced.map((h) => [
      h.instrumentId,
      new Map((input.closes.get(h.instrumentId) ?? []).map((c) => [c.date, c.closePaise])),
    ]),
  );
  const changesBy = new Map(
    priced.map((h) => [
      h.instrumentId,
      input.changes.filter((c) => c.instrumentId === h.instrumentId),
    ]),
  );

  // The series starts once every stock has a price, so a recent listing does
  // not make the value jump when it first appears.
  let start = input.from;
  for (const h of priced) {
    const first = input.closes.get(h.instrumentId)?.[0]?.date;
    if (first !== undefined && first > start) start = first;
  }
  const dates = new Set<string>();
  for (const h of priced)
    for (const c of input.closes.get(h.instrumentId) ?? [])
      if (c.date >= start && c.date <= input.to) dates.add(c.date);
  const sessions = [...dates].sort();

  // Carry each stock's last close in from before the start, so day one is priced.
  const last = new Map<number, { price: number; age: number }>();
  for (const h of priced) {
    const before = (input.closes.get(h.instrumentId) ?? []).filter((c) => c.date < start).at(-1);
    if (before !== undefined) last.set(h.instrumentId, { price: before.closePaise, age: 0 });
  }

  const points: ValuePoint[] = [];
  for (const date of sessions) {
    let value = 0;
    let partial = false;
    for (const h of priced) {
      const close = index.get(h.instrumentId)?.get(date);
      const prior = last.get(h.instrumentId);
      if (close !== undefined) last.set(h.instrumentId, { price: close, age: 0 });
      else if (prior !== undefined)
        last.set(h.instrumentId, { price: prior.price, age: prior.age + 1 });
      const known = last.get(h.instrumentId);
      if (known === undefined) {
        partial = true;
        continue;
      }
      if (known.age > STALE_SESSIONS) partial = true;
      value +=
        sharesOn(h.shares, date, changesBy.get(h.instrumentId) ?? [], input.to) * known.price;
    }
    points.push({ date, valuePaise: Math.round(value), netInvestedPaise: 0, partial });
  }
  return { points, from: points[0]?.date ?? null, leftOut };
}
