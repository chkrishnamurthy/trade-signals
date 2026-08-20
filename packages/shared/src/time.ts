/**
 * IST and market-session time.
 *
 * Every instant in this system is stored and passed around as a UTC `Date`
 * (TIMESTAMPTZ in the database, see CLAUDE.md hard rule 6). IST exists only at
 * two boundaries: interpreting an exchange-local wall-clock time on the way in,
 * and rendering for a human on the way out. Both live here.
 *
 * India Standard Time is UTC+05:30 and has never observed daylight saving, so
 * the offset is a constant and none of this needs a timezone database.
 *
 * These helpers are pure: no `Date.now()`, no ambient timezone. Callers pass the
 * instant in.
 */

/** IST is UTC+05:30, year-round, no DST. */
export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;

/** NSE equity pre-open call auction begins at 09:00 IST. */
export const PRE_OPEN_START_MINUTES = 9 * 60;

/**
 * NSE equity continuous trading begins at 09:15 IST.
 *
 * This is also the origin every derived candle bucket is aligned to — a 15m
 * candle covers 09:15-09:30, not 09:00-09:15 (CLAUDE.md hard rule 4).
 */
export const MARKET_OPEN_MINUTES = 9 * 60 + 15;

/** NSE equity continuous trading ends at 15:30 IST. */
export const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

/** Wall-clock fields of an instant, as read in IST. */
export interface IstParts {
  readonly year: number;
  /** 1-12, unlike `Date.getUTCMonth()`. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  /** 0 = Sunday ... 6 = Saturday. */
  readonly weekday: number;
}

/** Wall-clock fields to interpret as IST. */
export interface IstInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  readonly millisecond?: number;
}

function assertValidDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`${label}: received an invalid Date`);
  }
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Reads an instant's wall-clock fields in IST. */
export function istParts(date: Date): IstParts {
  assertValidDate(date, 'istParts');
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    weekday: shifted.getUTCDay(),
  };
}

/** Builds the UTC instant for a wall-clock time expressed in IST. */
export function fromIstParts(parts: IstInput): Date {
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );
  return new Date(utcMs - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

/**
 * The IST calendar date an instant falls on, as `YYYY-MM-DD`.
 *
 * This is the trading-date key: 2026-08-20T18:00:00Z is 2026-08-20 23:30 IST,
 * so it belongs to trading date `2026-08-20`.
 */
export function istDateKey(date: Date): string {
  const parts = istParts(date);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** ISO-8601 with an explicit `+05:30` offset, for logs and the UI boundary. */
export function toIstIsoString(date: Date): string {
  const p = istParts(date);
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.millisecond, 3)}`;
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${time}+05:30`;
}

/** Minutes elapsed since IST midnight, 0-1439. */
export function istMinutesOfDay(date: Date): number {
  const parts = istParts(date);
  return parts.hour * 60 + parts.minute;
}

/** Midnight IST at the start of the instant's IST calendar day, as a UTC instant. */
export function startOfIstDay(date: Date): Date {
  const parts = istParts(date);
  return fromIstParts({ year: parts.year, month: parts.month, day: parts.day });
}

/** Minutes past IST midnight on the instant's IST date, as a UTC instant. */
function istDayAt(date: Date, minutesOfDay: number): Date {
  return new Date(startOfIstDay(date).getTime() + minutesOfDay * MS_PER_MINUTE);
}

/** 09:15 IST on the instant's IST date. */
export function sessionOpen(date: Date): Date {
  return istDayAt(date, MARKET_OPEN_MINUTES);
}

/** 15:30 IST on the instant's IST date. */
export function sessionClose(date: Date): Date {
  return istDayAt(date, MARKET_CLOSE_MINUTES);
}

/** Saturday or Sunday in IST. */
export function isWeekend(date: Date): boolean {
  const weekday = istParts(date).weekday;
  return weekday === 0 || weekday === 6;
}

/**
 * Monday-Friday in IST.
 *
 * Says nothing about exchange holidays — those come from the trading calendar,
 * not from arithmetic.
 */
export function isWeekday(date: Date): boolean {
  return !isWeekend(date);
}

/** Inside the 09:00-09:15 IST pre-open call auction on a weekday. */
export function isPreOpen(date: Date): boolean {
  const minutes = istMinutesOfDay(date);
  return isWeekday(date) && minutes >= PRE_OPEN_START_MINUTES && minutes < MARKET_OPEN_MINUTES;
}

/**
 * Inside continuous trading: `[09:15, 15:30)` IST on a weekday.
 *
 * Open is inclusive, close is exclusive — 15:30:00 is already closed, and the
 * final 1m candle of the day opens at 15:29.
 *
 * Holiday-unaware; combine with the trading calendar for a real answer.
 */
export function isRegularSession(date: Date): boolean {
  const minutes = istMinutesOfDay(date);
  return isWeekday(date) && minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;
}

/**
 * Minutes since 09:15 IST on the instant's own IST date.
 *
 * Negative before the open, and beyond `MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES`
 * (375) after the close.
 */
export function minutesSinceOpen(date: Date): number {
  return istMinutesOfDay(date) - MARKET_OPEN_MINUTES;
}

/** Length of a full continuous-trading session in minutes (375). */
export const SESSION_LENGTH_MINUTES = MARKET_CLOSE_MINUTES - MARKET_OPEN_MINUTES;

/**
 * The next weekday 09:15 IST strictly after `date`.
 *
 * Holiday-unaware, so this is the earliest instant trading *could* start, not a
 * promise that it will.
 */
export function nextSessionOpen(date: Date): Date {
  assertValidDate(date, 'nextSessionOpen');
  let candidate = sessionOpen(date);
  while (candidate.getTime() <= date.getTime() || isWeekend(candidate)) {
    candidate = new Date(candidate.getTime() + MINUTES_PER_DAY * MS_PER_MINUTE);
  }
  return candidate;
}
