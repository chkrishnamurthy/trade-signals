import type { IpoListRow } from '@equitywise/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  list: vi.fn(),
  counts: vi.fn(),
  around: vi.fn(),
  health: vi.fn(),
  bySlug: vi.fn(),
  parts: vi.fn(),
  track: vi.fn(),
  unmatched: vi.fn(),
  conflicts: vi.fn(),
  filings: vi.fn(),
  yearStats: vi.fn(),
  years: vi.fn(),
  firstGmp: vi.fn(),
  documents: vi.fn(),
  filedCount: vi.fn(),
}));
vi.mock('./auth/require-user', () => ({ getSessionUser: mock.user, getAdminUser: mock.admin }));
vi.mock('./db', () => ({ getDatabase: () => ({}) }));
vi.mock('@equitywise/db', async (original) => ({
  ...(await original<typeof import('@equitywise/db')>()),
  listIpos: mock.list,
  countIposByStatus: mock.counts,
  listIposAround: mock.around,
  feedHealth: mock.health,
  getIpoBySlug: mock.bySlug,
  ipoDetailParts: mock.parts,
  gmpTrackRows: mock.track,
  listSebiFilings: mock.filings,
  countSebiFilingsSince: mock.filedCount,
  listUnmatchedSourceRecords: mock.unmatched,
  listIssuesWithConflicts: mock.conflicts,
  ipoYearStats: mock.yearStats,
  listIpoYears: mock.years,
  listIssueDocuments: mock.documents,
  firstGmpObservedAt: mock.firstGmp,
}));

import { GET as getAdminHealthRoute } from '../app/api/admin/ipos/health/route';
import { GET as getDetailRoute } from '../app/api/ipos/[slug]/route';
import { GET as getListRoute } from '../app/api/ipos/route';
import { getIpoWebConfig } from './ipo-config';
import {
  buildAgenda,
  calendarDays,
  calendarRows,
  calendarWindow,
  dashboardGmp,
  feedIdsFor,
  getIpoCalendarPage,
  getIpoDashboard,
  getIpoDetail,
  getIpoGmpPage,
  getIpoListingsPage,
  getIpoListPage,
  getIpoPipelinePage,
  getIposPage,
  type MapContext,
  mondayOf,
  nextSettlementDays,
  subscriptionViews,
  toAllotmentRow,
  toFeedStatuses,
  toGmpPanel,
  toListItem,
  toTrackRecord,
  visibleRhp,
} from './ipos';

// 2 Oct 2026, 08:40 IST.
const now = new Date('2026-10-02T03:10:00Z');

function issue(over: Partial<IpoListRow> = {}): IpoListRow {
  return {
    id: 1,
    slug: 'vishal-nirmiti-ipo-2026',
    companyName: 'Vishal Nirmiti Limited',
    board: 'mainboard',
    issueMethod: 'book_building',
    designatedExchange: 'NSE',
    exchanges: ['NSE'],
    nseSymbol: 'VNL',
    nseSeries: 'EQ',
    bseScripCode: null,
    isin: null,
    openDate: '2026-09-30',
    closeDate: '2026-10-05',
    listingDate: null,
    allotmentDate: null,
    refundDate: null,
    dematCreditDate: null,
    upiCutoffAt: new Date('2026-10-05T11:30:00Z'),
    priceBandLowPaise: 20_800,
    priceBandHighPaise: 22_000,
    issuePricePaise: null,
    faceValuePaise: 1_000,
    lotSize: 68,
    minBidQuantity: 68,
    retailMaxPaise: 20_000_000,
    employeeDiscountPaise: null,
    sharesOffered: 8_471_153,
    freshIssueShares: null,
    freshIssuePaise: 145_000_000_000,
    ofsShares: 1_500_000,
    ofsPaise: null,
    marketMakerShares: null,
    anchorShares: null,
    issueSizeText:
      'fresh issue aggregating up to 14500 lakhs and offer for sale up to 15,00,000 Equity Shares',
    registrarName: 'MUFG Intime India Private Limited',
    registrarContact: null,
    leadManagers: ['Saffron Capital Advisors Private Limited'],
    sponsorBanks: [],
    marketMaker: null,
    lifecycleOverride: null,
    fieldSources: {
      lotSize: {
        source: 'nse',
        url: 'https://www.nseindia.com/api/ipo-detail',
        observedAt: now.toISOString(),
        basis: 'official',
      },
    },
    firstSeenAt: now,
    updatedAt: now,
    subscriptionTotal: {
      scope: 'consolidated',
      asOf: '2026-10-01T11:30:00+00:00',
      sharesBid: 4_835_208,
      sharesOffered: 8_471_153,
    },
    subscriptionRetail: {
      scope: 'consolidated',
      asOf: '2026-10-01T11:30:00+00:00',
      sharesBid: 2_779_092,
      sharesOffered: 5_929_808,
    },
    latestGmp: {
      source: 'investorgain',
      gmpPaise: 2_000,
      observedAt: '2026-10-02T01:32:00+00:00',
      sourceUrl: 'https://www.investorgain.com/gmp/vishal-nirmiti-ipo/1602/',
    },
    listing: null,
    ...over,
  };
}

