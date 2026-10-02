import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import { createDatabase, type DatabaseHandle } from '../client.js';
import {
  countIposByStatus,
  createIpoIssue,
  gmpTrackRows,
  insertGmpSnapshots,
  insertSubscriptionSnapshot,
  latestObservationsForIssue,
  listIpos,
  listRhpDocumentsToExtract,
  recordListingDay,
  recordSourceObservation,
  updateIpoIssue,
  updateLatestClose,
  upsertIpoDocuments,
} from '../repositories/ipos.js';

/**
 * The invariants the IPO tables enforce in the DATABASE (plan §6): append-only
 * history, frozen listing-day prices, immutable observations, sane bands, and
 * the status filter matching core's `ipoStatus`. Skipped without a local
 * TEST_DATABASE_URL (see test/db.ts).
 */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

// drizzle wraps the driver error ("Failed query: …"); the trigger's message is the cause.
const rejectsWith = async (query: Promise<unknown>, pattern: RegExp) => {
  const error = await query.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  const cause = (error as Error & { cause?: unknown }).cause;
  const text = `${(error as Error).message} ${cause instanceof Error ? cause.message : ''}`;
  expect(text).toMatch(pattern);
};

suite('IPO persistence on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  const tag = randomUUID().slice(0, 8);
  const name = (n: string) => `${n} ${tag} Limited`;
  const ids: number[] = [];

  const issue = async (
    n: string,
    dates: { open: string | null; close: string | null; listing?: string },
  ) => {
    const id = await createIpoIssue(handle.db, {
      companyName: name(n),
      board: 'mainboard',
      openDate: dates.open,
      nseSymbol: null,
      nseSeries: null,
      bseScripCode: null,
      isin: null,
      slugYear: 2026,
    });
    await updateIpoIssue(handle.db, id, {
      openDate: dates.open,
      closeDate: dates.close,
      listingDate: dates.listing ?? null,
      priceBandLowPaise: 20_800,
      priceBandHighPaise: 22_000,
      fieldSources: {},
    });
    ids.push(id);
    return id;
  };

  beforeAll(() => {
    handle = createDatabase({ connectionString: url, max: 4 });
  });

  afterAll(async () => {
    if (ids.length > 0)
      await handle.db.execute(
        sql`delete from ipo_issues where id in (${sql.join(
          ids.map((i) => sql`${i}`),
          sql`, `,
        )})`,
      );
    await handle.close();
  });

  it('gives a second issue with the same name a distinct slug', async () => {
    const a = await issue('Slug Twin', { open: '2026-09-30', close: '2026-10-05' });
    const b = await issue('Slug Twin', { open: '2026-11-02', close: '2026-11-04' });
    const rows = await handle.db.execute<{ id: number; slug: string }>(
      sql`select id, slug from ipo_issues where id in (${a}, ${b}) order by id`,
    );
    expect(rows.rows[0]?.slug).toBe(`slug-twin-${tag}-ipo-2026`);
    expect(rows.rows[1]?.slug).toBe(`slug-twin-${tag}-ipo-2026-2`);
  });

  it('rejects an inverted price band and an unknown board', async () => {
    const id = await issue('Band', { open: null, close: null });
    await expect(
      handle.db.execute(sql`update ipo_issues set price_band_low_paise = 30000 where id = ${id}`),
    ).rejects.toThrow();
    await expect(
      handle.db.execute(sql`update ipo_issues set board = 'otc' where id = ${id}`),
    ).rejects.toThrow();
  });

  it('versions source records by payload and freezes each observation', async () => {
    const id = await issue('Observed', { open: '2026-09-30', close: '2026-10-05' });
    const base = {
      ipoId: id,
      source: 'nse',
      feed: 'detail',
      externalKey: `nse:OBS${tag}:EQ:2026-09-30`,
      sourceUrl: 'https://www.nseindia.com/api/ipo-detail?symbol=OBS',
    };
    const first = await recordSourceObservation(handle.db, {
      ...base,
      payload: { lotSize: 68, band: { lowPaise: 1, highPaise: 2 } },
      seenAt: new Date('2026-10-01T05:00:00Z'),
    });
    const repeat = await recordSourceObservation(handle.db, {
      ...base,
      // Same content, keys in a different order: the canonical hash matches.
      payload: { band: { highPaise: 2, lowPaise: 1 }, lotSize: 68 },
      seenAt: new Date('2026-10-01T09:00:00Z'),
    });
    const revised = await recordSourceObservation(handle.db, {
      ...base,
      payload: { lotSize: 70, band: { lowPaise: 1, highPaise: 2 } },
      seenAt: new Date('2026-10-02T05:00:00Z'),
    });
    expect(first.changed).toBe(true);
    expect(repeat).toEqual({ id: first.id, changed: false });
    expect(revised.changed).toBe(true);

    const latest = await latestObservationsForIssue(handle.db, id);
    expect(latest).toHaveLength(1);
    expect(latest[0]?.payload).toEqual({ band: { highPaise: 2, lowPaise: 1 }, lotSize: 70 });

    await rejectsWith(
      handle.db.execute(
        sql`update ipo_source_records set payload = '{}'::jsonb where id = ${first.id}`,
      ),
      /immutable/,
    );
  });

  it('appends subscription snapshots and refuses to rewrite one', async () => {
    const id = await issue('Subscribed', { open: '2026-09-30', close: '2026-10-05' });
    const snapshot = {
      ipoId: id,
      source: 'nse',
      scope: 'consolidated' as const,
      asOf: new Date('2026-10-01T11:30:00Z'),
      asOfBasis: 'stated' as const,
      rows: [
        {
          category: 'retail' as const,
          label: 'Retail Individual Investors(RIIs)',
          sharesOffered: 100,
          sharesBid: 50,
        },
        { category: 'total' as const, label: 'Total', sharesOffered: 1_000, sharesBid: 570 },
      ],
    };
    expect(await insertSubscriptionSnapshot(handle.db, snapshot)).toBe(2);
    expect(await insertSubscriptionSnapshot(handle.db, snapshot)).toBe(0);
    await rejectsWith(
      handle.db.execute(
        sql`update ipo_subscription_snapshots set shares_bid = 1 where ipo_id = ${id}`,
      ),
      /append-only/,
    );
  });

  it('writes listing-day prices once, then only rolls the latest close forward', async () => {
    const id = await issue('Listed', {
      open: '2026-09-24',
      close: '2026-09-28',
      listing: '2026-10-01',
    });
    const day = {
      ipoId: id,
      exchange: 'NSE' as const,
      listingDate: '2026-10-01',
      issuePricePaise: 40_500,
      openPaise: 45_500,
      highPaise: 47_000,
      lowPaise: 39_370,
      closePaise: 41_655,
      volume: 14_841_745,
      source: 'nse',
      sourceUrl: 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_01102026.csv',
    };
    expect(await recordListingDay(handle.db, day)).toBe(true);
    expect(await recordListingDay(handle.db, { ...day, openPaise: 1 })).toBe(false);
    expect(
      await updateLatestClose(handle.db, {
        ipoId: id,
        exchange: 'NSE',
        closePaise: 42_000,
        date: '2026-10-05',
      }),
    ).toBe(true);
    // An older file never moves the latest close backwards.
    expect(
      await updateLatestClose(handle.db, {
        ipoId: id,
        exchange: 'NSE',
        closePaise: 1,
        date: '2026-10-02',
      }),
    ).toBe(false);
    await rejectsWith(
      handle.db.execute(
        sql`update ipo_listing_performance set listing_open_paise = 1 where ipo_id = ${id}`,
      ),
      /frozen/,
    );
  });

  it('filters and counts by derived status exactly as core defines it', async () => {
    const s = `S${tag}`;
    await issue(`${s} Upcoming`, { open: '2026-10-10', close: '2026-10-14' });
    await issue(`${s} Open`, { open: '2026-09-30', close: '2026-10-05' });
    await issue(`${s} Closed`, { open: '2026-09-24', close: '2026-09-29' });
    await issue(`${s} Listed`, { open: '2026-09-20', close: '2026-09-23', listing: '2026-09-26' });
    const filters = { today: '2026-10-02', search: s, page: 1, pageSize: 50 };
    const names = async (status: 'open' | 'closed' | 'upcoming' | 'listed') =>
      (await listIpos(handle.db, { ...filters, status })).rows.map((r) => r.companyName);

    expect(await names('open')).toEqual([name(`${s} Open`)]);
    expect(await names('closed')).toEqual([name(`${s} Closed`)]);
    expect(await names('upcoming')).toEqual([name(`${s} Upcoming`)]);
    expect(await names('listed')).toEqual([name(`${s} Listed`)]);
    // 2 Oct is the close-day boundary check's neighbour: Open closes 5 Oct, so still open.
    const counts = await countIposByStatus(handle.db, { today: '2026-10-02', search: s });
    expect(counts).toEqual({
      upcoming: 1,
      open: 1,
      closed: 1,
      listed: 1,
      withdrawn: 0,
      postponed: 0,
    });
  });

  it('keeps GMP history append-only and reads the last quote before the listing open', async () => {
    const id = await issue('Grey', {
      open: '2026-09-24',
      close: '2026-09-28',
      listing: '2026-10-01',
    });
    const gmp = (iso: string, gmpPaise: number) => ({
      ipoId: id,
      source: 'investorgain',
      observedAt: new Date(iso),
      observedAtBasis: 'stated' as const,
      gmpPaise,
      rangeLowPaise: null,
      rangeHighPaise: null,
      sourceUrl: 'https://www.investorgain.com/gmp/grey-ipo/1/',
    });
    // 09:37 IST on listing day is before the 10:00 open; 11:00 IST is after it.
    expect(
      await insertGmpSnapshots(handle.db, [
        gmp('2026-09-30T04:00:00Z', 4_900),
        gmp('2026-10-01T04:07:00Z', 4_600),
        gmp('2026-10-01T05:30:00Z', 9_900),
      ]),
    ).toBe(3);
    await recordListingDay(handle.db, {
      ipoId: id,
      exchange: 'NSE',
      listingDate: '2026-10-01',
      issuePricePaise: 40_500,
      openPaise: 45_500,
      highPaise: 47_000,
      lowPaise: 39_370,
      closePaise: 41_655,
      volume: 1,
      source: 'nse',
      sourceUrl: 'https://nsearchives.nseindia.com/x.csv',
    });
    const rows = (await gmpTrackRows(handle.db, '2026-09-01')).filter(
      (r) => r.companyName === name('Grey'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastGmpPaise).toBe(4_600);
    await rejectsWith(
      handle.db.execute(sql`update ipo_gmp_snapshots set gmp_paise = 0 where ipo_id = ${id}`),
      /append-only/,
    );
  });

  it('offers only RHPs on hosts an enabled source may fetch', async () => {
    // Open far in the future so these sort ahead of every other test's documents.
    const id = await issue('Rhp Hosts', { open: '2099-01-05', close: '2099-01-07' });
    await upsertIpoDocuments(
      handle.db,
      id,
      'nse',
      [
        { kind: 'rhp', title: 'BSE copy', url: 'https://www.bseindia.com/x/RHP.pdf' },
        { kind: 'rhp', title: 'SEBI copy', url: 'https://www.sebi.gov.in/x/RHP.pdf' },
        { kind: 'rhp', title: 'NSE copy', url: 'https://nsearchives.nseindia.com/x/RHP.zip' },
        // A look-alike host is not a subdomain.
        { kind: 'rhp', title: 'Fake', url: 'https://evilnseindia.com/x/RHP.zip' },
      ],
      new Date('2026-10-02T05:00:00Z'),
    );
    const mine = async (hosts: string[]) =>
      (await listRhpDocumentsToExtract(handle.db, { version: 1, maxAttempts: 3, limit: 50, hosts }))
        .filter((d) => d.ipoId === id)
        .map((d) => d.title);
    expect(await mine(['nseindia.com'])).toEqual(['NSE copy']);
    expect((await mine(['nseindia.com', 'bseindia.com'])).sort()).toEqual(['BSE copy', 'NSE copy']);
    expect(await mine([])).toEqual([]);
  });

  it('reports the real total for a page past the end', async () => {
    await issue('Paged One', { open: '2026-09-01', close: '2026-09-03' });
    await issue('Paged Two', { open: '2026-09-02', close: '2026-09-04' });
    const base = { today: '2026-10-02', search: `paged`, page: 1, pageSize: 50 };
    const first = await listIpos(handle.db, base);
    const mine = first.rows.filter((r) => r.companyName.includes(tag)).length;
    expect(mine).toBe(2);
    const beyond = await listIpos(handle.db, { ...base, page: 99 });
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(first.total);
  });
});
