import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRADAY_CONFIG } from './config.js';
import { costPercent, DEFAULT_COST_MODEL, netPnl, roundTripCost } from './costs.js';
import { technicalLevels } from './strategies/shared.js';

/**
 * Fixtures are hand-computed from the published NSE/SEBI intraday equity
 * schedule, not from this module's own output. A ₹100 → ₹101 long, per share:
 *
 *   turnover  = 10000 + 10100                  = 20100 paise
 *   brokerage = 20100 × 0.03%                  =  6.03
 *   stt       = 10100 × 0.025%   (sell only)   =  2.525
 *   exchange  = 20100 × 0.00297%               =  0.59697
 *   sebi      = 20100 × 0.0001%                =  0.0201
 *   stamp     = 10000 × 0.003%   (buy only)    =  0.3
 *   gst       = (6.03 + 0.59697 + 0.0201) × 18% =  1.1964726
 *   slippage  = 20100 × 0.02%                  =  4.02
 *   total                                       = 14.6885426
 */
describe('roundTripCost', () => {
  it('itemises a long round trip to the published schedule', () => {
    const cost = roundTripCost('long', 10_000, 10_100, DEFAULT_COST_MODEL);
    expect(cost.brokerage).toBeCloseTo(6.03, 6);
    expect(cost.stt).toBeCloseTo(2.525, 6);
    expect(cost.exchange).toBeCloseTo(0.59697, 6);
    expect(cost.sebi).toBeCloseTo(0.0201, 6);
    expect(cost.stamp).toBeCloseTo(0.3, 6);
    expect(cost.gst).toBeCloseTo(1.1964726, 6);
    expect(cost.slippage).toBeCloseTo(4.02, 6);
    expect(cost.total).toBeCloseTo(14.6885426, 6);
  });

  it('charges STT on the entry when the trade is a short', () => {
    // Same two prices, opposite direction: the sell leg is now the 10,000 one,
    // so STT falls on the smaller number and stamp duty on the larger.
    const long = roundTripCost('long', 10_000, 10_100, DEFAULT_COST_MODEL);
    const short = roundTripCost('short', 10_000, 10_100, DEFAULT_COST_MODEL);
    expect(short.stt).toBeCloseTo(2.5, 6);
    expect(short.stamp).toBeCloseTo(0.303, 6);
    expect(short.total).toBeLessThan(long.total);
  });

  it('costs roughly 0.146% of a round trip at default rates', () => {
    expect(costPercent('long', 10_000, 10_000, DEFAULT_COST_MODEL)).toBeCloseTo(0.1461, 3);
  });

  it('turns a small gross gain into a net loss', () => {
    // ₹400 stock, a 10-paise winner: 10 gross, ~58.5 paise of cost.
    expect(netPnl('long', 40_000, 40_010, DEFAULT_COST_MODEL)).toBeLessThan(0);
  });
});

describe('technicalLevels cost awareness', () => {
  it('floors the invalidation level so it clears the spread', () => {
    // ATR 20 paise on a ₹400 stock: 1.2 × ATR is 24 paise, which is 0.06% and
    // inside the noise band. The 0.12% floor pushes it to 48.
    const levels = technicalLevels('long', 40_000, null, 20, DEFAULT_INTRADAY_CONFIG);
    expect(levels).not.toBeNull();
    expect(levels?.invalidation).toBe(39_952);
    expect(levels?.risk).toBe(48);
  });

  it('reports a net reward-to-risk below the gross one', () => {
    const levels = technicalLevels('long', 40_000, null, 200, DEFAULT_INTRADAY_CONFIG);
    expect(levels).not.toBeNull();
    if (levels === null) return;
    expect(levels.riskReward).not.toBeNull();
    expect(levels.netRiskReward).not.toBeNull();
    expect(levels.netRiskReward ?? 0).toBeLessThan(levels.riskReward ?? 0);
    expect(levels.netReward).toBe(levels.reward - levels.costPaise);
    expect(levels.netRisk).toBeGreaterThan(levels.risk);
  });

  it('reports a null net ratio when costs exceed the whole target', () => {
    // ATR 10 paise on a ₹400 stock: target 1 is 16 paise, cost is ~58.
    const levels = technicalLevels('long', 40_000, null, 10, DEFAULT_INTRADAY_CONFIG);
    expect(levels?.netReward).toBeLessThan(0);
    expect(levels?.netRiskReward).toBeNull();
  });
});