let ctx: MapContext;

beforeEach(async () => {
  vi.clearAllMocks();
  const config = await getIpoWebConfig(now.getTime());
  ctx = {
    today: '2026-10-02',
    now,
    calendar: config.calendar,
    gmp: { name: 'InvestorGain', url: 'https://www.investorgain.com/report/ipo-gmp-live/331/' },
  };
  mock.user.mockResolvedValue({ id: 7 });
  mock.admin.mockResolvedValue(null);
  mock.list.mockResolvedValue({ rows: [issue()], total: 1 });
  mock.filings.mockResolvedValue([
    {
      sebiId: '104866',
      companyName: 'JAGATJIT AGRI ENGINEERING LIMITED',
      documentLabel: 'DRHP',
      filedDate: '2026-10-01',
      pageUrl:
        'https://www.sebi.gov.in/filings/public-issues/oct-2026/jagatjit-agri-engineering-limited-drhp_104866.html',
      abridgedUrl: null,
      slug: null,
      lastSeenAt: now,
    },
  ]);
  mock.counts.mockResolvedValue({
    upcoming: 1,
    open: 1,
    closed: 0,
    listed: 0,
    withdrawn: 0,
    postponed: 0,
  });
  mock.around.mockResolvedValue([issue()]);
  mock.health.mockResolvedValue(new Map());
  mock.track.mockResolvedValue([]);
  mock.filedCount.mockResolvedValue(14);
  mock.yearStats.mockResolvedValue({
    listed: 88,
    withListingPrice: 8,
    openedAboveIssue: 6,
    withLatestClose: 8,
    latestAboveIssue: 4,
  });
  mock.years.mockResolvedValue([2026, 2025, 2024]);
  mock.documents.mockResolvedValue([]);
  // GMP recorded from 2 Oct 2026 (the first stored quote).
  mock.firstGmp.mockResolvedValue(new Date('2026-10-02T01:32:00Z'));
});

