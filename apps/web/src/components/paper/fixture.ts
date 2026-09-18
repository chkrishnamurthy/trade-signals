import { advancePosition, newPaperPosition, STRATEGY_CATALOGUE } from '@equitywise/core';
import {
  type PaperActivity,
  type PaperOpenTrade,
  type PaperOverview,
  type PaperPerformanceReport,
  type PaperTradesPage,
  paperActivitySchema,
  paperOpenTradeSchema,
  paperOverviewSchema,
  paperPerformanceReportSchema,
  paperTradesPageSchema,
  type TradeIntent,
} from '@equitywise/shared';
import { BUY_SIGNAL_AT, ist, SESSION } from '../../../../../packages/core/src/intraday/fixture';
import {
  assignments,
  CAPITAL,
  intent,
  relianceIntent,
  session,
  settings,
} from '../../../../../packages/core/src/paper/fixture';

/**
 * SIMULATED review data for Storybook and render tests, built by running the
 * real paper engine over the worked example. Never production output.
 */
export const PUBLISHED_AT = BUY_SIGNAL_AT + 2_000;
const obs = (at: number, price: number) => ({ at, receivedAt: at + 500, price, continuous: true });
const allocation = {
  equityPaise: CAPITAL,
  availablePaise: CAPITAL,
  riskBps: 10_000,
  maxShares: 23,
};

function run(id: number, i: TradeIntent, prices: [number, number][]) {
  let p = newPaperPosition(id, i, PUBLISHED_AT);
  for (const [at, price] of prices)
    p = advancePosition(
      p,
      i,
      obs(at, price),
      p.projection.fill === null ? allocation : null,
    ).position;
  return p;
}
const levels = (i: TradeIntent) => ({
  reference: i.entry.reference,
  stop: i.stop,
  target1: i.target1,
  target2: i.target2,
});
function trade(id: number, i: TradeIntent, prices: [number, number][], lastPrice: number | null) {
  const p = run(id, i, prices);
  return paperOpenTradeSchema.parse({
    ...p,
    decidedShares: 23,
    levels: levels(i),
    lastPrice,
    quoteAt: lastPrice === null ? null : PUBLISHED_AT + 30 * 60_000,
    markNetPaise: p.status === 'CLOSED' ? p.netRealisedPaise : p.netRealisedPaise + 12_000,
    squareOffAt: session.squareOffAt,
  });
}

const reliance = relianceIntent();
const hdfc = intent({ id: 2, instrumentId: 102, symbol: 'HDFCBANK', sector: 'Banking' });
const tata = intent({ id: 3, instrumentId: 103, symbol: 'TATASTEEL', sector: 'Metals' });

/** The worked example, closed at Target 2: net ₹663.15 on 23 shares. */
export const closedWinner = () =>
  trade(
    1,
    reliance,
    [
      [PUBLISHED_AT + 1_000, 295_650],
      [PUBLISHED_AT + 11_000, 297_830],
      [PUBLISHED_AT + 21_000, 300_020],
    ],
    300_020,
  );
export const stoppedOut = () =>
  trade(
    2,
    hdfc,
    [
      [PUBLISHED_AT + 1_000, 295_650],
      [PUBLISHED_AT + 12_000, 293_400],
    ],
    293_400,
  );
export const openAfterTarget1 = () =>
  trade(
    3,
    tata,
    [
      [PUBLISHED_AT + 1_000, 295_650],
      [PUBLISHED_AT + 11_000, 297_830],
    ],
    298_100,
  );
export const waitingForPrice = () =>
  trade(4, intent({ id: 4, symbol: 'ITC', instrumentId: 104 }), [], null);

export function simulatedOverview(overrides: Partial<PaperOverview> = {}): PaperOverview {
  const open = [openAfterTarget1(), waitingForPrice()];
  const now = PUBLISHED_AT + 30 * 60_000;
  return paperOverviewSchema.parse({
    serverNow: now,
    sessionDate: '2026-09-17',
    portfolio: { startingCapitalPaise: CAPITAL, createdAt: ist(SESSION, 8, 0) },
    settings: settings(),
    assignments,
    strategies: STRATEGY_CATALOGUE.map((s) => ({ ...s, rules: [...s.rules] })),
    session,
    phase: 'SESSION',
    feed: {
      name: 'Dhan',
      mode: 'LIVE',
      lastQuoteAt: now - 2_000,
      workerCycleAt: now - 1_000,
      workerDelayed: false,
    },
    balances: {
      cashPaise: 12_565_000,
      reservedPaise: 680_000,
      lockedPaise: 6_801_330,
      unrealisedPaise: 31_184,
      equityPaise: 20_077_514,
      exposurePaise: 6_801_330,
      peakEquityPaise: 20_077_514,
      drawdownPaise: 0,
      marksComplete: true,
    },
    today: {
      realisedPaise: 66_315 - 54_510,
      unrealisedPaise: 31_184,
      netPaise: 66_315 - 54_510 + 31_184,
      trades: 3,
      open: 2,
      decided: 5,
      rejected: 1,
    },
    openTrades: open,
    halts: [],
    simulation: { tier: 'Quote-based simulation', chargesVersion: 'nse-cash-2026-09-12-v1' },
    ...overrides,
  });
}

