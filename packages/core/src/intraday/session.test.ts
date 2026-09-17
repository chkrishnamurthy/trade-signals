import { describe, expect, it } from 'vitest';
import { dailyBars } from './fixture.js';
import { sessionEligibility } from './session.js';

describe('sessionEligibility', () => {
  const daily = dailyBars();
  it('passes the fixture: ₹2,940 close, ₹294 crore average turnover, no gap', () => {
    expect(sessionEligibility({ daily, todayOpen: 294_000, indexMoveBps: 50 })).toEqual({
      reason: null,
      previousClose: 294_000,
      gapBps: 0,
      averageTurnoverPaise: 294_000_000_000,
    });
  });
  it('GAP above 3 %: 2940 × 1.03 = 3028.20', () => {
    expect(sessionEligibility({ daily, todayOpen: 302_820, indexMoveBps: 0 }).reason).toBeNull();
    expect(sessionEligibility({ daily, todayOpen: 302_825, indexMoveBps: 0 }).reason).toBe('GAP');
    expect(sessionEligibility({ daily, todayOpen: 285_175, indexMoveBps: 0 }).reason).toBe('GAP');
  });
  it('PRICE_TOO_LOW below ₹100 and ILLIQUID below ₹25 crore', () => {
    const cheap = daily.map((b) => ({ ...b, open: 9_000, high: 9_500, low: 8_500, close: 9_000 }));
    expect(sessionEligibility({ daily: cheap, todayOpen: 9_000, indexMoveBps: 0 }).reason).toBe(
      'PRICE_TOO_LOW',
    );
    // 294000 × 85,000 = 2.499e10 < 2.5e10
    const thin = daily.map((b) => ({ ...b, volume: 85_000 }));
    expect(sessionEligibility({ daily: thin, todayOpen: 294_000, indexMoveBps: 0 }).reason).toBe(
      'ILLIQUID',
    );
    const enough = daily.map((b) => ({ ...b, volume: 85_035 }));
    expect(
      sessionEligibility({ daily: enough, todayOpen: 294_000, indexMoveBps: 0 }).reason,
    ).toBeNull();
  });
  it('index shock and unavailable index', () => {
    expect(sessionEligibility({ daily, todayOpen: 294_000, indexMoveBps: -200 }).reason).toBeNull();
    expect(sessionEligibility({ daily, todayOpen: 294_000, indexMoveBps: -201 }).reason).toBe(
      'INDEX_SHOCK',
    );
    expect(sessionEligibility({ daily, todayOpen: 294_000, indexMoveBps: null }).reason).toBe(
      'INDEX_UNAVAILABLE',
    );
  });
  it('HISTORY_INCOMPLETE with fewer than 20 sessions', () => {
    expect(
      sessionEligibility({ daily: daily.slice(-19), todayOpen: 294_000, indexMoveBps: 0 }).reason,
    ).toBe('HISTORY_INCOMPLETE');
  });
});
