import { istDateKey } from '@equitywise/shared';

/**
 * The trailing-return windows the watchlist can show.
 *
 * One declaration per window: what it is called, and where its anchor session
 * sits relative to now. The registry turns each into a column, the server turns
 * each into a `closesAsOf` anchor, and neither has to restate the list.
 *
 * A return is measured from the CLOSE of the anchor session to the current
 * price, so the anchor is a calendar cutoff — "the last session on or before
 * this instant" — never a bar count. Bar counts drift with holidays, and a
 * "1 month" that means twenty-one sessions is a different number in October
 * than in March.
 *
 * There is deliberately no 1D window here: today's move is `Change %`, computed
 * from the quote's own previous close, and a second column reading the same
 * number from a different source is how two cells end up disagreeing.
 */

export interface ReturnWindow {
  readonly id: string;
  /** Table header. */
  readonly label: string;
  readonly description: string;
  /** Calendar offset from today. `ytd` anchors on the previous year-end. */
  readonly shift: { readonly days: number } | { readonly months: number } | { readonly ytd: true };
  /**
   * How stale the anchor session may be, in calendar days.
   *
   * Tight for the week window, where a fortnight-old close would silently
   * answer a seven-day question; looser for the rest, where an Indian holiday
   * cluster can legitimately push the anchor back several sessions.
   */
  readonly toleranceDays: number;
}

export const RETURN_WINDOWS: readonly ReturnWindow[] = [
  {
    id: 'return1w',
    label: '1W %',
    description: 'Price change over the last week',
    shift: { days: 7 },
    toleranceDays: 10,
  },
  {
    id: 'return1m',
    label: '1M %',
    description: 'Price change over the last month',
    shift: { months: 1 },
    toleranceDays: 21,
  },
  {
    id: 'return3m',
    label: '3M %',
    description: 'Price change over the last three months',
    shift: { months: 3 },
    toleranceDays: 21,
  },
  {
    id: 'return6m',
    label: '6M %',
    description: 'Price change over the last six months',
    shift: { months: 6 },
    toleranceDays: 21,
  },
  {
    id: 'returnYtd',
    label: 'YTD %',
    description: 'Price change since the last close of the previous calendar year',
    shift: { ytd: true },
    toleranceDays: 21,
  },
  {
    id: 'return1y',
    label: '1Y %',
    description: 'Price change over the last year',
    shift: { months: 12 },
    toleranceDays: 21,
  },
  {
    id: 'return3y',
    label: '3Y %',
    description: 'Price change over the last three years',
    shift: { months: 36 },
    toleranceDays: 21,
  },
  {
    id: 'return5y',
    label: '5Y %',
    description: 'Price change over the last five years',
    shift: { months: 60 },
    toleranceDays: 21,
  },
];

export type ReturnWindowId = string;

/** Anchor closes, keyed by window id. Absent = no session that far back. */
export type ReturnCloses = Readonly<Record<string, number>>;

interface CalendarDate {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
}

function parseIstDate(key: string): CalendarDate {
  const [year, month, day] = key.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** Days in a Gregorian month. Only used to clamp a shifted day-of-month. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Shifts a calendar date back by whole months, clamping the day.
 *
 * 31 March minus one month is 28 February, not 3 March. Rolling over is what
 * `Date.setMonth` does, and it would make the one-month return of every
 * month-end quote measure from the wrong session.
 */
function minusMonths(date: CalendarDate, months: number): CalendarDate {
  const zeroBased = date.year * 12 + (date.month - 1) - months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function minusDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day - days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * The cutoff instant for an IST calendar date: the end of that day.
 *
 * A daily bar is stamped inside its own session, so an end-of-day cutoff picks
 * up that date's bar and can never reach the next one — the following session's
 * bar is stamped at least a day later.
 */
function endOf(date: CalendarDate): Date {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return new Date(`${date.year}-${month}-${day}T23:59:59.999Z`);
}

export interface ReturnAnchor {
  readonly key: string;
  readonly at: Date;
  readonly toleranceDays: number;
}

/**
 * The anchor instant for every window, relative to `now`.
 *
 * `now` is a parameter rather than a `Date.now()` call so the caller owns the
 * clock — the same discipline the rest of the product's date handling follows.
 * The calendar walked is IST, because "since the start of the year" means the
 * exchange's year, not UTC's.
 */
export function returnAnchors(now: Date): ReturnAnchor[] {
  const today = parseIstDate(istDateKey(now));

  return RETURN_WINDOWS.map((window) => {
    const anchor =
      'ytd' in window.shift
        ? { year: today.year - 1, month: 12, day: 31 }
        : 'days' in window.shift
          ? minusDays(today, window.shift.days)
          : minusMonths(today, window.shift.months);

    return { key: window.id, at: endOf(anchor), toleranceDays: window.toleranceDays };
  });
}
