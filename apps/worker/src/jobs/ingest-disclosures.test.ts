import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announcementWindowStart,
  businessHoursInWindow,
  ingestAnnouncements,
  relinkAnnouncementSymbols,
} from './ingest-disclosures.js';

const dbMock = vi.hoisted(() => ({
  announcementIngestionHealth: vi.fn(),
  recordAnnouncementIngestion: vi.fn(),
  resolveInstrumentIds: vi.fn(),
  upsertAnnouncements: vi.fn(),
  listAnnouncementsWithScripCodeSymbols: vi.fn(),
}));
vi.mock('@equitywise/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@equitywise/db')>()),
  ...dbMock,
}));
vi.mock('./interpret-announcements.js', () => ({
  interpretPendingAnnouncements: vi.fn(async () => undefined),
  withAnnouncementInterpretation: (row: unknown) => row,
}));

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
const context = { db: {} } as never;

describe('announcementWindowStart', () => {
  const now = new Date('2026-10-01T13:50:00Z');

  it('reaches back three days on the first run', () => {
    expect(announcementWindowStart(now, null).toISOString()).toBe('2026-09-28T13:50:00.000Z');
  });

  it('re-reads two hours before the last successful run', () => {
    const lastSuccess = new Date('2026-10-01T10:50:00Z');
    expect(announcementWindowStart(now, lastSuccess).toISOString()).toBe(
      '2026-10-01T08:50:00.000Z',
    );
  });

  it('never reaches back further than three days, however long the outage', () => {
    const lastSuccess = new Date('2026-09-20T10:50:00Z');
    expect(announcementWindowStart(now, lastSuccess).toISOString()).toBe(
      '2026-09-28T13:50:00.000Z',
    );
  });
});

describe('businessHoursInWindow', () => {
  it('counts weekday hours between 09:00 and 20:00 IST', () => {
    // Mon 5 Oct 10:00 -> 17:30 IST
    expect(
      businessHoursInWindow(new Date('2026-10-05T04:30:00Z'), new Date('2026-10-05T12:00:00Z')),
    ).toBe(8);
  });

  it('counts nothing across a weekend', () => {
    // Sat 3 Oct 10:00 -> Sun 4 Oct 18:00 IST
    expect(
      businessHoursInWindow(new Date('2026-10-03T04:30:00Z'), new Date('2026-10-04T12:30:00Z')),
    ).toBe(0);
  });

  it('is below the alarm threshold for the usual Saturday and Monday sweeps', () => {
    // Fri 19:30 IST -> Mon 10:20 IST: only Friday's last hour and Monday's first.
    expect(
      businessHoursInWindow(new Date('2026-10-02T14:00:00Z'), new Date('2026-10-05T04:50:00Z')),
    ).toBeLessThan(3);
  });
});

describe('ingestAnnouncements', () => {
  // Mon 5 Oct 2026, 15:50 IST. The last success was at 10:50 IST, so the window holds 7 business hours.
  const now = new Date('2026-10-05T10:20:00Z');
  const filing = (id: string, symbol = 'RELIANCE') => ({
    source: 'bse',
    externalId: id,
    symbol,
    companyName: 'Co',
    category: null,
    headline: `Filing ${id}`,
    detail: null,
    attachmentUrl: null,
    announcedAt: new Date('2026-10-05T09:00:00Z'),
  });
  const sourceOf = (
    fetchAnnouncements: (args: {
      since: Date;
      now?: Date;
      onBatch?: (rows: unknown[]) => Promise<void>;
    }) => Promise<unknown[]>,
  ) => ({ id: 'india-exchanges', fetchAnnouncements }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BSE_ANNOUNCEMENTS_ENABLED;
    dbMock.announcementIngestionHealth.mockResolvedValue({
      successful: { startedAt: new Date('2026-10-05T05:20:00Z') },
    });
    dbMock.resolveInstrumentIds.mockResolvedValue(new Map([['RELIANCE', 7]]));
    dbMock.upsertAnnouncements.mockImplementation(async (_db, rows: unknown[]) => rows.length);
    dbMock.listAnnouncementsWithScripCodeSymbols.mockResolvedValue([]);
  });

  it('stores each batch as it arrives and records one success with the totals', async () => {
    const source = sourceOf(async ({ onBatch }) => {
      await onBatch?.([filing('A'), filing('B')]);
      await onBatch?.([filing('C')]);
      return [];
    });

    const result = await ingestAnnouncements(context, log as never, { source, now });

    expect(result).toEqual({ fetched: 3, written: 3 });
    expect(dbMock.upsertAnnouncements).toHaveBeenCalledTimes(2);
    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledTimes(1);
    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ succeeded: true, fetched: 3, written: 3, startedAt: now }),
    );
  });

  it('also stores what a source returns instead of batching', async () => {
    const source = sourceOf(async () => [filing('A')]);
    const result = await ingestAnnouncements(context, log as never, { source, now });
    expect(result).toEqual({ fetched: 1, written: 1 });
  });

  it('passes the run’s clock to the source', async () => {
    const seen: { since?: Date; now?: Date } = {};
    const source = sourceOf(async (args) => {
      seen.since = args.since;
      seen.now = args.now;
      return [filing('A')];
    });
    await ingestAnnouncements(context, log as never, { source, now });
    expect(seen.now).toBe(now);
    expect(seen.since?.toISOString()).toBe('2026-10-05T03:20:00.000Z'); // two hours before the last success
  });

  it('records a failure, and does not move the window, when seven business hours return nothing', async () => {
    const source = sourceOf(async () => []);

    await expect(ingestAnnouncements(context, log as never, { source, now })).rejects.toThrow(
      /no filings across \d+ weekday business hours/,
    );

    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledTimes(1);
    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        succeeded: false,
        error: expect.stringMatching(/endpoint may have changed/),
      }),
    );
  });

  it('accepts an empty result over a weekend window', async () => {
    dbMock.announcementIngestionHealth.mockResolvedValue({
      successful: { startedAt: new Date('2026-10-03T05:20:00Z') }, // Saturday
    });
    const sunday = new Date('2026-10-04T10:20:00Z');
    const result = await ingestAnnouncements(context, log as never, {
      source: sourceOf(async () => []),
      now: sunday,
    });
    expect(result).toEqual({ fetched: 0, written: 0 });
    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ succeeded: true }),
    );
  });

  it('keeps the days already stored when a later day fails, and says how many', async () => {
    const source = sourceOf(async ({ onBatch }) => {
      await onBatch?.([filing('A'), filing('B')]);
      throw new Error('BSE announcements 20261004 page 3 responded 503');
    });

    await expect(ingestAnnouncements(context, log as never, { source, now })).rejects.toThrow(
      '503',
    );

    expect(dbMock.upsertAnnouncements).toHaveBeenCalledTimes(1);
    expect(dbMock.recordAnnouncementIngestion).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ succeeded: false, fetched: 2, written: 2 }),
    );
  });

  it('does nothing, and records nothing, when BSE_ANNOUNCEMENTS_ENABLED=false', async () => {
    process.env.BSE_ANNOUNCEMENTS_ENABLED = 'false';
    const fetchAnnouncements = vi.fn();
    const result = await ingestAnnouncements(context, log as never, {
      source: sourceOf(fetchAnnouncements),
      now,
    });
    expect(result).toEqual({ fetched: 0, written: 0 });
    expect(fetchAnnouncements).not.toHaveBeenCalled();
    expect(dbMock.recordAnnouncementIngestion).not.toHaveBeenCalled();
  });

  it('does not fail a stored run because the relink pass failed', async () => {
    dbMock.listAnnouncementsWithScripCodeSymbols.mockRejectedValue(new Error('db hiccup'));
    const result = await ingestAnnouncements(context, log as never, {
      source: sourceOf(async () => [filing('A')]),
      now,
    });
    expect(result.fetched).toBe(1);
    expect(log.warn).toHaveBeenCalledWith(
      'could not relink announcement symbols',
      expect.anything(),
    );
  });
});

