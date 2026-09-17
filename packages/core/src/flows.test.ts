import { describe, expect, it } from 'vitest';
import {
  ATTENTION_CAPS,
  attentionScore,
  buildupTone,
  classifyOiBuildup,
  deliveryAnomaly,
} from './flows.js';

describe('classifyOiBuildup', () => {
  it('maps the four quadrants', () => {
    expect(classifyOiBuildup({ closeChange: 100, oiChange: 1000 })).toBe('long_buildup');
    expect(classifyOiBuildup({ closeChange: -100, oiChange: 1000 })).toBe('short_buildup');
    expect(classifyOiBuildup({ closeChange: 100, oiChange: -1000 })).toBe('short_covering');
    expect(classifyOiBuildup({ closeChange: -100, oiChange: -1000 })).toBe('long_unwinding');
  });

  it('gives no read on a zero or invalid change', () => {
    expect(classifyOiBuildup({ closeChange: 0, oiChange: 5 })).toBeNull();
    expect(classifyOiBuildup({ closeChange: 5, oiChange: 0 })).toBeNull();
    expect(classifyOiBuildup({ closeChange: Number.NaN, oiChange: 5 })).toBeNull();
  });

  it('tones accumulation green and distribution red', () => {
    expect(buildupTone('long_buildup')).toBe('positive');
    expect(buildupTone('short_covering')).toBe('positive');
    expect(buildupTone('short_buildup')).toBe('negative');
    expect(buildupTone('long_unwinding')).toBe('negative');
  });
});

describe('deliveryAnomaly', () => {
  // Hand-computed: trailing [40, 50, 60, 50, 50] → mean 50, sample variance
  // ((100 + 0 + 100 + 0 + 0) / 4) = 50, stdev ≈ 7.0711.
  const trailing = [40, 50, 60, 50, 50];

  it('computes ratio, delta and z against the trailing sessions', () => {
    const a = deliveryAnomaly(65, trailing);
    expect(a.trailingSessions).toBe(5);
    expect(a.ratio).toBeCloseTo(1.3, 10);
    expect(a.delta).toBeCloseTo(15, 10);
    expect(a.zScore).toBeCloseTo(15 / Math.sqrt(50), 6);
  });

  it('withholds the z-score under five sessions and with no spread', () => {
    expect(deliveryAnomaly(65, [40, 50, 60]).zScore).toBeNull();
    expect(deliveryAnomaly(65, [40, 50, 60]).ratio).toBeCloseTo(1.3, 10);
    expect(deliveryAnomaly(65, [50, 50, 50, 50, 50]).zScore).toBeNull();
  });

  it('has no baseline with no history', () => {
    expect(deliveryAnomaly(65, [])).toEqual({
      ratio: null,
      delta: null,
      zScore: null,
      trailingSessions: 0,
    });
  });
});

describe('attentionScore', () => {
  it('sums linear contributions, capped at one each, with a chip per factor', () => {
    const result = attentionScore({
      delivery: { ratio: 1.5, delta: 15, zScore: 1, trailingSessions: 20 },
      volumeRatio: 2, // halfway to the 3× cap
      oi: { changeFraction: 0.25, buildup: 'long_buildup' }, // beyond the 10 % cap
      deals: { netPaise: 2_500, turnoverPaise: 100_000, count: 2 }, // 2.5 % of 5 % cap
    });
    // delivery z 1 / cap 2 = 0.5; volume (2−1)/(3−1) = 0.5; oi clamps to 1; deals 0.5
    expect(result.score).toBe(2.5);
    expect(result.factors.map((f) => [f.id, f.contribution, f.tone])).toEqual([
      ['delivery', 0.5, 'positive'],
      ['oi', 1, 'positive'],
      ['deals', 0.5, 'positive'],
      ['volume', 0.5, 'neutral'],
    ]);
    expect(result.factors[0]?.reading).toBe('+15.0 pts vs 20-session avg');
    expect(result.factors[1]?.reading).toBe('+25.0% OI');
  });

  it('omits factors without data rather than scoring them zero', () => {
    const result = attentionScore({ delivery: null, volumeRatio: null, oi: null, deals: null });
    expect(result.score).toBe(0);
    expect(result.factors).toEqual([]);
  });

  it('falls back to the delivery ratio when no z-score exists', () => {
    const result = attentionScore({
      delivery: { ratio: 2, delta: 30, zScore: null, trailingSessions: 3 },
      volumeRatio: null,
      oi: null,
      deals: null,
    });
    expect(result.factors[0]?.contribution).toBe(1);
    expect(ATTENTION_CAPS.deliveryRatio).toBe(2);
  });

  it('never rewards a negative reading: distribution is a chip, not a score', () => {
    const result = attentionScore({
      delivery: { ratio: 0.5, delta: -20, zScore: -2, trailingSessions: 20 },
      volumeRatio: 0.5,
      oi: { changeFraction: -0.2, buildup: 'long_unwinding' },
      deals: { netPaise: -10_000, turnoverPaise: 100_000, count: 1 },
    });
    // Delivery and volume below average contribute 0; |OI| and |deals| still count.
    expect(result.factors.map((f) => [f.id, f.contribution, f.tone])).toEqual([
      ['delivery', 0, 'negative'],
      ['oi', 1, 'negative'],
      ['deals', 1, 'negative'],
      ['volume', 0, 'neutral'],
    ]);
  });
});
