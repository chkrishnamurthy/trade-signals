import type { OiBuildup } from '../flows.js';
import { daysBetween } from '../ipos/match.js';

/**
 * The non-price halves of a screener row: delivery, ownership, F&O and
 * calendar distances. Each takes already-stored rows and returns nulls for
 * anything the rows cannot support — "not reported" is never 0.
 */

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` of a bar stamped at UTC midnight of its trading date. */
export function barDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export interface DeliveryPoint {
  readonly tradingDate: string;
  readonly deliveryPercent: number;
  readonly deliverableQty: number;
}

export interface DeliveryMetrics {
  readonly deliveryPct: number | null;
  readonly avgDelivery20: number | null;
  readonly deliveryVsAvg: number | null;
  readonly deliveryRatio: number | null;
  readonly deliveryQty: number | null;
}

/** Sessions of history needed before an average is shown. */
export const MIN_DELIVERY_HISTORY = 5;

/**
 * Delivery for `session`, against the mean of up to 20 EARLIER sessions.
 * Today is excluded from its own average for the same reason relative volume
 * excludes it: including it damps the spike the metric exists to show.
 */
export function deliveryMetrics(points: readonly DeliveryPoint[], session: string): DeliveryMetrics {
  const today = points.find((p) => p.tradingDate === session);
  const prior = points
    .filter((p) => p.tradingDate < session)
    .sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : 1))
    .slice(-20);
  const avg =
    prior.length >= MIN_DELIVERY_HISTORY
      ? prior.reduce((sum, p) => sum + p.deliveryPercent, 0) / prior.length
      : null;
  if (today === undefined) {
    return {
      deliveryPct: null,
      avgDelivery20: avg,
      deliveryVsAvg: null,
      deliveryRatio: null,
      deliveryQty: null,
    };
  }
  return {
    deliveryPct: today.deliveryPercent,
    avgDelivery20: avg,
    deliveryVsAvg: avg === null ? null : today.deliveryPercent - avg,
    deliveryRatio: avg === null || avg === 0 ? null : today.deliveryPercent / avg,
    deliveryQty: today.deliverableQty,
  };
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

export interface ShareholdingPoint {
  readonly asOf: string;
  readonly promoterPercent: number | null;
  readonly publicPercent: number | null;
}

export interface OwnershipMetrics {
  readonly promoterPct: number | null;
  readonly promoterChgQoq: number | null;
  readonly publicPct: number | null;
  readonly publicChgQoq: number | null;
  readonly promoterStreak: number | null;
  readonly shareholdingAsOf: string | null;
}

/** Changes smaller than this (pp) are reporting noise, not a move. */
const OWNERSHIP_EPSILON = 0.005;

export function ownershipMetrics(points: readonly ShareholdingPoint[]): OwnershipMetrics {
  const sorted = [...points].sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  if (latest === undefined) {
    return {
      promoterPct: null,
      promoterChgQoq: null,
      publicPct: null,
      publicChgQoq: null,
      promoterStreak: null,
      shareholdingAsOf: null,
    };
  }
  const diff = (a: number | null, b: number | null | undefined): number | null =>
    a === null || b === null || b === undefined ? null : a - b;

  return {
    promoterPct: latest.promoterPercent,
    promoterChgQoq: diff(latest.promoterPercent, previous?.promoterPercent),
    publicPct: latest.publicPercent,
    publicChgQoq: diff(latest.publicPercent, previous?.publicPercent),
    promoterStreak: promoterStreak(sorted),
    shareholdingAsOf: latest.asOf,
  };
}

/**
 * Consecutive quarters (counting back from the latest) in which promoter
 * holding moved the same way: +3 = rose three quarters running, −2 = fell two,
 * 0 = unchanged last quarter. Null without two comparable quarters.
 */
export function promoterStreak(sorted: readonly ShareholdingPoint[]): number | null {
  let sign = 0;
  let count = 0;
  for (let i = sorted.length - 1; i >= 1; i -= 1) {
    const now = sorted[i]?.promoterPercent;
    const before = sorted[i - 1]?.promoterPercent;
    if (now === null || now === undefined || before === null || before === undefined) break;
    const d = now - before;
    const s = Math.abs(d) < OWNERSHIP_EPSILON ? 0 : Math.sign(d);
    if (count === 0) {
      sign = s;
      count = 1;
      if (s === 0) return 0;
      continue;
    }
    if (s !== sign) break;
    count += 1;
  }
  return count === 0 ? null : sign * count;
}

// ---------------------------------------------------------------------------
// F&O
// ---------------------------------------------------------------------------

export interface OiPoint {
  readonly tradingDate: string;
  readonly futuresOi: number;
  readonly oiChange: number | null;
  readonly buildup: string | null;
}

export interface FnoMetrics {
  readonly fnoEligible: boolean;
  readonly futOi: number | null;
  readonly futOiChgPct: number | null;
  readonly oiBuildup: OiBuildup | null;
  readonly oiBuildupStreak: number | null;
  readonly oiAsOf: string | null;
}

const BUILDUPS: ReadonlySet<string> = new Set([
  'long_buildup',
  'short_buildup',
  'short_covering',
  'long_unwinding',
]);

/** Calendar days an OI row may trail the screened session and still count as current. */
export const OI_FRESH_DAYS = 7;

/**
 * Futures OI as of `session`. OI is ingested the morning after a session, so
 * the latest row can trail the bhavcopy session by a day; anything older than
 * {@link OI_FRESH_DAYS} means the stock is not (or no longer) in F&O.
 */
export function fnoMetrics(points: readonly OiPoint[], session: string): FnoMetrics {
  const sorted = points
    .filter((p) => p.tradingDate <= session)
    .sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : 1));
  const latest = sorted[sorted.length - 1];
  if (latest === undefined || daysBetween(latest.tradingDate, session) > OI_FRESH_DAYS) {
    return {
      fnoEligible: false,
      futOi: null,
      futOiChgPct: null,
      oiBuildup: null,
      oiBuildupStreak: null,
      oiAsOf: null,
    };
  }
  const prevOi = latest.oiChange === null ? null : latest.futuresOi - latest.oiChange;
  const buildup =
    latest.buildup !== null && BUILDUPS.has(latest.buildup) ? (latest.buildup as OiBuildup) : null;
  let streak = 0;
  if (buildup !== null) {
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (sorted[i]?.buildup !== buildup) break;
      streak += 1;
    }
  }
  return {
    fnoEligible: true,
    futOi: latest.futuresOi,
    futOiChgPct:
      prevOi === null || prevOi <= 0 || latest.oiChange === null
        ? null
        : (latest.oiChange / prevOi) * 100,
    oiBuildup: buildup,
    oiBuildupStreak: buildup === null ? null : streak,
    oiAsOf: latest.tradingDate,
  };
}

// ---------------------------------------------------------------------------
// Calendar distances
// ---------------------------------------------------------------------------

/** Days from `session` to the earliest date on or after it, within `horizon`; else null. */
export function daysUntilNext(
  dates: readonly string[],
  session: string,
  horizon = 30,
): number | null {
  let best: number | null = null;
  for (const date of dates) {
    const d = daysBetween(session, date);
    if (d < 0 || d > horizon) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

/** Size bucket from index membership — explicitly not market cap. */
export function sizeBucket(indexKeys: readonly string[]): 'large' | 'mid' | 'small' | 'micro' | 'other' {
  if (indexKeys.includes('nifty100')) return 'large';
  if (indexKeys.includes('niftymidcap150')) return 'mid';
  if (indexKeys.includes('niftysmallcap250')) return 'small';
  if (indexKeys.includes('niftymicrocap250')) return 'micro';
  return 'other';
}
