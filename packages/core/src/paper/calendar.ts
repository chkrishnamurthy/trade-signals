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