describe('toListItem', () => {
  it('derives status, minimum investment, issue size and the expected listing date', () => {
    const item = toListItem(issue(), ctx);
    expect(item).toMatchObject({
      status: 'open',
      closedStage: null,
      // 68 × ₹220 = ₹14,960.
      minInvestmentPaise: 1_496_000,
      // ₹145 cr fresh + 15,00,000 × ₹220 OFS = ₹178 cr, priced at the band.
      issueSizePaise: 178_000_000_000,
      issueSizeBasis: 'derived_at_upper_band',
      // Close Mon 5 Oct → T+3 Thu 8 Oct.
      expectedListingDate: '2026-10-08',
      upiCutoffAt: '2026-10-05T11:30:00.000Z',
    });
  });

  it('prices an SME application at two lots and reads an all-caps name', () => {
    const item = toListItem(
      issue({
        slug: 'eventions-ipo-2026',
        companyName: 'EVENTIONS LIMITED',
        board: 'sme',
        lotSize: 1_200,
        minBidQuantity: null,
        priceBandLowPaise: 11_200,
        priceBandHighPaise: 11_800,
      }),
      ctx,
    );
    expect(item).toMatchObject({
      companyName: 'Eventions Limited',
      minApplicationLots: 2,
      // SEBI (March 2025): two lots × 1,200 × ₹118 = ₹2,83,200.
      minInvestmentPaise: 28_320_000,
    });
    expect(toListItem(issue(), ctx).minApplicationLots).toBe(1);
  });

  it('computes subscription times within one scope only', () => {
    const item = toListItem(issue(), ctx);
    expect(item.subscription?.scope).toBe('consolidated');
    expect(item.subscription?.totalTimes).toBeCloseTo(0.5708, 4);
    const mixed = toListItem(
      issue({
        subscriptionRetail: {
          scope: 'nse',
          asOf: '2026-10-01T11:30:00Z',
          sharesBid: 1,
          sharesOffered: 1,
        },
      }),
      ctx,
    );
    expect(mixed.subscription?.retailTimes).toBeNull();
  });

  it('labels GMP unofficial and marks an old quote stale', () => {
    const item = toListItem(issue(), ctx);
    expect(item.gmp).toMatchObject({
      official: false,
      latestPaise: 2_000,
      sourceName: 'InvestorGain',
      stale: false,
    });
    expect(item.gmp?.percentOfUpperBand).toBeCloseTo(9.0909, 3);
    const old = toListItem(
      issue({
        latestGmp: {
          source: 'investorgain',
          gmpPaise: 2_000,
          observedAt: '2026-09-29T01:00:00Z',
          sourceUrl: 'x',
        },
      }),
      ctx,
    );
    expect(old.gmp?.stale).toBe(true);
  });

  it('shows no GMP at all when the source is switched off', () => {
    expect(toListItem(issue(), { ...ctx, gmp: null }).gmp).toBeNull();
  });

  it('computes listing gains from the exchange file', () => {
    const item = toListItem(
      issue({
        listingDate: '2026-10-01',
        listing: {
          exchange: 'NSE',
          listingDate: '2026-10-01',
          issuePricePaise: 40_500,
          listingOpenPaise: 45_500,
          listingClosePaise: 41_655,
          latestClosePaise: 42_000,
          latestCloseDate: '2026-10-01',
        },
      }),
      ctx,
    );
    expect(item.status).toBe('listed');
    expect(item.listing?.listingGainPercent).toBeCloseTo(12.3457, 3);
    expect(item.listing?.listingDayChangePercent).toBeCloseTo(2.8519, 3);
    expect(item.expectedListingDate).toBeNull();
  });

  it('stops promising a listing well past T+3 with no official date', () => {
    // Close Mon 5 Oct → T+3 Thu 8 Oct; 5 settlement days of grace end Thu 15 Oct.
    const pending = toListItem(issue(), { ...ctx, today: '2026-10-15' });
    expect(pending).toMatchObject({
      status: 'closed',
      closedStage: 'listing_pending',
      expectedListingDate: '2026-10-08',
    });
    const unreported = toListItem(issue(), { ...ctx, today: '2026-10-16' });
    expect(unreported).toMatchObject({
      status: 'closed',
      closedStage: 'listing_unconfirmed',
      expectedListingDate: null,
    });
  });
});

describe('buildAgenda', () => {
  it('groups milestones by day and marks computed ones expected', () => {
    const days = buildAgenda([issue()], '2026-10-02', '2026-10-15', ctx);
    expect(days.map((d) => [d.date, d.events.map((e) => [e.kind, e.expected])])).toEqual([
      ['2026-10-05', [['closes', false]]],
      ['2026-10-06', [['allotment', true]]],
      ['2026-10-07', [['demat_credit', true]]],
      ['2026-10-08', [['listing', true]]],
    ]);
  });
});

describe('subscriptionViews', () => {
  const row = (scope: string, asOf: string, category: string, bid: number, offered: number) => ({
    ipoId: 1,
    source: 'nse',
    scope,
    asOf: new Date(asOf),
    asOfBasis: 'stated',
    category,
    categoryLabel: category,
    sharesOffered: offered,
    sharesBid: bid,
    fetchedAt: new Date(asOf),
  });
  it('prefers the consolidated table and keeps one history point per day', () => {
    const views = subscriptionViews([
      row('consolidated', '2026-09-30T11:30:00Z', 'total', 100, 1_000),
      row('consolidated', '2026-10-01T06:00:00Z', 'total', 300, 1_000),
      row('consolidated', '2026-10-01T11:30:00Z', 'total', 570, 1_000),
      row('nse', '2026-10-01T11:30:03Z', 'total', 440, 1_000),
    ]);
    expect(views.table?.scope).toBe('consolidated');
    expect(views.table?.rows[0]?.times).toBeCloseTo(0.57, 5);
    expect(views.nseOnly?.scope).toBe('nse');
    expect(views.history.map((p) => p.totalTimes)).toEqual([0.1, 0.57]);
  });
});

describe('subscriptionViews across sources', () => {
  const at = '2026-10-01T11:30:00Z';
  const snap = (source: string, scope: string, category: string, bid: number) => ({
    ipoId: 1,
    source,
    scope,
    asOf: new Date(at),
    asOfBasis: 'stated',
    category,
    categoryLabel: `${category}-${source}`,
    sharesOffered: 1_000,
    sharesBid: bid,
    fetchedAt: new Date(at),
  });
  it('never merges two exchanges at the same time and prefers the designated one', () => {
    const rows = [
      snap('nse', 'consolidated', 'total', 571),
      snap('bse', 'consolidated', 'total', 572),
    ];
    const nse = subscriptionViews(rows, 'nse');
    expect(nse.table?.source).toBe('nse');
    expect(nse.table?.rows).toHaveLength(1);
    expect(subscriptionViews(rows, 'bse').table?.source).toBe('bse');
  });
});

