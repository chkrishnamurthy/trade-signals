import { describe, expect, it } from 'vitest';
import {
  fromIstParts,
  IST_OFFSET_MINUTES,
  isPreOpen,
  isRegularSession,
  istDateKey,
  istMinutesOfDay,
  istParts,
  isWeekday,
  isWeekend,
  MARKET_CLOSE_MINUTES,
  MARKET_OPEN_MINUTES,
  minutesSinceOpen,
  nextSessionOpen,
  PRE_OPEN_START_MINUTES,
  SESSION_LENGTH_MINUTES,
  sessionClose,
  sessionOpen,
  startOfIstDay,
  toIstIsoString,
} from './time.js';

/** 2026-08-20 was a Thursday. */
const THURSDAY_OPEN = new Date('2026-08-20T03:45:00.000Z'); // 09:15 IST
const THURSDAY_MIDDAY = new Date('2026-08-20T06:30:00.000Z'); // 12:00 IST
const THURSDAY_CLOSE = new Date('2026-08-20T10:00:00.000Z'); // 15:30 IST
const SATURDAY_MIDDAY = new Date('2026-08-22T06:30:00.000Z'); // 12:00 IST Sat
const SUNDAY_MIDDAY = new Date('2026-08-23T06:30:00.000Z'); // 12:00 IST Sun

describe('constants', () => {
  it('pins IST at UTC+05:30', () => {
    expect(IST_OFFSET_MINUTES).toBe(330);
  });

  it('pins the NSE equity session at 09:15-15:30 IST', () => {
    expect(PRE_OPEN_START_MINUTES).toBe(540);
    expect(MARKET_OPEN_MINUTES).toBe(555);
    expect(MARKET_CLOSE_MINUTES).toBe(930);
    expect(SESSION_LENGTH_MINUTES).toBe(375);
  });
});

describe('istParts', () => {
  it('shifts a UTC instant into IST wall-clock fields', () => {
    expect(istParts(THURSDAY_OPEN)).toEqual({
      year: 2026,
      month: 8,
      day: 20,
      hour: 9,
      minute: 15,
      second: 0,
      millisecond: 0,
      weekday: 4,
    });
  });

  it('rolls the IST date forward past 18:30 UTC', () => {
    const parts = istParts(new Date('2026-08-20T18:30:00.000Z'));
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 21, hour: 0, minute: 0, weekday: 5 });
  });

  it('rolls the IST date back before 18:30 UTC on the previous day', () => {
    const parts = istParts(new Date('2026-08-19T18:29:59.999Z'));
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 19, hour: 23, minute: 59 });
  });

  it('does not observe daylight saving in either hemisphere summer', () => {
    expect(istParts(new Date('2026-01-15T06:30:00.000Z')).hour).toBe(12);
    expect(istParts(new Date('2026-07-15T06:30:00.000Z')).hour).toBe(12);
  });

  it('rejects an invalid Date', () => {
    expect(() => istParts(new Date('nope'))).toThrow(RangeError);
  });
});

describe('fromIstParts', () => {
  it('interprets wall-clock fields as IST and returns a UTC instant', () => {
    expect(fromIstParts({ year: 2026, month: 8, day: 20, hour: 9, minute: 15 })).toEqual(
      THURSDAY_OPEN,
    );
  });

  it('defaults the time fields to IST midnight', () => {
    expect(fromIstParts({ year: 2026, month: 8, day: 20 }).toISOString()).toBe(
      '2026-08-19T18:30:00.000Z',
    );
  });

  it('round-trips with istParts', () => {
    for (const instant of [THURSDAY_OPEN, THURSDAY_MIDDAY, SATURDAY_MIDDAY]) {
      const p = istParts(instant);
      expect(fromIstParts(p)).toEqual(instant);
    }
  });
});

describe('istDateKey', () => {
  it('returns the IST trading date', () => {
    expect(istDateKey(THURSDAY_MIDDAY)).toBe('2026-08-20');
  });

  it('uses the IST date, not the UTC date, late in the UTC evening', () => {
    expect(istDateKey(new Date('2026-08-20T20:00:00.000Z'))).toBe('2026-08-21');
  });

  it('zero-pads single-digit months and days', () => {
    expect(istDateKey(new Date('2026-01-05T06:30:00.000Z'))).toBe('2026-01-05');
  });
});

describe('toIstIsoString', () => {
  it('renders with an explicit +05:30 offset', () => {
    expect(toIstIsoString(THURSDAY_OPEN)).toBe('2026-08-20T09:15:00.000+05:30');
  });

  it('keeps milliseconds', () => {
    expect(toIstIsoString(new Date('2026-08-20T06:30:00.007Z'))).toBe(
      '2026-08-20T12:00:00.007+05:30',
    );
  });

  it('parses back to the same instant', () => {
    expect(new Date(toIstIsoString(THURSDAY_MIDDAY)).getTime()).toBe(THURSDAY_MIDDAY.getTime());
  });
});

describe('istMinutesOfDay', () => {
  it('counts minutes since IST midnight', () => {
    expect(istMinutesOfDay(THURSDAY_OPEN)).toBe(MARKET_OPEN_MINUTES);
    expect(istMinutesOfDay(THURSDAY_CLOSE)).toBe(MARKET_CLOSE_MINUTES);
    expect(istMinutesOfDay(new Date('2026-08-19T18:30:00.000Z'))).toBe(0);
  });
});