export function simulatedActivity(): PaperActivity {
  const winner = closedWinner();
  const accepted = 'Accepted; simulated entry at the next observed price.';
  const decision = (
    orderId: number,
    t: PaperOpenTrade,
    status: string,
    reasonCode: string | null,
    reasonText: string,
  ) => ({
    orderId,
    intentId: t.intentId,
    strategyId: t.strategyId,
    strategyVersionId: t.strategyVersionId,
    instrumentId: t.instrumentId,
    symbol: t.symbol,
    direction: t.direction,
    status,
    reasonCode,
    reasonText,
    requestedShares: reasonCode ? 0 : 23,
    decidedAt: PUBLISHED_AT + 500,
    signalAt: BUY_SIGNAL_AT,
    sizing: reasonCode
      ? null
      : {
          equityPaise: CAPITAL,
          availableCashPaise: CAPITAL,
          riskBudgetPaise: 200_000,
          perShareRiskPaise: 2_190,
          plannedEntryPaise: 295_640,
          caps: {
            byRisk: 91,
            byCash: 67,
            byPosition: 23,
            byStock: 23,
            bySector: 40,
            byPortfolio: 67,
          },
          bindingCap: 'byPosition',
          shares: 23,
          reservePaise: 6_827_255,
        },
    counts: { openPositions: 0, tradesToday: 0 },
    levels: t.levels,
  });
  const itc = waitingForPrice();
  const event = (
    positionId: number,
    symbol: string,
    sequence: number,
    kind: string,
    at: number,
    pricePaise: number | null,
    shares: number | null,
    explanation: string,
  ) => ({ positionId, symbol, sequence, kind, at, pricePaise, shares, explanation });
  return paperActivitySchema.parse({
    sessionDate: '2026-09-17',
    decisions: [
      decision(1, winner, 'FILLED', null, accepted),
      decision(2, stoppedOut(), 'FILLED', null, accepted),
      decision(3, openAfterTarget1(), 'FILLED', null, accepted),
      decision(4, itc, 'ACCEPTED', null, accepted),
      decision(
        5,
        { ...itc, symbol: 'INFY', intentId: 5 },
        'REJECTED',
        'MAX_POSITIONS',
        'Maximum open paper trades reached.',
      ),
    ],
    events: [
      event(
        1,
        'RELIANCE',
        1,
        'OPENED',
        PUBLISHED_AT + 1_000,
        295_710,
        23,
        'Simulated entry: 23 shares at the next observed price with slippage.',
      ),
      event(
        1,
        'RELIANCE',
        2,
        'TARGET1_PARTIAL',
        PUBLISHED_AT + 11_000,
        297_770,
        11,
        'Target 1 reached: 11 shares booked.',
      ),
      event(
        1,
        'RELIANCE',
        3,
        'STOP_UPDATED',
        PUBLISHED_AT + 11_000,
        295_710,
        null,
        'Target 1 reached; the stop moved to the entry level (breakeven).',
      ),
      event(
        1,
        'RELIANCE',
        4,
        'TARGET2',
        PUBLISHED_AT + 21_000,
        299_955,
        12,
        'Target 2 reached: remaining 12 shares booked.',
      ),
      event(
        2,
        'HDFCBANK',
        1,
        'OPENED',
        PUBLISHED_AT + 1_000,
        295_710,
        23,
        'Simulated entry: 23 shares at the next observed price with slippage.',
      ),
      event(
        2,
        'HDFCBANK',
        2,
        'STOP',
        PUBLISHED_AT + 12_000,
        293_340,
        23,
        'Stop level reached: 23 shares exited.',
      ),
    ],
    trades: [winner, stoppedOut(), openAfterTarget1(), itc],
  });
}

export function simulatedTradesPage(): PaperTradesPage {
  return paperTradesPageSchema.parse({
    trades: [closedWinner(), stoppedOut()],
    total: 2,
    page: 1,
    pageSize: 25,
  });
}

export function simulatedPerformance(): PaperPerformanceReport {
  const group = (name: string, n: number) => ({
    group: name,
    closedTrades: n,
    unresolvedTrades: 0,
    wins: Math.round(n * 0.6),
    losses: n - Math.round(n * 0.6),
    breakeven: 0,
    winRate: 0.6,
    winRateLow95: 0.3127,
    winRateHigh95: 0.8318,
    averageWinPaise: 66_315,
    averageLossPaise: -54_510,
    profitFactor: 1.82,
    expectancyPaise: 17_985,
    expectancyTimesRisked: 0.35,
    target1HitRate: 0.6,
    target2HitRate: 0.4,
    stopHitRate: 0.4,
    averageHoldingMs: 47 * 60_000,
    grossPaise: 250_000,
    chargesPaise: 32_000,
    netPaise: 179_850,
    sampleSize: n < 30 ? 'TOO_FEW' : n < 100 ? 'EARLY' : 'OK',
  });
  const dayMs = 86_400_000;
  const start = ist(SESSION, 15, 35) - 9 * dayMs;
  const equity = [0, 66, -54, 12, 80, 40, 95, 130, 110, 180];
  const daily = [0, 66, -120, 66, 68, -40, 55, 35, -20, 70];
  return paperPerformanceReportSchema.parse({
    range: '30d',
    from: '2026-08-19',
    portfolio: group('portfolio', 10),
    byStrategy: [group('orb-vc', 10)],
    byVersion: [group('orb-vc@1', 10)],
    byInstrument: [group('RELIANCE', 4), group('HDFCBANK', 3), group('TATASTEEL', 3)],
    byExitReason: [group('TARGET2', 4), group('STOP', 4), group('EOD_SQUARE_OFF', 2)],
    equityCurve: equity.map((e, i) => ({
      at: start + i * dayMs,
      equityPaise: CAPITAL + e * 1_000,
    })),
    dailyNet: daily.map((n, i) => ({
      tradingDate: `2026-09-${String(8 + i).padStart(2, '0')}`,
      netPaise: n * 1_000,
      trades: 1,
    })),
    maxDrawdown: { paise: 120_000, bps: 59.7 },
    startingCapitalPaise: CAPITAL,
  });
}
