import { describe, expect, it } from 'vitest';
import { buildBreadthMarketRead } from './breadth-summary';

describe('buildBreadthMarketRead', () => {
  it('is bullish when participation is broadly strong', () => {
    const read = buildBreadthMarketRead({
      advances: 800,
      declines: 200,
      unchanged: 20,
      above20Pct: 76,
      above50Pct: 70,
      above200Pct: 64,
      newHighs: 90,
      newLows: 10,
    });
    expect(read.label).toBe('bullish');
    expect(read.headline).toContain('80%');
  });

  it('is bearish when participation is broadly weak', () => {
    expect(
      buildBreadthMarketRead({
        advances: 180,
        declines: 820,
        unchanged: 20,
        above20Pct: 20,
        above50Pct: 25,
        above200Pct: 30,
        newHighs: 5,
        newLows: 95,
      }).label,
    ).toBe('bearish');
  });

  it('is transitional when short-term participation opposes the long-term regime', () => {
    expect(
      buildBreadthMarketRead({
        advances: 800,
        declines: 200,
        unchanged: 20,
        above20Pct: 70,
        above50Pct: 42,
        above200Pct: 30,
        newHighs: 35,
        newLows: 45,
      }).label,
    ).toBe('transitional');
  });

  it('does not classify missing breadth', () => {
    expect(buildBreadthMarketRead(null).label).toBe('insufficient_data');
  });

  it.each([
    {
      name: 'All NSE on 2026-10-09',
      input: {
        advances: 1_447,
        declines: 1_099,
        unchanged: 74,
        above20Pct: 23.7,
        above50Pct: 26.1,
        above200Pct: 34.9,
        newHighs: 26,
        newLows: 125,
      },
      expected: 'bearish',
    },
    {
      name: 'Nifty 500 on 2026-10-09',
      input: {
        advances: 351,
        declines: 146,
        unchanged: 3,
        above20Pct: 19.2,
        above50Pct: 20,
        above200Pct: 33.1,
        newHighs: 3,
        newLows: 27,
      },
      expected: 'bearish',
    },
  ] as const)('matches the captured completed-session classification for $name', (scenario) => {
    const result = buildBreadthMarketRead(scenario.input);
    expect(result.label).toBe(scenario.expected);
    expect(result.headline).toContain('stocks advanced');
    expect(result.headline).toContain('200-day EMA');
  });

  it('treats no new highs or lows as absent evidence rather than neutral evidence', () => {
    const withoutExtremes = buildBreadthMarketRead({
      advances: 600,
      declines: 400,
      unchanged: 0,
      above20Pct: 58,
      above50Pct: 54,
      above200Pct: 52,
      newHighs: 0,
      newLows: 0,
    });
    expect(withoutExtremes.label).toBe('transitional');
    expect(withoutExtremes.headline).not.toContain('new 52-week');
  });
});
