import { emptyPortfolioState } from '@equitywise/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignments,
  CAPITAL,
  relianceIntent,
  session,
  settings,
} from '../../../../packages/core/src/paper/fixture.js';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createPaperJobs } from './paper.js';

const mock = vi.hoisted(() => ({
  active: vi.fn(async (): Promise<unknown[]> => []),
  undecided: vi.fn(async (): Promise<unknown[]> => []),
  record: vi.fn(async () => ({ orders: 0, positions: 0 })),
  state: vi.fn(),
  live: vi.fn(async () => new Map<number, number[]>()),
  observations: vi.fn(async (): Promise<unknown[]> => []),
  apply: vi.fn(async () => 0),
  checkpoint: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  setCheckpoint: vi.fn(async () => undefined),
  latestId: vi.fn(async () => 0),
  liveTrades: vi.fn(async (): Promise<unknown[]> => []),
  cancel: vi.fn(async () => true),
  exitPending: vi.fn(async () => undefined),
  resolve: vi.fn(async () => true),
  risk: vi.fn(async () => undefined),
  hasRisk: vi.fn(async () => false),
  resolveRisk: vi.fn(async () => undefined),
  session: vi.fn(),
}));
vi.mock('./calendar-refresh.js', async () => {
  const actual =
    await vi.importActual<typeof import('./calendar-refresh.js')>('./calendar-refresh.js');
  return { ...actual, sessionToday: mock.session };
});
vi.mock('node:fs/promises', () => ({
  readFile: async () =>
    'enabled: true\nuniverse: nifty50\nhistoryDays: 14\nhistoryConcurrency: 4\nstrategyRevision: 1',
}));
vi.mock('../universe.js', () => ({
  loadIndexConstituents: async () => [
    { symbol: 'RELIANCE', kind: 'equity', name: 'Reliance', sector: 'Energy' },
  ],
}));
vi.mock('@equitywise/db', () => ({
  listActivePaperPortfolios: mock.active,
  listUndecidedSignals: mock.undecided,
  recordPaperDecisions: mock.record,
  loadPaperState: mock.state,
  paperMarks: vi.fn(async () => new Map()),
  paperEquityContext: vi.fn(async () => ({
    peakEquityPaise: CAPITAL,
    startOfDayEquityPaise: CAPITAL,
  })),
  livePaperInstruments: mock.live,
  listPaperObservationsSince: mock.observations,
  applyPaperObservation: mock.apply,
  getWorkerCheckpoint: mock.checkpoint,
  setWorkerCheckpoint: mock.setCheckpoint,
  latestObservationId: mock.latestId,
  listLivePaperTrades: mock.liveTrades,
  cancelPendingPaperEntry: mock.cancel,
  markPaperExitPending: mock.exitPending,
  resolvePaperPositionUnavailable: mock.resolve,
  recordPaperRiskEvent: mock.risk,
  hasUnresolvedRiskEvent: mock.hasRisk,
  resolvePaperRiskEvents: mock.resolveRisk,
  listSnapshotPortfolios: vi.fn(async () => []),
  paperLedgerBalances: vi.fn(),
  openPaperPositionsMarked: vi.fn(),
  recordPaperSnapshot: vi.fn(),
  reconcilePaperLedger: vi.fn(),
  paperLockedByPositions: vi.fn(),
  paperReservedByPositions: vi.fn(),
}));

const context = { db: {} } as unknown as WorkerContext;
const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
const intent = relianceIntent();
const signal = {
  id: intent.id,
  instrumentId: intent.instrumentId,
  strategyVersionId: intent.strategyVersionId,
  symbol: intent.symbol,
  publishedAt: intent.signalAt + 2_000,
  evidence: intent.evidence,
};
const portfolio = (id: number, overrides = {}) => ({
  portfolio: { id, userId: id, startingCapitalPaise: CAPITAL, resetGeneration: 1, createdAt: 0 },
  settings: settings(overrides),
  assignments,
});
const asOf = intent.signalAt + 3_000;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; the defaults below reset the ones tests override.
  mock.session.mockResolvedValue(session);
  mock.state.mockResolvedValue(emptyPortfolioState(CAPITAL));
  mock.record.mockResolvedValue({ orders: 1, positions: 1 });
  mock.hasRisk.mockResolvedValue(false);
  mock.active.mockResolvedValue([]);
  mock.undecided.mockResolvedValue([]);
  mock.liveTrades.mockResolvedValue([]);
  mock.live.mockResolvedValue(new Map());
  mock.checkpoint.mockResolvedValue(null);
});

