import { fromIstParts } from '@wealthos/shared';
import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { bucketBars, bucketStart, openingRange, sessionSlot } from './bars.js';
import { DEFAULT_INTRADAY_CONFIG } from './config.js';
import { emptyMarketContext } from './context.js';
import { evaluateIntraday } from './engine.js';
import { buildLevels } from './levels.js';
import { engulfing, hammer, insideBar, shootingStar } from './patterns.js';
import { canEmitNewSignal, sessionRegime } from './session.js';
import { findSwings, readStructure } from './structure.js';
import { buildVolumeProfile, expectedCumulative, readVolume } from './volume.js';

/** An instant `minute` minutes past the 09:15 IST open on 2026-08-20 (Thursday). */
function istAt(minute: number, day = 20): Date {
  return fromIstParts({ year: 2026, month: 8, day, hour: 9, minute: 15 + minute });
}

function bar(minute: number, o: number, h: number, l: number, c: number, v = 1000, day = 20): Bar {
  return { timestamp: istAt(minute, day).getTime(), open: o, high: h, low: l, close: c, volume: v };
}

describe('bucket alignment', () => {
  it('anchors buckets to the 09:15 open, not to midnight', () => {
    // 09:17 belongs to the 09:15-09:30 bucket. A midnight-aligned 15m bucket
    // would put it in 09:15-09:30 too by luck, so the discriminating case is
    // 09:30: it must start a NEW bucket, not sit in a 09:15-09:30 one.
    expect(bucketStart(istAt(2).getTime(), 15)).toBe(istAt(0).getTime());
    expect(bucketStart(istAt(15).getTime(), 15)).toBe(istAt(15).getTime());
    expect(bucketStart(istAt(14).getTime(), 15)).toBe(istAt(0).getTime());
  });

  it('slots are minutes since the open', () => {
    expect(sessionSlot(istAt(0).getTime())).toBe(0);
    expect(sessionSlot(istAt(42).getTime())).toBe(42);
  });
});

describe('bucketBars', () => {
  const minutes = [
    bar(0, 100, 110, 95, 105, 10),
    bar(1, 105, 120, 100, 115, 20),
    bar(2, 115, 118, 108, 112, 30),
    bar(3, 112, 125, 110, 122, 40),
    bar(4, 122, 130, 120, 128, 50),
  ];

  it('aggregates open-first, close-last, extremes and summed volume', () => {
    const [bucket] = bucketBars(minutes, 5, { now: istAt(5) });
    expect(bucket).toEqual({
      timestamp: istAt(0).getTime(),
      open: 100,
      high: 130,
      low: 95,
      close: 128,
      volume: 150,
    });
  });

  it('refuses to emit a bucket that has not finished', () => {
    // At 09:19 the 09:15-09:20 bucket is still forming. Emitting it would hand
    // the engine a close that has not happened (hard rule 2).
    expect(bucketBars(minutes, 5, { now: istAt(4) })).toEqual([]);
    expect(bucketBars(minutes, 5, { now: istAt(5) })).toHaveLength(1);
  });

  it('emits the forming bucket only when explicitly asked', () => {
    expect(bucketBars(minutes, 5, { now: istAt(4), includeForming: true })).toHaveLength(1);
  });

  it('leaves a gap as a gap rather than inventing a flat candle', () => {
    const withHole = [minutes[0] as Bar, bar(12, 200, 205, 195, 202, 10)];
    const buckets = bucketBars(withHole, 5, { now: istAt(20) });
    // 09:15-09:20 and 09:25-09:30 exist; 09:20-09:25 simply does not.
    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.timestamp)).toEqual([istAt(0).getTime(), istAt(10).getTime()]);
  });
});

describe('openingRange', () => {
  const minutes = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i, 110 + i, 90 + i, 105 + i));

  it('is null until the range is actually complete', () => {
    expect(openingRange(minutes.slice(0, 10), 15)).toBeNull();
  });

  it('spans the first `minutes` of the session once complete', () => {
    // Highs run 110..124 over slots 0..14; lows run 90..104.
    expect(openingRange(minutes, 15)).toEqual({ high: 124, low: 90 });
  });
});

