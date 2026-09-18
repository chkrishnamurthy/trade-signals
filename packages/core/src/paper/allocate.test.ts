import { describe, expect, it } from 'vitest';
import { BUY_SIGNAL_AT } from '../intraday/fixture.js';
import { decidePaperEntries } from './allocate.js';
import { assignments, CAPITAL, intent, session, settings } from './fixture.js';
import { emptyPortfolioState } from './state.js';

const asOf = BUY_SIGNAL_AT + 2_000;
const decide = (
  intents: ReturnType<typeof intent>[],
  overrides: Parameters<typeof decidePaperEntries>[0] extends infer T ? Partial<T> : never = {},
) =>
  decidePaperEntries({
    intents,
    state: emptyPortfolioState(CAPITAL),
    settings: settings(),
    assignments,
    session,
    asOf,
    ...overrides,
  });
const codes = (d: ReturnType<typeof decidePaperEntries>) =>
  d.map((x) => [x.intentId, x.accepted ? 'ACCEPT' : x.reasonCode]);

describe('decidePaperEntries — pre-filters', () => {
  const one = intent({ id: 1 });
  it.each([
    ['PAPER_TRADING_DISABLED', { settings: settings({ enabled: false }) }],
    ['ENTRIES_PAUSED', { settings: settings({ entriesPaused: true }) }],
    ['SIGNAL_BEFORE_ACTIVATION', { settings: settings({ enabledAt: BUY_SIGNAL_AT }) }],
    ['SIGNAL_BEFORE_ACTIVATION', { settings: settings({ enabledAt: null }) }],
    ['STRATEGY_DISABLED', { assignments: [{ ...assignments[0]!, enabled: false }] }],
    ['MARKET_CLOSED', { session: { ...session, kind: 'HOLIDAY' as const } }],
    ['AFTER_ENTRY_CUTOFF', { session: { ...session, entryCutoffAt: BUY_SIGNAL_AT - 1 } }],
    ['SIGNAL_EXPIRED', { asOf: one.validUntil + 1 }],
  ])('%s', (code, overrides) => {
    expect(codes(decide([one], overrides))).toEqual([[1, code]]);
  });
  it('a signal exactly at activation is before it; one candle later is taken', () => {
    expect(codes(decide([one], { settings: settings({ enabledAt: BUY_SIGNAL_AT }) }))).toEqual([
      [1, 'SIGNAL_BEFORE_ACTIVATION'],
    ]);
    expect(codes(decide([one], { settings: settings({ enabledAt: BUY_SIGNAL_AT - 1 }) }))).toEqual([
      [1, 'ACCEPT'],
    ]);
  });
  it('unsupported entry kinds and invalid stops', () => {
    expect(
      codes(
        decide([intent({ id: 1, entry: { kind: 'LIMIT', reference: 295_640, maxSlipBps: 30 } })]),
      ),
    ).toEqual([[1, 'UNSUPPORTED_ENTRY_KIND']]);
    expect(codes(decide([intent({ id: 2, stop: 296_000 })]))).toEqual([[2, 'INVALID_STOP']]);
  });
  it('daily loss and drawdown halts', () => {
    // −2 % of 20,000,000 = −400,000
    expect(
      codes(decide([one], { state: { ...emptyPortfolioState(CAPITAL), dayNetPaise: -400_000 } })),
    ).toEqual([[1, 'DAILY_LOSS_LIMIT']]);
    expect(
      codes(decide([one], { state: { ...emptyPortfolioState(CAPITAL), dayNetPaise: -399_999 } })),
    ).toEqual([[1, 'ACCEPT']]);
    // −10 % from a 22,000,000 peak = equity ≤ 19,800,000
    expect(
      codes(
        decide([one], {
          state: {
            ...emptyPortfolioState(CAPITAL),
            equityPaise: 19_800_000,
            peakEquityPaise: 22_000_000,
          },
        }),
      ),
    ).toEqual([[1, 'DRAWDOWN_LIMIT']]);
  });
  it('duplicate and existing-position checks use the portfolio state', () => {
    expect(
      codes(
        decide([one], {
          state: {
            ...emptyPortfolioState(CAPITAL),
            decidedKeys: new Set(['orb-vc:101:2026-09-17']),
          },
        }),
      ),
    ).toEqual([[1, 'DUPLICATE_SIGNAL']]);
    expect(
      codes(
        decide([one], {
          state: { ...emptyPortfolioState(CAPITAL), liveInstruments: new Set([101]) },
        }),
      ),
    ).toEqual([[1, 'EXISTING_POSITION']]);
  });
});