describe('paper-entries', () => {
  it('decides every undecided intent for every active portfolio, activation cutoff included', async () => {
    mock.active.mockResolvedValue([
      portfolio(1),
      portfolio(2, { enabledAt: intent.signalAt + 1 }), // switched on after the candle closed
    ]);
    mock.undecided.mockResolvedValue([signal]);
    const jobs = createPaperJobs(context, log);
    const result = await jobs.entries(asOf);
    expect(result.portfolios).toBe(2);
    expect(mock.record).toHaveBeenCalledTimes(2);
    const first = mock.record.mock.calls[0]?.[2] as {
      decisions: { accepted: boolean; reasonCode: string | null }[];
      intents: { sector: string | null }[];
    };
    const second = mock.record.mock.calls[1]?.[2] as {
      decisions: { accepted: boolean; reasonCode: string | null }[];
    };
    expect(first.decisions[0]?.accepted).toBe(true);
    expect(first.intents[0]?.sector).toBe('Energy');
    expect(second.decisions[0]).toMatchObject({
      accepted: false,
      reasonCode: 'SIGNAL_BEFORE_ACTIVATION',
    });
    expect(mock.setCheckpoint).toHaveBeenCalledWith(
      {},
      'paper-entries',
      expect.objectContaining({ tradingDate: '2026-09-17' }),
      asOf,
    );
  });
  it('does nothing on a closed day but still sweeps unfilled entries', async () => {
    mock.session.mockResolvedValue({ ...session, kind: 'HOLIDAY' });
    mock.active.mockResolvedValue([portfolio(1, { entriesPaused: true })]);
    mock.liveTrades.mockResolvedValue([
      { positionId: 5, portfolioId: 1, filled: false, validUntil: asOf + 60_000 },
    ]);
    const jobs = createPaperJobs(context, log);
    await jobs.entries(asOf);
    expect(mock.undecided).not.toHaveBeenCalled();
    expect(mock.cancel).toHaveBeenCalledWith({}, 1, 5, 'ENTRIES_PAUSED', expect.any(String), asOf);
  });
  it('cancels entries of portfolios that switched off, and expired ones', async () => {
    mock.active.mockResolvedValue([portfolio(1)]);
    mock.liveTrades.mockResolvedValue([
      { positionId: 7, portfolioId: 9, filled: false, validUntil: asOf + 60_000 }, // portfolio 9 is off
      { positionId: 8, portfolioId: 1, filled: false, validUntil: asOf - 20_000 }, // window passed
      { positionId: 9, portfolioId: 1, filled: true, validUntil: asOf - 20_000 }, // filled: untouched
    ]);
    const jobs = createPaperJobs(context, log);
    await jobs.entries(asOf);
    expect(mock.cancel).toHaveBeenCalledTimes(2);
    expect(mock.cancel).toHaveBeenCalledWith(
      {},
      9,
      7,
      'PAPER_TRADING_DISABLED',
      expect.any(String),
      asOf,
    );
    expect(mock.cancel).toHaveBeenCalledWith({}, 1, 8, 'SIGNAL_EXPIRED', expect.any(String), asOf);
  });
  it('raises one risk event per halt', async () => {
    mock.active.mockResolvedValue([portfolio(1)]);
    mock.undecided.mockResolvedValue([signal]);
    mock.state.mockResolvedValue({ ...emptyPortfolioState(CAPITAL), dayNetPaise: -500_000 });
    const jobs = createPaperJobs(context, log);
    await jobs.entries(asOf);
    expect(mock.risk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ kind: 'DAILY_LOSS_HALT', portfolioId: 1 }),
    );
    mock.hasRisk.mockResolvedValue(true);
    await jobs.entries(asOf + 1);
    expect(mock.risk).toHaveBeenCalledTimes(1);
  });
});

