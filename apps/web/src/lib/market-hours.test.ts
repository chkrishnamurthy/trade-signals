import { describe, expect, it } from 'vitest';
import { closedMarketMessage, isFeedDownCode } from './market-hours';

/**
 * IST is UTC+5:30. The weekday session is 09:15–15:30 IST.
 * 2026-09-04 is a Friday, 2026-09-05 a Saturday, 2026-09-07 a Monday.
 * `${ist}` below is the UTC instant for a given IST wall-clock time.
 */
function ist(isoWithoutZone: string): Date {
  return new Date(`${isoWithoutZone}+05:30`);
}

describe('closedMarketMessage', () => {
  it('returns null during the weekday session so real outages still surface', () => {
    expect(closedMarketMessage(ist('2026-09-04T09:15:00'))).toBeNull(); // open bell
    expect(closedMarketMessage(ist('2026-09-04T12:00:00'))).toBeNull(); // mid-session
    expect(closedMarketMessage(ist('2026-09-04T15:30:00'))).toBeNull(); // closing bell
  });

  it('reports the weekend', () => {
    expect(closedMarketMessage(ist('2026-09-05T12:00:00'))).toMatch(/weekend/i);
    expect(closedMarketMessage(ist('2026-09-06T12:00:00'))).toMatch(/weekend/i);
  });

  it('reports pre-open and post-close on a weekday', () => {
    expect(closedMarketMessage(ist('2026-09-04T09:14:59'))).toMatch(/not opened/i);
    expect(closedMarketMessage(ist('2026-09-04T07:30:00'))).toMatch(/not opened/i);
    expect(closedMarketMessage(ist('2026-09-04T15:30:01'))).toMatch(/closed for the day/i);
    expect(closedMarketMessage(ist('2026-09-04T18:00:00'))).toMatch(/closed for the day/i);
  });
});

describe('isFeedDownCode', () => {
  it('is true for feed-unavailable codes', () => {
    for (const code of ['AUTH', 'UPSTREAM', 'NOT_CONFIGURED', 'RATE_LIMIT']) {
      expect(isFeedDownCode(code)).toBe(true);
    }
  });

  it('is false for real faults and client drops, so they are never masked', () => {
    expect(isFeedDownCode('NETWORK')).toBe(false);
    expect(isFeedDownCode('UNKNOWN')).toBe(false);
    expect(isFeedDownCode(undefined)).toBe(false);
  });
});
