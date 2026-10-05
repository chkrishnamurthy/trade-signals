import {
  type CalendarConfig,
  type ExchangeSession,
  fromIstParts,
  istParts,
  isWeekend,
} from '@equitywise/shared';

/**
 * Exchange calendar (docs/planning/paper-trading-plan.md §9.4). Pure lookup
 * over the versioned `config/nse-calendar.yaml`; the worker cross-checks the
 * answer against provider status and candle arrival for unscheduled closures.
 */
const at = (dateKey: string, hhmm: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return fromIstParts({
    year: y ?? 1970,
    month: m ?? 1,
    day: d ?? 1,
    hour: hh ?? 0,
    minute: mm ?? 0,
  }).getTime();
};

export function sessionFor(dateKey: string, calendar: CalendarConfig): ExchangeSession {
  const closed = (kind: ExchangeSession['kind'], note: string | null): ExchangeSession => ({
    tradingDate: dateKey,
    kind,
    openAt: null,
    closeAt: null,
    entryCutoffAt: null,
    squareOffAt: null,
    note,
  });
  const special = calendar.specialSessions.find((s) => s.date === dateKey);
  if (special)
    return {
      tradingDate: dateKey,
      kind: special.kind,
      openAt: at(dateKey, special.open),
      closeAt: at(dateKey, special.close),
      entryCutoffAt: at(dateKey, special.entryCutoff),
      squareOffAt: at(dateKey, special.squareOff),
      note: special.name,
    };
  const holiday = calendar.holidays.find((h) => h.date === dateKey);
  if (holiday) return closed('HOLIDAY', holiday.name);
  if (isWeekend(fromIstParts({ ...ymd(dateKey), hour: 12 }))) return closed('WEEKEND', null);
  const t = calendar.timings;
  return {
    tradingDate: dateKey,
    kind: 'NORMAL',
    openAt: at(dateKey, t.open),
    closeAt: at(dateKey, t.close),
    entryCutoffAt: at(dateKey, t.entryCutoff),
    squareOffAt: at(dateKey, t.squareOff),
    note: null,
  };
}
function ymd(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** True when the config's verified range no longer covers `dateKey` plus `warnDays`. */
export function calendarExpiresSoon(
  dateKey: string,
  calendar: CalendarConfig,
  warnDays = 14,
): boolean {
  const today = fromIstParts({ ...ymd(dateKey), hour: 12 }).getTime();
  const through = fromIstParts({ ...ymd(calendar.verifiedThrough), hour: 12 }).getTime();
  return through - today < warnDays * 86_400_000;
}
export { istParts };

/**
 * Is the exchange scheduled to trade on `dateKey` (`YYYY-MM-DD`, IST)?
 *
 * Answers from the versioned config only. It cannot know about an unscheduled
 * closure, and it says nothing about a date past `verifiedThrough` beyond what the
 * weekday rule implies — pair it with `calendarExpiresSoon`. Offline paths
 * (coverage reports, replays) use this instead of treating a holiday as a session
 * with missing data.
 */
export function isTradingDay(dateKey: string, calendar: CalendarConfig): boolean {
  const kind = sessionFor(dateKey, calendar).kind;
  return kind === 'NORMAL' || kind === 'SPECIAL' || kind === 'MUHURAT';
}

/** `dateKey` shifted by whole days, as `YYYY-MM-DD`. */
function shiftDay(dateKey: string, days: number): string {
  const { year, month, day } = ymd(dateKey);
  const shifted = fromIstParts({ year, month, day: day + days, hour: 12 });
  const p = istParts(shifted);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Scheduled trading days from `from` to `to` inclusive, oldest first. Capped at ~3 years. */
export function tradingDaysBetween(
  from: string,
  to: string,
  calendar: CalendarConfig,
): readonly string[] {
  const days: string[] = [];
  for (let cursor = from, guard = 0; cursor <= to && guard < 1100; guard += 1) {
    if (isTradingDay(cursor, calendar)) days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}

/** The latest scheduled trading day strictly before `dateKey`, or null within a year. */
export function previousTradingDay(dateKey: string, calendar: CalendarConfig): string | null {
  let cursor = dateKey;
  for (let i = 0; i < 366; i += 1) {
    cursor = shiftDay(cursor, -1);
    if (isTradingDay(cursor, calendar)) return cursor;
  }
  return null;
}
