import type { IpoBoard, IpoClosedStage, IpoStatus } from '@equitywise/shared';
import type { AgendaEventKind, GmpChipDto, IpoListItemDto } from './ipo-types';

/**
 * Wording and small formatting for the IPO pages. Pure, so the copy rules
 * (plan §10.3, §11) are unit-tested: no "apply", "subscribe now", "recommended",
 * "hot" or "target" anywhere, and GMP is never called an estimate or expectation.
 */

const DASH = '—';

/**
 * Fixed month and weekday words. `Intl` month names differ between runtimes
 * (newer ICU writes "Sept" in en-GB), and a server/browser difference is a
 * hydration mismatch — so date words come from these tables, never from Intl.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(dateKey: string): { y: number; m: number; d: number; weekday: number } | null {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) return null;
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** `2026-10-05` → `Mon 5 Oct`. */
export function shortDate(dateKey: string | null): string {
  if (dateKey === null) return DASH;
  const p = parts(dateKey);
  return p === null ? dateKey : `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m - 1]}`;
}

/** `2026-10-05` → `5 Oct 2026`. */
export function longDate(dateKey: string | null): string {
  if (dateKey === null) return DASH;
  const p = parts(dateKey);
  return p === null ? dateKey : `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** `30 Sep – 5 Oct`, or one side alone, or "Dates not announced". */
export function dateRange(open: string | null, close: string | null): string {
  if (open === null && close === null) return 'Dates not announced';
  const strip = (s: string) => s.replace(/^[A-Za-z]{3} /, '');
  if (open === null) return `Closes ${shortDate(close)}`;
  if (close === null) return `Opens ${shortDate(open)}`;
  return `${strip(shortDate(open))} – ${strip(shortDate(close))}`;
}

/** An instant as IST clock time with day: `5 Oct, 5:00 pm`. */
export function istDayTime(iso: string | null): string {
  if (iso === null) return DASH;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return DASH;
  const ist = new Date(t + 330 * 60_000);
  const hour = ist.getUTCHours();
  const minute = String(ist.getUTCMinutes()).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}, ${h12}:${minute} ${hour < 12 ? 'am' : 'pm'}`;
}

export const BOARD_LABEL: Readonly<Record<IpoBoard, string>> = {
  mainboard: 'Mainboard',
  sme: 'SME',
};

/** The board inside a sentence: "every mainboard issue", "every SME issue". */
export const BOARD_WORD: Readonly<Record<IpoBoard, string>> = {
  mainboard: 'mainboard',
  sme: 'SME',
};

export const STATUS_LABEL: Readonly<Record<IpoStatus, string>> = {
  upcoming: 'Upcoming',
  open: 'Open',
  closed: 'Closed',
  listed: 'Listed',
  withdrawn: 'Withdrawn',
  postponed: 'Postponed',
};

/** A company name without its trailing "Limited", for tight spaces: `Vishal Nirmiti`. */
export function shortName(companyName: string): string {
  return companyName.replace(/[\s,]+(limited|ltd\.?)$/i, '').trim() || companyName;
}

/** Closed and still on the way to listing — not one past T+3 with no listing reported. */
export function awaitingListing(item: Pick<IpoListItemDto, 'status' | 'closedStage'>): boolean {
  return item.status === 'closed' && item.closedStage !== 'listing_unconfirmed';
}

/** The one line that says what happens next for an issue. */
export function nextMilestone(item: IpoListItemDto, today: string): string {
  switch (item.status) {
    case 'upcoming':
      return item.openDate === null ? 'Dates not announced' : `Opens ${shortDate(item.openDate)}`;
    case 'open':
      return item.closeDate === today ? 'Closes today' : `Closes ${shortDate(item.closeDate)}`;
    case 'closed': {
      const listing = item.listingDate ?? item.expectedListingDate;
      if (listing === null) return 'Closed';
      return `${item.listingDate === null ? 'Expected listing' : 'Listing'} ${shortDate(listing)}`;
    }
    case 'listed':
      return `Listed ${shortDate(item.listingDate)}`;
    case 'withdrawn':
      return 'Withdrawn by the company';
    case 'postponed':
      return 'Postponed';
  }
}

/**
 * The colour a state carries — open green, awaiting listing amber, upcoming
 * or listing today blue, listed grey. A state, never a verdict.
 */
export type IpoTone = 'open' | 'waiting' | 'info' | 'listed' | 'inactive';

