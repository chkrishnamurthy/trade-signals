import { describe, expect, it } from 'vitest';
import {
  addMarketDays,
  isMarketDateKey,
  marketCalendarConfigSchema,
  marketCalendarDateRanges,
  marketEventInstant,
} from './market-calendar.js';

const validEvent = {
  key: 'config:result:TCS:2026-Q2',
  symbol: 'TCS',
  event_type: 'result',
  title: 'TCS quarterly results',
  event_date: '2026-10-10',
  event_time: '09:30',
  source_name: 'NSE',
  source_url: 'https://www.nseindia.com/',
  importance: 'high',
};

describe('market calendar config', () => {
  it('accepts a supported, traceable event', () => {
    expect(marketCalendarConfigSchema.parse({ events: [validEvent] }).events).toHaveLength(1);
  });

  it('rejects duplicate keys, impossible dates, unsupported types and unsafe URLs', () => {
    expect(marketCalendarConfigSchema.safeParse({ events: [validEvent, validEvent] }).success).toBe(
      false,
    );
    expect(
      marketCalendarConfigSchema.safeParse({
        events: [{ ...validEvent, event_date: '2026-02-30' }],
      }).success,
    ).toBe(false);
    expect(
      marketCalendarConfigSchema.safeParse({
        events: [{ ...validEvent, event_type: 'conference' }],
      }).success,
    ).toBe(false);
    expect(
      marketCalendarConfigSchema.safeParse({
        events: [{ ...validEvent, source_url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
  });
});

describe('market event time', () => {
  it('converts an IST wall-clock value to a UTC instant', () => {
    expect(marketEventInstant('2026-10-10', '09:30')?.toISOString()).toBe(
      '2026-10-10T04:00:00.000Z',
    );
    expect(marketEventInstant('2026-10-10', null)).toBeNull();
  });
});

describe('market calendar ranges', () => {
  it('uses Monday-Sunday and the current IST calendar month', () => {
    const ranges = marketCalendarDateRanges(new Date('2026-10-02T06:30:00.000Z'));
    expect(ranges.today).toEqual({ from: '2026-10-02', to: '2026-10-02' });
    expect(ranges.week).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(ranges.month).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(ranges.upcoming).toEqual({ from: '2026-10-02', to: '2026-11-01' });
  });

  it('handles month and year rollover without the host timezone', () => {
    expect(addMarketDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isMarketDateKey('2028-02-29')).toBe(true);
    expect(isMarketDateKey('2027-02-29')).toBe(false);
  });
});
