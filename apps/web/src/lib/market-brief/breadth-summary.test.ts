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
});
