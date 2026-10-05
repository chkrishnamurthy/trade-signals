import { describe, expect, it } from 'vitest';
import {
  capGroups,
  companySizeByIndex,
  concentration,
  groupByWeight,
  topContributors,
  treemapLayout,
} from './insight.js';

describe('groupByWeight', () => {
  it('adds up by key, largest first, and ignores non-positive values', () => {
    const groups = groupByWeight([
      { key: 'Banks', valuePaise: 300 },
      { key: 'IT', valuePaise: 100 },
      { key: 'Banks', valuePaise: 100 },
      { key: 'Gone', valuePaise: 0 },
    ]);
    expect(groups).toEqual([
      { key: 'Banks', valuePaise: 400, weight: 0.8, count: 2 },
      { key: 'IT', valuePaise: 100, weight: 0.2, count: 1 },
    ]);
  });
});

describe('concentration', () => {
  it('reports the share in the largest holdings and the effective number', () => {
    const c = concentration([50, 30, 10, 5, 5]);
    expect(c?.largest).toBeCloseTo(0.5, 10);
    expect(c?.top3).toBeCloseTo(0.9, 10);
    expect(c?.top5).toBeCloseTo(1, 10);
    // 1 / (0.25 + 0.09 + 0.01 + 0.0025 + 0.0025) = 2.8985...
    expect(c?.effectiveHoldings).toBeCloseTo(1 / 0.355, 10);
  });
  it('equals the count when every holding is the same size, and is null with nothing', () => {
    expect(concentration([10, 10, 10, 10])?.effectiveHoldings).toBeCloseTo(4, 10);
    expect(concentration([])).toBeNull();
    expect(concentration([0])).toBeNull();
  });
});

describe('companySizeByIndex', () => {
  it('maps index membership to a size, largest index first', () => {
    expect(companySizeByIndex(['nifty500', 'nifty100'])).toBe('large');
    expect(companySizeByIndex(['nifty500', 'niftymidcap150'])).toBe('mid');
    expect(companySizeByIndex(['niftysmallcap250'])).toBe('small');
    expect(companySizeByIndex(['niftymicrocap250'])).toBe('micro');
    expect(companySizeByIndex([])).toBe('other');
  });
});

describe('topContributors', () => {
  const items = [10, -5, 30, -40, 20, 1, -2, 0].map((g, i) => ({ key: `S${i}`, gainPaise: g }));
  it('keeps the biggest gains and the biggest losses within the limit', () => {
    expect(topContributors(items, 4).map((c) => c.gainPaise)).toEqual([30, 20, -5, -40]);
  });
  it('returns everything (minus zeros) when it fits', () => {
    expect(topContributors(items, 10)).toHaveLength(7);
  });
});

describe('treemapLayout', () => {
  it('fills the box exactly with areas in proportion to value', () => {
    const cells = treemapLayout(
      [
        { key: 'a', value: 50 },
        { key: 'b', value: 30 },
        { key: 'c', value: 20 },
        { key: 'z', value: 0 },
      ],
      100,
      50,
    );
    expect(cells.map((c) => c.item.key).sort()).toEqual(['a', 'b', 'c']);
    const area = (k: string) => {
      const c = cells.find((x) => x.item.key === k);
      return c === undefined ? 0 : c.w * c.h;
    };
    expect(area('a')).toBeCloseTo(2500, 6);
    expect(area('b')).toBeCloseTo(1500, 6);
    expect(area('c')).toBeCloseTo(1000, 6);
    for (const c of cells) {
      expect(c.x + c.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(50 + 1e-9);
    }
  });
  it('is empty for nothing', () => {
    expect(treemapLayout([], 10, 10)).toEqual([]);
  });
});

describe('capGroups', () => {
  const groups = ['A', 'B', 'C', 'D', 'E'].map((key, i) => ({
    key,
    valuePaise: 50 - i * 10,
    weight: (50 - i * 10) / 150,
    count: 1,
  }));
  it('folds everything past the largest max − 1 into one group', () => {
    const { groups: out, folded } = capGroups(groups, 3, 'Other');
    expect(out.map((g) => g.key)).toEqual(['A', 'B', 'Other']);
    expect(out[2]).toMatchObject({ valuePaise: 60, count: 3 });
    expect(out.reduce((a, g) => a + g.weight, 0)).toBeCloseTo(1, 10);
    expect([...folded].sort()).toEqual(['C', 'D', 'E']);
  });
  it('leaves a short list alone', () => {
    expect(capGroups(groups, 5, 'Other').groups).toHaveLength(5);
    expect(capGroups(groups, 5, 'Other').folded.size).toBe(0);
  });
});
