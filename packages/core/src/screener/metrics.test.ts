import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import {
  annualisedVolatility,
  candlePatterns,
  computeTechnicalMetrics,
  crossDays,
  emaStack,
  findUnexplainedGap,
  flipDays,
  narrowestRange,
  percentileRanks,
  rangePct,
  relativeStrength,
  returnOver,
  returnYtd,
  thresholdCrossDays,
} from './metrics.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 1);

function bar(i: number, open: number, high: number, low: number, close: number, volume = 1000): Bar {
  return { timestamp: T0 + i * DAY, open, high, low, close, volume };
}

/** A deterministic, gently trending series of `n` bars around 100,000 paise. */
function trending(n: number, drift = 20): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100_000 + i * drift + ((i * 37) % 11) * 15;
    return bar(i, close - 40, close + 120, close - 160, close, 1000 + ((i * 13) % 7) * 100);
  });
}

describe('returnOver / returnYtd', () => {
  it('compares against the close N sessions back', () => {
    // 121 ÷ 100 − 1 = 21%
    expect(returnOver([100, 110, 121], 2)).toBeCloseTo(21, 10);
    expect(returnOver([100, 110], 2)).toBeNull();
  });

  it('measures YTD from the last close of the previous calendar year', () => {
    const bars = [
      { ...bar(0, 1, 1, 1, 100), timestamp: Date.UTC(2025, 11, 30) },
      { ...bar(0, 1, 1, 1, 120), timestamp: Date.UTC(2025, 11, 31) },
      { ...bar(0, 1, 1, 1, 132), timestamp: Date.UTC(2026, 0, 2) },
    ];
    // 132 ÷ 120 − 1 = 10% (the 30 Dec close is not the year's last)
    expect(returnYtd(bars)).toBeCloseTo(10, 10);
    expect(returnYtd(bars.slice(2))).toBeNull();
  });
});

describe('crossDays', () => {
  it('counts sessions since a cross that still holds', () => {
    // a crosses above b at index 2 (3 > 2, previously 1 < 2); n = 4 → 4 − 1 − 2 = 1
    expect(crossDays([1, 1, 3, 3], [2, 2, 2, 2], 'up', 10)).toBe(1);
    expect(crossDays([1, 1, 3, 3], [2, 2, 2, 2], 'down', 10)).toBeNull();
  });

  it('ignores a cross that has already reversed', () => {
    expect(crossDays([1, 3, 1], [2, 2, 2], 'up', 10)).toBeNull();
  });

  it('ignores a cross older than the window', () => {
    expect(crossDays([1, 3, 3, 3, 3], [2, 2, 2, 2, 2], 'up', 2)).toBeNull();
  });

  it('is null across warm-up nulls', () => {
    expect(crossDays([null, 3, 3], [2, 2, 2], 'up', 10)).toBeNull();
  });

  it('crosses a constant level', () => {
    // RSI 58 → 61 at index 2 crosses 60; n = 4 → 1 session ago
    expect(thresholdCrossDays([55, 58, 61, 63], 60, 'up', 10)).toBe(1);
  });
});

describe('flipDays', () => {
  it('counts back to the last direction change', () => {
    // change between index 1 and 2; n = 5 → 5 − 1 − 2 = 2
    expect(flipDays([1, 1, -1, -1, -1], 20)).toBe(2);
    expect(flipDays([1, 1, 1], 20)).toBeNull();
  });
});

describe('percentileRanks', () => {
  it('spreads ranks 1–99 and keeps nulls null', () => {
    // sorted 10, 20, 30 → positions 0, 1, 2 → 1 + 98·p/2 → 1, 50, 99
    expect(percentileRanks([10, null, 30, 20])).toEqual([1, null, 99, 50]);
  });

  it('gives ties the mean rank', () => {
    // 5, 5 occupy positions 0 and 1 → mean 0.5 → 1 + 98·0.5/2 = 25.5 → 26
    expect(percentileRanks([5, 5, 10])).toEqual([26, 26, 99]);
  });

  it('ranks a lone value 50', () => {
    expect(percentileRanks([null, 7])).toEqual([null, 50]);
  });
});

describe('candlePatterns', () => {
  it('recognises a hammer', () => {
    // range 13, body 2 (≤ 4.55), lower shadow 10 (≥ 4), upper 1 (≤ 1.95)
    const p = candlePatterns(bar(1, 100, 103, 90, 102), undefined);
    expect(p.hammer).toBe(true);
    expect(p.shootingStar).toBe(false);
    expect(p.doji).toBe(false);
    expect(p.insideBar).toBeNull();
  });

  it('recognises a bullish engulfing pair', () => {
    // yesterday down 105 → 100 (body 5); today up 99 → 107 (body 8) covering it
    const p = candlePatterns(bar(1, 99, 108, 98, 107), bar(0, 105, 106, 99, 100));
    expect(p.bullishEngulfing).toBe(true);
    expect(p.bearishEngulfing).toBe(false);
    expect(p.outsideBar).toBe(true);
  });

  it('recognises an inside bar and a doji', () => {
    const p = candlePatterns(bar(1, 100, 104, 96, 100.5), bar(0, 95, 110, 90, 105));
    expect(p.insideBar).toBe(true);
    expect(p.doji).toBe(true);
  });
});

