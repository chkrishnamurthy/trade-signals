import type { Bar } from '@equitywise/market-data';
import { describe, expect, it } from 'vitest';
import { latestSession } from './history';

/** A 5m bar opening at the given IST wall-clock time on 2026-09-1{day}. */
function bar(day: number, hour: number, minute: number): Bar {
  const timestamp = Date.UTC(2026, 8, day, hour, minute) - 330 * 60_000;
  return { timestamp, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

const OPEN_15 = Date.UTC(2026, 8, 15, 9, 15) - 330 * 60_000;
const CLOSE_15 = Date.UTC(2026, 8, 15, 15, 30) - 330 * 60_000;

describe('latestSession', () => {
  it('returns null for no bars', () => {
    expect(latestSession([])).toBeNull();
  });

  it('keeps only the bars of the session the last bar falls on', () => {
    const friday = [bar(11, 9, 15), bar(11, 15, 25)];
    const monday = [bar(14, 9, 15), bar(14, 12, 0), bar(14, 15, 25)];
    const tuesday = [bar(15, 9, 15), bar(15, 9, 50)];
    const result = latestSession([...friday, ...monday, ...tuesday]);
    expect(result?.bars).toEqual(tuesday);
    expect(result?.session).toEqual({ open: OPEN_15, close: CLOSE_15 });
  });

  it('falls back to the previous session before today has any bars', () => {
    // Monday 09:05 IST: the only bars are Friday's, so Friday is the session.
    const friday = [bar(11, 9, 15), bar(11, 15, 25)];
    const result = latestSession(friday);
    expect(result?.bars).toEqual(friday);
    expect(result?.session).toEqual({
      open: Date.UTC(2026, 8, 11, 9, 15) - 330 * 60_000,
      close: Date.UTC(2026, 8, 11, 15, 30) - 330 * 60_000,
    });
  });

  it('identifies the session by IST date, not UTC date', () => {
    // 09:15 IST is 03:45 UTC — same UTC date — but a late-evening bar the
    // previous day is on a different IST date even though UTC would agree.
    const result = latestSession([bar(14, 23, 30), bar(15, 9, 15)]);
    expect(result?.bars).toEqual([bar(15, 9, 15)]);
  });
});
