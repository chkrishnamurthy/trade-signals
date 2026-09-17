import type { IntradayEvidence } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { evaluateOrb } from './evaluate.js';
import { BUY_SIGNAL_AT, buySession, ist, SESSION, SESSION_INPUT, TICK } from './fixture.js';
import {
  type BookAllocation,
  type IntradayObservation,
  initialRisk,
  markNet,
  pendingIntradayProjection,
  realisedNet,
  sizeTrade,
  stepProjection,
} from './lifecycle.js';

function evidence(): IntradayEvidence {
  const d = evaluateOrb({
    bars: buySession(),
    asOf: BUY_SIGNAL_AT + 2_000,
    tickSize: TICK,
    alreadySignalled: false,
    session: SESSION_INPUT,
  });
  if (d.kind !== 'SIGNAL') throw new Error('fixture must signal');
  return d.evidence;
}
const PUBLISHED_AT = BUY_SIGNAL_AT + 2_000;
/** ₹5,00,000 capital, all of it free, 1 % risk. */
const BOOK: BookAllocation = { capitalPaise: 50_000_000, availablePaise: 50_000_000, riskBps: 100 };
const obs = (
  at: number,
  price: number,
  extra: Partial<IntradayObservation> = {},
): IntradayObservation => ({
  at,
  receivedAt: at + 500,
  price,
  continuous: true,
  ...extra,
});

/**
 * Worked example from the plan (§4), hand-computed:
 *   first quote 2956.50 + 2 bps slippage (59.13 → 60 paise) = 295710, rounded up to tick
 *   per-share risk 295710 − 293450 = 2260; floor(500,000 / 2260) = 221; cash cap floor(50,000,000 / 295710) = 169
 *   reserve(169) = 49,974,990 + round-trip charges 22,455 = 49,997,445 ≤ 50,000,000 → 169 shares
 *   T1: 84 out at 297830 − ceil(59.566) = 297770 (down to tick); net 84×2060 − 13,587 = 159,453
 *   T2: 85 out at 300020 − ceil(60.004)=61 → 299959 → 299955; net 85×4245 − 13,747 = 347,078
 */
describe('stepProjection — the worked example', () => {
  const e = evidence();
  const pending = pendingIntradayProjection(PUBLISHED_AT);
  const filled = stepProjection(e, pending, obs(PUBLISHED_AT + 1_000, 295_650), BOOK);
  it('sizes 169 shares at the slipped next price', () => {
    expect(sizeTrade(295_710, 293_450, BOOK)).toBe(169);
    expect(filled).toMatchObject({
      status: 'ACTIVE',
      taken: true,
      shares: 169,
      remainingShares: 169,
      fill: 295_710,
      fillAt: PUBLISHED_AT + 1_000,
      effectiveStop: 293_450,
      exits: [],
    });
    expect(initialRisk(e, filled)).toBe(2_260 * 169);
  });
  const t1 = stepProjection(e, filled, obs(ist(SESSION, 10, 35), 297_830), BOOK);
  it('books half at Target 1 and moves the stop to the fill', () => {
    expect(t1).toMatchObject({
      status: 'TARGET_1_HIT',
      remainingShares: 85,
      effectiveStop: 295_710,
      target1At: ist(SESSION, 10, 35),
      exits: [{ at: ist(SESSION, 10, 35), price: 297_770, shares: 84, reason: 'TARGET_1' }],
    });
    expect(realisedNet(e, t1)).toBe(159_453);
    // Marked at 2978.30 the remainder would exit at 297770: 85×2060 − charges(295710,297770,85)
    // b=25,135,350 s=25,310,450 total=50,445,800: broker 4000, exch ceil(1548.6)=1549, reg 51, prot 1
    // taxable 5601, GST ceil(1008.18)=1009, STT ceil(6327.6)=6328, stamp ceil(754.06)=755 → 13,693
    expect(markNet(e, t1, 297_830)).toBe(159_453 + 85 * 2_060 - 13_693);
  });
  const t2 = stepProjection(e, t1, obs(ist(SESSION, 12, 40), 300_020), BOOK);
  it('exits the remainder at Target 2', () => {
    expect(t2).toMatchObject({
      status: 'TARGET_2_HIT',
      remainingShares: 0,
      endedAt: ist(SESSION, 12, 40),
    });
    expect(t2.exits[1]).toEqual({
      at: ist(SESSION, 12, 40),
      price: 299_955,
      shares: 85,
      reason: 'TARGET_2',
    });
    expect(realisedNet(e, t2)).toBe(159_453 + 347_078);
    expect(markNet(e, t2, null)).toBe(506_531);
  });
  it('ignores anything after a terminal state or before the cursor', () => {
    expect(stepProjection(e, t2, obs(ist(SESSION, 13, 0), 100), BOOK)).toBe(t2);
    expect(stepProjection(e, t1, obs(ist(SESSION, 10, 34), 300_020), BOOK)).toBe(t1);
  });
});

