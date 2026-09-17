import {
  evaluateOrb,
  initialRisk,
  markNet,
  orbRules,
  pendingIntradayProjection,
  realisedNet,
  stepProjection,
} from '@equitywise/core';
import {
  type IntradayEvidence,
  type IntradayProjection,
  type IntradaySignalDto,
  type IntradayToday,
  intradaySignalDtoSchema,
  intradayTodaySchema,
} from '@equitywise/shared';
import {
  BUY_SIGNAL_AT,
  buySession,
  ist,
  SESSION,
  SESSION_INPUT,
  sellSession,
} from '../../../../../packages/core/src/intraday/fixture';

/**
 * SIMULATED review data for Storybook and render tests, built by running the
 * real evaluator and lifecycle over the core fixtures. Never production output.
 */
const BOOK = { capitalPaise: 50_000_000, availablePaise: 50_000_000, riskBps: 100 };
function evidence(direction: 'BUY' | 'SELL'): IntradayEvidence {
  const d = evaluateOrb({
    bars: direction === 'BUY' ? buySession() : sellSession(),
    asOf: BUY_SIGNAL_AT + 2_000,
    tickSize: 5,
    alreadySignalled: false,
    session: SESSION_INPUT,
  });
  if (d.kind !== 'SIGNAL') throw new Error('fixture must signal');
  return d.evidence;
}
const obs = (at: number, price: number) => ({ at, receivedAt: at + 500, price, continuous: true });
export const PUBLISHED_AT = BUY_SIGNAL_AT + 2_000;

function dto(
  id: number,
  symbol: string,
  companyName: string,
  e: IntradayEvidence,
  projection: IntradayProjection,
  lastPrice: number | null,
): IntradaySignalDto {
  return intradaySignalDtoSchema.parse({
    dataOrigin: 'SIMULATED',
    id,
    instrumentId: id,
    symbol,
    companyName,
    strategyVersionId: 1,
    publishedAt: PUBLISHED_AT,
    evidence: e,
    projection,
    lastPrice,
    quoteAt: lastPrice === null ? null : ist(SESSION, 12, 41),
    realisedNetPaise: realisedNet(e, projection),
    markNetPaise: markNet(e, projection, lastPrice),
    initialRiskPaise: initialRisk(e, projection),
  });
}

export function simulatedSignals(): IntradaySignalDto[] {
  const buy = evidence('BUY');
  const sell = evidence('SELL');
  const filled = stepProjection(
    buy,
    pendingIntradayProjection(PUBLISHED_AT),
    obs(PUBLISHED_AT + 1_000, 295_650),
    BOOK,
  );
  const t1 = stepProjection(buy, filled, obs(ist(SESSION, 10, 35), 297_830), BOOK);
  const t2 = stepProjection(buy, t1, obs(ist(SESSION, 12, 40), 300_020), BOOK);
  const sellFilled = stepProjection(
    sell,
    pendingIntradayProjection(PUBLISHED_AT),
    obs(PUBLISHED_AT + 1_000, 293_000),
    BOOK,
  );
  const stopped = stepProjection(sell, sellFilled, obs(ist(SESSION, 10, 5), 295_200), BOOK);
  const slipped = stepProjection(
    buy,
    pendingIntradayProjection(PUBLISHED_AT),
    obs(PUBLISHED_AT + 1_000, 296_600),
    BOOK,
  );
  const notTaken = stepProjection(
    buy,
    pendingIntradayProjection(PUBLISHED_AT, 'DAILY_LIMIT'),
    obs(PUBLISHED_AT + 1_000, 295_650),
    null,
  );
  return [
    dto(1, 'RELIANCE', 'Reliance Industries', buy, t2, 300_155),
    dto(2, 'HDFCBANK', 'HDFC Bank', sell, stopped, 295_400),
    dto(3, 'TATASTEEL', 'Tata Steel', buy, t1, 298_100),
    dto(4, 'INFY', 'Infosys', buy, slipped, 296_900),
    dto(5, 'ITC', 'ITC', buy, notTaken, 296_000),
    dto(6, 'SBIN', 'State Bank of India', buy, pendingIntradayProjection(PUBLISHED_AT), null),
  ];
}

export function simulatedToday(overrides: Partial<IntradayToday> = {}): IntradayToday {
  const signals = simulatedSignals();
  return intradayTodaySchema.parse({
    serverNow: PUBLISHED_AT + 4 * 60_000,
    sessionDate: '2026-09-17',
    phase: 'SESSION',
    source: { name: 'Dhan', mode: 'LIVE', lastQuoteAt: PUBLISHED_AT + 4 * 60_000 - 3_000 },
    scanner: {
      checkedAt: PUBLISHED_AT,
      phase: 'open',
      requested: 50,
      evaluated: 50,
      published: 6,
      reasons: { NO_BREAKOUT: 40, VOLUME: 4 },
      message: 'Evaluated 50 of 50 stocks; 6 published.',
    },
    rules: orbRules(),
    signals,
    book: {
      capitalPaise: 50_000_000,
      riskBps: 100,
      tradesToday: 3,
      openTrades: 1,
      maxTradesPerDay: 5,
      maxOpenTrades: 3,
      realisedNetPaise: 506_531 - 380_000,
      markNetPaise: 506_531 - 380_000 + 120_000,
      lossHalted: false,
    },
    exclusions: [
      { symbol: 'ADANIENT', reason: 'GAP', detail: null },
      { symbol: 'WIPRO', reason: 'OR_RANGE', detail: '18.2 bps' },
    ],
    ...overrides,
  });
}
