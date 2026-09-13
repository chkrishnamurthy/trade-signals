import { type SignalEvidence, sessionOpen } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { paperCharges, paperNet, paperPerformance, sizePaperStudy } from './paper-journal.js';
import { pendingProjection, updateSignalStatus } from './signal-lifecycle.js';
import { strategyFixture } from './vwap-fixture.js';
import { evaluateVwapSetup } from './vwap-strategy.js';

const evidence = (direction: 'BUY' | 'SELL' = 'BUY') =>
  evaluateVwapSetup(strategyFixture(direction), direction).evidence as SignalEvidence;
describe('prospective signal lifecycle', () => {
  for (const direction of ['BUY', 'SELL'] as const)
    it(`${direction}: activation, T1 continuation, and T2 full exit`, () => {
      const e = evidence(direction);
      const at = e.confirmationAt + 2000;
      const expires = e.confirmationAt + 900_000;
      const pending = pendingProjection(at);
      expect(
        updateSignalStatus(
          e,
          pending,
          { at, receivedAt: at, price: e.levels.trigger, continuous: true },
          expires,
        ),
      ).toEqual(pending);
      const active = updateSignalStatus(
        e,
        pending,
        { at: at + 5000, receivedAt: at + 5000, price: e.levels.trigger, continuous: true },
        expires,
      );
      expect(active.state).toBe('ACTIVE');
      expect(active.fill).toBe(e.levels.trigger);
      const t1 = updateSignalStatus(
        e,
        active,
        { at: at + 10_000, receivedAt: at + 10_000, price: e.levels.target1, continuous: true },
        expires,
      );
      expect(t1.state).toBe('TARGET_1_HIT');
      expect(t1.exit).toBeNull();
      const t2 = updateSignalStatus(
        e,
        t1,
        { at: at + 15_000, receivedAt: at + 15_000, price: e.levels.target2, continuous: true },
        expires,
      );
      expect(t2.state).toBe('TARGET_2_HIT');
      expect(t2.exit).toBe(e.levels.target2);
      expect(
        updateSignalStatus(
          e,
          t2,
          {
            at: at + 20_000,
            receivedAt: at + 20_000,
            price: e.levels.invalidation,
            continuous: true,
          },
          expires,
        ),
      ).toEqual(t2);
    });
  it('expires at the third scheduled boundary before admitting a trigger', () => {
    const e = evidence();
    const p = pendingProjection(e.confirmationAt + 29_000);
    const expires = e.confirmationAt + 900_000;
    expect(
      updateSignalStatus(
        e,
        p,
        { at: expires, receivedAt: expires, price: e.levels.trigger, continuous: true },
        expires,
      ).state,
    ).toBe('EXPIRED');
  });
  it('never reconstructs a profitable outcome across a delivery gap', () => {
    const e = evidence();
    const p = pendingProjection(e.confirmationAt);
    const at = e.confirmationAt + 5000;
    const interrupted = updateSignalStatus(
      e,
      p,
      { at, receivedAt: at, price: e.levels.target2, continuous: false },
      at + 900_000,
    );
    expect(interrupted.resolution).toBe('UNAVAILABLE');
    expect(interrupted.fill).toBeNull();
    const resumed = updateSignalStatus(
      e,
      interrupted,
      { at: at + 5000, receivedAt: at + 5000, price: e.levels.target2, continuous: true },
      at + 900_000,
    );
    expect(resumed.resolution).toBe('UNAVAILABLE');
    expect(resumed.fill).toBeNull();
  });
  it('uses the observed adverse stop gap, and square-off requires a valid observation', () => {
    const e = evidence();
    const at = e.confirmationAt + 5000;
    const p = { ...pendingProjection(at), state: 'ACTIVE' as const, fill: e.levels.trigger };
    const stopped = updateSignalStatus(
      e,
      p,
      { at: at + 5000, receivedAt: at + 5000, price: e.levels.invalidation - 10, continuous: true },
      at + 900_000,
    );
    expect(stopped.state).toBe('STOP_LOSS_HIT');
    expect(stopped.exit).toBe(e.levels.invalidation - 10);
    const squareAt = sessionOpen(new Date(at)).getTime() + 365 * 60_000;
    expect(
      updateSignalStatus(
        e,
        p,
        { at: squareAt, receivedAt: squareAt, price: e.levels.trigger, continuous: true },
        at + 900_000,
      ).state,
    ).toBe('SQUARED_OFF');
    expect(
      updateSignalStatus(
        e,
        p,
        { at: squareAt, receivedAt: squareAt + 16_000, price: e.levels.trigger, continuous: true },
        at + 900_000,
      ).exit,
    ).toBeNull();
  });
  it('invalidates an excessive trigger gap rather than inventing a cheap fill', () => {
    const e = evidence();
    const at = e.confirmationAt + 5000;
    const p = pendingProjection(e.confirmationAt);
    expect(
      updateSignalStatus(
        e,
        p,
        { at, receivedAt: at, price: e.levels.target2, continuous: true },
        at + 900_000,
      ).state,
    ).toBe('INVALIDATED');
  });
  it('moves the stop to fill only on the observation after target 1', () => {
    const e = evidence();
    const at = e.confirmationAt + 5000;
    const p = { ...pendingProjection(at), state: 'ACTIVE' as const, fill: e.levels.trigger };
    const t1 = updateSignalStatus(
      e,
      p,
      { at: at + 5000, receivedAt: at + 5000, price: e.levels.target1, continuous: true },
      at + 900_000,
      { moveToBreakeven: true },
    );
    expect(t1.state).toBe('TARGET_1_HIT');
    const stop = updateSignalStatus(
      e,
      t1,
      { at: at + 10_000, receivedAt: at + 10_000, price: e.levels.trigger, continuous: true },
      at + 900_000,
      { moveToBreakeven: true },
    );
    expect(stop.state).toBe('STOP_LOSS_HIT');
    expect(paperNet('BUY', e.levels.trigger, stop.exit!, 10)).toBeLessThan(0);
  });
});
describe('paper risk and costs', () => {
  it('hand-computed charge example with both legs, sell-only tax and buy-only stamp', () => {
    // 1 share: buy 10000p, sell11000p. Brokerage 3+4=7p; exchange1,
    // regulator1, protection1 => taxable10p, GST2p, sell tax3p, stamp1p =>16p.
    expect(paperCharges(10_000, 11_000, 1)).toBe(16);
    expect(paperNet('BUY', 10_000, 11_000, 1)).toBe(984);
  });
  it('caps at available unreserved capital, and costs are inside the loss budget', () => {
    const e = evidence();
    const sized = sizePaperStudy(e.levels, 'BUY', 10_000_000, 100, 1_000_000);
    expect(sized.capitalRequired).toBeLessThanOrEqual(1_000_000);
    expect(sized.maxLoss).toBeLessThanOrEqual(100_000);
    expect(sized.shares).toBeGreaterThan(0);
    expect(sizePaperStudy(e.levels, 'BUY', 10_000_000, 100, 0).shares).toBe(0);
    expect(sizePaperStudy(e.levels, 'BUY', 100, 1).shares).toBe(0);
  });
  it('keeps empty-sample statistics undefined rather than claiming a win rate', () => {
    const p = paperPerformance([]);
    expect(p.sampleSize).toBe(0);
    expect(p.winRate).toBeNull();
    expect(p.expectancyR).toBeNull();
    expect(p.profitFactor).toBeNull();
    expect(p.maxDrawdownPaise).toBeNull();
  });
});
