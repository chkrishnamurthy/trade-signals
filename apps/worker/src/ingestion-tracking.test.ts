import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkSessionIngested,
  decideIndicatorGate,
  statusFor,
  withIngestionRun,
} from './ingestion-tracking.js';

const dbMock = vi.hoisted(() => ({
  startIngestionRun: vi.fn(),
  finishIngestionRun: vi.fn(),
  hasAnyIngestionRun: vi.fn(),
  hasSuccessfulIngestionRun: vi.fn(),
}));
vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  ...dbMock,
}));

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const db = {} as never;
const outcome = (
  over: Partial<{
    requested: number;
    succeeded: number;
    rowsWritten: number;
    failed: string[];
  }> = {},
) => ({
  requested: 10,
  succeeded: 10,
  rowsWritten: 100,
  failed: [] as string[],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.startIngestionRun.mockResolvedValue(7);
});

describe('statusFor', () => {
  it('maps outcomes to run statuses', () => {
    expect(statusFor(outcome())).toBe('ok');
    expect(statusFor(outcome({ succeeded: 8, failed: ['A', 'B'] }))).toBe('partial');
    expect(statusFor(outcome({ succeeded: 0, failed: ['A'] }))).toBe('failed');
  });
});

describe('withIngestionRun', () => {
  it('opens a run, closes it with the job’s own numbers, and returns the result unchanged', async () => {
    const result = outcome({ succeeded: 9, failed: ['X'], rowsWritten: 90 });
    const returned = await withIngestionRun(
      db,
      log as never,
      { job: 'daily_candles', tradingDate: '2026-10-05' },
      async () => result,
    );

    expect(returned).toBe(result);
    expect(dbMock.startIngestionRun).toHaveBeenCalledWith(db, {
      job: 'daily_candles',
      tradingDate: '2026-10-05',
    });
    expect(dbMock.finishIngestionRun).toHaveBeenCalledWith(
      db,
      7,
      expect.objectContaining({
        status: 'partial',
        instrumentsSucceeded: 9,
        rowsWritten: 90,
        failedSymbols: ['X'],
      }),
    );
  });

  it('records a failed run and rethrows when the job throws', async () => {
    await expect(
      withIngestionRun(
        db,
        log as never,
        { job: 'daily_candles', tradingDate: '2026-10-05' },
        async () => {
          throw new Error('provider down');
        },
      ),
    ).rejects.toThrow('provider down');
    expect(dbMock.finishIngestionRun).toHaveBeenCalledWith(
      db,
      7,
      expect.objectContaining({ status: 'failed', error: 'provider down' }),
    );
  });

  it('still runs the job when the bookkeeping itself is down', async () => {
    dbMock.startIngestionRun.mockRejectedValue(new Error('db down'));
    const job = vi.fn().mockResolvedValue(outcome());

    await expect(
      withIngestionRun(db, log as never, { job: 'daily_candles', tradingDate: '2026-10-05' }, job),
    ).resolves.toBeDefined();

    expect(job).toHaveBeenCalledOnce();
    expect(dbMock.finishIngestionRun).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('does not let a failure to close a run fail the job', async () => {
    dbMock.finishIngestionRun.mockRejectedValue(new Error('db down'));
    await expect(
      withIngestionRun(
        db,
        log as never,
        { job: 'daily_candles', tradingDate: '2026-10-05' },
        async () => outcome(),
      ),
    ).resolves.toBeDefined();
  });
});

describe('decideIndicatorGate', () => {
  it('proceeds when a run covers the date', () => {
    expect(decideIndicatorGate({ armed: true, hasRunForDate: true, enforce: true })).toBe(
      'proceed',
    );
  });
  it('proceeds on a fresh install that has never recorded a run', () => {
    expect(decideIndicatorGate({ armed: false, hasRunForDate: false, enforce: true })).toBe(
      'proceed',
    );
  });
  it('warns by default and refuses only when enforcement is on', () => {
    expect(decideIndicatorGate({ armed: true, hasRunForDate: false, enforce: false })).toBe('warn');
    expect(decideIndicatorGate({ armed: true, hasRunForDate: false, enforce: true })).toBe(
      'refuse',
    );
  });
});

describe('checkSessionIngested', () => {
  it('throws when enforcement is on and the newest session has no run', async () => {
    dbMock.hasAnyIngestionRun.mockResolvedValue(true);
    dbMock.hasSuccessfulIngestionRun.mockResolvedValue(false);
    await expect(
      checkSessionIngested(db, log as never, '2026-10-05', {
        INDICATORS_REQUIRE_INGEST_RUN: 'true',
      }),
    ).rejects.toThrow(/Refusing to compute indicators/);
  });

  it('only warns without the switch', async () => {
    dbMock.hasAnyIngestionRun.mockResolvedValue(true);
    dbMock.hasSuccessfulIngestionRun.mockResolvedValue(false);
    await expect(checkSessionIngested(db, log as never, '2026-10-05', {})).resolves.toBe('warn');
    expect(log.warn).toHaveBeenCalled();
  });

  it('proceeds when the bookkeeping cannot be read', async () => {
    dbMock.hasAnyIngestionRun.mockRejectedValue(new Error('db down'));
    dbMock.hasSuccessfulIngestionRun.mockResolvedValue(false);
    await expect(
      checkSessionIngested(db, log as never, '2026-10-05', {
        INDICATORS_REQUIRE_INGEST_RUN: 'true',
      }),
    ).resolves.toBe('proceed');
  });
});
