import type { CalendarConfig } from '@equitywise/shared';
import { fromIstParts } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { calendarExpiresSoon, sessionFor } from './calendar.js';

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
