import type {
  CalendarConfig,
  IpoClosedStage,
  IpoLifecycleOverride,
  IpoStatus,
} from '@equitywise/shared';
import { sessionFor } from '../paper/calendar.js';

/**
 * Where an issue is in its life, and the dates ahead of it.
 *
 * Pure: "today" is an argument (an IST date key), never a clock read. Status
 * is DERIVED from dates on every read and never stored, so it cannot go stale.
 */

export interface IssueDates {
  readonly openDate: string | null;
  readonly closeDate: string | null;
  /** The OFFICIAL listing date; an expected one never makes an issue "listed". */
  readonly listingDate: string | null;
  readonly lifecycleOverride: IpoLifecycleOverride | null;
}

/**
 * `upcoming` before the open date (or while the dates are not yet announced),
 * `open` from open through close day, `closed` after it until the exchange
 * publishes a listing date, then `listed` from that date. A source's
 * withdrawal or postponement overrides everything.
 */
export function ipoStatus(issue: IssueDates, today: string): IpoStatus {
  if (issue.lifecycleOverride !== null) return issue.lifecycleOverride;
  if (issue.listingDate !== null && today >= issue.listingDate) return 'listed';
  if (issue.openDate === null || today < issue.openDate) return 'upcoming';
  if (issue.closeDate !== null && today > issue.closeDate) return 'closed';
  return 'open';
}

/**
 * A source's own status word for an issue → a lifecycle override, or null when
 * the word does not say the issue was withdrawn or postponed ("Active",
 * "Forthcoming", "Live", "Closed" …). Only a source's statement ever sets an
 * override: EquityWise never infers a withdrawal from silence.
 */
export function lifecycleFromSourceStatus(
  status: string | null | undefined,
): IpoLifecycleOverride | null {
  if (status === null || status === undefined) return null;
  if (/\b(withdrawn|withdrawal|cancell?ed|recalled|abandoned)\b/i.test(status)) return 'withdrawn';
  if (/\b(postponed|deferred|rescheduled)\b/i.test(status)) return 'postponed';
  return null;
}

/**
 * Equity settlement days: normal sessions and declared special sessions. A
 * Muhurat session is a symbolic hour on a holiday, not a settlement day.
 */
export function isSettlementDay(dateKey: string, calendar: CalendarConfig): boolean {
  const kind = sessionFor(dateKey, calendar).kind;
  return kind === 'NORMAL' || kind === 'SPECIAL';
}

function nextDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
  return next.toISOString().slice(0, 10);
}

/** The date `n` settlement days after `dateKey` (n ≥ 1). */
export function addSettlementDays(dateKey: string, n: number, calendar: CalendarConfig): string {
  let current = dateKey;
  let remaining = n;
  // A year of consecutive holidays is impossible; the bound only stops a bad
  // calendar from spinning forever.
  for (let guard = 0; remaining > 0 && guard < 400; guard += 1) {
    current = nextDay(current);
    if (isSettlementDay(current, calendar)) remaining -= 1;
  }
  return current;
}

export interface ExpectedTimeline {
  /** T+1: basis of allotment finalised. */
  readonly allotment: string;
  /** T+2: refunds initiated for unallotted applications. */
  readonly refunds: string;
  /** T+2: shares credited to demat accounts. */
  readonly dematCredit: string;
  /** T+3: listing. */
  readonly listing: string;
}

/**
 * SEBI's T+3 schedule (mandatory from 1 Dec 2023), counted in settlement days
 * from the close date T. These are EXPECTED dates — shown as such until a
 * source states the real one.
 */
export function expectedTimeline(closeDate: string, calendar: CalendarConfig): ExpectedTimeline {
  const t1 = addSettlementDays(closeDate, 1, calendar);
  const t2 = addSettlementDays(closeDate, 2, calendar);
  return {
    allotment: t1,
    refunds: t2,
    dematCredit: t2,
    listing: addSettlementDays(closeDate, 3, calendar),
  };
}

/**
 * Settlement days past the expected T+3 listing after which an issue with no
 * official listing date is no longer "listing next". A late listing is rare;
 * one this late usually means the issue was withdrawn or deferred, which only
 * a source can confirm — so the page says "no listing reported", nothing more.
 */
export const LISTING_GRACE_SETTLEMENT_DAYS = 5;

/** True once a closed issue with no official listing date is past the grace window. */
export function listingUnconfirmed(
  issue: Pick<IssueDates, 'closeDate' | 'listingDate'>,
  today: string,
  calendar: CalendarConfig,
): boolean {
  if (issue.listingDate !== null || issue.closeDate === null) return false;
  const deadline = addSettlementDays(issue.closeDate, 3 + LISTING_GRACE_SETTLEMENT_DAYS, calendar);
  return today > deadline;
}

/** Where a closed issue is between close and listing. Null unless `closed`. */
export function closedStage(
  issue: IssueDates & { readonly allotmentDate: string | null },
  today: string,
  calendar: CalendarConfig,
): IpoClosedStage | null {
  if (ipoStatus(issue, today) !== 'closed' || issue.closeDate === null) return null;
  if (listingUnconfirmed(issue, today, calendar)) return 'listing_unconfirmed';
  const expected = expectedTimeline(issue.closeDate, calendar);
  const allotment = issue.allotmentDate ?? expected.allotment;
  if (today < allotment) return 'allotment_pending';
  if (today < expected.dematCredit) return 'allotment_done';
  return 'listing_pending';
}

export type TimelineEventKind =
  | 'opens'
  | 'closes'
  | 'allotment'
  | 'refunds'
  | 'demat_credit'
  | 'listing';

export interface TimelineEvent {
  readonly kind: TimelineEventKind;
  readonly date: string;
  /** True when the date is computed from the T+3 rule rather than stated by a source. */
  readonly expected: boolean;
  /** True when `date` is before today. */
  readonly done: boolean;
}

export interface TimelineInput extends IssueDates {
  readonly allotmentDate: string | null;
  readonly refundDate: string | null;
  readonly dematCreditDate: string | null;
}

/**
 * An issue's dated milestones, official where a source stated them and
 * expected otherwise. Withdrawn or postponed issues have no future milestones.
 */
export function ipoTimeline(
  issue: TimelineInput,
  today: string,
  calendar: CalendarConfig,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const add = (kind: TimelineEventKind, date: string | null, expected: boolean) => {
    if (date !== null) events.push({ kind, date, expected, done: date < today });
  };
  add('opens', issue.openDate, false);
  add('closes', issue.closeDate, false);
  if (issue.lifecycleOverride !== null || issue.closeDate === null) return events;
  const expected = expectedTimeline(issue.closeDate, calendar);
  add('allotment', issue.allotmentDate ?? expected.allotment, issue.allotmentDate === null);
  add('refunds', issue.refundDate ?? expected.refunds, issue.refundDate === null);
  add(
    'demat_credit',
    issue.dematCreditDate ?? expected.dematCredit,
    issue.dematCreditDate === null,
  );
  // Past the grace window an EXPECTED listing date would read as a listing
  // that happened; with no official date there is no listing to show.
  if (!listingUnconfirmed(issue, today, calendar))
    add('listing', issue.listingDate ?? expected.listing, issue.listingDate === null);
  return events;
}