describe('range and volatility helpers', () => {
  it('flags the narrowest range strictly', () => {
    const ranges = (rs: number[]) => rs.map((r, i) => bar(i, 100, 100 + r, 100, 100));
    expect(narrowestRange(ranges([5, 4, 6, 3]), 4)).toBe(true);
    expect(narrowestRange(ranges([5, 3, 6, 3]), 4)).toBe(false);
    expect(narrowestRange(ranges([5, 3]), 4)).toBeNull();
  });

  it('measures range as a share of the lowest low', () => {
    // highs 110, 120; lows 100, 105 → (120 − 100) ÷ 100 = 20%
    expect(rangePct([bar(0, 0, 110, 100, 105), bar(1, 0, 120, 105, 110)], 2)).toBeCloseTo(20, 10);
  });

  it('annualises the sample σ of log returns', () => {
    // ln(1.1) = 0.0953102, ln(100/110) = −0.0953102; mean 0
    // sample variance = 2 × 0.0953102² ÷ 1 = 0.0181680 → σ = 0.1347876
    // × √252 (15.874508) = 2.139687 → 213.97%
    expect(annualisedVolatility([100, 110, 100], 2)).toBeCloseTo(213.97, 1);
    expect(annualisedVolatility([100, 100, 100], 2)).toBe(0);
  });
});

describe('emaStack', () => {
  it('needs every EMA and a strict order', () => {
    expect(emaStack(110, 105, 100, 95)).toBe('bullish');
    expect(emaStack(90, 95, 100, 105)).toBe('bearish');
    expect(emaStack(110, 95, 100, 105)).toBe('mixed');
    expect(emaStack(110, 105, 100, null)).toBeNull();
  });
});

describe('relativeStrength', () => {
  it('subtracts the benchmark return over the same sessions', () => {
    // stock: 100 → 130 over 21 sessions = +30%; benchmark 1000 → 1100 = +10% → +20 pp
    const stock = Array.from({ length: 22 }, (_, i) => bar(i, 1, 1, 1, i === 21 ? 130 : 100));
    const bench = Array.from({ length: 22 }, (_, i) => bar(i, 1, 1, 1, i === 21 ? 1100 : 1000));
    const rs = relativeStrength(stock, bench);
    expect(rs.rs1m).toBeCloseTo(20, 10);
    expect(rs.rs3m).toBeNull();
    expect(rs.rsNewHigh).toBeNull(); // fewer than 120 aligned sessions
  });

  it('is null when the benchmark lacks the session', () => {
    const stock = [bar(0, 1, 1, 1, 100), bar(1, 1, 1, 1, 110)];
    expect(relativeStrength(stock, [bar(0, 1, 1, 1, 1000)]).rs1m).toBeNull();
    expect(relativeStrength(stock, null).rs1m).toBeNull();
  });
});

describe('findUnexplainedGap', () => {
  it('finds an overnight move beyond the guard', () => {
    const bars = [bar(0, 100, 101, 99, 100), bar(1, 50, 51, 49, 50), bar(2, 50, 51, 49, 50)];
    expect(findUnexplainedGap(bars)).toBe(1);
    expect(findUnexplainedGap([bar(0, 100, 101, 99, 100), bar(1, 95, 96, 94, 95)])).toBeNull();
  });
});

describe('computeTechnicalMetrics', () => {
  it('returns null for an empty series', () => {
    expect(computeTechnicalMetrics([])).toBeNull();
  });

  it('leaves long-window metrics null without the history', () => {
    const m = computeTechnicalMetrics(trending(30));
    expect(m?.ema20).not.toBeNull();
    expect(m?.ema200).toBeNull();
    expect(m?.ret3m).toBeNull();
    expect(m?.breakout52w).toBeNull();
    expect(m?.emaStack).toBeNull();
  });

  it('fills every metric on a long series', () => {
    const m = computeTechnicalMetrics(trending(300));
    expect(m?.ema200).not.toBeNull();
    expect(m?.emaStack).toBe('bullish');
    expect(m?.rsi14).toBeGreaterThan(0);
    expect(m?.supertrendDir).not.toBeNull();
    expect(m?.spark).toHaveLength(60);
    expect(m?.dataIssue).toBeNull();
  });

  it('describes session k identically whatever comes after it (no lookahead)', () => {
    const base = trending(300);
    const altered = base.map((b, i) => (i > 250 ? { ...b, close: b.close * 3, high: b.high * 3 } : b));
    expect(computeTechnicalMetrics(base.slice(0, 251))).toEqual(
      computeTechnicalMetrics(altered.slice(0, 251)),
    );
  });

  it('keeps only single-session fields across an unexplained gap', () => {
    const bars = trending(100);
    const gapped = bars.map((b, i) =>
      i >= 80 ? { ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 } : b,
    );
    const m = computeTechnicalMetrics(gapped);
    expect(m?.dataIssue).toBe('unadjusted_gap');
    expect(m?.ret1m).toBeNull();
    expect(m?.close).toBe(gapped[99]?.close);
  });
});
