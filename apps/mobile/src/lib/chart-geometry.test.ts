import { describe, expect, it } from 'vitest';
import { barTime, chartGeometry, nearestIndex } from './chart-geometry';

describe('chart geometry', () => {
  it('maps the lowest close to the bottom and the highest to the top', () => {
    const g = chartGeometry(
      [
        { t: 1, c: 100 },
        { t: 2, c: 300 },
        { t: 3, c: 200 },
      ],
      200,
      108,
    );
    expect(g?.ys).toEqual([104, 4, 54]);
    expect(g?.xs).toEqual([0, 100, 200]);
    expect(g?.path.startsWith('M0.0,104.0')).toBe(true);
  });

  it('needs at least two points', () => {
    expect(chartGeometry([{ t: 1, c: 1 }], 100, 100)).toBeNull();
  });

  it('finds the nearest point to a touch', () => {
    expect(nearestIndex(0, 300, 4)).toBe(0);
    expect(nearestIndex(160, 300, 4)).toBe(2);
    expect(nearestIndex(999, 300, 4)).toBe(3);
  });

  it('reads both bar-time encodings', () => {
    expect(barTime(1_790_000_000_000)).toBe(1_790_000_000_000);
    expect(barTime('2026-09-24T03:45:00.000Z')).toBe(Date.UTC(2026, 8, 24, 3, 45));
  });
});
