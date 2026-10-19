import { readFileSync } from 'node:fs';
import { createDatabase, type DatabaseHandle, getIpoBySlug } from '@equitywise/db';
import type { IpoSource } from '@equitywise/market-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { resolveTestDatabaseUrl } from '../../../../test/db';
import type { WorkerContext } from '../context.js';
import { createLogger } from '../log.js';
import { boardForSeries, parseIpoSourcesConfig } from '../sources/ipo/config.js';
import { PoliteHttpClient, type Transport } from '../sources/ipo/http.js';
import { parseInvestorGainPage } from '../sources/ipo/investorgain.js';
import {
  parseNseActiveCategory,
  parseNseBhavcopyPrices,
  parseNseDetail,
  parseNseIssueList,
  parseNseRecentListings,
} from '../sources/ipo/nse.js';
import { parseSebiFilings } from '../sources/ipo/sebi.js';
import { extractIpoRhp } from './extract-ipo-rhp.js';
import {
  backfillIpos,
  ingestIpoCalendar,
  ingestIpoDetails,
  ingestIpoGmp,
  ingestIpoListings,
  ingestIpoSubscriptions,
  ingestSebiFilings,
} from './ingest-ipos.js';

/**
 * End to end on a real database: the captured NSE fixtures go through the
 * real jobs, matcher, resolver and repositories. Skipped without a local
 * TEST_DATABASE_URL (test/db.ts).
 */
const url = resolveTestDatabaseUrl();
const suite = url ? describe : describe.skip;

const fixture = (name: string) =>
  readFileSync(new URL(`../sources/ipo/__fixtures__/${name}`, import.meta.url), 'utf8');
const config = parseIpoSourcesConfig(
  parse(readFileSync(new URL('../../../../config/ipo-sources.yaml', import.meta.url), 'utf8')),
);
const boardOf = (s: string) => boardForSeries(config, s);
const HOSTS = config.documentHosts;

/** NSE answering from the 2026-10-02 fixtures. */
const fixtureSource: IpoSource = {
  id: 'nse',
  fetchCalendar: async () => [
    ...parseNseIssueList(
      JSON.parse(fixture('nse-upcoming-issues.json')),
      'https://www.nseindia.com/api/all-upcoming-issues?category=ipo',
      boardOf,
    ),
    ...parseNseIssueList(
      JSON.parse(fixture('nse-current-issue.json')),
      'https://www.nseindia.com/api/ipo-current-issue',
      boardOf,
    ),
  ],
  fetchPastIssues: async () =>
    parseNseIssueList(
      JSON.parse(fixture('nse-past-issues.json')),
      'https://www.nseindia.com/api/public-past-issues',
      boardOf,
    ),
  fetchDetail: async (key) => {
    const file = {
      VNL: 'nse-detail-vnl-eq.json',
      NITYAS: 'nse-detail-nityas-eq.json',
      AONESTEELS: 'nse-detail-aonesteels-eq.json',
      RKFAL: 'nse-detail-rkfal-sme.json',
      EVENTIONS: 'nse-detail-eventions-sme.json',
    }[key.symbol];
    if (file === undefined) return null;
    return parseNseDetail(JSON.parse(fixture(file)), {
      key,
      sourceUrl: `https://www.nseindia.com/api/ipo-detail?symbol=${key.symbol}`,
      documentHosts: HOSTS,
    });
  },
  fetchSubscription: async (key) =>
    key.symbol === 'VNL'
      ? parseNseActiveCategory(JSON.parse(fixture('nse-active-category-vnl.json')))
      : null,
  fetchListingDay: async (date) =>
    date === '2026-10-01'
      ? parseNseBhavcopyPrices(
          fixture('nse-bhavcopy-01102026.csv'),
          'https://nsearchives.nseindia.com/x.csv',
          boardOf,
        )
      : [],
  fetchRecentListings: async () =>
    parseNseRecentListings(JSON.parse(fixture('nse-recent-listing.json')), boardOf),
};

const sources = () => [{ id: 'nse', source: fixtureSource, client: {} as PoliteHttpClient }];