describe('decidePaperEntries — conflicts and ordering', () => {
  const two = [
    { strategyId: 'orb-vc', enabled: true, priority: 10 },
    { strategyId: 'other', enabled: true, priority: 20 },
  ];
  it('opposite directions at equal priority reject both', () => {
    const a = intent({ id: 1, direction: 'BUY' });
    const b = intent({ id: 2, direction: 'SELL', stop: 297_800 });
    expect(codes(decide([a, b]))).toEqual([
      [1, 'CONFLICTING_SIGNAL'],
      [2, 'CONFLICTING_SIGNAL'],
    ]);
  });
  it('a higher-priority strategy wins a conflict; same direction from two strategies is a duplicate', () => {
    const a = intent({ id: 1, direction: 'BUY' });
    const b = intent({ id: 2, direction: 'SELL', stop: 297_800, strategyId: 'other' });
    expect(codes(decide([b, a], { assignments: two }))).toEqual([
      [2, 'CONFLICTING_SIGNAL'],
      [1, 'ACCEPT'],
    ]);
    const c = intent({ id: 3, strategyId: 'other' });
    expect(codes(decide([c, a], { assignments: two }))).toEqual([
      [3, 'CONFLICTING_SIGNAL'],
      [1, 'ACCEPT'],
    ]);
  });
  it('orders by priority, then strength, then symbol — never by input order', () => {
    // Cheap stocks so the position cap is not the constraint: ref 100.00 stop 99.30 (risk 0.70 → 0.7 %)
    const cheap = (id: number, symbol: string, strength: number, strategyId = 'orb-vc') =>
      intent({
        id,
        symbol,
        instrumentId: 200 + id,
        sector: null,
        strategyId,
        entry: { kind: 'MARKET_NEXT', reference: 10_000, maxSlipBps: 30 },
        stop: 9_930,
        sizing: { strength },
      });
    const intents = [
      cheap(1, 'ZEE', 1.6),
      cheap(2, 'AAA', 1.6),
      cheap(3, 'MMM', 2.5),
      cheap(4, 'OTH', 9.9, 'other'),
    ];
    const first = decide(intents, {
      assignments: two,
      settings: settings({ maxOpenPositions: 3 }),
    });
    const second = decide([...intents].reverse(), {
      assignments: two,
      settings: settings({ maxOpenPositions: 3 }),
    });
    const accepted = (d: typeof first) => d.filter((x) => x.accepted).map((x) => x.intentId);
    // orb-vc (priority 10) first: MMM (2.5), then AAA and ZEE (1.6, A→Z); 'other' is 4th → MAX_POSITIONS
    expect(accepted(first)).toEqual([3, 2, 1]);
    expect(codes(first).find(([id]) => id === 4)?.[1]).toBe('MAX_POSITIONS');
    expect([...first].sort((a, b) => a.intentId - b.intentId)).toEqual(
      [...second].sort((a, b) => a.intentId - b.intentId),
    );
  });
  it('exposure moves with each accepted decision in the batch', () => {
    const cheap = (id: number) =>
      intent({
        id,
        symbol: `S${id}`,
        instrumentId: 300 + id,
        sector: 'Bank',
        entry: { kind: 'MARKET_NEXT', reference: 10_000, maxSlipBps: 30 },
        stop: 9_930,
      });
    const d = decide([cheap(1), cheap(2), cheap(3), cheap(4)], {
      settings: settings({ maxOpenPositions: 5 }),
    });
    // each: risk 200,000/70 = 2857; position cap 7,000,000/10,000 = 700 → 700 shares = 7,000,000 notional
    // sector cap 12,000,000: 1st 700, 2nd floor(5,000,000/10,000) = 500, then no room → SECTOR_EXPOSURE_LIMIT
    expect(codes(d)).toEqual([
      [1, 'ACCEPT'],
      [2, 'ACCEPT'],
      [3, 'SECTOR_EXPOSURE_LIMIT'],
      [4, 'SECTOR_EXPOSURE_LIMIT'],
    ]);
    expect(d[0]?.shares).toBe(700);
    expect(d[1]?.shares).toBe(500);
    expect(d[2]?.counts).toEqual({ openPositions: 2, tradesToday: 2 });
  });
  it('the daily trade count and the open-trade count each cap the batch', () => {
    const cheap = (id: number) =>
      intent({
        id,
        symbol: `S${id}`,
        instrumentId: 300 + id,
        sector: null,
        entry: { kind: 'MARKET_NEXT', reference: 10_000, maxSlipBps: 30 },
        stop: 9_930,
      });
    expect(
      codes(
        decide([cheap(1), cheap(2), cheap(3)], {
          settings: settings({ maxTradesPerDay: 2, maxOpenPositions: 5 }),
        }),
      ),
    ).toEqual([
      [1, 'ACCEPT'],
      [2, 'ACCEPT'],
      [3, 'MAX_TRADES_PER_DAY'],
    ]);
    expect(
      codes(
        decide([cheap(1), cheap(2)], {
          state: { ...emptyPortfolioState(CAPITAL), openPositions: 2 },
          settings: settings({ maxOpenPositions: 3 }),
        }),
      ),
    ).toEqual([
      [1, 'ACCEPT'],
      [2, 'MAX_POSITIONS'],
    ]);
  });
});