describe('volume profile', () => {
  /**
   * Two prior sessions, three minutes each.
   *   day 18: [100, 200, 300]
   *   day 19: [200, 300, 400]
   * Per-slot averages: [150, 250, 350].
   */
  const prior = [
    bar(0, 10, 10, 10, 10, 100, 18),
    bar(1, 10, 10, 10, 10, 200, 18),
    bar(2, 10, 10, 10, 10, 300, 18),
    bar(0, 10, 10, 10, 10, 200, 19),
    bar(1, 10, 10, 10, 10, 300, 19),
    bar(2, 10, 10, 10, 10, 400, 19),
  ];

  it('averages each minute-of-session across prior sessions', () => {
    const profile = buildVolumeProfile(prior, DEFAULT_INTRADAY_CONFIG);
    expect(profile.slice(0, 3)).toEqual([150, 250, 350]);
  });

  it('accumulates the expected volume through a slot', () => {
    const profile = buildVolumeProfile(prior, DEFAULT_INTRADAY_CONFIG);
    // 150 + 250 = 400 by the end of slot 1.
    expect(expectedCumulative(profile, 1)).toBe(400);
  });

  it('compares today against the same time of day, not a daily average', () => {
    const profile = buildVolumeProfile(prior, DEFAULT_INTRADAY_CONFIG);
    const today = [bar(0, 10, 10, 10, 10, 300), bar(1, 10, 10, 10, 10, 500)];
    const read = readVolume(today, profile, today[1], 1);
    // 800 traded against an expected 400 by this minute: 2.0x.
    expect(read.sessionVolume).toBe(800);
    expect(read.relativeVolume).toBe(2);
    // The bar itself: 500 against an expected 250 for slot 1.
    expect(read.barRelativeVolume).toBe(2);
  });

  it('reports null rather than a confident 1.0 when there is no profile', () => {
    const today = [bar(0, 10, 10, 10, 10, 300)];
    const read = readVolume(today, new Array(375).fill(0), today[0], 1);
    expect(read.relativeVolume).toBeNull();
    expect(read.profileMissing).toBe(true);
  });
});

describe('patterns', () => {
  it('recognises a bullish engulfing only when the body swallows the previous body', () => {
    const down = bar(0, 110, 112, 104, 105);
    const up = bar(1, 104, 118, 103, 116);
    const match = engulfing(down, up);
    expect(match?.key).toBe('bullishEngulfing');
    expect(match?.direction).toBe('long');

    // Same colours: not an engulfing at all.
    expect(engulfing(up, bar(2, 116, 130, 115, 128))).toBeNull();
    // Opposite colour but the body does not cover the previous one.
    expect(engulfing(down, bar(1, 106, 112, 105, 108))).toBeNull();
  });

  it('recognises a hammer by its lower wick, and rejects an upper-wick bar', () => {
    // Range 100-130, body 126-130: lower wick 26/30 = 87%, upper 0.
    expect(hammer(bar(0, 126, 130, 100, 130))?.direction).toBe('long');
    expect(hammer(bar(0, 100, 130, 100, 104))).toBeNull();
    // The mirror bar is a shooting star, not a hammer.
    expect(shootingStar(bar(0, 104, 130, 100, 100))?.direction).toBe('short');
  });

  it('recognises an inside bar', () => {
    expect(insideBar(bar(0, 100, 130, 90, 120), bar(1, 110, 125, 100, 115))?.key).toBe('insideBar');
    expect(insideBar(bar(0, 100, 130, 90, 120), bar(1, 110, 135, 100, 115))).toBeNull();
  });
});