describe('stepProjection — other exits', () => {
  const e = evidence();
  const filled = stepProjection(
    e,
    pendingIntradayProjection(PUBLISHED_AT),
    obs(PUBLISHED_AT + 1_000, 295_650),
    BOOK,
  );
  it('stops out at the worse observed price with slippage', () => {
    // 2934.00 is through the 2934.50 stop: exit floor((293400 − 59) / 5)×5 = 293340
    const s = stepProjection(e, filled, obs(ist(SESSION, 11, 0), 293_400), BOOK);
    expect(s).toMatchObject({ status: 'STOPPED_OUT', remainingShares: 0 });
    expect(s.exits).toEqual([
      { at: ist(SESSION, 11, 0), price: 293_340, shares: 169, reason: 'STOP' },
    ]);
    expect(realisedNet(e, s)).toBeLessThan(-2_370 * 169);
    // Touching the level exactly also exits: 293450 − ceil(58.69)=59 → 293391 → 293390
    const touch = stepProjection(e, filled, obs(ist(SESSION, 11, 0), 293_450), BOOK);
    expect(touch.exits[0]?.price).toBe(293_390);
  });
  it('breakeven stop after Target 1 exits the remainder near the fill', () => {
    const t1 = stepProjection(e, filled, obs(ist(SESSION, 10, 35), 297_830), BOOK);
    // 2957.00 ≤ 2957.10 stop: exit floor((295700 − 60) / 5)×5 = 295640
    const be = stepProjection(e, t1, obs(ist(SESSION, 11, 20), 295_700), BOOK);
    expect(be).toMatchObject({ status: 'STOPPED_OUT', remainingShares: 0 });
    expect(be.exits[1]).toEqual({
      at: ist(SESSION, 11, 20),
      price: 295_640,
      shares: 85,
      reason: 'BREAKEVEN_STOP',
    });
  });
  it('squares off at 15:15 on the first covered price', () => {
    const t1 = stepProjection(e, filled, obs(ist(SESSION, 10, 35), 297_830), BOOK);
    const before = stepProjection(e, t1, obs(ist(SESSION, 15, 14, 59), 298_000), BOOK);
    expect(before.status).toBe('TARGET_1_HIT');
    const eod = stepProjection(e, before, obs(ist(SESSION, 15, 15), 298_000), BOOK);
    // 298000 − 60 = 297940, on tick
    expect(eod).toMatchObject({ status: 'CLOSED_EOD', remainingShares: 0 });
    expect(eod.exits[1]).toEqual({
      at: ist(SESSION, 15, 15),
      price: 297_940,
      shares: 85,
      reason: 'EOD',
    });
  });
  it('Target 1 and Target 2 on one observation book both legs', () => {
    const both = stepProjection(e, filled, obs(ist(SESSION, 10, 35), 300_100), BOOK);
    expect(both.status).toBe('TARGET_2_HIT');
    expect(both.exits.map((x) => [x.shares, x.price, x.reason])).toEqual([
      [84, 297_770, 'TARGET_1'],
      [85, 299_955, 'TARGET_2'],
    ]);
  });
  it('skips a fill that slipped more than 0.30 % past the signal close', () => {
    // 2966.00 + 60 → 296660; 296660 − 295640 = 1020 > 295640 × 0.003 = 886.9
    const s = stepProjection(
      e,
      pendingIntradayProjection(PUBLISHED_AT),
      obs(PUBLISHED_AT + 1_000, 296_600),
      BOOK,
    );
    expect(s).toMatchObject({
      status: 'SKIPPED',
      taken: false,
      skipReason: 'ENTRY_SLIPPED',
      shares: 0,
    });
    expect(s.endedAt).toBe(PUBLISHED_AT + 1_000);
  });
  it('tracks a signal the book did not take, with no shares and no result', () => {
    const p = pendingIntradayProjection(PUBLISHED_AT, 'DAILY_LIMIT');
    const f = stepProjection(e, p, obs(PUBLISHED_AT + 1_000, 295_650), null);
    expect(f).toMatchObject({
      status: 'ACTIVE',
      taken: false,
      skipReason: 'DAILY_LIMIT',
      shares: 0,
      fill: 295_710,
    });
    const done = stepProjection(e, f, obs(ist(SESSION, 12, 0), 300_100), null);
    expect(done).toMatchObject({ status: 'TARGET_2_HIT', exits: [] });
    expect(realisedNet(e, done)).toBeNull();
    expect(markNet(e, done, 300_100)).toBeNull();
    expect(initialRisk(e, done)).toBeNull();
  });
  it('marks a zero-share allocation as too expensive', () => {
    const f = stepProjection(
      e,
      pendingIntradayProjection(PUBLISHED_AT),
      obs(PUBLISHED_AT + 1_000, 295_650),
      {
        ...BOOK,
        availablePaise: 200_000,
      },
    );
    expect(f).toMatchObject({
      status: 'ACTIVE',
      taken: false,
      skipReason: 'TOO_EXPENSIVE',
      shares: 0,
    });
  });
  it('a coverage gap makes the outcome unavailable and stays that way', () => {
    const gap = stepProjection(
      e,
      filled,
      obs(ist(SESSION, 11, 0), 300_100, { continuous: false }),
      BOOK,
    );
    expect(gap).toMatchObject({ status: 'ACTIVE', resolution: 'UNAVAILABLE', exits: [] });
    const later = stepProjection(e, gap, obs(ist(SESSION, 11, 5), 300_100), BOOK);
    expect(later).toMatchObject({ status: 'ACTIVE', resolution: 'UNAVAILABLE' });
    const stale = stepProjection(
      e,
      filled,
      obs(ist(SESSION, 11, 0), 300_100, { receivedAt: ist(SESSION, 11, 0) + 15_001 }),
      BOOK,
    );
    expect(stale.resolution).toBe('UNAVAILABLE');
  });
  it('a single share has no partial at Target 1 but still moves the stop', () => {
    const one = stepProjection(
      e,
      pendingIntradayProjection(PUBLISHED_AT),
      obs(PUBLISHED_AT + 1_000, 295_650),
      {
        ...BOOK,
        availablePaise: 300_000,
      },
    );
    expect(one.shares).toBe(1);
    const t1 = stepProjection(e, one, obs(ist(SESSION, 10, 35), 297_830), BOOK);
    expect(t1).toMatchObject({
      status: 'TARGET_1_HIT',
      remainingShares: 1,
      effectiveStop: 295_710,
      exits: [],
    });
  });
});

describe('sizeTrade', () => {
  it('is bounded by risk budget, then by free cash including charges', () => {
    // budget 500,000 / 2260 = 221 shares needs ₹6.5 lakh; with ₹10 lakh free the budget binds
    expect(
      sizeTrade(295_710, 293_450, {
        capitalPaise: 50_000_000,
        availablePaise: 100_000_000,
        riskBps: 100,
      }),
    ).toBe(221);
    // exactly 169 × 295710 = 49,974,990 free: the charges no longer fit → 168
    expect(sizeTrade(295_710, 293_450, { ...BOOK, availablePaise: 49_974_990 })).toBe(168);
    expect(sizeTrade(295_710, 295_710, BOOK)).toBe(0);
    expect(sizeTrade(295_710, 293_450, { ...BOOK, availablePaise: 0 })).toBe(0);
  });
});
