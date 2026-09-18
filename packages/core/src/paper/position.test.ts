import { describe, expect, it } from 'vitest';
import { BUY_SIGNAL_AT, ist, SESSION } from '../intraday/fixture.js';
import { CAPITAL, relianceIntent } from './fixture.js';
import { advancePosition, ledgerForFills, newPaperPosition } from './position.js';

const PUBLISHED_AT = BUY_SIGNAL_AT + 2_000;
const obs = (at: number, price: number, continuous = true) => ({
  at,
  receivedAt: at + 500,
  price,
  continuous,
});
/** The engine decided 23 shares; the fill re-checks cash (67 would fit) and keeps 23. */
const allocation = { equityPaise: CAPITAL, availablePaise: CAPITAL, riskBps: 100, maxShares: 23 };

/**
 * 23 shares of the worked example:
 *   fill 2957.10 → locked 6,801,330; initial risk 23 × 22.60 = 51,980
 *   T1 2978.30: 11 out at 2977.70 → gross 11 × 20.60 = 22,660; charges 3,476; net 19,184
 *   T2 3000.20: 12 out at 2999.55 → gross 12 × 42.45 = 50,940; charges 3,809; net 47,131
 *   total gross 73,600 · charges 7,285 · net 66,315
 */
describe('advancePosition', () => {
  const intent = relianceIntent();
  const pending = newPaperPosition(1, intent, PUBLISHED_AT);
  it('fills at the next price, sized no larger than the decision', () => {
    const r = advancePosition(pending, intent, obs(PUBLISHED_AT + 1_000, 295_650), allocation);
    expect(r.changed).toBe(true);
    expect(r.fills).toEqual([
      {
        leg: 0,
        at: PUBLISHED_AT + 1_000,
        pricePaise: 295_710,
        shares: 23,
        chargesPaise: 0,
        resolution: 'OBSERVED',
      },
    ]);
    expect(r.position).toMatchObject({
      status: 'OPEN',
      lockedPaise: 6_801_330,
      initialRiskPaise: 51_980,
      openedAt: PUBLISHED_AT + 1_000,
    });
    expect(r.events.map((e) => e.kind)).toEqual(['OPENED']);
    expect(
      ledgerForFills(
        1,
        r.position,
        intent,
        r.fills.map((f) => ({ ...f, id: 11 })),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'ENTRY',
        amountPaise: -6_801_330,
        idempotencyKey: '1:fill:11:ENTRY:0',
      }),
    ]);
  });
  it('books the partial at Target 1, moves the stop, then closes at Target 2', () => {
    const filled = advancePosition(
      pending,
      intent,
      obs(PUBLISHED_AT + 1_000, 295_650),
      allocation,
    ).position;
    const t1 = advancePosition(filled, intent, obs(ist(SESSION, 10, 35), 297_830), null);
    expect(t1.fills).toEqual([
      {
        leg: 1,
        at: ist(SESSION, 10, 35),
        pricePaise: 297_770,
        shares: 11,
        chargesPaise: 3_476,
        resolution: 'OBSERVED',
      },
    ]);
    expect(t1.position).toMatchObject({
      status: 'OPEN',
      lockedPaise: 3_548_520,
      grossRealisedPaise: 22_660,
      chargesPaise: 3_476,
      netRealisedPaise: 19_184,
    });
    expect(t1.events.map((e) => e.kind)).toEqual(['TARGET1_PARTIAL', 'STOP_UPDATED']);
    expect(
      ledgerForFills(
        1,
        t1.position,
        intent,
        t1.fills.map((f) => ({ ...f, id: 12 })),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'EXIT',
        amountPaise: 3_275_470,
        lockedDeltaPaise: -3_252_810,
      }),
      expect.objectContaining({ kind: 'CHARGES', amountPaise: -3_476 }),
    ]);
    const t2 = advancePosition(t1.position, intent, obs(ist(SESSION, 12, 40), 300_020), null);
    expect(t2.fills).toEqual([
      {
        leg: 2,
        at: ist(SESSION, 12, 40),
        pricePaise: 299_955,
        shares: 12,
        chargesPaise: 3_809,
        resolution: 'OBSERVED',
      },
    ]);
    expect(t2.position).toMatchObject({
      status: 'CLOSED',
      exitReason: 'TARGET2',
      lockedPaise: 0,
      grossRealisedPaise: 73_600,
      chargesPaise: 7_285,
      netRealisedPaise: 66_315,
      closedAt: ist(SESSION, 12, 40),
    });
    expect(advancePosition(t2.position, intent, obs(ist(SESSION, 13, 0), 1), null).changed).toBe(
      false,
    );
  });
  it('a slipped entry closes the position without a fill', () => {
    const r = advancePosition(pending, intent, obs(PUBLISHED_AT + 1_000, 296_600), allocation);
    expect(r.fills).toEqual([]);
    expect(r.position).toMatchObject({
      status: 'CLOSED',
      exitReason: 'ENTRY_GAP_TOO_LARGE',
      lockedPaise: 0,
    });
    expect(r.events[0]?.kind).toBe('UNRESOLVED');
  });
  it('a stop exits everything with the loss on the ledger; a coverage break is an event, not a fill', () => {
    const filled = advancePosition(
      pending,
      intent,
      obs(PUBLISHED_AT + 1_000, 295_650),
      allocation,
    ).position;
    const gap = advancePosition(filled, intent, obs(ist(SESSION, 10, 0), 300_000, false), null);
    expect(gap.fills).toEqual([]);
    expect(gap.events.map((e) => e.kind)).toEqual(['COVERAGE_BREAK']);
    expect(gap.position.status).toBe('OPEN');
    // 2934.00 through the 2934.50 stop → 23 out at 2933.40: gross 23 × −23.70 = −54,510
    const stop = advancePosition(filled, intent, obs(ist(SESSION, 10, 0), 293_400), null);
    expect(stop.fills[0]).toMatchObject({ leg: 2, pricePaise: 293_340, shares: 23 });
    expect(stop.position).toMatchObject({
      status: 'CLOSED',
      exitReason: 'STOP',
      grossRealisedPaise: -54_510,
    });
    expect(stop.position.netRealisedPaise).toBeLessThan(-54_510);
  });
  it('an entry past its validity window is cancelled, never filled late', () => {
    // validUntil = signalAt + 5 min; the first price arrives a second after that.
    const r = advancePosition(pending, intent, obs(intent.validUntil + 1_000, 295_650), allocation);
    expect(r.fills).toEqual([]);
    expect(r.position).toMatchObject({ status: 'CLOSED', exitReason: 'SIGNAL_EXPIRED' });
    expect(r.position.projection.fill).toBeNull();
    expect(r.events).toEqual([expect.objectContaining({ kind: 'UNRESOLVED' })]);
  });
  it('a fill that leaves room for no share declines the trade instead of opening it empty', () => {
    const r = advancePosition(pending, intent, obs(PUBLISHED_AT + 1_000, 295_650), {
      ...allocation,
      availablePaise: 100, // ₹1 of free cash
    });
    expect(r.fills).toEqual([]);
    expect(r.position).toMatchObject({ status: 'CLOSED', exitReason: 'QUANTITY_ZERO' });
    expect(r.position.projection).toMatchObject({ status: 'SKIPPED', fill: null, shares: 0 });
  });
  it("squares off at the session's own time when one is given", () => {
    const open = advancePosition(pending, intent, obs(PUBLISHED_AT + 1_000, 295_650), allocation);
    const at1400 = ist(SESSION, 14, 0);
    const untouched = advancePosition(open.position, intent, obs(at1400, 296_000), null);
    expect(untouched.position.status).toBe('OPEN');
    expect(untouched.fills).toEqual([]);
    // A special session squaring off at 14:00: the same observation closes it.
    const early = advancePosition(
      open.position,
      intent,
      obs(at1400, 296_000),
      null,
      undefined,
      undefined,
      at1400,
    );
    expect(early.position).toMatchObject({ status: 'CLOSED', exitReason: 'EOD_SQUARE_OFF' });
    expect(early.fills[0]).toMatchObject({ leg: 2, shares: 23 });
  });
});