describe('structure', () => {
  it('only reports a swing once the bars on both sides have printed', () => {
    // A peak at index 2 of a 5-bar series, lookback 2: reportable.
    const peak = [
      bar(0, 100, 105, 95, 100),
      bar(1, 100, 110, 98, 105),
      bar(2, 105, 130, 100, 125),
      bar(3, 125, 120, 110, 115),
      bar(4, 115, 118, 105, 110),
    ];
    expect(findSwings(peak, 2).map((s) => s.index)).toContain(2);
    // Truncated before the right-hand bars exist, the same peak is not a swing.
    expect(findSwings(peak.slice(0, 4), 2)).toEqual([]);
  });

  it('reads higher highs and higher lows as bullish structure', () => {
    // A hand-built zig-zag. With lookback 1 the confirmed swings are:
    //   lows  at index 1 (90) and index 5 (95)   -> higher low
    //   highs at index 3 (130) and index 7 (140) -> higher high
    const shape: readonly (readonly [number, number])[] = [
      [105, 115],
      [90, 110],
      [100, 120],
      [110, 130],
      [108, 125],
      [95, 118],
      [105, 128],
      [115, 140],
      [112, 135],
    ];
    const rising = shape.map(([low, high], i) => bar(i, low + 2, high, low, high - 2));

    const swings = findSwings(rising, 1);
    expect(swings.filter((s) => s.kind === 'low').map((s) => s.price)).toEqual([90, 95]);
    expect(swings.filter((s) => s.kind === 'high').map((s) => s.price)).toEqual([130, 140]);
    expect(readStructure(rising, 1).kind).toBe('higher_highs_higher_lows');
    expect(readStructure(rising, 1).bias).toBe(1);
  });

  it('reads the mirror shape as bearish structure', () => {
    const shape: readonly (readonly [number, number])[] = [
      [105, 115],
      [90, 110],
      [100, 120],
      [110, 130],
      [108, 125],
      [95, 118],
      [105, 128],
      [115, 140],
      [112, 135],
    ];
    // Reversing the series turns each higher high into a lower high.
    const falling = shape
      .map(([low, high], i) => bar(i, low + 2, high, low, high - 2))
      .reverse()
      .map((original, i) => ({ ...original, timestamp: istAt(i).getTime() }));
    expect(readStructure(falling, 1).bias).toBeLessThan(0);
  });

  it('says "indeterminate", not "range", when there is nothing to read', () => {
    expect(readStructure([bar(0, 100, 101, 99, 100)], 3).kind).toBe('indeterminate');
  });
});

describe('level identity', () => {
  const base = {
    previousClose: 10_000,
    previousHigh: 10_200,
    previousLow: 9_800,
    dayOpen: 10_050,
    dayHigh: 10_150,
    dayLow: 9_950,
    openingRangeHigh: 10_100,
    openingRangeLow: 9_990,
    vwap: 10_020,
    price: 10_040,
  };

  it('keys a swing level by price, so it survives new bars printing', () => {
    // A level's key becomes the identity of any setup anchored to it. Keying on
    // the bar index makes the same swing look like a brand-new level every time
    // a bar prints, which expires the live signal and immediately creates an
    // identical replacement — one duplicate card per cycle, forever.
    const swing = (index: number) => [
      { index, timestamp: istAt(index).getTime(), price: 10_140, kind: 'high' as const },
    ];

    const before = buildLevels({ ...base, swings: swing(10) });
    const after = buildLevels({ ...base, swings: swing(11) });

    const keyOf = (levels: readonly { label: string; key: string }[]) =>
      levels.find((level) => level.label === 'Recent swing high')?.key;

    expect(keyOf(before)).toBe('swingHigh:10140');
    expect(keyOf(after)).toBe(keyOf(before));
  });

  it('classifies a level as support or resistance by where price is now', () => {
    const below = buildLevels({ ...base, swings: [], price: 9_900 });
    const above = buildLevels({ ...base, swings: [], price: 10_300 });
    expect(below.find((l) => l.key === 'previousHigh')?.kind).toBe('resistance');
    expect(above.find((l) => l.key === 'previousHigh')?.kind).toBe('support');
  });
});

describe('session regime', () => {
  const config = DEFAULT_INTRADAY_CONFIG;

  it('maps the trading day onto its regimes', () => {
    // 09:05 IST — inside the 09:00-09:15 pre-open auction.
    expect(sessionRegime(istAt(-10), config)).toBe('pre_open');
    // 08:45 IST — before the auction even starts.
    expect(sessionRegime(istAt(-30), config)).toBe('closed');
    expect(sessionRegime(istAt(5), config)).toBe('opening');
    expect(sessionRegime(istAt(60), config)).toBe('early');
    expect(sessionRegime(istAt(200), config)).toBe('mid');
    expect(sessionRegime(istAt(300), config)).toBe('afternoon');
    expect(sessionRegime(istAt(360), config)).toBe('closing');
    expect(sessionRegime(istAt(400), config)).toBe('closed');
  });

  it('treats a Saturday as closed regardless of the clock', () => {
    // 2026-08-22 is a Saturday.
    expect(sessionRegime(istAt(60, 22), config)).toBe('closed');
  });

  it('refuses new signals during warm-up and near the close', () => {
    expect(canEmitNewSignal(istAt(5), config).allowed).toBe(false);
    expect(canEmitNewSignal(istAt(60), config).allowed).toBe(true);
    // 375 − 35 = 340 minutes in; anything later has no room to work.
    expect(canEmitNewSignal(istAt(345), config).allowed).toBe(false);
  });
});