describe('paper-monitor', () => {
  it('replays observations after the checkpoint to the portfolios holding the instrument', async () => {
    mock.checkpoint.mockResolvedValue({ lastObservationId: 10 });
    mock.live.mockResolvedValue(new Map([[101, [1, 2]]]));
    mock.observations.mockResolvedValue([
      { id: 11, instrumentId: 101, at: asOf, receivedAt: asOf, price: 295_000, continuous: true },
      { id: 12, instrumentId: 555, at: asOf, receivedAt: asOf, price: 1, continuous: true },
    ]);
    mock.apply.mockResolvedValue(1);
    const jobs = createPaperJobs(context, log);
    const result = await jobs.monitor(asOf);
    expect(mock.observations).toHaveBeenCalledWith({}, 10);
    expect(mock.apply).toHaveBeenCalledTimes(2); // instrument 101 × portfolios 1 and 2; 555 has no holder
    expect(mock.apply).toHaveBeenCalledWith(
      {},
      1,
      101,
      expect.objectContaining({ price: 295_000 }),
      { observationId: 11 },
    );
    expect(result).toEqual({ observations: 2, moved: 2 });
    expect(mock.setCheckpoint).toHaveBeenCalledWith(
      {},
      'paper-monitor',
      { lastObservationId: 12, lastRunAt: asOf },
      asOf,
    );
  });
  it('starts from the newest observation on the very first run and skips ahead when nothing is live', async () => {
    mock.checkpoint.mockResolvedValue(null);
    mock.latestId.mockResolvedValue(900);
    const jobs = createPaperJobs(context, log);
    await jobs.monitor(asOf);
    expect(mock.observations).not.toHaveBeenCalled();
    expect(mock.setCheckpoint).toHaveBeenCalledWith(
      {},
      'paper-monitor',
      { lastObservationId: 900, lastRunAt: asOf },
      asOf,
    );
  });
});

describe('paper-squareoff', () => {
  const squareOffAt = session.squareOffAt ?? 0;
  const closeAt = session.closeAt ?? 0;
  it('cancels unfilled entries and flags filled ones as exit-pending from 15:15', async () => {
    mock.liveTrades.mockResolvedValue([
      { positionId: 1, portfolioId: 1, filled: false, tradingDate: '2026-09-17', squareOffAt },
      { positionId: 2, portfolioId: 1, filled: true, tradingDate: '2026-09-17', squareOffAt },
    ]);
    const jobs = createPaperJobs(context, log);
    expect(await jobs.squareOff(squareOffAt - 1)).toEqual({
      cancelled: 0,
      pending: 0,
      unresolved: 0,
    });
    expect(await jobs.squareOff(squareOffAt)).toEqual({ cancelled: 1, pending: 1, unresolved: 0 });
    expect(mock.cancel).toHaveBeenCalledWith(
      {},
      1,
      1,
      'EOD_SQUARE_OFF',
      expect.any(String),
      squareOffAt,
    );
    expect(mock.exitPending).toHaveBeenCalledWith({}, 2);
    expect(mock.resolve).not.toHaveBeenCalled();
  });
  it('after 15:30:15 alerts once and resolves the trade as unavailable', async () => {
    mock.liveTrades.mockResolvedValue([
      { positionId: 2, portfolioId: 1, filled: true, tradingDate: '2026-09-17', squareOffAt },
    ]);
    const jobs = createPaperJobs(context, log);
    const at = closeAt + 16_000;
    expect(await jobs.squareOff(at)).toEqual({ cancelled: 0, pending: 0, unresolved: 1 });
    expect(mock.risk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ kind: 'OPEN_AFTER_CUTOFF', portfolioId: 1 }),
    );
    expect(mock.resolve).toHaveBeenCalledWith({}, 1, 2, at);
    expect(mock.resolveRisk).toHaveBeenCalledWith({}, 1, 'OPEN_AFTER_CUTOFF', at);
  });
});