describe('toGmpPanel', () => {
  it('says why there is no GMP', () => {
    expect(toGmpPanel([], 22_000, { now, gmp: null })).toMatchObject({
      available: false,
      reason: 'source_disabled',
    });
    expect(toGmpPanel([], 22_000, ctx)).toMatchObject({ available: false, reason: 'not_tracked' });
  });

  it('says an issue closed before GMP recording began was never tracked, not unreported', () => {
    const tracked = { ...ctx, gmpSince: '2026-10-02' };
    // Bharat Coking Coal closed 13 Jan 2026, long before the first stored quote.
    expect(toGmpPanel([], 2_300, tracked, '2026-01-13')).toMatchObject({
      available: false,
      reason: 'before_tracking',
    });
    // An issue closing after recording began, with no quote, is "not tracked".
    expect(toGmpPanel([], 22_000, tracked, '2026-10-05')).toMatchObject({
      reason: 'not_tracked',
    });
  });
});

describe('toTrackRecord', () => {
  it('compares the last GMP with the listing gain and finds this issue', () => {
    const record = toTrackRecord(
      [
        {
          slug: 'a-one',
          companyName: 'A-One Steels',
          board: 'mainboard',
          listingDate: '2026-10-01',
          priceBandHighPaise: 40_500,
          issuePricePaise: 40_500,
          listingOpenPaise: 45_500,
          lastGmpPaise: 4_600,
        },
      ],
      12,
      'a-one',
    );
    expect(record.official).toBe(false);
    expect(record.within).toBe(1);
    expect(record.thisIssue?.lastGmpPercent).toBeCloseTo(11.358, 2);
  });
});

describe('feed statuses', () => {
  it('lists enabled feeds and reports failure and staleness', async () => {
    const config = await getIpoWebConfig(now.getTime());
    const feeds = feedIdsFor(config);
    expect(feeds.map((f) => f.id)).toEqual(
      expect.arrayContaining(['ipo-nse-calendar', 'ipo-nse-subscription', 'ipo-investorgain-gmp']),
    );
    const statuses = toFeedStatuses(
      feeds,
      new Map([
        [
          'ipo-nse-calendar',
          {
            feed: 'ipo-nse-calendar',
            latest: {
              succeeded: false,
              fetched: 0,
              written: 0,
              error: 'SourceHttpError: 503',
              completedAt: now,
            },
            lastSuccess: null,
          },
        ],
      ]),
      now,
      config,
    );
    expect(statuses.find((s) => s.id === 'ipo-nse-calendar')).toMatchObject({
      status: 'failed',
      error: 'SourceHttpError: 503',
      label: 'NSE issue calendar',
    });
    expect(statuses.find((s) => s.id === 'ipo-nse-detail')?.status).toBe('empty');
  });
});

function rhpRow() {
  return {
    documentId: 7,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    documentTitle: 'Red Herring Prospectus',
    section: 'overview',
    title: 'Overview',
    body: 'We are a civil engineering company.',
    items: [],
    table: null,
    pageFrom: 247,
    pageTo: 247,
    extractedAt: new Date('2026-10-02T02:50:00Z'),
  };
}

describe('visibleRhp', () => {
  it('drops the sections ipo-rhp-overrides.yaml hides, and nothing else', () => {
    const rows = [rhpRow(), { ...rhpRow(), section: 'risks', body: null, items: ['A risk.'] }];
    expect(visibleRhp(rows, undefined).map((e) => e.section)).toEqual(['overview', 'risks']);
    expect(visibleRhp(rows, new Set(['risks'])).map((e) => e.section)).toEqual(['overview']);
  });

  it('reads the committed overrides file', async () => {
    const config = await getIpoWebConfig(now.getTime());
    expect(config.rhpHidden.size).toBe(0);
  });
});