describe('evaluateIntraday — lookahead', () => {
  /** A full synthetic session of 1m bars, trending gently upward. */
  function session(count: number): Bar[] {
    return Array.from({ length: count }, (_, i) => {
      const base = 100_000 + i * 20;
      return bar(i, base, base + 60, base - 40, base + 20, 5_000 + (i % 7) * 500);
    });
  }

  function dailyHistory(): Bar[] {
    return Array.from({ length: 30 }, (_, i) => ({
      timestamp: fromIstParts({ year: 2026, month: 7, day: 1 + i, hour: 15, minute: 29 }).getTime(),
      open: 99_000,
      high: 101_500,
      low: 98_500,
      close: 100_000,
      volume: 4_000_000,
    }));
  }

  const input = (minute: Bar[]) => ({
    symbol: 'TEST',
    bars: {
      minute,
      history: [],
      daily: dailyHistory(),
      volumeProfile: new Array(375).fill(5_000),
    },
    context: emptyMarketContext('NIFTY50'),
    at: istAt(120),
  });

  it('ignores bars that have not closed by the evaluation instant', () => {
    // The same evaluation, once with exactly the bars available at 11:15 and
    // once with two further hours of "future" bars appended. If any of those
    // future bars reaches an indicator, the two verdicts diverge — and every
    // backtest built on this path becomes fiction.
    const upToNow = evaluateIntraday(input(session(120)), DEFAULT_INTRADAY_CONFIG);
    const withFuture = evaluateIntraday(input(session(240)), DEFAULT_INTRADAY_CONFIG);

    expect(withFuture.snapshot).toEqual(upToNow.snapshot);
    expect(withFuture.candidates).toEqual(upToNow.candidates);
  });

  it('produces the same verdict for the same bars, every time', () => {
    // Purity (hard rule 1) is what makes a backtest reproducible at all.
    const bars = session(120);
    expect(evaluateIntraday(input(bars), DEFAULT_INTRADAY_CONFIG)).toEqual(
      evaluateIntraday(input(bars), DEFAULT_INTRADAY_CONFIG),
    );
  });

  it('warms indicators from prior sessions without leaking them into session values', () => {
    // The bug this covers: a 15m EMA-20 needs 300 minutes, so with today's bars
    // alone the higher-timeframe trend reads "flat" until mid-afternoon and
    // every trend-aware strategy silently never fires.
    const today = session(90);
    const history = [16, 17, 18].flatMap((day) =>
      Array.from({ length: 370 }, (_, i) => {
        const base = 99_000 + i * 5;
        return bar(i, base, base + 60, base - 40, base + 10, 4_000, day);
      }),
    );

    const warmed = evaluateIntraday(
      { ...input(today), bars: { ...input(today).bars, history }, at: istAt(90) },
      DEFAULT_INTRADAY_CONFIG,
    );
    const cold = evaluateIntraday({ ...input(today), at: istAt(90) }, DEFAULT_INTRADAY_CONFIG);

    const trendOf = (result: typeof warmed) =>
      result.snapshot.trends.find((t) => t.minutes === DEFAULT_INTRADAY_CONFIG.timeframes.trend);

    // 90 minutes gives six 15m bars: nowhere near a 20-period EMA on its own.
    expect(trendOf(cold)?.ema20).toBeNull();
    expect(trendOf(warmed)?.ema20).not.toBeNull();

    // Session-scoped measurements must be identical either way. VWAP resets at
    // the open, the day's extremes are today's, and relative volume compares
    // against the profile — none of them may see yesterday.
    expect(warmed.snapshot.vwap).toBe(cold.snapshot.vwap);
    expect(warmed.snapshot.dayOpen).toBe(cold.snapshot.dayOpen);
    expect(warmed.snapshot.dayHigh).toBe(cold.snapshot.dayHigh);
    expect(warmed.snapshot.dayLow).toBe(cold.snapshot.dayLow);
    expect(warmed.snapshot.sessionVolume).toBe(cold.snapshot.sessionVolume);
    expect(warmed.snapshot.openingRangeHigh).toBe(cold.snapshot.openingRangeHigh);
  });

  it('declines to evaluate with too little history rather than guessing', () => {
    const result = evaluateIntraday(input(session(8)), DEFAULT_INTRADAY_CONFIG);
    expect(result.candidates).toEqual([]);
    expect(result.dataQuality.usable).toBe(false);
    expect(result.rejections.join(' ')).toMatch(/session bars/);
  });
});