function daysFrom(today: string, dateKey: string): number {
  return Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

/** `today`, `tomorrow`, a weekday within the week ahead, else `5 Oct`. */
export function dayLabel(dateKey: string, today: string): string {
  const days = daysFrom(today, dateKey);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  const short = shortDate(dateKey);
  return days > 1 && days < 7 ? short.slice(0, 3) : short.replace(/^[A-Za-z]{3} /, '');
}

const CLOSED_CHIP: Readonly<Record<IpoClosedStage, string>> = {
  allotment_pending: 'Allotment pending',
  allotment_done: 'Allotment out',
  listing_pending: 'Listing next',
  listing_unconfirmed: 'No listing reported',
};

/**
 * A row's state in two parts: the chip (what is happening) and a note with
 * the next date. An expected T+3 date ends in `*`, which the table footnotes.
 */
export function statusParts(
  item: Pick<
    IpoListItemDto,
    'status' | 'closedStage' | 'openDate' | 'closeDate' | 'listingDate' | 'expectedListingDate'
  >,
  today: string,
): { chip: string; note: string | null; tone: IpoTone } {
  switch (item.status) {
    case 'open':
      return {
        chip: 'Open',
        note: item.closeDate === null ? null : `closes ${dayLabel(item.closeDate, today)}`,
        tone: 'open',
      };
    case 'upcoming':
      return {
        chip: 'Upcoming',
        note: item.openDate === null ? 'dates not announced' : `opens ${shortDate(item.openDate)}`,
        tone: 'info',
      };
    case 'closed': {
      const stage = item.closedStage ?? 'allotment_pending';
      if (stage === 'listing_unconfirmed')
        return { chip: CLOSED_CHIP[stage], note: null, tone: 'inactive' };
      const listing = item.listingDate ?? item.expectedListingDate;
      return {
        chip: CLOSED_CHIP[stage],
        note:
          listing === null
            ? null
            : `lists ${shortDate(listing)}${item.listingDate === null ? '*' : ''}`,
        tone: 'waiting',
      };
    }
    case 'listed':
      return item.listingDate === today
        ? { chip: 'Listing today', note: null, tone: 'info' }
        : { chip: 'Listed', note: shortDate(item.listingDate), tone: 'listed' };
    case 'withdrawn':
    case 'postponed':
      return { chip: STATUS_LABEL[item.status], note: null, tone: 'inactive' };
  }
}

/** One compact label for a dashboard row: `Open · closes Mon`, `Lists Tue 6 Oct*`. */
export function stateLabel(
  item: Pick<
    IpoListItemDto,
    'status' | 'closedStage' | 'openDate' | 'closeDate' | 'listingDate' | 'expectedListingDate'
  >,
  today: string,
): { label: string; tone: IpoTone } {
  const parts = statusParts(item, today);
  switch (item.status) {
    case 'open':
      return { label: parts.note === null ? 'Open' : `Open · ${parts.note}`, tone: parts.tone };
    case 'upcoming':
      return {
        label: item.openDate === null ? 'Dates not announced' : `Opens ${shortDate(item.openDate)}`,
        tone: parts.tone,
      };
    case 'closed':
      return {
        label: parts.note === null ? parts.chip : `L${parts.note.slice(1)}`,
        tone: parts.tone,
      };
    case 'listed':
      return {
        label: parts.note === null ? parts.chip : `Listed ${parts.note}`,
        tone: parts.tone,
      };
    default:
      return { label: parts.chip, tone: parts.tone };
  }
}

/** `0.57×`, `12.23×`, or a dash. */
export function times(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)}×`;
}

export const SCOPE_LABEL = {
  consolidated: 'NSE + BSE bids',
  nse: 'NSE bids only',
  bse: 'BSE bids only',
} as const;

/**
 * Whose bids a figure counts, in words. For an issue on one exchange only,
 * that exchange's bids are all the bids there are.
 */
export function scopeLabel(scope: keyof typeof SCOPE_LABEL, exchanges: readonly string[]): string {
  if (exchanges.length === 1) return `All bids (${exchanges[0]})`;
  return SCOPE_LABEL[scope];
}

/** `₹20 (+9.09%)`, `−₹5 (−1.64%)`, or `No quote`. Never "expected". */
export function gmpText(gmp: Pick<GmpChipDto, 'latestPaise' | 'percentOfUpperBand'>): string {
  if (gmp.latestPaise === null) return 'No quote';
  const rupees = Math.abs(gmp.latestPaise) / 100;
  const amount = `${gmp.latestPaise < 0 ? '−' : ''}₹${rupees.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;
  if (gmp.percentOfUpperBand === null) return amount;
  const pct = gmp.percentOfUpperBand;
  return `${amount} (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}%)`;
}

export const AGENDA_LABEL: Readonly<Record<AgendaEventKind, string>> = {
  opens: 'Opens',
  closes: 'Closes',
  allotment: 'Allotment',
  refunds: 'Refunds',
  demat_credit: 'Shares credited',
  listing: 'Listing',
};

/** The short line shown beside every GMP figure, card and header included. */
export const GMP_SHORT_NOTE = 'Unofficial grey-market quote — not verified, not a forecast.';
