import { describe, expect, it } from 'vitest';
import type { Bar } from '../types.js';
import { buySession, dailyBars, ist, SESSION, SESSION_OPEN } from './fixture.js';
import { replaySession } from './replay.js';

/** Minute bars for the fixture session: flat until 09:50, then the worked example's path. */
function minutes(): Bar[] {
  const out: Bar[] = [];
  const flat = (t: number, p: number) => ({
    timestamp: t,
    open: p,
    high: p,
    low: p,
    close: p,
    volume: 1_000,
  });
  for (let t = SESSION_OPEN; t < ist(SESSION, 9, 50); t += 60_000) out.push(flat(t, 294_500));
  // 09:50 opens at 2956.50 → fill 2957.10
  out.push({
    timestamp: ist(SESSION, 9, 50),
    open: 295_650,
    high: 295_900,
    low: 295_600,
    close: 295_800,
    volume: 1_000,
  });
  for (let t = ist(SESSION, 9, 51); t < ist(SESSION, 10, 35); t += 60_000)
    out.push(flat(t, 296_000));
  // 10:35 touches Target 1 (2978.30) → 84 out at 2977.70, stop to 2957.10
  out.push({
    timestamp: ist(SESSION, 10, 35),
    open: 297_000,
    high: 297_900,
    low: 296_900,
    close: 297_500,
    volume: 1_000,
  });
  for (let t = ist(SESSION, 10, 36); t < ist(SESSION, 12, 40); t += 60_000)
    out.push(flat(t, 298_000));
  // 12:40 touches Target 2 (3000.20) → 85 out at 2999.55
  out.push({
    timestamp: ist(SESSION, 12, 40),
    open: 299_500,
    high: 300_100,
    low: 299_400,
    close: 300_000,
    volume: 1_000,
  });
  for (let t = ist(SESSION, 12, 41); t < ist(SESSION, 15, 30); t += 60_000)
    out.push(flat(t, 300_000));
  return out;
}
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