describe('dashboard building blocks', () => {
  it('counts five settlement days, skipping the holiday and the weekend', async () => {
    const config = await getIpoWebConfig(now.getTime());
    // Fri 2 Oct 2026 is Gandhi Jayanti: the window is Mon 5 – Fri 9 Oct.
    expect(nextSettlementDays('2026-10-02', 5, config.calendar)).toEqual({
      from: '2026-10-02',
      to: '2026-10-09',
    });
    // A trading Monday counts itself.
    expect(nextSettlementDays('2026-10-05', 5, config.calendar).to).toBe('2026-10-09');
  });

  it('keeps GMP to unlisted issues with a quote, highest premium first, once each', () => {
    const vnl = toListItem(issue(), ctx);
    const higher = toListItem(
      issue({
        slug: 'higher',
        latestGmp: {
          source: 'investorgain',
          gmpPaise: 5_000,
          observedAt: '2026-10-02T01:32:00+00:00',
          sourceUrl: 'https://www.investorgain.com/gmp/x/1/',
        },
      }),
      ctx,
    );
    const noQuote = toListItem(
      issue({
        slug: 'no-quote',
        latestGmp: {
          source: 'investorgain',
          gmpPaise: null,
          observedAt: '2026-10-02T01:32:00+00:00',
          sourceUrl: 'https://www.investorgain.com/gmp/y/2/',
        },
      }),
      ctx,
    );
    const listed = toListItem(issue({ slug: 'listed', listingDate: '2026-10-01' }), ctx);
    expect(dashboardGmp([vnl, higher, noQuote, listed, vnl]).map((r) => r.slug)).toEqual([
      'higher',
      'vishal-nirmiti-ipo-2026',
    ]);
  });

  it("gives a closed issue's allotment day and the registrar's own page", async () => {
    const config = await getIpoWebConfig(now.getTime());
    const row = toAllotmentRow(
      issue({ openDate: '2026-09-25', closeDate: '2026-09-29', allotmentDate: '2026-09-30' }),
      config,
    );
    expect(row).toMatchObject({
      allotmentDate: '2026-09-30',
      allotmentExpected: false,
      // T+3 from Tue 29 Sep, past the Gandhi Jayanti holiday.
      listingDate: '2026-10-05',
      listingExpected: true,
      registrarName: 'MUFG Intime India Private Limited',
    });
    expect(row?.registrarUrl).toMatch(/^https:\/\//);
    expect(toAllotmentRow(issue({ closeDate: null }), config)).toBeNull();
  });
});

describe('calendar', () => {
  it('starts the week before the current one, three weeks to a Friday', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // a Sunday
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(calendarWindow('2026-10-02')).toEqual({ from: '2026-09-21', to: '2026-10-09' });
    // On a weekend the current week is the one about to start.
    expect(calendarWindow('2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-16' });
    expect(calendarWindow('2026-10-02', '2026-10-15')).toEqual({
      from: '2026-10-12',
      to: '2026-10-30',
    });
  });

  it('lists weekdays only, marking exchange holidays', async () => {
    const config = await getIpoWebConfig(now.getTime());
    const days = calendarDays('2026-09-28', '2026-10-09', config.calendar);
    expect(days).toHaveLength(10);
    // Gandhi Jayanti.
    expect(days.find((d) => d.date === '2026-10-02')).toEqual({
      date: '2026-10-02',
      trading: false,
    });
    expect(days.every((d) => d.date !== '2026-10-03')).toBe(true);
  });

  it('keeps issues bidding, allotting or listing in the window, with expected days marked', () => {
    const open = issue();
    const before = issue({
      slug: 'long-gone',
      openDate: '2026-08-01',
      closeDate: '2026-08-05',
      listingDate: '2026-08-10',
    });
    const listingInside = issue({
      slug: 'lists-inside',
      openDate: '2026-09-22',
      closeDate: '2026-09-24',
      listingDate: '2026-09-29',
    });
    const rows = calendarRows([open, before, listingInside], '2026-09-28', '2026-10-16', ctx);
    expect(rows.map((r) => r.slug)).toEqual(['lists-inside', 'vishal-nirmiti-ipo-2026']);
    const vnl = rows[1];
    expect(vnl).toMatchObject({ status: 'open', openDate: '2026-09-30', closeDate: '2026-10-05' });
    // T+1 and T+3 from Mon 5 Oct.
    expect(vnl?.allotment).toEqual({ date: '2026-10-06', expected: true });
    expect(vnl?.listing).toEqual({ date: '2026-10-08', expected: true });
    expect(rows[0]?.listing).toEqual({ date: '2026-09-29', expected: false });
  });
});

