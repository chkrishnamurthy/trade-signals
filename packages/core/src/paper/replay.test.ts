import { describe, expect, it } from 'vitest';
import {
  buySession,
  dailyBars,
  ist,
  SESSION,
  SESSION_OPEN,
  workedExampleMinutes,
} from '../intraday/fixture.js';
import { assignments, CAPITAL, session, settings } from './fixture.js';
import { replayPortfolio } from './replay.js';

const stock = (symbol = 'RELIANCE', sector = 'Energy') => ({
  symbol,
  companyName: symbol,
  sector,
  tickSize: 5,
  bars: buySession(),
  minutes: workedExampleMinutes(),
  daily: dailyBars(),
});
const run = (overrides: Partial<Parameters<typeof replayPortfolio>[0]> = {}) =>
  replayPortfolio({
    sessionOpenMs: SESSION_OPEN,
    stocks: [stock()],
    indexMoveBps: 50,
    capitalPaise: CAPITAL,
    settings: settings(),
    assignments,
    session,
    ...overrides,
  });

describe('replayPortfolio', () => {
  it('runs the worked example through a ₹2,00,000 book: 23 shares, net +₹663.15, ledger balanced', () => {
    const r = run();
    expect(r.decisions.map((d) => [d.intentId, d.accepted, d.shares])).toEqual([[1, true, 23]]);
    expect(r.positions[0]).toMatchObject({
      status: 'CLOSED',
      exitReason: 'TARGET2',
      netRealisedPaise: 66_315,
      grossRealisedPaise: 73_600,
      chargesPaise: 7_285,
    });
    expect(r.positions[0]?.projection.exits.map((x) => [x.shares, x.price])).toEqual([
      [11, 297_770],
      [12, 299_955],
    ]);
    expect(r.balances).toEqual({ cashPaise: 20_066_315, reservedPaise: 0, lockedPaise: 0 });
    expect(r.ledger.map((e) => e.kind)).toEqual([
      'OPENING_BALANCE',
      'RESERVE',
      'RELEASE',
      'ENTRY',
      'EXIT',
      'CHARGES',
      'EXIT',
      'CHARGES',
    ]);
    expect(r.ledgerMismatches).toBe(0);
    expect(r.snapshot).toMatchObject({
      equityPaise: 20_066_315,
      exposurePaise: 0,
      drawdownPaise: 0,
      marksComplete: true,
    });
    expect(r.performance).toMatchObject({
      closedTrades: 1,
      wins: 1,
      netPaise: 66_315,
      sampleSize: 'TOO_FEW',
    });
  });
  it('is deterministic and independent of stock order; the second stock is capped by the sector limit', () => {
    const a = run({ stocks: [stock('A'), stock('B')] });
    const b = run({ stocks: [stock('B'), stock('A')] });
    expect(a).toEqual(b);
    // A: 23 shares (position cap). B: sector 60 % = 12,000,000 − 6,799,720 = 5,200,280 / 295,640 = 17
    expect(a.decisions.map((d) => [d.intentId, d.shares, d.sizing?.bindingCap])).toEqual([
      [1, 23, 'byPosition'],
      [2, 17, 'bySector'],
    ]);
    expect(a.ledgerMismatches).toBe(0);
  });
  it('takes nothing when paper trading is off or was switched on after the signal', () => {
    expect(run({ settings: settings({ enabled: false }) }).decisions[0]).toMatchObject({
      accepted: false,
      reasonCode: 'PAPER_TRADING_DISABLED',
    });
    const late = run({ settings: settings({ enabledAt: ist(SESSION, 9, 50) }) });
    expect(late.decisions[0]).toMatchObject({
      accepted: false,
      reasonCode: 'SIGNAL_BEFORE_ACTIVATION',
    });
    expect(late.balances.cashPaise).toBe(CAPITAL);
    expect(late.ledger).toHaveLength(1);
  });
  it('an unfilled reservation is released at the close', () => {
    // Minutes stop right after the signal candle: the position never sees a next price.
    const m = workedExampleMinutes().filter((b) => b.timestamp < ist(SESSION, 9, 50));
    const r = run({ stocks: [{ ...stock(), minutes: m }] });
    expect(r.decisions[0]?.accepted).toBe(true);
    expect(r.balances).toEqual({ cashPaise: CAPITAL, reservedPaise: 0, lockedPaise: 0 });
    expect(r.ledger.map((e) => e.kind)).toEqual(['OPENING_BALANCE', 'RESERVE', 'RELEASE']);
  });
});
