import { describe, expect, it } from 'vitest';
import {
  buySession,
  dailyBars,
  ist,
  workedExampleMinutes as minutes,
  SESSION,
  SESSION_OPEN,
} from './fixture.js';
import { replaySession } from './replay.js';

const stock = (symbol = 'RELIANCE') => ({
  symbol,
  companyName: 'Reliance Industries',
  tickSize: 5,
  bars: buySession(),
  minutes: minutes(),
  daily: dailyBars(),
});

describe('replaySession', () => {
  it('reproduces the worked example from minute bars', () => {
    const r = replaySession({
      sessionOpenMs: SESSION_OPEN,
      stocks: [stock()],
      indexMoveBps: 50,
      capitalPaise: 50_000_000,
    });
    expect(r.signals).toHaveLength(1);
    const s = r.signals[0];
    expect(s?.publishedAt).toBe(ist(SESSION, 9, 50));
    expect(s?.projection).toMatchObject({
      status: 'TARGET_2_HIT',
      taken: true,
      shares: 169,
      fill: 295_710,
      fillAt: ist(SESSION, 9, 50) + 1_000,
      target1At: ist(SESSION, 10, 35) + 3_000,
      endedAt: ist(SESSION, 12, 40) + 3_000,
    });
    expect(s?.projection.exits.map((x) => [x.shares, x.price])).toEqual([
      [84, 297_770],
      [85, 299_955],
    ]);
    expect(s?.realisedNetPaise).toBe(506_531);
    expect(r).toMatchObject({ netPaise: 506_531, taken: 1, exclusions: [] });
  });
  it('stop wins when one minute touches both the stop and a target', () => {
    const m = minutes();
    // 10:35: low through the stop (2934.00) and high through Target 1 in one bar
    m[m.findIndex((b) => b.timestamp === ist(SESSION, 10, 35))] = {
      timestamp: ist(SESSION, 10, 35),
      open: 297_000,
      high: 297_900,
      low: 293_400,
      close: 297_500,
      volume: 1_000,
    };
    const r = replaySession({
      sessionOpenMs: SESSION_OPEN,
      stocks: [{ ...stock(), minutes: m }],
      indexMoveBps: 50,
      capitalPaise: 50_000_000,
    });
    expect(r.signals[0]?.projection).toMatchObject({
      status: 'STOPPED_OUT',
      exits: [{ price: 293_340, shares: 169, reason: 'STOP' }],
    });
  });
  it('is deterministic and independent of stock order', () => {
    const a = replaySession({
      sessionOpenMs: SESSION_OPEN,
      stocks: [stock('A'), stock('B')],
      indexMoveBps: 50,
      capitalPaise: 50_000_000,
    });
    const b = replaySession({
      sessionOpenMs: SESSION_OPEN,
      stocks: [stock('B'), stock('A')],
      indexMoveBps: 50,
      capitalPaise: 50_000_000,
    });
    expect(a).toEqual(b);
    expect(a.taken).toBe(1); // B could not afford a single share
    // Same relative volume: the tie breaks A→Z, so 'A' fills first and 'B' sees its reservation.
    expect(a.signals.map((s) => s.symbol)).toEqual(['A', 'B']);
    expect(a.signals[1]?.projection.shares).toBe(0);
    expect(a.signals[1]?.projection.skipReason).toBe('TOO_EXPENSIVE');
  });
});