describe('services and routes', () => {
  it('builds the Overview for a board scope, with filings never on SME', async () => {
    mock.list.mockImplementation(async (_db: unknown, f: { status?: string; board?: string }) =>
      f.status === 'open' ? { rows: [issue()], total: 1 } : { rows: [], total: 0 },
    );
    mock.documents.mockResolvedValue([
      {
        ipoId: 1,
        kind: 'rhp',
        title: 'Red Herring Prospectus',
        url: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
        sectionsQuoted: 5,
      },
    ]);
    const main = await getIpoDashboard('mainboard', now);
    expect(main.board).toBe('mainboard');
    expect(main.yearStats).toEqual({
      year: 2026,
      listed: 88,
      withListingPrice: 8,
      openedAboveIssue: 6,
      withLatestClose: 8,
      latestAboveIssue: 4,
    });
    expect(mock.yearStats).toHaveBeenCalledWith(expect.anything(), {
      board: 'mainboard',
      year: 2026,
      today: '2026-10-02',
    });
    expect(main.open.map((r) => r.slug)).toEqual(['vishal-nirmiti-ipo-2026']);
    expect(main.gmp).toHaveLength(1);
    expect(main.filedRecently).toBe(14);
    expect(mock.filedCount).toHaveBeenCalledWith(expect.anything(), '2026-07-04');
    expect(main.gmpTracks).toEqual([expect.objectContaining({ board: 'mainboard', total: 0 })]);
    for (const call of mock.list.mock.calls) expect(call[1]).toMatchObject({ board: 'mainboard' });

    const sme = await getIpoDashboard('sme', now);
    expect(sme.filedRecently).toBeNull();

    // Both boards: no board filter, and a GMP record per board, never pooled.
    mock.list.mockClear();
    const all = await getIpoDashboard('all', now);
    expect(all.board).toBe('all');
    for (const call of mock.list.mock.calls) expect(call[1].board).toBeUndefined();
    expect(all.gmpTracks.map((t) => t.board)).toEqual(['mainboard', 'sme']);
    expect(mock.track).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), 'sme');
    // The Overview no longer reads offer documents or the filings list: Pipeline does.
    expect(mock.documents).not.toHaveBeenCalled();
    expect(mock.filings).not.toHaveBeenCalled();
  });

  it("lists the table for this year by default, every year on 'all', both boards by default", async () => {
    const page = await getIpoListPage('sme', { page: 1 }, now);
    expect(page.filters).toEqual({ status: null, year: 2026, q: '' });
    expect(page.years).toEqual([2026, 2025, 2024]);
    expect(mock.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ board: 'sme', year: 2026, page: 1 }),
    );
    const all = await getIpoListPage('sme', { page: 1, year: 'all' }, now);
    expect(all.filters.year).toBeNull();
    expect(mock.list).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ board: 'sme', year: undefined }),
    );
    const both = await getIpoListPage('all', { page: 1 }, now);
    expect(both.board).toBe('all');
    expect(mock.list.mock.lastCall?.[1].board).toBeUndefined();
    expect(mock.years).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });

  it('sorts the whole board before paging, and counts every status for the tiles', async () => {
    // 26 open issues with rising demand, and one upcoming issue.
    const open = Array.from({ length: 26 }, (_, i) =>
      issue({
        id: i + 1,
        slug: `open-${i}-ipo-2026`,
        companyName: `Open ${String(i).padStart(2, '0')} Limited`,
        subscriptionTotal: {
          scope: 'consolidated',
          asOf: '2026-10-01T11:30:00+00:00',
          sharesBid: (i + 1) * 1_000,
          sharesOffered: 1_000,
        },
      }),
    );
    const upcoming = issue({
      id: 99,
      slug: 'later-ipo-2026',
      companyName: 'Later Limited',
      openDate: '2026-10-07',
      closeDate: '2026-10-09',
    });
    mock.list.mockResolvedValue({ rows: [upcoming, ...open], total: 27 });

    const page2 = await getIpoListPage('mainboard', { page: 2, sort: 'demand' }, now);
    expect(mock.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 1, pageSize: 5_000 }),
    );
    // Every status is read; the filter is applied after the tiles are counted.
    expect(mock.list.mock.calls[0]?.[1]).not.toHaveProperty('status');
    expect(page2.sort).toEqual({ key: 'demand', dir: 'desc' });
    expect(page2.total).toBe(27);
    // Highest demand first: page 2 holds the two lowest, then the issue with none.
    expect(page2.rows.map((r) => r.slug)).toEqual(['open-0-ipo-2026', 'later-ipo-2026']);
    expect(page2.counts).toMatchObject({ open: 26, upcoming: 1 });

    // A status filter narrows the rows, never the pill counts.
    const filtered = await getIpoListPage('mainboard', { page: 1, status: 'upcoming' }, now);
    expect(filtered.rows.map((r) => r.slug)).toEqual(['later-ipo-2026']);
    expect(filtered.total).toBe(1);
    expect(filtered.counts.open).toBe(26);
    expect(filtered.sort).toEqual({ key: 'stage', dir: 'asc' });

    // A page past the end is the last real page.
    const past = await getIpoListPage('mainboard', { page: 9, sort: 'company', dir: 'desc' }, now);
    expect(past.page).toBe(2);
    expect(past.rows.map((r) => r.companyName)).toEqual(['Open 00 Limited', 'Later Limited']);
  });

  it('builds the calendar, listings, grey-market and pipeline pages for a scope', async () => {
    mock.around.mockResolvedValue([issue(), issue({ id: 2, slug: 'sme-one', board: 'sme' })]);
    const cal = await getIpoCalendarPage('mainboard', undefined, now);
    expect(cal).toMatchObject({ board: 'mainboard', from: '2026-09-21', to: '2026-10-09' });
    expect(cal.prevFrom).toBe('2026-09-07');
    expect(cal.nextFrom).toBe('2026-10-05');
    expect(cal.rows.map((r) => r.slug)).toEqual(['vishal-nirmiti-ipo-2026']);
    const both = await getIpoCalendarPage('all', '2026-10-01', now);
    expect(both.from).toBe('2026-09-28');
    expect(both.rows).toHaveLength(2);

    mock.list.mockResolvedValue({
      rows: [issue({ slug: 'listed-one', listingDate: '2026-09-20' })],
      total: 1,
    });
    const listings = await getIpoListingsPage('all', { page: 1 }, now);
    expect(mock.list).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'listed', year: 2026, board: undefined }),
    );
    expect(listings.rows.map((r) => r.slug)).toEqual(['listed-one']);
    expect(listings.months.map((m) => m.month)).toEqual(['2026-09']);

    const gmp = await getIpoGmpPage('all', now);
    expect(gmp.gmpPolicy.enabled).toBe(true);
    expect(gmp.tracks.map((t) => t.board)).toEqual(['mainboard', 'sme']);

    mock.list.mockImplementation(async (_db: unknown, f: { status?: string }) =>
      f.status === 'upcoming'
        ? { rows: [issue({ slug: 'undated', openDate: null, closeDate: null })], total: 1 }
        : { rows: [], total: 0 },
    );
    mock.documents.mockResolvedValue([
      {
        ipoId: 1,
        kind: 'rhp',
        title: 'Red Herring Prospectus',
        url: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
        sectionsQuoted: 5,
      },
    ]);
    const pipe = await getIpoPipelinePage('all', now);
    expect(pipe.documents).toEqual([
      {
        slug: 'undated',
        companyName: 'Vishal Nirmiti Limited',
        kind: 'rhp',
        url: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
        host: 'nsearchives.nseindia.com',
        sectionsQuoted: 5,
      },
    ]);
    expect(pipe.filingsOn).toBe(true);
    expect(pipe.filings).toHaveLength(1);
    expect(pipe.filedRecently).toBe(14);
    expect(pipe.undated.map((r) => r.slug)).toEqual(['undated']);
    const smePipe = await getIpoPipelinePage('sme', now);
    expect(smePipe).toMatchObject({ filingsOn: false, filings: [], filedRecently: null });
  });

  it('refuses the section pages when signed out', async () => {
    mock.user.mockResolvedValue(null);
    await expect(getIpoCalendarPage('all', undefined, now)).rejects.toMatchObject({ status: 401 });
    await expect(getIpoListingsPage('all', { page: 1 }, now)).rejects.toMatchObject({
      status: 401,
    });
    await expect(getIpoGmpPage('all', now)).rejects.toMatchObject({ status: 401 });
    await expect(getIpoPipelinePage('all', now)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses the dashboard and the list when signed out', async () => {
    mock.user.mockResolvedValue(null);
    await expect(getIpoDashboard('mainboard', now)).rejects.toMatchObject({ status: 401 });
    await expect(getIpoListPage('mainboard', { page: 1 }, now)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('serves the last real page for a page number past the end', async () => {
    // Page 3 of a result that now fits on page 1: the stale page is empty.
    mock.list.mockImplementation(async (_db: unknown, f: { page: number; status?: string }) =>
      f.status === 'open'
        ? { rows: [issue()], total: 1 }
        : f.page === 1
          ? { rows: [issue()], total: 1 }
          : { rows: [], total: 1 },
    );
    const page = await getIposPage({ page: 3 }, now);
    expect(page.page).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('builds the page with highlights and the GMP policy', async () => {
    const page = await getIposPage({ page: 1 }, now);
    expect(page.highlights.openNow).toHaveLength(1);
    expect(page.highlights.listsThisWeek).toBe(1);
    expect(page.gmpPolicy).toEqual({
      enabled: true,
      sourceName: 'InvestorGain',
      sourceUrl: 'https://www.investorgain.com/report/ipo-gmp-live/331/',
      // The day of the first stored quote: no GMP exists before it.
      trackedSince: '2026-10-02',
    });
    expect(page.disclaimer).toMatch(/not investment advice/);
    // SEBI filings are shown on their own, never as issues.
    expect(page.filings).toEqual([
      {
        sebiId: '104866',
        // SEBI publishes it in capitals; the page shows it readable.
        companyName: 'Jagatjit Agri Engineering Limited',
        documentLabel: 'DRHP',
        filedDate: '2026-10-01',
        pageUrl:
          'https://www.sebi.gov.in/filings/public-issues/oct-2026/jagatjit-agri-engineering-limited-drhp_104866.html',
        abridgedUrl: null,
        slug: null,
      },
    ]);
    expect(page.rows).toHaveLength(1);
  });

  it('answers 400 for an invalid filter and 401 when signed out', async () => {
    const bad = await getListRoute(new Request('http://x/api/ipos?status=hot'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('INVALID_STATUS');
    mock.user.mockResolvedValue(null);
    const out = await getListRoute(new Request('http://x/api/ipos'));
    expect(out.status).toBe(401);
  });

  it('answers 404 for an unknown slug', async () => {
    mock.bySlug.mockResolvedValue(null);
    const res = await getDetailRoute(new Request('http://x'), {
      params: Promise.resolve({ slug: 'nope-ipo-2026' }),
    });
    expect(res.status).toBe(404);
  });

  it('assembles a detail page with sources and the registrar link', async () => {
    mock.bySlug.mockResolvedValue(issue());
    mock.parts.mockResolvedValue({
      subscriptions: [],
      gmp: [],
      documents: [],
      listing: [],
      sources: [],
      filings: [],
      rhp: [
        {
          documentId: 7,
          documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
          documentTitle: 'Red Herring Prospectus',
          section: 'financials',
          title: 'Restated financial summary',
          body: null,
          items: [],
          table: {
            unit: '₹ lakh',
            columns: ['31 March 2026'],
            rows: [{ label: 'Revenue from operations', values: ['33,867.73'] }],
          },
          pageFrom: 71,
          pageTo: 73,
          extractedAt: new Date('2026-10-02T02:50:00Z'),
        },
        // A section this build does not know is dropped, not rendered raw.
        { ...rhpRow(), section: 'valuation' },
      ],
    });
    const detail = await getIpoDetail('vishal-nirmiti-ipo-2026', now);
    // RHP figures pass through as the document's own strings.
    expect(detail.rhp).toEqual([
      {
        section: 'financials',
        title: 'Restated financial summary',
        text: null,
        items: [],
        table: {
          unit: '₹ lakh',
          columns: ['31 March 2026'],
          rows: [{ label: 'Revenue from operations', values: ['33,867.73'] }],
        },
        pageFrom: 71,
        pageTo: 73,
        documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
        extractedAt: '2026-10-02T02:50:00.000Z',
      },
    ]);
    expect(detail.registrar).toMatchObject({
      name: 'MUFG Intime India Private Limited',
      allotmentUrl: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    });
    // 13 lots of ₹14,960 fit under ₹2,00,000.
    expect(detail.maxRetailLots).toBe(13);
    // Mainboard: each category's application in whole lots at ₹220.
    expect(detail.investmentLimits.map((l) => [l.kind, l.lots, l.amountPaise])).toEqual([
      ['retail_min', 1, 1_496_000],
      ['retail_max', 13, 19_448_000],
      ['snii_min', 14, 20_944_000],
      ['snii_max', 66, 98_736_000],
      ['bnii_min', 67, 100_232_000],
    ]);
    // The GMP track record compares this board's listings only.
    expect(detail.gmpTrackRecord.board).toBe('mainboard');
    expect(mock.track).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'mainboard');
    expect(detail.fieldSources.lotSize?.sourceName).toBe('NSE');
    expect(detail.gmpPanel).toMatchObject({
      official: false,
      available: false,
      reason: 'not_tracked',
    });
  });

  it('refuses the admin health view to a non-admin', async () => {
    const res = await getAdminHealthRoute();
    expect(res.status).toBe(403);
  });
});
