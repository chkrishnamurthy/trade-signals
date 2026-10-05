import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeFiring, evaluateAlerts } from './evaluate-alerts.js';

const dbMock = vi.hoisted(() => ({
  getLatestIndicatorDate: vi.fn(),
  getLatestTwoSessions: vi.fn(),
  listEnabledAlertsForWorker: vi.fn(),
  markAlertEventEmailed: vi.fn(),
  markAlertsEvaluated: vi.fn(),
  recordAlertFiring: vi.fn(),
}));

vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  ...dbMock,
}));

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const context = { db: {} } as never;

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  ownerId: 7,
  ownerEmail: 'a@example.com',
  instrumentId: 10,
  symbol: 'RELIANCE',
  metric: 'close',
  comparator: 'crosses_above',
  threshold: 150000,
  oneShot: true,
  ...overrides,
});

const session = (tradingDate: string, closePaise: number, rsi14: number | null = null) => ({
  instrumentId: 10,
  tradingDate,
  closePaise,
  rsi14,
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getLatestIndicatorDate.mockResolvedValue('2026-10-05');
  dbMock.recordAlertFiring.mockResolvedValue(99);
});

describe('describeFiring', () => {
  it('states the condition without advising anything', () => {
    expect(describeFiring(rule(), 151240, '2026-10-05')).toBe(
      'RELIANCE: close crossed above ₹1,500.00 (closed at ₹1,512.40 on 2026-10-05)',
    );
    expect(describeFiring(rule({ metric: 'rsi14', threshold: 70 }), 71.234, '2026-10-05')).toBe(
      'RELIANCE: RSI(14) crossed above 70 (71.2 on 2026-10-05)',
    );
  });
});

describe('evaluateAlerts', () => {
  it('records a firing, emails it, and marks it emailed', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule()]);
    dbMock.getLatestTwoSessions.mockResolvedValue(
      new Map([[10, [session('2026-10-05', 151000), session('2026-10-03', 149000)]]]),
    );
    const mail = vi.fn().mockResolvedValue(true);

    const summary = await evaluateAlerts(context, log as never, mail);

    expect(summary).toEqual({ tradingDate: '2026-10-05', evaluated: 1, fired: 1, emailed: 1 });
    expect(dbMock.recordAlertFiring).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ alertId: 1, ownerId: 7, tradingDate: '2026-10-05', oneShot: true }),
    );
    expect(mail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', subject: 'EquityWise alert: RELIANCE' }),
    );
    expect(dbMock.markAlertEventEmailed).toHaveBeenCalledWith(context.db, 99);
  });

  it('does not email twice when the session already fired (a re-run)', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule()]);
    dbMock.getLatestTwoSessions.mockResolvedValue(
      new Map([[10, [session('2026-10-05', 151000), session('2026-10-03', 149000)]]]),
    );
    dbMock.recordAlertFiring.mockResolvedValue(null);
    const mail = vi.fn().mockResolvedValue(true);

    const summary = await evaluateAlerts(context, log as never, mail);

    expect(summary.fired).toBe(0);
    expect(mail).not.toHaveBeenCalled();
  });

  it('keeps the in-app event when email is not configured or fails', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule()]);
    dbMock.getLatestTwoSessions.mockResolvedValue(
      new Map([[10, [session('2026-10-05', 151000), session('2026-10-03', 149000)]]]),
    );

    const summary = await evaluateAlerts(context, log as never, vi.fn().mockResolvedValue(false));

    expect(summary).toMatchObject({ fired: 1, emailed: 0 });
    expect(dbMock.markAlertEventEmailed).not.toHaveBeenCalled();
  });

  it('does not fire while the close stays across the level', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule()]);
    dbMock.getLatestTwoSessions.mockResolvedValue(
      new Map([[10, [session('2026-10-05', 152000), session('2026-10-03', 151000)]]]),
    );

    const summary = await evaluateAlerts(context, log as never, vi.fn());

    expect(summary).toMatchObject({ evaluated: 1, fired: 0 });
    expect(dbMock.recordAlertFiring).not.toHaveBeenCalled();
  });

  it('skips an instrument with no row for the run date', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule()]);
    dbMock.getLatestTwoSessions.mockResolvedValue(
      new Map([[10, [session('2026-10-01', 151000), session('2026-09-30', 149000)]]]),
    );

    const summary = await evaluateAlerts(context, log as never, vi.fn());

    expect(summary.evaluated).toBe(0);
    expect(dbMock.markAlertsEvaluated).toHaveBeenCalledWith(context.db, [], '2026-10-05');
  });

  it('skips a rule whose stored condition is invalid instead of throwing', async () => {
    dbMock.listEnabledAlertsForWorker.mockResolvedValue([rule({ threshold: 1500.5 })]);
    dbMock.getLatestTwoSessions.mockResolvedValue(new Map());

    const summary = await evaluateAlerts(context, log as never, vi.fn());

    expect(summary).toMatchObject({ evaluated: 0, fired: 0 });
    expect(log.warn).toHaveBeenCalled();
  });

  it('does nothing before the first indicator run', async () => {
    dbMock.getLatestIndicatorDate.mockResolvedValue(null);
    expect(await evaluateAlerts(context, log as never, vi.fn())).toEqual({
      tradingDate: null,
      evaluated: 0,
      fired: 0,
      emailed: 0,
    });
  });
});