describe('startOfIstDay / sessionOpen / sessionClose', () => {
  it('anchors to IST midnight', () => {
    expect(startOfIstDay(THURSDAY_MIDDAY).toISOString()).toBe('2026-08-19T18:30:00.000Z');
  });

  it('returns 09:15 and 15:30 IST for the instant own IST date', () => {
    expect(sessionOpen(THURSDAY_MIDDAY)).toEqual(THURSDAY_OPEN);
    expect(sessionClose(THURSDAY_MIDDAY)).toEqual(THURSDAY_CLOSE);
  });

  it('uses the IST date even when the instant is on the previous UTC date', () => {
    expect(sessionOpen(new Date('2026-08-19T19:00:00.000Z'))).toEqual(THURSDAY_OPEN);
  });

  it('spans one full session', () => {
    const spanMinutes =
      (sessionClose(THURSDAY_MIDDAY).getTime() - sessionOpen(THURSDAY_MIDDAY).getTime()) / 60_000;
    expect(spanMinutes).toBe(SESSION_LENGTH_MINUTES);
  });
});

describe('isWeekend / isWeekday', () => {
  it('reads the weekday in IST', () => {
    expect(isWeekend(THURSDAY_MIDDAY)).toBe(false);
    expect(isWeekend(SATURDAY_MIDDAY)).toBe(true);
    expect(isWeekend(SUNDAY_MIDDAY)).toBe(true);
    expect(isWeekday(THURSDAY_MIDDAY)).toBe(true);
    expect(isWeekday(SUNDAY_MIDDAY)).toBe(false);
  });

  it('treats Friday 19:00 UTC as Saturday, because it is Saturday in IST', () => {
    expect(isWeekend(new Date('2026-08-21T19:00:00.000Z'))).toBe(true);
  });
});

describe('isPreOpen', () => {
  it('covers 09:00 up to but not including 09:15 IST', () => {
    expect(isPreOpen(new Date('2026-08-20T03:29:59.999Z'))).toBe(false); // 08:59:59
    expect(isPreOpen(new Date('2026-08-20T03:30:00.000Z'))).toBe(true); // 09:00
    expect(isPreOpen(new Date('2026-08-20T03:44:59.999Z'))).toBe(true); // 09:14:59
    expect(isPreOpen(THURSDAY_OPEN)).toBe(false); // 09:15
  });

  it('is false at the weekend', () => {
    expect(isPreOpen(new Date('2026-08-22T03:30:00.000Z'))).toBe(false);
  });
});

describe('isRegularSession', () => {
  it('includes the opening minute', () => {
    expect(isRegularSession(THURSDAY_OPEN)).toBe(true);
  });

  it('excludes the closing instant', () => {
    expect(isRegularSession(new Date('2026-08-20T09:59:59.999Z'))).toBe(true); // 15:29:59
    expect(isRegularSession(THURSDAY_CLOSE)).toBe(false); // 15:30:00
  });

  it('excludes pre-open and post-close', () => {
    expect(isRegularSession(new Date('2026-08-20T03:30:00.000Z'))).toBe(false);
    expect(isRegularSession(new Date('2026-08-20T11:00:00.000Z'))).toBe(false);
  });

  it('excludes weekends even at midday', () => {
    expect(isRegularSession(SATURDAY_MIDDAY)).toBe(false);
    expect(isRegularSession(SUNDAY_MIDDAY)).toBe(false);
  });
});

describe('minutesSinceOpen', () => {
  it('is zero at the open', () => {
    expect(minutesSinceOpen(THURSDAY_OPEN)).toBe(0);
  });

  it('is negative before the open', () => {
    expect(minutesSinceOpen(new Date('2026-08-20T03:30:00.000Z'))).toBe(-15);
  });

  it('reaches the session length at the close', () => {
    expect(minutesSinceOpen(THURSDAY_CLOSE)).toBe(SESSION_LENGTH_MINUTES);
  });
});

describe('nextSessionOpen', () => {
  it('returns today 09:15 when called before the open', () => {
    expect(nextSessionOpen(new Date('2026-08-20T03:00:00.000Z'))).toEqual(THURSDAY_OPEN);
  });

  it('returns tomorrow 09:15 when called at or after the open', () => {
    expect(nextSessionOpen(THURSDAY_OPEN).toISOString()).toBe('2026-08-21T03:45:00.000Z');
    expect(nextSessionOpen(THURSDAY_MIDDAY).toISOString()).toBe('2026-08-21T03:45:00.000Z');
  });

  it('skips the weekend', () => {
    // Friday midday -> Monday 09:15 IST.
    expect(nextSessionOpen(new Date('2026-08-21T06:30:00.000Z')).toISOString()).toBe(
      '2026-08-24T03:45:00.000Z',
    );
    expect(nextSessionOpen(SATURDAY_MIDDAY).toISOString()).toBe('2026-08-24T03:45:00.000Z');
    expect(nextSessionOpen(SUNDAY_MIDDAY).toISOString()).toBe('2026-08-24T03:45:00.000Z');
  });

  it('always lands on 09:15 IST on a weekday', () => {
    const start = Date.UTC(2026, 0, 1);
    for (let day = 0; day < 40; day += 1) {
      const next = nextSessionOpen(new Date(start + day * 86_400_000 + 5_000_000));
      expect(istMinutesOfDay(next)).toBe(MARKET_OPEN_MINUTES);
      expect(isWeekend(next)).toBe(false);
    }
  });

  it('rejects an invalid Date', () => {
    expect(() => nextSessionOpen(new Date('nope'))).toThrow(RangeError);
  });
});
