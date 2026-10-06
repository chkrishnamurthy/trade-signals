import { describe, expect, it } from 'vitest';
import { pastSeries, sharesOn } from './past.js';

const day = (d: string, close: number) => ({ date: d, closePaise: close });

describe('sharesOn', () => {
  it('undoes a split that happened after the date', () => {
    const changes = [{ instrumentId: 1, kind: 'split', exDate: '2026-03-02', ratio: 0.5 }];
    expect(sharesOn(100, '2026-03-01', changes, '2026-06-01')).toBe(50);
    expect(sharesOn(100, '2026-03-02', changes, '2026-06-01')).toBe(100);
  });

  it('ignores changes after today and other kinds', () => {
    const changes = [
      { instrumentId: 1, kind: 'split', exDate: '2026-09-01', ratio: 0.5 },
      { instrumentId: 1, kind: 'dividend', exDate: '2026-03-02', ratio: 0.5 },
    ];
    expect(sharesOn(100, '2026-01-01', changes, '2026-06-01')).toBe(100);
  });
});

describe('pastSeries', () => {
  it('values the shares held now at each past close, with no money flows', () => {
    const closes = new Map([
      [1, [day('2026-01-01', 1000), day('2026-01-02', 1100), day('2026-01-05', 1210)]],
    ]);
    const out = pastSeries({
      held: [{ instrumentId: 1, shares: 10 }],
      changes: [],
      closes,
      from: '2026-01-01',
      to: '2026-01-05',
    });
    expect(out.points.map((p) => p.valuePaise)).toEqual([10000, 11000, 12100]);
    expect(out.points.every((p) => p.netInvestedPaise === 0 && !p.partial)).toBe(true);
    expect(out.from).toBe('2026-01-01');
  });

  it('keeps value continuous across a split by using the share count of the day', () => {
    // 1-into-2 split on 3 Jan: the raw price halves, the share count doubles.
    const closes = new Map([
      [1, [day('2026-01-01', 2000), day('2026-01-02', 2000), day('2026-01-03', 1000)]],
    ]);
    const out = pastSeries({
      held: [{ instrumentId: 1, shares: 20 }],
      changes: [{ instrumentId: 1, kind: 'split', exDate: '2026-01-03', ratio: 0.5 }],
      closes,
      from: '2026-01-01',
      to: '2026-01-03',
    });
    expect(out.points.map((p) => p.valuePaise)).toEqual([20000, 20000, 20000]);
  });

  it('starts when every stock has a price, so a recent listing causes no jump', () => {
    const closes = new Map([
      [1, [day('2026-01-01', 1000), day('2026-01-02', 1000), day('2026-01-05', 1000)]],
      [2, [day('2026-01-05', 500)]],
    ]);
    const out = pastSeries({
      held: [
        { instrumentId: 1, shares: 1 },
        { instrumentId: 2, shares: 2 },
      ],
      changes: [],
      closes,
      from: '2026-01-01',
      to: '2026-01-05',
    });
    expect(out.from).toBe('2026-01-05');
    expect(out.points.map((p) => p.valuePaise)).toEqual([2000]);
  });

  it('leaves out a stock with no prices and says so', () => {
    const closes = new Map([[1, [day('2026-01-01', 1000)]]]);
    const out = pastSeries({
      held: [
        { instrumentId: 1, shares: 1 },
        { instrumentId: 9, shares: 5 },
      ],
      changes: [],
      closes,
      from: '2026-01-01',
      to: '2026-01-01',
    });
    expect(out.leftOut).toBe(1);
    expect(out.points).toHaveLength(1);
  });

  it('is empty with nothing held', () => {
    const out = pastSeries({
      held: [],
      changes: [],
      closes: new Map(),
      from: '2026-01-01',
      to: '2026-01-05',
    });
    expect(out).toEqual({ points: [], from: null, leftOut: 0 });
  });
});
