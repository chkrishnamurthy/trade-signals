import { fromIstParts } from '@equitywise/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { calendarRefresh, checkUnscheduledClosure, sessionToday } from './calendar-refresh.js';

const mock = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<unknown> => null),
  upsert: vi.fn(async () => undefined),
  risk: vi.fn(async () => undefined),
  latestQuote: vi.fn(async (): Promise<number | null> => null),
  calendar: `exchange: NSE
verifiedThrough: 2026-09-30
timings: { open: "09:15", close: "15:30", entryCutoff: "14:30", squareOff: "15:15" }
holidays:
  - { date: 2026-10-02, name: Mahatma Gandhi Jayanti }
specialSessions:
  - { date: 2026-11-08, kind: MUHURAT, name: Muhurat, open: "18:15", close: "19:15", entryCutoff: "18:45", squareOff: "19:05" }
`,
}));
vi.mock('node:fs/promises', () => ({ readFile: async () => mock.calendar }));
vi.mock('@equitywise/db', () => ({
  getExchangeSession: mock.get,
  upsertExchangeSession: mock.upsert,
  recordPaperRiskEvent: mock.risk,
  latestSignalQuoteAt: mock.latestQuote,
}));

const ist = (day: number, month: number, hour: number, minute = 0) =>
  fromIstParts({ year: 2026, month, day, hour, minute }).getTime();
const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
const status = vi.fn(async () => ({ isOpen: true, phase: 'open', checkedAt: new Date() }));
const context = { db: {}, provider: { fetchMarketStatus: status } } as unknown as WorkerContext;

beforeEach(() => {
  vi.clearAllMocks();
  mock.get.mockResolvedValue(null);
});

describe('calendar-refresh', () => {
  it('writes a NORMAL session with the configured timings', async () => {
    const session = await calendarRefresh(context, log, ist(21, 9, 6, 30));
    expect(session.kind).toBe('NORMAL');
    expect(session.openAt).toBe(ist(21, 9, 9, 15));
    expect(session.entryCutoffAt).toBe(ist(21, 9, 14, 30));
    expect(session.squareOffAt).toBe(ist(21, 9, 15, 15));
    expect(mock.upsert).toHaveBeenCalledWith({}, session, 'config', ist(21, 9, 6, 30));
  });
  it('marks holidays, weekends and special sessions', async () => {
    expect((await calendarRefresh(context, log, ist(2, 10, 6, 30))).kind).toBe('HOLIDAY');
    expect((await calendarRefresh(context, log, ist(19, 9, 6, 30))).kind).toBe('WEEKEND');
    const muhurat = await calendarRefresh(context, log, ist(8, 11, 6, 30));
    expect(muhurat.kind).toBe('MUHURAT');
    expect(muhurat.squareOffAt).toBe(ist(8, 11, 19, 5));
  });
  it('warns and records a risk event when the verified range is nearly exhausted', async () => {
    await calendarRefresh(context, log, ist(21, 9, 6, 30)); // 9 days before verifiedThrough
    expect(log.warn).toHaveBeenCalled();
    expect(mock.risk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ kind: 'CALENDAR_EXPIRING' }),
    );
  });
  it('never overwrites a detected unscheduled closure', async () => {
    const closed = { tradingDate: '2026-09-21', kind: 'CLOSED_UNSCHEDULED', openAt: null };
    mock.get.mockResolvedValue(closed);
    expect((await calendarRefresh(context, log, ist(21, 9, 6, 30))).kind).toBe(
      'CLOSED_UNSCHEDULED',
    );
    expect(mock.upsert).not.toHaveBeenCalled();
    expect((await sessionToday(context, ist(21, 9, 10))).kind).toBe('CLOSED_UNSCHEDULED');
  });
});

describe('unscheduled closure check', () => {
  it('needs all three signs: calendar open, provider closed, no price since the open', async () => {
    const at = ist(21, 9, 9, 20);
    // Provider open → no closure.
    expect(await checkUnscheduledClosure(context, log, at)).toBe(false);
    // Provider closed but prices flowing → no closure.
    status.mockResolvedValueOnce({ isOpen: false, phase: 'closed', checkedAt: new Date() });
    mock.latestQuote.mockResolvedValueOnce(ist(21, 9, 9, 16));
    expect(await checkUnscheduledClosure(context, log, at)).toBe(false);
    // Provider closed and silence → closure, risk event, session row rewritten.
    status.mockResolvedValueOnce({ isOpen: false, phase: 'closed', checkedAt: new Date() });
    mock.latestQuote.mockResolvedValueOnce(null);
    expect(await checkUnscheduledClosure(context, log, at)).toBe(true);
    expect(mock.upsert).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({ kind: 'CLOSED_UNSCHEDULED' }),
      'provider',
      at,
    );
    expect(mock.risk).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ kind: 'CLOSED_UNSCHEDULED' }),
    );
  });
  it('is a no-op before 09:20 and on closed days', async () => {
    expect(await checkUnscheduledClosure(context, log, ist(21, 9, 9, 17))).toBe(false);
    expect(await checkUnscheduledClosure(context, log, ist(2, 10, 9, 30))).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });
});