suite('IPO ingestion jobs on real PostgreSQL', () => {
  let handle: DatabaseHandle;
  let context: WorkerContext;
  const log = createLogger('test');
  const options = { config, sources, now: new Date('2026-10-02T03:10:00Z') };
  const query = async <T extends object>(text: string, values: unknown[] = []): Promise<T[]> =>
    (await handle.pool.query<T>(text, values)).rows;

  beforeAll(async () => {
    handle = createDatabase({ connectionString: url, max: 4 });
    // This suite owns the NSE fixture symbols; clear any earlier run's rows.
    await query('delete from ipo_issues where nse_symbol = any($1)', [
      ['VNL', 'NITYAS', 'RKFAL', 'EVENTIONS', 'AONESTEELS', 'MONEYVIEW'],
    ]);
    context = { db: handle.db } as unknown as WorkerContext;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('creates issues from the calendar and past list, with details for new ones', async () => {
    const first = await ingestIpoCalendar(context, log, options);
    expect(first.written).toBeGreaterThan(0);
    const vnl = await query<{ slug: string; lot_size: number; registrar_name: string }>(
      "select slug, lot_size, registrar_name from ipo_issues where nse_symbol = 'VNL'",
    );
    expect(vnl).toHaveLength(1);
    expect(vnl[0]).toEqual({
      slug: 'vishal-nirmiti-ipo-2026',
      lot_size: 68,
      registrar_name: 'MUFG Intime India Private Limited',
    });

    // A second run creates nothing new: the same listing matches the same issue.
    await ingestIpoCalendar(context, log, options);
    const count = await query<{ n: string }>(
      "select count(*) as n from ipo_issues where nse_symbol = 'VNL'",
    );
    expect(Number(count[0]?.n)).toBe(1);
  });

  it('records documents, provenance and subscription', async () => {
    await ingestIpoDetails(context, log, options);
    await ingestIpoSubscriptions(context, log, options);
    const issue = await getIpoBySlug(handle.db, 'vishal-nirmiti-ipo-2026');
    expect(issue?.fieldSources.lotSize?.source).toBe('nse');
    const docs = await query<{ kind: string }>(
      'select kind from ipo_documents where ipo_id = $1 order by kind',
      [issue?.id ?? 0],
    );
    expect(docs.map((r) => r.kind)).toEqual(['price_band_ad', 'rhp']);
    const totals = await query<{ scope: string; shares_bid: string }>(
      "select scope, shares_bid from ipo_subscription_snapshots where ipo_id = $1 and category = 'total' order by scope",
      [issue?.id ?? 0],
    );
    expect(totals.map((r) => [r.scope, Number(r.shares_bid)])).toEqual([
      ['consolidated', 4_835_208],
      ['nse', 3_721_912],
    ]);
  });

  it('writes the listing day from the bhavcopy and the ISIN from recent listings', async () => {
    await ingestIpoListings(context, log, { ...options, now: new Date('2026-10-01T14:00:00Z') });
    const listed = await query<{
      isin: string | null;
      listing_open_paise: string;
      issue_price_paise: string;
    }>(
      `select i.isin, l.listing_open_paise, l.issue_price_paise from ipo_issues i
       join ipo_listing_performance l on l.ipo_id = i.id where i.nse_symbol = 'AONESTEELS'`,
    );
    expect(listed[0]?.isin).toBe('INE0OTC01025');
    expect(Number(listed[0]?.listing_open_paise)).toBe(45_500);
    expect(Number(listed[0]?.issue_price_paise)).toBe(40_500);
  });

  it('backfills details only for issues that never had one', async () => {
    const asked: string[] = [];
    const finals: string[] = [];
    const counting: IpoSource = {
      ...fixtureSource,
      fetchDetail: async (key) => {
        asked.push(key.symbol);
        return fixtureSource.fetchDetail(key);
      },
      fetchSubscription: async (key) => {
        finals.push(key.symbol);
        return fixtureSource.fetchSubscription(key);
      },
    };
    // SEBI's paged list, from the captured second page (no network in tests).
    const pages: number[] = [];
    const filings = () => [
      {
        id: 'sebi',
        client: {} as PoliteHttpClient,
        source: {
          id: 'sebi',
          fetchFilings: async () => parseSebiFilings(fixture('sebi-public-issues.html')),
          fetchFilingsPage: async (page: number) => {
            pages.push(page);
            return parseSebiFilings(fixture('sebi-public-issues-page2.html'));
          },
        },
      },
    ];
    const backfill = {
      ...options,
      filings,
      sources: () => [{ id: 'nse', source: counting, client: {} as PoliteHttpClient }],
    };
    await backfillIpos(context, log, backfill);
    // A-One Steels listed on 2026-10-01 and already has its detail page.
    expect(asked).not.toContain('AONESTEELS');
    const first = [...asked];
    asked.length = 0;
    await backfillIpos(context, log, backfill);
    // Only issues whose detail still could not be read are asked again.
    expect(asked.every((s) => first.includes(s))).toBe(true);
    // Filings pages are read newest first and stop when a page makes no
    // progress (the fixture answers the same page every time).
    expect(pages.slice(0, 2)).toEqual([0, 1]);
    expect(pages.length).toBeLessThan(10);
    // Closed issues without a consolidated final are asked for one; issues
    // still bidding (VNL closes 5 Oct) are left to the live job.
    expect(finals).toContain('AONESTEELS');
    expect(finals).not.toContain('VNL');
    // A run that was not cut short is recorded as the completed history load.
    const marker = await query<{ succeeded: boolean }>(
      'select succeeded from feed_ingestion_runs where feed = $1 order by completed_at desc limit 1',
      [`ipo-history-${config.backfill.since}`],
    );
    expect(marker[0]?.succeeded).toBe(true);
  });

  it('attaches unofficial GMP only to the exactly-matching issue', async () => {
    const gmp = () => [
      {
        id: 'investorgain',
        client: {} as PoliteHttpClient,
        source: {
          id: 'investorgain',
          fetchGmp: async () => parseInvestorGainPage(fixture('investorgain-gmp-live.html')),
        },
      },
    ];
    const result = await ingestIpoGmp(context, log, { ...options, gmp });
    expect(result.fetched).toBe(10);
    const rows = await query<{ nse_symbol: string; gmp_paise: string | null }>(
      `select i.nse_symbol, g.gmp_paise from ipo_gmp_snapshots g join ipo_issues i on i.id = g.ipo_id
       where i.nse_symbol = any($1) order by i.nse_symbol`,
      [['VNL', 'NITYAS', 'EVENTIONS']],
    );
    // "Nityas Gems & Jewellery" matches "Nityas Gems and Jewellery Limited" (₹3 on the
    // captured page); Eventions' "--" is stored as null.
    expect(
      rows.map((r) => [r.nse_symbol, r.gmp_paise === null ? null : Number(r.gmp_paise)]),
    ).toEqual([
      ['EVENTIONS', null],
      ['NITYAS', 300],
      ['VNL', 2_000],
    ]);
  });

  it('reads each RHP once, through the source owning its host, and keeps its pages', async () => {
    const vnlPages = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/core/src/ipos/__fixtures__/rhp-vnl-pages.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { totalPages: number; pages: Record<string, string> };
    const pages = Array.from(
      { length: vnlPages.totalPages },
      (_, i) => vnlPages.pages[String(i + 1)] ?? '',
    );
    const fetched: string[] = [];
    const transport: Transport = async ({ url }) => {
      const body = url.endsWith('/robots.txt') ? '' : '%PDF-1.4 stand-in';
      if (!url.endsWith('/robots.txt')) fetched.push(url);
      return { status: 200, url, headers: new Map(), body: new TextEncoder().encode(body) };
    };
    const client = (sourceId: string) =>
      new PoliteHttpClient({
        sourceId,
        userAgent: 'test',
        robotsAgent: 'equitywise',
        minIntervalMs: 0,
        maxRequestsPerRun: 50,
        transport,
        sleep: async () => {},
      });
    // Every RHP gets the VNL text: this checks the job, not the extractor.
    const rhp = { config, now: options.now, client, pageTexts: async () => pages };
    for (let run = 0; run < 5; run += 1) {
      const result = await extractIpoRhp(context, log, rhp);
      if (result.fetched === 0) break;
      expect(result.fetched).toBeLessThanOrEqual(config.rhp.maxDocumentsPerRun);
    }
    expect(fetched.every((u) => new URL(u).hostname.endsWith('nseindia.com'))).toBe(true);
    expect(fetched).toContain('https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip');
    expect(new Set(fetched).size).toBe(fetched.length);

    const rows = await query<{ section: string; page_from: number; items: string[] }>(
      `select e.section, e.page_from, e.items from ipo_rhp_extracts e join ipo_issues i on i.id = e.ipo_id
       where i.nse_symbol = 'VNL' order by e.section`,
    );
    expect(rows.map((r) => r.section)).toEqual([
      'financials',
      'objects',
      'overview',
      'promoters',
      'risks',
    ]);
    expect(rows.find((r) => r.section === 'promoters')?.items[0]).toBe('Brij B Tapadiya');
    const [doc] = await query<{ sha256: string; extractor_version: number }>(
      `select sha256, extractor_version from ipo_documents where url = $1`,
      ['https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip'],
    );
    expect(doc?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Nothing left to read: a further run fetches nothing.
    const before = fetched.length;
    expect((await extractIpoRhp(context, log, rhp)).fetched).toBe(0);
    expect(fetched.length).toBe(before);
  });

  it('stores SEBI filings once and never turns one into an issue', async () => {
    const filings = () => [
      {
        id: 'sebi',
        client: {} as PoliteHttpClient,
        source: {
          id: 'sebi',
          fetchFilings: async () => parseSebiFilings(fixture('sebi-public-issues.html')),
        },
      },
    ];
    await query('delete from ipo_sebi_filings');
    const issuesBefore = await query<{ n: number }>('select count(*)::int as n from ipo_issues');
    const first = await ingestSebiFilings(context, log, { ...options, filings });
    expect(first).toEqual({ fetched: 25, written: 25 });
    const again = await ingestSebiFilings(context, log, { ...options, filings });
    expect(again).toEqual({ fetched: 25, written: 0 });
    const issuesAfter = await query<{ n: number }>('select count(*)::int as n from ipo_issues');
    expect(issuesAfter[0]?.n).toBe(issuesBefore[0]?.n);
    // Only German Green Steel has an issue (opened 2026-09-25, after its 2026-09-12
    // DRHP addendum); every other filer is not on the exchange yet.
    const linked = await query<{ filer: string; issue: string }>(
      `select f.company_name as filer, i.company_name as issue from ipo_sebi_filings f
       join ipo_issues i on i.id = f.ipo_id order by f.sebi_id`,
    );
    expect(linked).toEqual([
      {
        filer: 'German Green Steel and Power Limited',
        issue: 'German Green Steel and Power Limited',
      },
    ]);
  });
});
