import 'server-only';
import {
  closedStage,
  expectedTimeline,
  gmpPercent,
  gmpTrackRecord,
  investmentLimits,
  ipoStatus,
  ipoTimeline,
  isSettlementDay,
  issueSizePaise,
  listingUnconfirmed,
  maxRetailLots,
  minApplicationLots,
  minInvestmentPaise,
  percentChange,
  RHP_EXTRACTOR_VERSION,
  readableCompanyName,
  smeInvestmentLimits,
  subscriptionTimes,
} from '@equitywise/core';
import {
  countIposByStatus,
  countSebiFilingsSince,
  type FeedHealthRow,
  feedHealth,
  firstGmpObservedAt,
  type GmpSnapshotRow,
  getIpoBySlug,
  gmpTrackRows,
  type IpoIssueRow,
  type IpoListRow,
  ipoDetailParts,
  ipoFeedId,
  ipoYearStats,
  type ListingPerformanceRow,
  listIpos,
  listIposAround,
  listIpoYears,
  listIssueDocuments,
  listIssuesWithConflicts,
  listSebiFilings,
  listUnmatchedSourceRecords,
  type RhpExtractRow,
  rhpExtractionCounts,
  type SebiFilingRow,
  type SubscriptionSnapshotRow,
} from '@equitywise/db';
import {
  type CalendarConfig,
  type IpoBoard,
  type IpoDocumentKind,
  type IpoExchange,
  type IpoIssueMethod,
  type IpoSubscriptionCategory,
  istDateKey,
  type SubscriptionScope,
} from '@equitywise/shared';
import { awaitingListing } from '@/lib/ipo-format';
import {
  countByStatus,
  DEFAULT_SORT_DIR,
  listingMonths,
  listingStats,
  sortListItems,
} from '@/lib/ipo-list';
import { boardOf, type IpoScope } from '@/lib/ipo-routes';
import type {
  FactSourceDto,
  GmpChipDto,
  GmpPanelDto,
  GmpPointDto,
  GmpPolicyDto,
  GmpTrackRecordDto,
  GmpTrackRowDto,
  IpoAdminHealthDto,
  IpoAgendaDayDto,
  IpoAllotmentRowDto,
  IpoCalendarDto,
  IpoCalendarPageDto,
  IpoCalendarRowDto,
  IpoDashboardDto,
  IpoDetailDto,
  IpoDocumentLinkDto,
  IpoFeedStatusDto,
  IpoGmpPageDto,
  IpoListItemDto,
  IpoListingsPageDto,
  IpoListPageDto,
  IpoPipelinePageDto,
  IposPageDto,
  ListingSummaryDto,
  RhpExtractDto,
  SebiFilingDto,
  SubscriptionPointDto,
  SubscriptionSummaryDto,
  SubscriptionTableDto,
} from '@/lib/ipo-types';
import { getAdminUser, getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';
import { getIpoWebConfig, gmpSource, type IpoWebConfig, sourceName } from './ipo-config';
import type { IpoBoardListQuery, IpoListingsQuery, IpoListQuery } from './ipo-schemas';

/**
 * Read services for `/ipos` (docs/planning/ipos-plan.md §9–10).
 *
 * Everything reads previously persisted data — no source is ever called at
 * request time. Status, stage, expected dates, minimum investment and ratios
 * are DERIVED here from stored official facts on every read, so they cannot
 * go stale. GMP is carried in its own `official: false` objects and is never
 * mixed into an official figure.
 */

export const IPO_DISCLAIMER =
  'For information only — not investment advice. EquityWise does not recommend applying for, or avoiding, any IPO. Figures are as published by the exchanges and may change or be revised; check the timestamp on each. Subscription figures show demand so far, not future performance. Read the Red Herring Prospectus (RHP), especially its Risk Factors, before investing. Past listing gains do not indicate future returns.';

export const GMP_NOTE =
  'Grey-market premium (GMP) is an unofficial, unregulated quote. No exchange or regulator publishes it. EquityWise shows it as reported by a third-party website and does not verify it. It can change sharply or disappear, it is not a forecast of the listing price, and grey-market deals are not enforceable. Past GMP accuracy does not indicate future results.';

const PAGE_SIZE = 25;
const AGENDA_DAYS = 14;
/** A GMP quote older than this is shown as stale. */
const GMP_STALE_MS = 36 * 3_600_000;

async function requireSignedIn(): Promise<void> {
  if ((await getSessionUser()) === null)
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : typeof value === 'string'
      ? new Date(value).toISOString()
      : value.toISOString();

// ---------------------------------------------------------------------------
// Pure mappers (exported for tests)
// ---------------------------------------------------------------------------

export interface MapContext {
  readonly today: string;
  readonly now: Date;
  readonly calendar: CalendarConfig;
  readonly gmp: { readonly name: string; readonly url: string } | null;
  /**
   * The IST day the first GMP quote was stored: before it there is no GMP for
   * any issue, and no source to recover one from (the aggregator's page only
   * carries the last few weeks). Null before any quote is stored.
   */
  readonly gmpSince?: string | null;
}

/** The GMP source as a page states it, with where its coverage begins. */
function gmpPolicyOf(ctx: Pick<MapContext, 'gmp' | 'gmpSince'>): GmpPolicyDto {
  return {
    enabled: ctx.gmp !== null,
    sourceName: ctx.gmp?.name ?? null,
    sourceUrl: ctx.gmp?.url ?? null,
    trackedSince: ctx.gmp === null ? null : (ctx.gmpSince ?? null),
  };
}

function datesOf(row: IpoIssueRow) {
  return {
    openDate: row.openDate,
    closeDate: row.closeDate,
    listingDate: row.listingDate,
    lifecycleOverride: (row.lifecycleOverride as 'withdrawn' | 'postponed' | null) ?? null,
  };
}

function issueSize(row: IpoIssueRow) {
  return issueSizePaise(
    {
      fresh:
        row.freshIssuePaise === null && row.freshIssueShares === null
          ? null
          : { paise: row.freshIssuePaise, shares: row.freshIssueShares },
      offerForSale:
        row.ofsPaise === null && row.ofsShares === null
          ? null
          : { paise: row.ofsPaise, shares: row.ofsShares },
      total: null,
      marketMakerShares: null,
      anchorShares: null,
      employeeReservation: null,
    },
    row.priceBandHighPaise,
  );
}

function summaryFromJson(
  total: IpoListRow['subscriptionTotal'],
  retail: IpoListRow['subscriptionRetail'],
): SubscriptionSummaryDto | null {
  if (total === null) return null;
  return {
    scope: total.scope,
    asOf: new Date(total.asOf).toISOString(),
    totalTimes: subscriptionTimes(total.sharesBid, total.sharesOffered),
    // Only compare retail within the same scope as the total.
    retailTimes:
      retail !== null && retail.scope === total.scope
        ? subscriptionTimes(retail.sharesBid, retail.sharesOffered)
        : null,
  };
}

export function toListing(
  l: {
    exchange: IpoExchange;
    listingDate: string;
    issuePricePaise: number;
    listingOpenPaise: number;
    listingClosePaise: number;
    latestClosePaise: number | null;
    latestCloseDate: string | null;
  } | null,
): ListingSummaryDto | null {
  if (l === null) return null;
  return {
    exchange: l.exchange,
    listingDate: l.listingDate,
    issuePricePaise: l.issuePricePaise,
    listingOpenPaise: l.listingOpenPaise,
    listingGainPercent: percentChange(l.issuePricePaise, l.listingOpenPaise),
    listingClosePaise: l.listingClosePaise,
    listingDayChangePercent: percentChange(l.issuePricePaise, l.listingClosePaise),
    latestClosePaise: l.latestClosePaise,
    latestCloseDate: l.latestCloseDate,
    sinceIssuePercent: percentChange(l.issuePricePaise, l.latestClosePaise),
  };
}

export function toGmpChip(
  latest: IpoListRow['latestGmp'],
  bandHighPaise: number | null,
  ctx: Pick<MapContext, 'now' | 'gmp'>,
): GmpChipDto | null {
  if (latest === null || ctx.gmp === null) return null;
  const observedAt = new Date(latest.observedAt);
  return {
    official: false,
    latestPaise: latest.gmpPaise,
    percentOfUpperBand: gmpPercent(latest.gmpPaise, bandHighPaise),
    observedAt: observedAt.toISOString(),
    sourceName: ctx.gmp.name,
    sourceUrl: latest.sourceUrl,
    stale: ctx.now.getTime() - observedAt.getTime() > GMP_STALE_MS,
  };
}

export function toListItem(row: IpoListRow, ctx: MapContext): IpoListItemDto {
  const dates = datesOf(row);
  const status = ipoStatus(dates, ctx.today);
  const size = issueSize(row);
  // An expected date that has long passed with no listing is not shown at all.
  const expectedListing =
    row.listingDate === null &&
    row.closeDate !== null &&
    row.lifecycleOverride === null &&
    !listingUnconfirmed(dates, ctx.today, ctx.calendar)
      ? expectedTimeline(row.closeDate, ctx.calendar).listing
      : null;
  const minLots = minApplicationLots(row.board as IpoBoard, row.openDate);
  return {
    slug: row.slug,
    companyName: readableCompanyName(row.companyName),
    board: row.board as IpoBoard,
    status,
    closedStage: closedStage(
      { ...dates, allotmentDate: row.allotmentDate },
      ctx.today,
      ctx.calendar,
    ),
    exchanges: row.exchanges as IpoExchange[],
    nseSymbol: row.nseSymbol,
    openDate: row.openDate,
    closeDate: row.closeDate,
    listingDate: row.listingDate,
    expectedListingDate: expectedListing,
    upiCutoffAt: iso(row.upiCutoffAt),
    priceBand:
      row.priceBandLowPaise !== null && row.priceBandHighPaise !== null
        ? { lowPaise: row.priceBandLowPaise, highPaise: row.priceBandHighPaise }
        : null,
    issuePricePaise: row.issuePricePaise,
    lotSize: row.lotSize,
    minApplicationLots: minLots,
    minInvestmentPaise: minInvestmentPaise({
      lotSize: row.lotSize,
      minBidQuantity: row.minBidQuantity,
      priceBandHighPaise: row.priceBandHighPaise,
      issuePricePaise: row.issuePricePaise,
      minLots,
    }),
    issueSizePaise: size?.totalPaise ?? null,
    issueSizeBasis: size?.basis ?? null,
    subscription: summaryFromJson(row.subscriptionTotal, row.subscriptionRetail),
    gmp: toGmpChip(row.latestGmp, row.priceBandHighPaise, ctx),
    listing: toListing(row.listing),
  };
}

/** Milestones of `issues` that fall in [from, to], grouped by day. */
export function buildAgenda(
  issues: readonly IpoIssueRow[],
  from: string,
  to: string,
  ctx: Pick<MapContext, 'today' | 'calendar'>,
): IpoAgendaDayDto[] {
  const days = new Map<string, IpoAgendaDayDto['events'][number][]>();
  for (const issue of issues) {
    const events = ipoTimeline(
      {
        ...datesOf(issue),
        allotmentDate: issue.allotmentDate,
        refundDate: issue.refundDate,
        dematCreditDate: issue.dematCreditDate,
      },
      ctx.today,
      ctx.calendar,
    );
    for (const event of events) {
      if (event.date < from || event.date > to) continue;
      // Refunds share the demat-credit day; one chip is enough.
      if (event.kind === 'refunds') continue;
      const list = days.get(event.date) ?? [];
      list.push({
        slug: issue.slug,
        companyName: readableCompanyName(issue.companyName),
        board: issue.board as IpoBoard,
        kind: event.kind,
        expected: event.expected,
      });
      days.set(event.date, list);
    }
  }
  const order = ['opens', 'closes', 'allotment', 'demat_credit', 'listing'];
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({
      date,
      events: events.sort(
        (a, b) =>
          order.indexOf(a.kind) - order.indexOf(b.kind) ||
          a.companyName.localeCompare(b.companyName),
      ),
    }));
}

/** How old each feed may get before the page calls it stale (weekend gaps included). */
const FEED_STALE_HOURS: Readonly<Record<string, number>> = {
  calendar: 40,
  detail: 40,
  subscription: 80,
  listing: 80,
  gmp: 30,
  rhp: 60,
  filings: 60,
};

const FEED_LABELS: Readonly<Record<string, string>> = {
  calendar: 'issue calendar',
  detail: 'issue details',
  subscription: 'subscription',
  listing: 'listing prices',
  gmp: 'GMP (unofficial)',
  rhp: 'RHP extracts',
  filings: 'DRHP filings',
};

/** How many of SEBI's latest filings the list page shows. */
const FILINGS_SHOWN = 10;

export function toFiling(row: SebiFilingRow): SebiFilingDto {
  return {
    sebiId: row.sebiId,
    companyName: readableCompanyName(row.companyName),
    documentLabel: row.documentLabel,
    filedDate: row.filedDate,
    pageUrl: row.pageUrl,
    abridgedUrl: row.abridgedUrl,
    slug: row.slug,
  };
}

const RHP_SECTIONS = new Set<string>([
  'overview',
  'promoters',
  'objects',
  'strengths',
  'risks',
  'financials',
]);
const isRhpSection = (s: string): s is RhpExtractDto['section'] => RHP_SECTIONS.has(s);

/** A stored RHP extract, as quoted on the detail page. Unknown sections are dropped. */
export function toRhpExtract(row: RhpExtractRow): RhpExtractDto[] {
  if (!isRhpSection(row.section)) return [];
  return [
    {
      section: row.section,
      title: row.title,
      text: row.body,
      items: row.items,
      table: row.table,
      pageFrom: row.pageFrom,
      pageTo: row.pageTo,
      documentUrl: row.documentUrl,
      extractedAt: row.extractedAt.toISOString(),
    },
  ];
}

/** An issue's extracts minus the sections `ipo-rhp-overrides.yaml` hides. */
export function visibleRhp(
  rows: readonly RhpExtractRow[],
  hidden: ReadonlySet<string> | undefined,
): RhpExtractDto[] {
  return rows.flatMap(toRhpExtract).filter((e) => !(hidden?.has(e.section) ?? false));
}

export function feedIdsFor(config: IpoWebConfig): { id: string; source: string; feed: string }[] {
  const out: { id: string; source: string; feed: string }[] = [];
  for (const [source, s] of Object.entries(config.sources)) {
    if (!s.enabled) continue;
    const feeds = Array.isArray(s.feeds) ? (s.feeds as string[]) : [];
    for (const feed of feeds)
      if (feed !== 'past') out.push({ id: ipoFeedId(source, feed), source, feed });
  }
  return out;
}

export function toFeedStatuses(
  feeds: readonly { id: string; source: string; feed: string }[],
  health: ReadonlyMap<string, FeedHealthRow>,
  now: Date,
  config: IpoWebConfig,
): IpoFeedStatusDto[] {
  return feeds.map(({ id, source, feed }) => {
    const row = health.get(id);
    const latest = row?.latest ?? null;
    const success = row?.lastSuccess ?? null;
    const hours = FEED_STALE_HOURS[feed] ?? 48;
    const status =
      latest === null
        ? 'empty'
        : !latest.succeeded
          ? 'failed'
          : success !== null && now.getTime() - success.completedAt.getTime() > hours * 3_600_000
            ? 'stale'
            : 'fresh';
    return {
      id,
      label: `${sourceName(config, source)} ${FEED_LABELS[feed] ?? feed}`,
      status,
      lastSuccessAt: success?.completedAt.toISOString() ?? null,
      lastAttemptAt: latest?.completedAt.toISOString() ?? null,
      error: latest !== null && !latest.succeeded ? latest.error : null,
    };
  });
}

function tableFrom(rows: readonly SubscriptionSnapshotRow[]): SubscriptionTableDto | null {
  const first = rows[0];
  if (first === undefined) return null;
  const order: IpoSubscriptionCategory[] = [
    'qib',
    'nii',
    'nii_big',
    'nii_small',
    'retail',
    'employee',
    'shareholder',
    'policyholder',
    'other',
    'total',
  ];
  return {
    source: first.source,
    scope: first.scope as SubscriptionScope,
    asOf: first.asOf.toISOString(),
    asOfBasis: first.asOfBasis as 'stated' | 'fetched',
    rows: [...rows]
      .sort(
        (a, b) =>
          order.indexOf(a.category as IpoSubscriptionCategory) -
          order.indexOf(b.category as IpoSubscriptionCategory),
      )
      .map((r) => ({
        category: r.category as IpoSubscriptionCategory,
        label: r.categoryLabel,
        sharesOffered: r.sharesOffered,
        sharesBid: r.sharesBid,
        times: subscriptionTimes(r.sharesBid, r.sharesOffered),
      })),
  };
}

/** The latest snapshot for a scope, and the per-day history of the broadest scope. */
/**
 * The table to show and the per-day history. Snapshots are grouped by source,
 * scope and time — two exchanges' figures are never merged into one table.
 * The broadest scope wins (consolidated, then the designated exchange's own,
 * then any); among equal scopes the designated exchange's source is preferred.
 */
export function subscriptionViews(
  snapshots: readonly SubscriptionSnapshotRow[],
  preferredSource: string | null = null,
): {
  table: SubscriptionTableDto | null;
  nseOnly: SubscriptionTableDto | null;
  history: SubscriptionPointDto[];
} {
  const groups = new Map<string, SubscriptionSnapshotRow[]>();
  for (const s of snapshots) {
    const key = `${s.source}|${s.scope}|${s.asOf.toISOString()}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const series = (source: string, scope: string) =>
    [...groups.entries()]
      .filter(([k]) => k.startsWith(`${source}|${scope}|`))
      .sort(([a], [b]) => a.localeCompare(b));
  const sources = [...new Set(snapshots.map((s) => s.source))].sort(
    (a, b) => Number(b === preferredSource) - Number(a === preferredSource) || a.localeCompare(b),
  );
  const pick = (scopes: readonly string[]) => {
    for (const scope of scopes)
      for (const source of sources) {
        const list = series(source, scope);
        if (list.length > 0) return { source, scope, list };
      }
    return null;
  };
  const chosen = pick(['consolidated', 'nse', 'bse']);
  const nse = series('nse', 'nse');
  const times = (rows: readonly SubscriptionSnapshotRow[], category: string) => {
    const r = rows.find((x) => x.category === category);
    return r === undefined ? null : subscriptionTimes(r.sharesBid, r.sharesOffered);
  };
  // One point per IST day: the last snapshot of each day.
  const perDay = new Map<string, { asOf: string; rows: SubscriptionSnapshotRow[] }>();
  for (const [key, rows] of chosen?.list ?? []) {
    const asOf = key.slice(key.lastIndexOf('|') + 1);
    perDay.set(istDateKey(new Date(asOf)), { asOf, rows });
  }
  const history = [...perDay.values()].map(({ asOf, rows }) => ({
    asOf,
    totalTimes: times(rows, 'total'),
    retailTimes: times(rows, 'retail'),
    qibTimes: times(rows, 'qib'),
    niiTimes: times(rows, 'nii'),
  }));
  const last = chosen?.list.at(-1);
  return {
    table: last === undefined ? null : tableFrom(last[1]),
    nseOnly:
      chosen?.scope === 'consolidated' && nse.length > 0 ? tableFrom(nse.at(-1)?.[1] ?? []) : null,
    history,
  };
}

export function toGmpPanel(
  snapshots: readonly GmpSnapshotRow[],
  bandHighPaise: number | null,
  ctx: Pick<MapContext, 'now' | 'gmp' | 'gmpSince'>,
  closeDate: string | null = null,
): GmpPanelDto {
  if (ctx.gmp === null)
    return { official: false, available: false, reason: 'source_disabled', sourceName: null };
  if (snapshots.length === 0) {
    // Bidding ended before EquityWise stored its first quote: not "unreported".
    const before =
      closeDate !== null &&
      ctx.gmpSince !== undefined &&
      ctx.gmpSince !== null &&
      closeDate < ctx.gmpSince;
    return {
      official: false,
      available: false,
      reason: before ? 'before_tracking' : 'not_tracked',
      sourceName: ctx.gmp.name,
    };
  }
  const latest = snapshots.at(-1) as GmpSnapshotRow;
  if (latest.gmpPaise === null && snapshots.every((s) => s.gmpPaise === null))
    return { official: false, available: false, reason: 'no_quote', sourceName: ctx.gmp.name };
  const history: GmpPointDto[] = snapshots.map((s) => ({
    observedAt: s.observedAt.toISOString(),
    gmpPaise: s.gmpPaise,
    percentOfUpperBand: gmpPercent(s.gmpPaise, bandHighPaise),
  }));
  return {
    official: false,
    available: true,
    sourceName: ctx.gmp.name,
    sourceUrl: latest.sourceUrl,
    latestPaise: latest.gmpPaise,
    percentOfUpperBand: gmpPercent(latest.gmpPaise, bandHighPaise),
    rangeLowPaise: latest.rangeLowPaise,
    rangeHighPaise: latest.rangeHighPaise,
    observedAt: latest.observedAt.toISOString(),
    stale: ctx.now.getTime() - latest.observedAt.getTime() > GMP_STALE_MS,
    history,
  };
}

export function toTrackRecord(
  rows: readonly {
    slug: string;
    companyName: string;
    board: IpoBoard;
    listingDate: string;
    priceBandHighPaise: number | null;
    issuePricePaise: number;
    listingOpenPaise: number;
    lastGmpPaise: number;
  }[],
  months: number,
  thisSlug: string | null,
  board: IpoBoard | null = null,
  since: string | null = null,
): GmpTrackRecordDto {
  const boardOf = new Map(rows.map((r) => [r.slug, r.board]));
  const inputs = rows.flatMap((r) => {
    const gmp = gmpPercent(r.lastGmpPaise, r.priceBandHighPaise ?? r.issuePricePaise);
    const gain = percentChange(r.issuePricePaise, r.listingOpenPaise);
    return gmp === null || gain === null
      ? []
      : [
          {
            slug: r.slug,
            companyName: readableCompanyName(r.companyName),
            listingDate: r.listingDate,
            lastGmpPercent: gmp,
            listingGainPercent: gain,
          },
        ];
  });
  const record = gmpTrackRecord(inputs);
  const out: GmpTrackRowDto[] = record.rows.map((r) => ({
    ...r,
    board: boardOf.get(r.slug) ?? 'mainboard',
  }));
  return {
    official: false,
    months,
    board,
    since,
    tolerancePoints: record.tolerancePoints,
    total: record.total,
    within: record.within,
    gmpAbove: record.gmpAbove,
    gmpBelow: record.gmpBelow,
    rows: out,
    thisIssue: thisSlug === null ? null : (out.find((r) => r.slug === thisSlug) ?? null),
  };
}

// ---------------------------------------------------------------------------
// Dashboard building blocks (pure, exported for tests)
// ---------------------------------------------------------------------------

/** From `today` through the `n`th settlement day counting today, if it is one. */
export function nextSettlementDays(
  today: string,
  n: number,
  calendar: CalendarConfig,
): { from: string; to: string } {
  let count = isSettlementDay(today, calendar) ? 1 : 0;
  let to = today;
  for (let guard = 0; count < n && guard < 60; guard += 1) {
    to = addDays(to, 1);
    if (isSettlementDay(to, calendar)) count += 1;
  }
  return { from: today, to };
}

/** Unlisted issues with a GMP quote, highest premium first. Quotes never mix with official figures. */
export function dashboardGmp(rows: readonly IpoListItemDto[], limit = 8): IpoListItemDto[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      if (seen.has(r.slug) || r.status === 'listed' || r.gmp?.latestPaise == null) return false;
      seen.add(r.slug);
      return r.status === 'open' || r.status === 'upcoming' || awaitingListing(r);
    })
    .sort(
      (a, b) =>
        (b.gmp?.percentOfUpperBand ?? Number.NEGATIVE_INFINITY) -
        (a.gmp?.percentOfUpperBand ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, limit);
}

/** A closed issue's allotment day and its registrar's own page. */
export function toAllotmentRow(
  row: Pick<
    IpoIssueRow,
    'slug' | 'companyName' | 'closeDate' | 'allotmentDate' | 'listingDate' | 'registrarName'
  >,
  config: Pick<IpoWebConfig, 'calendar' | 'registrars'>,
): IpoAllotmentRowDto | null {
  if (row.closeDate === null) return null;
  const expected = expectedTimeline(row.closeDate, config.calendar);
  const registrar =
    row.registrarName === null
      ? undefined
      : config.registrars.find((r) => r.pattern.test(row.registrarName ?? ''));
  return {
    slug: row.slug,
    companyName: readableCompanyName(row.companyName),
    allotmentDate: row.allotmentDate ?? expected.allotment,
    allotmentExpected: row.allotmentDate === null,
    listingDate: row.listingDate ?? expected.listing,
    listingExpected: row.listingDate === null,
    registrarName: row.registrarName,
    registrarUrl: registrar?.allotmentUrl ?? null,
  };
}

function filingsEnabled(config: IpoWebConfig): boolean {
  return Object.values(config.sources).some(
    (s) =>
      s.enabled && s.kind === 'regulator' && Array.isArray(s.feeds) && s.feeds.includes('filings'),
  );
}

/** The year from an IST date key. */
const yearOf = (dateKey: string) => Number(dateKey.slice(0, 4));

/**
 * Offer documents of issues still ahead: the RHP (a fixed-price issue's
 * Prospectus), else the DRHP — linked where the exchange hosts them.
 */
async function offerDocuments(
  db: ReturnType<typeof getDatabase>,
  ahead: readonly IpoListRow[],
): Promise<IpoDocumentLinkDto[]> {
  const docs = await listIssueDocuments(
    db,
    ahead.map((r) => r.id),
    ['rhp', 'prospectus', 'drhp'],
  );
  return ahead.flatMap((r) => {
    const own = docs.filter((d) => d.ipoId === r.id);
    const doc =
      own.find((d) => d.kind === 'rhp') ??
      own.find((d) => d.kind === 'prospectus') ??
      own.find((d) => d.kind === 'drhp');
    return doc === undefined
      ? []
      : [
          {
            slug: r.slug,
            companyName: readableCompanyName(r.companyName),
            kind: doc.kind as IpoDocumentKind,
            url: doc.url,
            host: hostOf(doc.url),
            sectionsQuoted: doc.sectionsQuoted,
          },
        ];
  });
}

/** The feed statuses and the calendar feed's last success, as every IPO page shows them. */
async function feedState(
  db: ReturnType<typeof getDatabase>,
  config: IpoWebConfig,
  now: Date,
): Promise<{ feeds: IpoFeedStatusDto[]; asOf: string | null }> {
  const ids = feedIdsFor(config);
  const health = await feedHealth(
    db,
    ids.map((f) => f.id),
  );
  const feeds = toFeedStatuses(ids, health, now, config);
  return { feeds, asOf: feeds.find((f) => f.id.endsWith('-calendar'))?.lastSuccessAt ?? null };
}

// ---------------------------------------------------------------------------
// Calendar (pure, exported for tests)
// ---------------------------------------------------------------------------

/** The Monday of the week holding `dateKey`. */
export function mondayOf(dateKey: string): string {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return addDays(dateKey, weekday === 0 ? -6 : 1 - weekday);
}

/**
 * The calendar's window: three weeks, Monday to Friday, starting the week
 * before the current one (so the issues that just closed are still in view),
 * or the week holding `from` when one is asked for. On a weekend the current
 * week is the one about to start.
 */
export function calendarWindow(today: string, from?: string): { from: string; to: string } {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const current = weekday === 0 || weekday === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
  const start = from === undefined ? addDays(current, -7) : mondayOf(from);
  return { from: start, to: addDays(start, 18) };
}

/** Weekdays in [from, to], each marked whether the exchange trades that day. */
export function calendarDays(
  from: string,
  to: string,
  calendar: CalendarConfig,
): { date: string; trading: boolean }[] {
  const out: { date: string; trading: boolean }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    out.push({ date: d, trading: isSettlementDay(d, calendar) });
  }
  return out;
}

/**
 * The issues with a milestone in [from, to] — bidding that overlaps the
 * window, or an allotment or listing inside it — each with its bidding window
 * and its allotment and listing days, official or expected (T+3).
 */
export function calendarRows(
  issues: readonly IpoIssueRow[],
  from: string,
  to: string,
  ctx: Pick<MapContext, 'today' | 'calendar'>,
): IpoCalendarRowDto[] {
  const inWindow = (d: string | null) => d !== null && d >= from && d <= to;
  return issues
    .flatMap((issue) => {
      const events = ipoTimeline(
        {
          ...datesOf(issue),
          allotmentDate: issue.allotmentDate,
          refundDate: issue.refundDate,
          dematCreditDate: issue.dematCreditDate,
        },
        ctx.today,
        ctx.calendar,
      );
      const at = (kind: string) => {
        const e = events.find((x) => x.kind === kind);
        return e === undefined ? null : { date: e.date, expected: e.expected };
      };
      const allotment = at('allotment');
      const listing = at('listing');
      const bidding =
        issue.openDate !== null &&
        issue.openDate <= to &&
        (issue.closeDate ?? issue.openDate) >= from;
      if (!bidding && !inWindow(allotment?.date ?? null) && !inWindow(listing?.date ?? null))
        return [];
      return [
        {
          slug: issue.slug,
          companyName: readableCompanyName(issue.companyName),
          board: issue.board as IpoBoard,
          status: ipoStatus(datesOf(issue), ctx.today),
          openDate: issue.openDate,
          closeDate: issue.closeDate,
          allotment,
          listing,
          priceBand:
            issue.priceBandLowPaise !== null && issue.priceBandHighPaise !== null
              ? { lowPaise: issue.priceBandLowPaise, highPaise: issue.priceBandHighPaise }
              : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        (a.openDate ?? '9999').localeCompare(b.openDate ?? '9999') ||
        a.companyName.localeCompare(b.companyName, 'en-IN'),
    );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

async function context(now: Date): Promise<{ ctx: MapContext; config: IpoWebConfig }> {
  const [config, firstGmp] = await Promise.all([
    getIpoWebConfig(now.getTime()),
    firstGmpObservedAt(getDatabase()),
  ]);
  return {
    config,
    ctx: {
      today: istDateKey(now),
      now,
      calendar: config.calendar,
      gmp: gmpSource(config),
      gmpSince: firstGmp === null ? null : istDateKey(firstGmp),
    },
  };
}

/** Which exchanges' issues the page covers, from the enabled official sources. */
export function coverageNote(config: IpoWebConfig): string {
  const on = (id: string) => config.sources[id]?.enabled === true;
  if (on('nse') && on('bse'))
    return 'Covers issues on NSE and BSE, including NSE Emerge and BSE SME.';
  if (on('nse'))
    return 'Covers issues bid on NSE, including NSE Emerge SME. BSE-only SME issues are not yet included.';
  if (on('bse'))
    return 'Covers issues on BSE, including BSE SME. NSE-only issues are not yet included.';
  return 'No exchange source is enabled.';
}

export async function getIposPage(
  query: IpoListQuery,
  now: Date = new Date(),
): Promise<IposPageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const filters = {
    today: ctx.today,
    board: query.board,
    exchange: query.exchange,
    search: query.q,
  };
  const agendaTo = addDays(ctx.today, AGENDA_DAYS - 1);
  const feeds = feedIdsFor(config);
  const filingsOn = filingsEnabled(config);
  const [first, counts, open, around, health, filings] = await Promise.all([
    listIpos(db, { ...filters, status: query.status, page: query.page, pageSize: PAGE_SIZE }),
    countIposByStatus(db, filters),
    listIpos(db, { ...filters, status: 'open', page: 1, pageSize: 50 }),
    listIposAround(db, ctx.today, agendaTo),
    feedHealth(
      db,
      feeds.map((f) => f.id),
    ),
    filingsOn ? listSebiFilings(db, FILINGS_SHOWN) : Promise.resolve([]),
  ]);
  // A page past the end (a stale `?page=` after the filters narrowed) shows the
  // last real page, so the reader never lands on "no IPOs" with no way back.
  const lastPage = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  const page = first.rows.length === 0 && query.page > lastPage ? lastPage : query.page;
  const list =
    page === query.page
      ? first
      : await listIpos(db, { ...filters, status: query.status, page, pageSize: PAGE_SIZE });
  const agenda = buildAgenda(around, ctx.today, agendaTo, ctx);
  const weekEnd = addDays(ctx.today, 6);
  const inWeek = (kind: string) =>
    new Set(
      agenda
        .filter((d) => d.date <= weekEnd)
        .flatMap((d) => d.events.filter((e) => e.kind === kind).map((e) => e.slug)),
    ).size;
  return {
    today: ctx.today,
    filters: {
      status: query.status ?? null,
      board: query.board ?? null,
      exchange: query.exchange ?? null,
      q: query.q ?? '',
    },
    counts,
    highlights: {
      openNow: open.rows.map((r) => toListItem(r, ctx)),
      opensThisWeek: inWeek('opens'),
      closesToday: new Set(
        (agenda.find((d) => d.date === ctx.today)?.events ?? [])
          .filter((e) => e.kind === 'closes')
          .map((e) => e.slug),
      ).size,
      listsThisWeek: inWeek('listing'),
    },
    agenda,
    rows: list.rows.map((r) => toListItem(r, ctx)),
    total: list.total,
    page,
    pageSize: PAGE_SIZE,
    feeds: toFeedStatuses(feeds, health, now, config),
    gmpPolicy: gmpPolicyOf(ctx),
    coverageNote: coverageNote(config),
    filings: filings.map(toFiling),
    disclaimer: IPO_DISCLAIMER,
    gmpNote: GMP_NOTE,
  };
}

/** Rows the Overview reads per status; far more than any board has open at once. */
const DASHBOARD_ROWS = 50;
/** How many months of listings the GMP track record looks back over. */
const GMP_TRACK_MONTHS = 12;
/** The window the "Filed with SEBI" stage counts over. */
const FILED_DAYS = 90;

export async function getIpoDashboard(
  scope: IpoScope,
  now: Date = new Date(),
): Promise<IpoDashboardDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const year = yearOf(ctx.today);
  const board = boardOf(scope);
  const base = { today: ctx.today, board };
  const feeds = feedIdsFor(config);
  const window = nextSettlementDays(ctx.today, 5, config.calendar);
  const gmp = gmpSource(config);
  // SEBI holds mainboard drafts only; SME drafts go to the exchange.
  const filingsOn = scope !== 'sme' && filingsEnabled(config);
  // Grey markets differ by board, so each board's record is read on its own.
  const trackBoards: readonly IpoBoard[] = board === undefined ? ['mainboard', 'sme'] : [board];
  const trackSince = addDays(ctx.today, -Math.round(GMP_TRACK_MONTHS * 30.44));
  const [yearCounts, open, upcoming, closed, listed, around, health, stats, filed, tracks] =
    await Promise.all([
      countIposByStatus(db, { ...base, year }),
      listIpos(db, { ...base, status: 'open', page: 1, pageSize: DASHBOARD_ROWS }),
      listIpos(db, { ...base, status: 'upcoming', page: 1, pageSize: DASHBOARD_ROWS }),
      listIpos(db, { ...base, status: 'closed', page: 1, pageSize: DASHBOARD_ROWS }),
      listIpos(db, { ...base, status: 'listed', page: 1, pageSize: 12 }),
      listIposAround(db, window.from, window.to),
      feedHealth(
        db,
        feeds.map((f) => f.id),
      ),
      ipoYearStats(db, { board, year, today: ctx.today }),
      filingsOn
        ? countSebiFilingsSince(db, addDays(ctx.today, -FILED_DAYS))
        : Promise.resolve(null),
      gmp === null
        ? Promise.resolve([])
        : Promise.all(trackBoards.map((b) => gmpTrackRows(db, trackSince, b))),
    ]);
  const items = (rows: readonly IpoListRow[]) => rows.map((r) => toListItem(r, ctx));
  const openItems = sortListItems(items(open.rows), { key: 'stage', dir: 'asc' });
  const upcomingItems = sortListItems(items(upcoming.rows), { key: 'stage', dir: 'asc' });
  const closedItems = items(closed.rows);
  const listedItems = items(listed.rows);

  const statuses = toFeedStatuses(feeds, health, now, config);
  const gmpTracks = trackBoards.flatMap((b, i) => {
    const rows = tracks[i];
    if (rows === undefined) return [];
    const record = toTrackRecord(rows, GMP_TRACK_MONTHS, null, b, ctx.gmpSince ?? null);
    return [
      {
        board: b,
        official: false as const,
        months: record.months,
        since: record.since,
        tolerancePoints: record.tolerancePoints,
        total: record.total,
        within: record.within,
      },
    ];
  });
  return {
    board: scope,
    today: ctx.today,
    asOf: statuses.find((f) => f.id.endsWith('-calendar'))?.lastSuccessAt ?? null,
    feeds: statuses,
    yearCounts,
    awaitingListing: closedItems.filter(awaitingListing).length,
    yearStats: { year, ...stats },
    filedRecently: filed,
    filedDays: FILED_DAYS,
    open: openItems,
    upcoming: upcomingItems,
    gmp: gmp === null ? [] : dashboardGmp([...openItems, ...upcomingItems, ...closedItems], 5),
    listings: listedItems.filter((i) => i.listing !== null).slice(0, 5),
    agenda: buildAgenda(
      board === undefined ? around : around.filter((r) => r.board === board),
      window.from,
      window.to,
      ctx,
    ),
    allotment: closed.rows
      .flatMap((r, i) => {
        const item = closedItems[i];
        return item !== undefined && awaitingListing(item) ? (toAllotmentRow(r, config) ?? []) : [];
      })
      .slice(0, 8),
    exchangeAllotment: config.exchangeAllotment,
    gmpPolicy: gmpPolicyOf(ctx),
    gmpTracks,
    coverageNote: coverageNote(config),
    disclaimer: IPO_DISCLAIMER,
    gmpNote: GMP_NOTE,
  };
}

const LIST_PAGE_SIZE = 25;
/**
 * The board list reads every issue under its board, year and search filters
 * and sorts and pages them here: several columns (minimum investment, issue
 * size, the GMP's share of the band) are computed in `toListItem`, and the
 * tiles and pill counts need every status anyway. A board-year is under a few
 * hundred issues; this cap is only a backstop.
 */
const LIST_SCAN_LIMIT = 5_000;

export async function getIpoListPage(
  scope: IpoScope,
  query: Omit<IpoBoardListQuery, 'board'>,
  now: Date = new Date(),
): Promise<IpoListPageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const board = boardOf(scope);
  const currentYear = yearOf(ctx.today);
  const year = query.year === 'all' ? undefined : (query.year ?? currentYear);
  const filters = { today: ctx.today, board, year, search: query.q };
  const feeds = feedIdsFor(config);
  const [scan, years, health] = await Promise.all([
    listIpos(db, { ...filters, page: 1, pageSize: LIST_SCAN_LIMIT }),
    listIpoYears(db, board),
    feedHealth(
      db,
      feeds.map((f) => f.id),
    ),
  ]);
  const items = scan.rows.map((r) => toListItem(r, ctx));
  const gmpPolicy = gmpPolicyOf(ctx);
  // A GMP order with the source switched off would sort by a hidden column.
  const key = query.sort === 'gmp' && !gmpPolicy.enabled ? 'stage' : (query.sort ?? 'stage');
  const sort = { key, dir: query.dir ?? DEFAULT_SORT_DIR[key] };
  const matching = sortListItems(
    query.status === undefined ? items : items.filter((r) => r.status === query.status),
    sort,
  );
  // A page past the end shows the last real page, as on the API.
  const lastPage = Math.max(1, Math.ceil(matching.length / LIST_PAGE_SIZE));
  const page = Math.min(query.page, lastPage);
  return {
    board: scope,
    today: ctx.today,
    filters: { status: query.status ?? null, year: year ?? null, q: query.q ?? '' },
    years: [...new Set([currentYear, ...years])].sort((a, b) => b - a),
    counts: countByStatus(items),
    sort,
    rows: matching.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    total: matching.length,
    page,
    pageSize: LIST_PAGE_SIZE,
    feeds: toFeedStatuses(feeds, health, now, config),
    gmpPolicy,
    coverageNote: coverageNote(config),
    disclaimer: IPO_DISCLAIMER,
    gmpNote: GMP_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Section pages: calendar, listings, grey market, pipeline
// ---------------------------------------------------------------------------

export async function getIpoCalendarPage(
  scope: IpoScope,
  from: string | undefined,
  now: Date = new Date(),
): Promise<IpoCalendarPageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const window = calendarWindow(ctx.today, from);
  const board = boardOf(scope);
  const [around, state] = await Promise.all([
    listIposAround(db, window.from, window.to),
    feedState(db, config, now),
  ]);
  const issues = board === undefined ? around : around.filter((r) => r.board === board);
  const rows = calendarRows(issues, window.from, window.to, ctx);
  const allotment = issues
    .flatMap((r) => toAllotmentRow(r, config) ?? [])
    // In the window, and not yet listed: an allotment that matters to someone now.
    .filter(
      (a) =>
        a.allotmentDate !== null &&
        a.allotmentDate >= window.from &&
        a.allotmentDate <= window.to &&
        (a.listingDate === null || a.listingDate >= ctx.today),
    )
    .sort((a, b) => (a.allotmentDate ?? '').localeCompare(b.allotmentDate ?? ''));
  return {
    board: scope,
    today: ctx.today,
    asOf: state.asOf,
    feeds: state.feeds,
    from: window.from,
    to: window.to,
    prevFrom: addDays(window.from, -14),
    nextFrom: addDays(window.from, 14),
    days: calendarDays(window.from, window.to, config.calendar),
    rows,
    agenda: buildAgenda(issues, window.from, window.to, ctx),
    allotment,
    exchangeAllotment: config.exchangeAllotment,
    coverageNote: coverageNote(config),
    disclaimer: IPO_DISCLAIMER,
  };
}

const LISTINGS_PAGE_SIZE = 25;

export async function getIpoListingsPage(
  scope: IpoScope,
  query: Omit<IpoListingsQuery, 'board'>,
  now: Date = new Date(),
): Promise<IpoListingsPageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const board = boardOf(scope);
  const currentYear = yearOf(ctx.today);
  const year = query.year === 'all' ? undefined : (query.year ?? currentYear);
  const [scan, years, state] = await Promise.all([
    listIpos(db, {
      today: ctx.today,
      board,
      year,
      status: 'listed',
      page: 1,
      pageSize: LIST_SCAN_LIMIT,
    }),
    listIpoYears(db, board),
    feedState(db, config, now),
  ]);
  const items = sortListItems(
    scan.rows.map((r) => toListItem(r, ctx)),
    { key: 'stage', dir: 'asc' },
  );
  const lastPage = Math.max(1, Math.ceil(items.length / LISTINGS_PAGE_SIZE));
  const page = Math.min(query.page, lastPage);
  return {
    board: scope,
    today: ctx.today,
    feeds: state.feeds,
    year: year ?? null,
    years: [...new Set([currentYear, ...years])].sort((a, b) => b - a),
    stats: listingStats(items),
    months: listingMonths(items),
    rows: items.slice((page - 1) * LISTINGS_PAGE_SIZE, page * LISTINGS_PAGE_SIZE),
    total: items.length,
    page,
    pageSize: LISTINGS_PAGE_SIZE,
    coverageNote: coverageNote(config),
    disclaimer: IPO_DISCLAIMER,
  };
}

export async function getIpoGmpPage(
  scope: IpoScope,
  now: Date = new Date(),
): Promise<IpoGmpPageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const board = boardOf(scope);
  const base = { today: ctx.today, board };
  const gmp = gmpSource(config);
  const trackBoards: readonly IpoBoard[] = board === undefined ? ['mainboard', 'sme'] : [board];
  const trackSince = addDays(ctx.today, -Math.round(GMP_TRACK_MONTHS * 30.44));
  const [open, upcoming, closed, tracks, state] = await Promise.all([
    listIpos(db, { ...base, status: 'open', page: 1, pageSize: DASHBOARD_ROWS }),
    listIpos(db, { ...base, status: 'upcoming', page: 1, pageSize: DASHBOARD_ROWS }),
    listIpos(db, { ...base, status: 'closed', page: 1, pageSize: DASHBOARD_ROWS }),
    gmp === null
      ? Promise.resolve([])
      : Promise.all(trackBoards.map((b) => gmpTrackRows(db, trackSince, b))),
    feedState(db, config, now),
  ]);
  const items = (rows: readonly IpoListRow[]) => rows.map((r) => toListItem(r, ctx));
  return {
    board: scope,
    today: ctx.today,
    feeds: state.feeds,
    gmpPolicy: gmpPolicyOf(ctx),
    quotes:
      gmp === null
        ? []
        : dashboardGmp([...items(open.rows), ...items(upcoming.rows), ...items(closed.rows)], 100),
    tracks: trackBoards.flatMap((b, i) => {
      const rows = tracks[i];
      return rows === undefined
        ? []
        : [toTrackRecord(rows, GMP_TRACK_MONTHS, null, b, ctx.gmpSince ?? null)];
    }),
    gmpNote: GMP_NOTE,
    disclaimer: IPO_DISCLAIMER,
  };
}

/** How many SEBI filings the pipeline lists. */
const PIPELINE_FILINGS = 30;

export async function getIpoPipelinePage(
  scope: IpoScope,
  now: Date = new Date(),
): Promise<IpoPipelinePageDto> {
  await requireSignedIn();
  const db = getDatabase();
  const { ctx, config } = await context(now);
  const board = boardOf(scope);
  const base = { today: ctx.today, board };
  const filingsOn = scope !== 'sme' && filingsEnabled(config);
  const [open, upcoming, filings, filed, state] = await Promise.all([
    listIpos(db, { ...base, status: 'open', page: 1, pageSize: DASHBOARD_ROWS }),
    listIpos(db, { ...base, status: 'upcoming', page: 1, pageSize: DASHBOARD_ROWS }),
    filingsOn ? listSebiFilings(db, PIPELINE_FILINGS) : Promise.resolve([]),
    filingsOn ? countSebiFilingsSince(db, addDays(ctx.today, -FILED_DAYS)) : Promise.resolve(null),
    feedState(db, config, now),
  ]);
  return {
    board: scope,
    today: ctx.today,
    feeds: state.feeds,
    filingsOn,
    filedRecently: filed,
    filedDays: FILED_DAYS,
    filings: filings.map(toFiling),
    undated: upcoming.rows.map((r) => toListItem(r, ctx)).filter((r) => r.openDate === null),
    documents: await offerDocuments(db, [...open.rows, ...upcoming.rows]),
    coverageNote: coverageNote(config),
    disclaimer: IPO_DISCLAIMER,
  };
}

export async function getIpoCalendar(
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<IpoCalendarDto> {
  await requireSignedIn();
  const { ctx } = await context(now);
  const issues = await listIposAround(getDatabase(), from, to);
  return { from, to, days: buildAgenda(issues, from, to, ctx) };
}

export async function getGmpTrackRecord(
  input: { months: number; board?: IpoBoard | undefined },
  now: Date = new Date(),
): Promise<GmpTrackRecordDto> {
  await requireSignedIn();
  const { ctx } = await context(now);
  const since = addDays(istDateKey(now), -Math.round(input.months * 30.44));
  const rows = await gmpTrackRows(getDatabase(), since, input.board);
  return toTrackRecord(rows, input.months, null, input.board ?? null, ctx.gmpSince ?? null);
}

function factSources(row: IpoIssueRow, config: IpoWebConfig): Record<string, FactSourceDto> {
  const out: Record<string, FactSourceDto> = {};
  for (const [field, s] of Object.entries(row.fieldSources ?? {}))
    out[field] = { ...s, sourceName: sourceName(config, s.source) };
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function getIpoDetail(slug: string, now: Date = new Date()): Promise<IpoDetailDto> {
  await requireSignedIn();
  const db = getDatabase();
  const row = await getIpoBySlug(db, slug);
  if (row === null)
    throw new MarketDataError('IPO not found.', {
      code: 'NOT_FOUND',
      status: 404,
      remedy: 'Check the address, or find the issue from the IPOs page.',
    });
  const { ctx, config } = await context(now);
  const [parts, trackRows] = await Promise.all([
    ipoDetailParts(db, row.id),
    // The same board only: SME and mainboard grey markets behave differently.
    gmpTrackRows(db, addDays(ctx.today, -365), row.board as IpoBoard),
  ]);
  const listing: ListingPerformanceRow | undefined =
    parts.listing.find((l) => l.exchange === row.designatedExchange) ?? parts.listing[0];
  const lastGmp = parts.gmp.at(-1);
  const base = toListItem(
    {
      ...row,
      subscriptionTotal: null,
      subscriptionRetail: null,
      latestGmp:
        lastGmp === undefined
          ? null
          : {
              source: lastGmp.source,
              gmpPaise: lastGmp.gmpPaise,
              observedAt: lastGmp.observedAt.toISOString(),
              sourceUrl: lastGmp.sourceUrl,
            },
      listing:
        listing === undefined
          ? null
          : {
              exchange: listing.exchange as IpoExchange,
              listingDate: listing.listingDate,
              issuePricePaise: listing.issuePricePaise,
              listingOpenPaise: listing.listingOpenPaise,
              listingClosePaise: listing.listingClosePaise,
              latestClosePaise: listing.latestClosePaise,
              latestCloseDate: listing.latestCloseDate,
            },
    },
    ctx,
  );
  const subs = subscriptionViews(
    parts.subscriptions,
    row.designatedExchange === 'BSE' ? 'bse' : row.designatedExchange === 'NSE' ? 'nse' : null,
  );
  const total = subs.table?.rows.find((r) => r.category === 'total');
  const retail = subs.table?.rows.find((r) => r.category === 'retail');
  const size = issueSize(row);
  const registrar =
    row.registrarName === null
      ? null
      : config.registrars.find((r) => r.pattern.test(row.registrarName ?? ''));

  return {
    ...base,
    subscription:
      subs.table === null
        ? null
        : {
            scope: subs.table.scope,
            asOf: subs.table.asOf,
            totalTimes: total?.times ?? null,
            retailTimes: retail?.times ?? null,
          },
    isin: row.isin,
    bseScripCode: row.bseScripCode,
    designatedExchange: (row.designatedExchange as IpoExchange | null) ?? null,
    issueMethod: (row.issueMethod as IpoIssueMethod | null) ?? null,
    faceValuePaise: row.faceValuePaise,
    minBidQuantity: row.minBidQuantity,
    retailMaxPaise: row.retailMaxPaise,
    maxRetailLots: maxRetailLots(
      {
        lotSize: row.lotSize,
        priceBandHighPaise: row.priceBandHighPaise,
        issuePricePaise: row.issuePricePaise,
      },
      row.retailMaxPaise,
    ),
    investmentLimits:
      row.board === 'mainboard'
        ? investmentLimits(
            {
              lotSize: row.lotSize,
              priceBandHighPaise: row.priceBandHighPaise,
              issuePricePaise: row.issuePricePaise,
            },
            row.retailMaxPaise ?? undefined,
          )
        : smeInvestmentLimits(
            {
              lotSize: row.lotSize,
              priceBandHighPaise: row.priceBandHighPaise,
              issuePricePaise: row.issuePricePaise,
            },
            minApplicationLots('sme', row.openDate),
          ),
    employeeDiscountPaise: row.employeeDiscountPaise,
    sharesOffered: row.sharesOffered,
    issueSize: {
      text: row.issueSizeText,
      totalPaise: size?.totalPaise ?? null,
      basis: size?.basis ?? null,
      freshPaise: size?.freshPaise ?? row.freshIssuePaise,
      freshShares: row.freshIssueShares,
      offerForSalePaise: size?.offerForSalePaise ?? row.ofsPaise,
      offerForSaleShares: row.ofsShares,
      marketMakerShares: row.marketMakerShares,
      anchorShares: row.anchorShares,
    },
    registrar:
      row.registrarName === null
        ? null
        : {
            name: row.registrarName,
            contact: row.registrarContact,
            allotmentUrl: registrar?.allotmentUrl ?? null,
            allotmentChecked: registrar?.checked ?? null,
          },
    exchangeAllotment: config.exchangeAllotment,
    leadManagers: row.leadManagers,
    sponsorBanks: row.sponsorBanks,
    marketMaker: row.marketMaker,
    timeline: ipoTimeline(
      {
        ...datesOf(row),
        allotmentDate: row.allotmentDate,
        refundDate: row.refundDate,
        dematCreditDate: row.dematCreditDate,
      },
      ctx.today,
      ctx.calendar,
    ),
    subscriptionTable: subs.table,
    subscriptionNseOnly: subs.nseOnly,
    subscriptionHistory: subs.history,
    documents: parts.documents.map((d) => ({
      kind: d.kind as IpoDocumentKind,
      title: d.title,
      url: d.url,
      host: hostOf(d.url),
    })),
    rhp: visibleRhp(parts.rhp, config.rhpHidden.get(row.slug)),
    rhpReadFrom: config.rhpSince,
    filings: parts.filings.map(toFiling),
    gmpPanel: toGmpPanel(parts.gmp, row.priceBandHighPaise, ctx, row.closeDate),
    gmpTrackRecord: toTrackRecord(
      trackRows,
      12,
      row.slug,
      row.board as IpoBoard,
      ctx.gmpSince ?? null,
    ),
    sources: parts.sources.map((s) => ({
      source: s.source,
      sourceName: sourceName(config, s.source),
      feed: s.feed,
      url: s.sourceUrl,
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
    fieldSources: factSources(row, config),
    updatedAt: row.updatedAt.toISOString(),
    disclaimer: IPO_DISCLAIMER,
    gmpNote: GMP_NOTE,
  };
}

export async function getIpoAdminHealth(now: Date = new Date()): Promise<IpoAdminHealthDto> {
  if ((await getAdminUser()) === null)
    throw new MarketDataError('Forbidden.', { code: 'FORBIDDEN', status: 403 });
  const db = getDatabase();
  const config = await getIpoWebConfig(now.getTime());
  const feeds = feedIdsFor(config);
  const [health, unmatched, conflicts, rhp] = await Promise.all([
    feedHealth(
      db,
      feeds.map((f) => f.id),
    ),
    listUnmatchedSourceRecords(db, new Date(now.getTime() - 14 * 86_400_000)),
    listIssuesWithConflicts(db),
    rhpExtractionCounts(db, { version: RHP_EXTRACTOR_VERSION, maxAttempts: config.rhpMaxAttempts }),
  ]);
  return {
    feeds: toFeedStatuses(feeds, health, now, config),
    unmatched: unmatched.map((u) => ({
      source: u.source,
      feed: u.feed,
      externalKey: u.externalKey,
      companyName: typeof u.payload.companyName === 'string' ? u.payload.companyName : null,
      lastSeenAt: u.lastSeenAt.toISOString(),
      sourceUrl: u.sourceUrl,
    })),
    conflicts: conflicts.map((c) => ({
      slug: c.slug,
      companyName: c.companyName,
      fields: Object.entries(c.fieldSources ?? {})
        .filter(([, s]) => s.basis === 'conflict')
        .map(([f]) => f),
    })),
    rhp,
  };
}
