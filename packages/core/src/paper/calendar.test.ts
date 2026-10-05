import type { CalendarConfig } from '@equitywise/shared';
import { fromIstParts } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import {
  calendarExpiresSoon,
  isTradingDay,
  previousTradingDay,
  sessionFor,
  tradingDaysBetween,
} from './calendar.js';

const calendar: CalendarConfig = {
  exchange: 'NSE',
  verifiedThrough: '2026-12-31',
  timings: { open: '09:15', close: '15:30', entryCutoff: '14:30', squareOff: '15:15' },
  holidays: [{ date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' }],
  specialSessions: [
    {
      date: '2026-11-08',
      kind: 'MUHURAT',
      name: 'Muhurat trading',
      open: '18:15',
      close: '19:15',
      entryCutoff: '18:45',
      squareOff: '19:05',
    },
  ],
};
const ist = (y: number, m: number, d: number, hh: number, mm: number) =>
  fromIstParts({ year: y, month: m, day: d, hour: hh, minute: mm }).getTime();

describe('sessionFor', () => {
  it('a normal weekday uses the default timings', () => {
    expect(sessionFor('2026-09-17', calendar)).toEqual({
      tradingDate: '2026-09-17',
      kind: 'NORMAL',
      openAt: ist(2026, 9, 17, 9, 15),
      closeAt: ist(2026, 9, 17, 15, 30),
      entryCutoffAt: ist(2026, 9, 17, 14, 30),
      squareOffAt: ist(2026, 9, 17, 15, 15),
      note: null,
    });
  });
  it('holidays and weekends are closed, with the reason', () => {
    expect(sessionFor('2026-10-02', calendar)).toMatchObject({
      kind: 'HOLIDAY',
      openAt: null,
      note: 'Mahatma Gandhi Jayanti',
    });
    expect(sessionFor('2026-09-19', calendar)).toMatchObject({ kind: 'WEEKEND', openAt: null });
  });
  it('a special session overrides everything, including a Sunday', () => {
    expect(sessionFor('2026-11-08', calendar)).toMatchObject({
      kind: 'MUHURAT',
      openAt: ist(2026, 11, 8, 18, 15),
      squareOffAt: ist(2026, 11, 8, 19, 5),
      note: 'Muhurat trading',
    });
  });
  it('warns two weeks before the verified range ends', () => {
    expect(calendarExpiresSoon('2026-12-10', calendar)).toBe(false);
    expect(calendarExpiresSoon('2026-12-18', calendar)).toBe(true);
  });
});

describe('isTradingDay', () => {
  it('is true for ordinary weekdays and special sessions', () => {
    expect(isTradingDay('2026-09-17', calendar)).toBe(true);
    expect(isTradingDay('2026-11-08', calendar)).toBe(true); // Muhurat, a Sunday
  });
  it('is false for weekends and listed holidays', () => {
    expect(isTradingDay('2026-09-19', calendar)).toBe(false); // Saturday
    expect(isTradingDay('2026-09-20', calendar)).toBe(false); // Sunday
    expect(isTradingDay('2026-10-02', calendar)).toBe(false); // holiday (also a Friday)
  });
});

describe('tradingDaysBetween', () => {
  it('lists scheduled days only, skipping weekends and holidays, bounds inclusive', () => {
    expect(tradingDaysBetween('2026-09-30', '2026-10-06', calendar)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-05',
      '2026-10-06',
    ]);
  });
  it('is empty when from is after to', () => {
    expect(tradingDaysBetween('2026-10-06', '2026-10-01', calendar)).toEqual([]);
  });
  it('crosses a month and year boundary', () => {
    expect(tradingDaysBetween('2026-12-30', '2027-01-04', calendar)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-04',
    ]);
  });
});

describe('previousTradingDay', () => {
  it('steps back over a weekend', () => {
    expect(previousTradingDay('2026-09-21', calendar)).toBe('2026-09-18'); // Mon -> Fri
  });
  it('steps back over a holiday and the weekend after it', () => {
    expect(previousTradingDay('2026-10-05', calendar)).toBe('2026-10-01');
  });
});