describe('relinkAnnouncementSymbols', () => {
  const stored = (symbol: string, externalId: string) => ({
    instrumentId: null,
    symbol,
    companyName: 'Co',
    source: 'bse',
    externalId,
    category: 'Result',
    headline: `Filing ${externalId}`,
    detail: null,
    attachmentUrl: null,
    announcedAt: new Date('2026-09-01T09:00:00Z'),
    interpretation: { kind: 'kept' },
    interpretationChecksum: 'abc123',
  });
  const directory = (complete: boolean) => ({
    scrips: new Map([
      ['500325', { isin: 'INE002A01018', ticker: 'RELIANCE' }],
      ['511563', { isin: 'INE654D01010', ticker: 'SANCF' }],
    ]),
    nseByIsin: new Map([['INE002A01018', 'RELIANCE']]),
    complete,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.resolveInstrumentIds.mockResolvedValue(new Map([['RELIANCE', 7]]));
    dbMock.upsertAnnouncements.mockImplementation(async (_db, rows: unknown[]) => rows.length);
  });

  it('does nothing, and reads no listings, when no filing is keyed by a scrip code', async () => {
    dbMock.listAnnouncementsWithScripCodeSymbols.mockResolvedValue([]);
    const loadDirectory = vi.fn();
    expect(await relinkAnnouncementSymbols(context, log as never, { loadDirectory })).toBe(0);
    expect(loadDirectory).not.toHaveBeenCalled();
  });

  it('waits while the listings are incomplete', async () => {
    dbMock.listAnnouncementsWithScripCodeSymbols.mockResolvedValue([stored('500325', 'A')]);
    const count = await relinkAnnouncementSymbols(context, log as never, {
      loadDirectory: async () => directory(false),
    });
    expect(count).toBe(0);
    expect(dbMock.upsertAnnouncements).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('maps codes to NSE symbols or BSE:<ticker>, links instruments, and keeps the interpretation', async () => {
    dbMock.listAnnouncementsWithScripCodeSymbols.mockResolvedValue([
      stored('500325', 'A'),
      stored('511563', 'B'),
      stored('999999', 'C'),
    ]);

    const count = await relinkAnnouncementSymbols(context, log as never, {
      loadDirectory: async () => directory(true),
    });

    expect(count).toBe(3);
    const rows = dbMock.upsertAnnouncements.mock.calls[0]?.[1] as {
      symbol: string;
      instrumentId: number | null;
      interpretation: unknown;
      interpretationChecksum: string;
    }[];
    expect(rows.map((r) => [r.symbol, r.instrumentId])).toEqual([
      ['RELIANCE', 7],
      ['BSE:SANCF', null],
      ['BSE:999999', null],
    ]);
    // Only the symbol changes, so the stored reading of each filing is untouched.
    for (const row of rows) {
      expect(row.interpretation).toEqual({ kind: 'kept' });
      expect(row.interpretationChecksum).toBe('abc123');
    }
  });

  it('leaves no row with an all-digit symbol, so the pass finishes', async () => {
    dbMock.listAnnouncementsWithScripCodeSymbols.mockResolvedValue([stored('888888', 'D')]);
    await relinkAnnouncementSymbols(context, log as never, {
      loadDirectory: async () => directory(true),
    });
    const rows = dbMock.upsertAnnouncements.mock.calls[0]?.[1] as { symbol: string }[];
    expect(rows.every((r) => !/^[0-9]+$/.test(r.symbol))).toBe(true);
  });
});
