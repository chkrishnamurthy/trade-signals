import { describe, expect, it } from 'vitest';
import type { IndexSnapshotDto } from './market-types';
import { applyIndexTicks } from './use-index-strip';

const base: IndexSnapshotDto = {
  symbol: 'NIFTY50',
  name: 'NIFTY 50',
  exchange: 'NSE',
  display: 'index',
  ltp: 25_300_00,
  change: 130_45,
  changePercent: 0.518,
  open: 25_201_10,
  high: 25_350_00,
  low: 25_164_30,
  previousClose: 25_169_55,
  at: '2026-09-18T09:00:00.000Z',
};

describe('applyIndexTicks', () => {
  it('returns the same array when nothing moved', () => {
    const indices = [base];
    expect(applyIndexTicks(indices, [])).toBe(indices);
    expect(
      applyIndexTicks(indices, [{ symbol: 'NIFTY50', ltp: base.ltp, volume: null, at: 'x' }]),
    ).toBe(indices);
    expect(applyIndexTicks(indices, [{ symbol: 'OTHER', ltp: 1, volume: null, at: 'x' }])).toBe(
      indices,
    );
  });

  it('recomputes change from previous close in integer paise and stretches the day range', () => {
    const [next] = applyIndexTicks(
      [base],
      [{ symbol: 'NIFTY50', ltp: 25_400_00, volume: null, at: '2026-09-18T09:01:00.000Z' }],
    );
    expect(next).toMatchObject({
      ltp: 25_400_00,
      change: 230_45,
      high: 25_400_00,
      low: 25_164_30,
      at: '2026-09-18T09:01:00.000Z',
    });
    expect(Number.isInteger(next?.change)).toBe(true);
    expect(next?.changePercent).toBeCloseTo((230_45 / 25_169_55) * 100, 6);
  });

  it('keeps the provider change when there is no previous close to derive from', () => {
    const [next] = applyIndexTicks(
      [{ ...base, previousClose: null }],
      [{ symbol: 'NIFTY50', ltp: 25_400_00, volume: null, at: 'x' }],
    );
    expect(next).toMatchObject({ ltp: 25_400_00, change: base.change });
  });
});
