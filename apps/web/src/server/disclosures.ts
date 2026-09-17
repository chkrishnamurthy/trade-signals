import 'server-only';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  attentionScore,
  type DeliveryAnomaly,
  MIN_SESSIONS_FOR_Z,
  officialAnnouncementUrl,
} from '@equitywise/core';
import {
  type AnnouncementRow,
  type AnnouncementStatePatch,
  announcementIngestionHealth,
  announcementStatesForOwner,
  type DealRow,
  type DeliverySnapshotRow,
  dealAggregates,
  deliveryHistory,
  deliverySnapshot,
  derivativeOiHistory,
  type FeedHealthRow,
  type FiiDiiRow,
  FLOW_FEEDS,
  feedHealth,
  getAnnouncements,
  getAnnouncementVersions,
  getInstrumentBySymbol,
  getRecentDeals,
  getRecentFiiDii,
  latestDeliveryDate,
  latestDerivativeOi,
  latestTwoShareholdingForInstruments,
  listAnnouncementCategories,
  listInstrumentsById,
  listOwnerWatchedInstrumentIds,
  type ParticipantOiRow,
  recentParticipantOi,
  type ShareholdingHistoryRow,
  shareholdingHistory,
  updateAnnouncementState,
  watchlistMembershipForOwner,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import {
  type DateRange,
  HIGH_IMPACT_PATTERNS,
  isDateRange,
  rangeSince,
} from '@/lib/announcement-meta';
import type {
  AnnouncementDto,
  AnnouncementsPageDto,
  CashFlowSummaryDto,
  DealDto,
  FeedStatus,
  FeedStatusDto,
  FiiDiiDayDto,
  FreshnessStatus,
  IndexFuturesPositionDto,
  InstitutionalFlowDto,
  MarketTapeDto,
  OiBuildupDto,
  ParticipantOiCellDto,
  ShareholdingDto,
  StockFlowDetailDto,
  StockFlowRowDto,
} from '@/lib/disclosure-types';
import { announcementFilterSchema } from './announcement-schemas';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * Read services for the disclosure pages (`/announcements`, `/flows`).
 *
 * Everything here reads previously-persisted official data — no Fyers call, no
 * scraping at request time. Personalised filters ("names I follow") are scoped
 * to the signed-in user through the owner-scoped watchlist query, so one user
 * can never see another's list membership.
 */

const DISCLAIMER =
  'Official exchange disclosures, shown for information only — not investment advice. Figures are as published by the exchanges.';

const PAGE_SIZE = 25;
/** Data older than this many days reads as stale on the freshness banner. */
const STALE_DAYS = 4;

async function requireOwnerId(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return user.id;
}

function freshnessOf(latest: Date | null, now: Date, count: number): FreshnessStatus {
  if (count === 0 || latest === null) return 'empty';
  const ageDays = (now.getTime() - latest.getTime()) / 86_400_000;
  return ageDays > STALE_DAYS ? 'stale' : 'fresh';
}

// ---------------------------------------------------------------------------
// Corporate announcements
// ---------------------------------------------------------------------------

export interface AnnouncementsInput {
  readonly state?: string | undefined;
  readonly eventStatus?: string | undefined;
  readonly normalizedCategory?: string | undefined;
  readonly source?: string | undefined;
  readonly hasFacts?: boolean;
  readonly watchlistOnly?: boolean;
  readonly categories?: readonly string[];
  readonly page?: number;
  /** Free-text search across symbol, company and headline. */
  readonly search?: string;
  /** One stock's filings only (exchange symbol). */
  readonly symbol?: string;
  /** Relative date window. */
  readonly range?: string;
  /** Keep only high-impact filings (results, dividends, buybacks, …). */
  readonly highImpactOnly?: boolean;
}

export async function getAnnouncementsPage(
  input: AnnouncementsInput = {},
  now: Date = new Date(),
): Promise<AnnouncementsPageDto> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();
  const filters = announcementFilterSchema.safeParse(input);
  if (
    !filters.success ||
    (input.eventStatus && !Object.hasOwn(ANNOUNCEMENT_STATUSES, input.eventStatus)) ||
    (input.normalizedCategory && !Object.hasOwn(ANNOUNCEMENT_CATEGORIES, input.normalizedCategory))
  ) {
    throw new MarketDataError('Invalid announcement filters.', {
      code: 'INVALID_FILTER',
      status: 400,
    });
  }
  const personal = filters.data;
  const page = Number.isSafeInteger(input.page ?? 1)
    ? Math.max(1, Math.min(10000, input.page ?? 1))
    : 1;

  const watched = await listOwnerWatchedInstrumentIds(db, ownerId);
  const watchedSet = new Set(watched);
  const hasWatchlists = watched.length > 0;
  const watchlistOnly = input.watchlistOnly === true;

  const range: DateRange =
    input.range !== undefined && isDateRange(input.range) ? input.range : 'all';
  const since = rangeSince(range, now);
  const search = input.search?.trim() ?? '';
  const symbol = input.symbol?.trim().toUpperCase() ?? '';
  const highImpactOnly = input.highImpactOnly === true;
  const activeCategories =
    input.categories !== undefined && input.categories.length > 0 ? input.categories : [];

  const [result, categories, health] = await Promise.all([
    getAnnouncements(db, {
      ownerId,
      ...(personal.state !== 'all' ? { state: personal.state } : {}),
      ...(personal.eventStatus ? { eventStatus: personal.eventStatus } : {}),
      ...(personal.normalizedCategory ? { normalizedCategory: personal.normalizedCategory } : {}),
      ...(personal.source ? { source: personal.source } : {}),
      ...(personal.hasFacts ? { hasFacts: true } : {}),
      ...(watchlistOnly ? { instrumentIds: watched } : {}),
      ...(symbol !== '' ? { symbols: [symbol] } : {}),
      ...(activeCategories.length > 0 ? { categories: activeCategories } : {}),
      ...(since !== null ? { since } : {}),
      ...(search !== '' ? { search } : {}),
      ...(highImpactOnly ? { matchPatterns: HIGH_IMPACT_PATTERNS } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listAnnouncementCategories(db),
    announcementIngestionHealth(db),
  ]);

  const [states, membership] = await Promise.all([
    announcementStatesForOwner(
      db,
      ownerId,
      result.rows.map((row) => row.id),
    ),
    watchlistMembershipForOwner(
      db,
      ownerId,
      result.rows.flatMap((row) => (row.instrumentId === null ? [] : [row.instrumentId])),
    ),
  ]);
  const statesById = new Map(states.map((row) => [row.announcementId, row]));
  const rows: AnnouncementDto[] = result.rows.map((row: AnnouncementRow) => ({
    id: row.id,
    interpretation:
      officialAnnouncementUrl(row.attachmentUrl) === null ? null : (row.interpretation ?? null),
    interpretationChecksum: row.interpretationChecksum ?? null,
    externalId: row.externalId,
    ingestedAt: row.ingestedAt.toISOString(),
    watchlistNames:
      row.instrumentId === null
        ? []
        : (membership.get(row.instrumentId) ?? []).map((item) => item.name),
    userState: {
      read:
        statesById.get(row.id)?.read === true &&
        (statesById.get(row.id)?.readChecksum ?? null) === row.interpretationChecksum,
      saved: statesById.get(row.id)?.saved ?? false,
      dismissed: statesById.get(row.id)?.dismissed ?? false,
      issueReported: statesById.get(row.id)?.issueReported ?? false,
    },
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    companyName: row.companyName,
    category: row.category,
    headline: row.headline,
    detail: row.detail,
    attachmentUrl: officialAnnouncementUrl(row.attachmentUrl),
    announcedAt: row.announcedAt.toISOString(),
    source: row.source,
    onWatchlist: row.instrumentId !== null && watchedSet.has(row.instrumentId),
  }));

  const latestAt = result.rows[0]?.announcedAt ?? null;

  return {
    coverage: {
      latestAttempt: health.latest?.completedAt.toISOString() ?? null,
      lastSuccess: health.successful?.completedAt.toISOString() ?? null,
      failed: health.latest?.succeeded === false,
      stale:
        health.successful === null ||
        now.getTime() - health.successful.completedAt.getTime() > 24 * 60 * 60_000,
    },
    personalFilters: {
      state: personal.state,
      eventStatus: personal.eventStatus ?? '',
      normalizedCategory: personal.normalizedCategory ?? '',
      source: personal.source ?? '',
      hasFacts: personal.hasFacts ?? false,
    },
    rows,
    total: result.total,
    page,
    pageSize: PAGE_SIZE,
    categories,
    latestAt: latestAt === null ? null : latestAt.toISOString(),
    status: freshnessOf(latestAt, now, result.total),
    watchlistOnly,
    hasWatchlists,
    nowIso: now.toISOString(),
    query: {
      search: search === '' ? null : search,
      symbol: symbol === '' ? null : symbol,
      range,
      highImpactOnly,
      categories: activeCategories,
    },
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Institutional flow
// ---------------------------------------------------------------------------

function groupFiiDii(rows: readonly FiiDiiRow[]): FiiDiiDayDto[] {
  const byDate = new Map<string, { fii?: FiiDiiRow; dii?: FiiDiiRow }>();
  for (const row of rows) {
    if (row.segment !== 'cash') continue;
    const entry = byDate.get(row.tradingDate) ?? {};
    if (row.participant === 'fii') entry.fii = row;
    else if (row.participant === 'dii') entry.dii = row;
    byDate.set(row.tradingDate, entry);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([tradingDate, entry]) => ({
      tradingDate,
      fii:
        entry.fii === undefined
          ? null
          : { buy: entry.fii.buyValue, sell: entry.fii.sellValue, net: entry.fii.netValue },
      dii:
        entry.dii === undefined
          ? null
          : { buy: entry.dii.buyValue, sell: entry.dii.sellValue, net: entry.dii.netValue },
    }));
}

/** Today's net, the 5- and 20-session sums, and the series for a sparkline. */
function cashSummary(
  days: readonly FiiDiiDayDto[],
  participant: 'fii' | 'dii',
): CashFlowSummaryDto | null {
  // `days` is newest first.
  const nets = days.flatMap((day) => {
    const side = participant === 'fii' ? day.fii : day.dii;
    return side === null ? [] : [{ date: day.tradingDate, net: side.net }];
  });
  const latest = nets[0];
  if (latest === undefined) return null;
  const sum = (n: number): number => nets.slice(0, n).reduce((acc, p) => acc + p.net, 0);
  return {
    tradingDate: latest.date,
    net: latest.net,
    sum5: sum(5),
    sum20: sum(20),
    series: nets
      .slice(0, 20)
      .map((p) => p.net)
      .reverse(),
  };
}

const PARTICIPANTS = new Set(['fii', 'dii', 'pro', 'client']);
const BUCKETS = new Set(['index_fut', 'stock_fut', 'index_ce', 'index_pe', 'stock_ce', 'stock_pe']);

function isParticipant(value: string): value is ParticipantOiCellDto['participant'] {
  return PARTICIPANTS.has(value);
}
function isBucket(value: string): value is ParticipantOiCellDto['bucket'] {
  return BUCKETS.has(value);
}

/** The tape's positioning figures from the participant-wise OI rows (newest first). */
function participantPositioning(rows: readonly ParticipantOiRow[]): {
  fiiIndexFutures: IndexFuturesPositionDto | null;
  cells: ParticipantOiCellDto[];
  date: string | null;
} {
  const dates = [...new Set(rows.map((r) => r.tradingDate))].sort((a, b) => (a < b ? 1 : -1));
  const latestDate = dates[0] ?? null;
  const previousDate = dates[1] ?? null;
  if (latestDate === null) return { fiiIndexFutures: null, cells: [], date: null };

  const key = (r: { participant: string; bucket: string }): string =>
    `${r.participant}:${r.bucket}`;
  const previous = new Map(
    rows.filter((r) => r.tradingDate === previousDate).map((r) => [key(r), r] as const),
  );
  const cells: ParticipantOiCellDto[] = [];
  for (const row of rows) {
    if (row.tradingDate !== latestDate) continue;
    if (!isParticipant(row.participant) || !isBucket(row.bucket)) continue;
    const prior = previous.get(key(row));
    cells.push({
      participant: row.participant,
      bucket: row.bucket,
      longContracts: row.longContracts,
      shortContracts: row.shortContracts,
      netChange:
        prior === undefined
          ? null
          : row.longContracts - row.shortContracts - (prior.longContracts - prior.shortContracts),
    });
  }

  const fiiSeries = dates
    .map((date) => rows.find((r) => r.tradingDate === date && key(r) === 'fii:index_fut'))
    .flatMap((r) => (r === undefined ? [] : [r.longContracts - r.shortContracts]))
    .reverse();
  const fii = cells.find((c) => c.participant === 'fii' && c.bucket === 'index_fut');
  const book = fii === undefined ? 0 : fii.longContracts + fii.shortContracts;
  return {
    date: latestDate,
    cells,
    fiiIndexFutures:
      fii === undefined
        ? null
        : {
            tradingDate: latestDate,
            longContracts: fii.longContracts,
            shortContracts: fii.shortContracts,
            net: fii.longContracts - fii.shortContracts,
            netChange: fii.netChange,
            longPercent: book === 0 ? 0 : (fii.longContracts / book) * 100,
            series: fiiSeries,
          },
  };
}

/**
 * The core anomaly shape from the repository's trailing aggregates (mean,
 * sample stdev, count) — the same arithmetic `deliveryAnomaly` does over raw
 * samples, without shipping ~20 rows per stock to compute it here.
 */
function deliveryAnomalyFromStats(row: DeliverySnapshotRow): DeliveryAnomaly | null {
  const mean = row.trailingDeliveryPercent;
  if (mean === null) return null;
  const delta = row.deliveryPercent - mean;
  const stdev = row.trailingDeliveryStdev;
  return {
    ratio: mean > 0 ? row.deliveryPercent / mean : null,
    delta,
    zScore:
      row.trailingSessions >= MIN_SESSIONS_FOR_Z && stdev !== null && stdev > 0
        ? delta / stdev
        : null,
    trailingSessions: row.trailingSessions,
  };
}

function toDealDto(row: DealRow, watchedSet: ReadonlySet<number>): DealDto {
  return {
    id: row.id,
    dealType: row.dealType === 'block' ? 'block' : 'bulk',
    tradingDate: row.tradingDate,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    companyName: row.companyName,
    clientName: row.clientName,
    side: row.side === 'sell' ? 'sell' : 'buy',
    quantity: row.quantity,
    price: row.price,
    value: row.quantity * row.price,
    exchange: row.exchange,
    onWatchlist: row.instrumentId !== null && watchedSet.has(row.instrumentId),
  };
}

function isBuildup(value: string | null): value is OiBuildupDto {
  return (
    value === 'long_buildup' ||
    value === 'short_buildup' ||
    value === 'short_covering' ||
    value === 'long_unwinding'
  );
}

const FEED_LABELS: Readonly<Record<string, string>> = {
  [FLOW_FEEDS.fiiDii]: 'FII/DII',
  [FLOW_FEEDS.deals]: 'Deals',
  [FLOW_FEEDS.delivery]: 'Delivery',
  [FLOW_FEEDS.participantOi]: 'Participant OI',
  [FLOW_FEEDS.futuresOi]: 'Futures OI',
  [FLOW_FEEDS.shareholding]: 'Shareholding',
};

/** Sessions of age after which a daily feed reads as stale (covers a long weekend). */
const FEED_STALE_DAYS = 4;
/** Shareholding is quarterly; a filing window plus slack. */
const SHAREHOLDING_STALE_DAYS = 120;

function feedStatus(
  id: string,
  asOf: string | null,
  health: FeedHealthRow | undefined,
  now: Date,
): FeedStatusDto {
  const latest = health?.latest ?? null;
  const staleDays = id === FLOW_FEEDS.shareholding ? SHAREHOLDING_STALE_DAYS : FEED_STALE_DAYS;
  let status: FeedStatus;
  if (asOf === null) status = latest !== null && !latest.succeeded ? 'failed' : 'empty';
  else {
    const ageDays = (now.getTime() - new Date(`${asOf}T12:00:00+05:30`).getTime()) / 86_400_000;
    // A failed attempt only matters once the data behind it has gone stale:
    // the archive 404s on an exchange holiday (and serves the prior session's
    // file the next day), so a single failed evening with recent data is not
    // a fault. The reason still travels in the tooltip either way.
    if (ageDays > staleDays) status = latest !== null && !latest.succeeded ? 'failed' : 'stale';
    else status = 'fresh';
  }
  return {
    id,
    label: FEED_LABELS[id] ?? id,
    status,
    asOf,
    lastAttemptAt: latest?.completedAt.toISOString() ?? null,
    error: latest !== null && !latest.succeeded ? latest.error : null,
  };
}

export interface FlowInput {
  readonly watchlistOnly?: boolean;
}

/** Sessions of deals folded into the stock table's deals column. */
const DEAL_WINDOW_DAYS = 7;
/** Rows the ranked table carries to the client. */
const MAX_STOCK_ROWS = 400;

export async function getInstitutionalFlow(
  input: FlowInput = {},
  now: Date = new Date(),
): Promise<InstitutionalFlowDto> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();

  const watched = await listOwnerWatchedInstrumentIds(db, ownerId);
  const watchedSet = new Set(watched);
  const hasWatchlists = watched.length > 0;
  const watchlistOnly = input.watchlistOnly === true && hasWatchlists;

  const [flowRows, participantRows, deliveryDate, oiRows, dealRows, health] = await Promise.all([
    getRecentFiiDii(db, { segment: 'cash', days: 30 }),
    recentParticipantOi(db, 30),
    latestDeliveryDate(db),
    latestDerivativeOi(db),
    // Enough for a busy session (~250 deals) so the ledger is never a window
    // onto part of a day; the client pages it.
    getRecentDeals(db, { ...(watchlistOnly ? { instrumentIds: watched } : {}), limit: 300 }),
    feedHealth(db, Object.values(FLOW_FEEDS)),
  ]);

  const dealSince = istDateKey(new Date(now.getTime() - DEAL_WINDOW_DAYS * 86_400_000));
  const [deliveryRows, dealTotals, shareholdingMap] = await Promise.all([
    deliveryDate === null ? Promise.resolve([]) : deliverySnapshot(db, deliveryDate),
    dealAggregates(db, dealSince),
    watched.length === 0
      ? Promise.resolve(new Map<number, ShareholdingHistoryRow[]>())
      : latestTwoShareholdingForInstruments(db, watched),
  ]);

  // ---- tape ---------------------------------------------------------------
  const fiiDii = groupFiiDii(flowRows);
  const positioning = participantPositioning(participantRows);
  const tape: MarketTapeDto = {
    fiiCash: cashSummary(fiiDii, 'fii'),
    diiCash: cashSummary(fiiDii, 'dii'),
    fiiIndexFutures: positioning.fiiIndexFutures,
    participantOi: positioning.cells,
    participantOiDate: positioning.date,
    fiiDii,
  };

  // ---- stocks -------------------------------------------------------------
  const deliveryById = new Map(deliveryRows.map((row) => [row.instrumentId, row]));
  const oiById = new Map(oiRows.map((row) => [row.instrumentId, row]));
  const oiAsOf = oiRows.reduce<string | null>(
    (max, row) => (max === null || row.tradingDate > max ? row.tradingDate : max),
    null,
  );

  // Universe: F&O names ∪ names with a recent deal ∪ followed names. Under
  // the watchlist scope, followed names only.
  const universe = new Set<number>();
  if (watchlistOnly) for (const id of watched) universe.add(id);
  else {
    for (const id of oiById.keys()) universe.add(id);
    for (const id of dealTotals.keys()) universe.add(id);
    for (const id of watched) universe.add(id);
  }

  const stocks: StockFlowRowDto[] = [];
  for (const instrumentId of universe) {
    const delivery = deliveryById.get(instrumentId);
    const oi = oiById.get(instrumentId);
    const dealTotal = dealTotals.get(instrumentId);
    if (delivery === undefined && oi === undefined && dealTotal === undefined) continue;

    const symbol = delivery?.symbol ?? oi?.symbol ?? null;
    if (symbol === null) continue;

    const anomaly = delivery === undefined ? null : deliveryAnomalyFromStats(delivery);
    const volumeRatio =
      delivery === undefined ||
      delivery.trailingTradedQty === null ||
      delivery.trailingTradedQty <= 0
        ? null
        : delivery.tradedQty / delivery.trailingTradedQty;
    const oiFraction =
      oi === undefined || oi.oiChange === null || oi.futuresOi - oi.oiChange <= 0
        ? null
        : oi.oiChange / (oi.futuresOi - oi.oiChange);

    const attention = attentionScore({
      delivery: anomaly,
      volumeRatio,
      oi:
        oi === undefined || oiFraction === null
          ? null
          : { changeFraction: oiFraction, buildup: isBuildup(oi.buildup) ? oi.buildup : null },
      deals:
        dealTotal === undefined || delivery === undefined
          ? null
          : {
              netPaise: dealTotal.netPaise,
              turnoverPaise: delivery.turnoverPaise,
              count: dealTotal.deals,
            },
    });

    stocks.push({
      instrumentId,
      symbol,
      companyName: delivery?.companyName ?? symbol,
      onWatchlist: watchedSet.has(instrumentId),
      inFno: oi !== undefined,
      delivery:
        delivery === undefined
          ? null
          : {
              tradingDate: delivery.tradingDate,
              percent: delivery.deliveryPercent,
              trailingPercent: delivery.trailingDeliveryPercent,
              trailingSessions: delivery.trailingSessions,
              delta:
                delivery.trailingDeliveryPercent === null
                  ? null
                  : delivery.deliveryPercent - delivery.trailingDeliveryPercent,
            },
      price:
        delivery === undefined
          ? null
          : {
              tradingDate: delivery.tradingDate,
              close: delivery.closePaise,
              change: delivery.closePaise - delivery.prevClosePaise,
              changePercent:
                ((delivery.closePaise - delivery.prevClosePaise) / delivery.prevClosePaise) * 100,
            },
      volume: delivery === undefined ? null : { tradedQty: delivery.tradedQty, ratio: volumeRatio },
      oi:
        oi === undefined
          ? null
          : {
              tradingDate: oi.tradingDate,
              futuresOi: oi.futuresOi,
              changePercent: oiFraction === null ? null : oiFraction * 100,
              buildup: isBuildup(oi.buildup) ? oi.buildup : null,
            },
      deals:
        dealTotal === undefined
          ? null
          : {
              netPaise: dealTotal.netPaise,
              count: dealTotal.deals,
              latestDate: dealTotal.latestDate,
            },
      attention: { score: attention.score, factors: attention.factors },
    });
  }
  stocks.sort((a, b) => b.attention.score - a.attention.score || (a.symbol < b.symbol ? -1 : 1));

  // ---- deals & shareholding ----------------------------------------------
  const deals = dealRows.map((row) => toDealDto(row, watchedSet));

  const shareholding: ShareholdingDto[] = [];
  if (watched.length > 0) {
    const names = await getInstrumentNames(db, [...shareholdingMap.keys()]);
    for (const [instrumentId, quarters] of shareholdingMap) {
      const [latest, previous] = quarters;
      const name = names.get(instrumentId);
      if (latest === undefined || name === undefined) continue;
      const delta = (a: number | null, b: number | null | undefined): number | null =>
        a === null || b === null || b === undefined ? null : a - b;
      shareholding.push({
        instrumentId,
        symbol: name.symbol,
        companyName: name.name,
        asOfDate: latest.asOfDate,
        promoterPercent: latest.promoterPercent,
        fiiPercent: latest.fiiPercent,
        diiPercent: latest.diiPercent,
        publicPercent: latest.publicPercent,
        promoterChange: delta(latest.promoterPercent, previous?.promoterPercent),
        fiiChange: delta(latest.fiiPercent, previous?.fiiPercent),
        diiChange: delta(latest.diiPercent, previous?.diiPercent),
        publicChange: delta(latest.publicPercent, previous?.publicPercent),
        previousAsOfDate: previous?.asOfDate ?? null,
      });
    }
    shareholding.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  }

  // ---- feeds --------------------------------------------------------------
  const shareholdingAsOf = shareholding.reduce<string | null>(
    (max, row) => (max === null || row.asOfDate > max ? row.asOfDate : max),
    null,
  );
  const feeds: FeedStatusDto[] = [
    feedStatus(
      FLOW_FEEDS.fiiDii,
      fiiDii[0]?.tradingDate ?? null,
      health.get(FLOW_FEEDS.fiiDii),
      now,
    ),
    feedStatus(FLOW_FEEDS.delivery, deliveryDate, health.get(FLOW_FEEDS.delivery), now),
    feedStatus(
      FLOW_FEEDS.participantOi,
      positioning.date,
      health.get(FLOW_FEEDS.participantOi),
      now,
    ),
    feedStatus(FLOW_FEEDS.futuresOi, oiAsOf, health.get(FLOW_FEEDS.futuresOi), now),
    feedStatus(FLOW_FEEDS.deals, deals[0]?.tradingDate ?? null, health.get(FLOW_FEEDS.deals), now),
    feedStatus(FLOW_FEEDS.shareholding, shareholdingAsOf, health.get(FLOW_FEEDS.shareholding), now),
  ];

  return {
    tape,
    stocks: stocks.slice(0, MAX_STOCK_ROWS),
    stocksAsOf: deliveryDate,
    oiAsOf,
    deals,
    shareholding,
    feeds,
    watchlistOnly,
    hasWatchlists,
    disclaimer: DISCLAIMER,
  };
}

/** Symbol and name for a set of instrument ids. */
async function getInstrumentNames(
  db: ReturnType<typeof getDatabase>,
  ids: readonly number[],
): Promise<Map<number, { symbol: string; name: string }>> {
  const rows = await listInstrumentsById(db, ids);
  return new Map(rows.map((row) => [row.id, { symbol: row.symbol, name: row.name }]));
}

/**
 * One stock's flow history — the drawer behind a row of the table.
 *
 * Deals are the stock's own, all parties; shareholding is the last eight
 * quarters. Everything is oldest → newest so the charts read left to right.
 */
export async function getStockFlow(symbol: string): Promise<StockFlowDetailDto> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(clean)) {
    throw new MarketDataError('Invalid symbol.', { code: 'INVALID_SYMBOL', status: 400 });
  }
  const instrument = await getInstrumentBySymbol(db, clean);
  if (instrument === null) {
    throw new MarketDataError('Unknown symbol.', { code: 'NOT_FOUND', status: 404 });
  }

  const [watched, delivery, oi, dealRows, quarters] = await Promise.all([
    listOwnerWatchedInstrumentIds(db, ownerId),
    deliveryHistory(db, instrument.id, 40),
    derivativeOiHistory(db, instrument.id, 40),
    getRecentDeals(db, { instrumentIds: [instrument.id], limit: 50 }),
    shareholdingHistory(db, instrument.id, 8),
  ]);
  const watchedSet = new Set(watched);
  const deliveryAsc = [...delivery].reverse();
  const average =
    deliveryAsc.length === 0
      ? null
      : deliveryAsc.reduce((sum, row) => sum + row.deliveryPercent, 0) / deliveryAsc.length;

  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    companyName: instrument.name,
    onWatchlist: watchedSet.has(instrument.id),
    delivery: deliveryAsc.map((row) => ({
      tradingDate: row.tradingDate,
      percent: row.deliveryPercent,
      tradedQty: row.tradedQty,
      close: row.closePaise,
    })),
    deliveryAverage: average,
    oi: [...oi].reverse().map((row) => ({
      tradingDate: row.tradingDate,
      futuresOi: row.futuresOi,
      close: row.futuresClosePaise,
      buildup: isBuildup(row.buildup) ? row.buildup : null,
    })),
    deals: dealRows.map((row) => toDealDto(row, watchedSet)),
    shareholding: [...quarters].reverse().map((row) => ({
      asOfDate: row.asOfDate,
      promoterPercent: row.promoterPercent,
      fiiPercent: row.fiiPercent,
      diiPercent: row.diiPercent,
      publicPercent: row.publicPercent,
    })),
    disclaimer: DISCLAIMER,
  };
}

export async function setAnnouncementUserState(
  id: number,
  patch: AnnouncementStatePatch,
): Promise<void> {
  const ownerId = await requireOwnerId();
  if (!Number.isSafeInteger(id) || id < 1)
    throw new MarketDataError('Invalid announcement ID.', { code: 'INVALID_ID', status: 400 });
  if (!(await updateAnnouncementState(getDatabase(), ownerId, id, patch)))
    throw new MarketDataError('Announcement not found.', { code: 'NOT_FOUND', status: 404 });
}

export async function announcementHistory(id: number) {
  await requireOwnerId();
  if (!Number.isSafeInteger(id) || id < 1)
    throw new MarketDataError('Invalid announcement ID.', { code: 'INVALID_ID', status: 400 });
  const versions = await getAnnouncementVersions(getDatabase(), id);
  return versions.map((version) => ({
    ...version,
    createdAt: version.createdAt.toISOString(),
    snapshot: {
      ...version.snapshot,
      attachmentUrl: officialAnnouncementUrl(version.snapshot.attachmentUrl),
    },
  }));
}
