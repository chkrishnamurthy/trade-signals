import 'server-only';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  officialAnnouncementUrl,
} from '@equitywise/core';
import {
  type AnnouncementRow,
  type AnnouncementStatePatch,
  announcementIngestionHealth,
  announcementStatesForOwner,
  type DealRow,
  type FiiDiiRow,
  getAnnouncements,
  getAnnouncementVersions,
  getRecentDeals,
  getRecentFiiDii,
  latestShareholdingForInstruments,
  listAnnouncementCategories,
  listOwnerWatchedInstrumentIds,
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
  DealDto,
  FiiDiiDayDto,
  FreshnessStatus,
  InstitutionalFlowDto,
  ShareholdingDto,
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

export interface FlowInput {
  readonly watchlistOnly?: boolean;
}

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

  const [flowRows, dealRows, shareholdingMap] = await Promise.all([
    getRecentFiiDii(db, { segment: 'cash', days: 30 }),
    getRecentDeals(db, { ...(watchlistOnly ? { instrumentIds: watched } : {}), limit: 100 }),
    watched.length === 0
      ? Promise.resolve(new Map())
      : latestShareholdingForInstruments(db, watched),
  ]);

  const fiiDii = groupFiiDii(flowRows);
  const latest = fiiDii[0] ?? null;

  const deals: DealDto[] = dealRows.map((row: DealRow) => ({
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
  }));

  const shareholding: ShareholdingDto[] = [...shareholdingMap.values()]
    .map((row) => ({
      instrumentId: row.instrumentId,
      symbol: row.symbol,
      companyName: row.companyName,
      asOfDate: row.asOfDate,
      promoterPercent: row.promoterPercent,
      fiiPercent: row.fiiPercent,
      diiPercent: row.diiPercent,
      publicPercent: row.publicPercent,
    }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

  const latestFlowDate = latest?.tradingDate ?? null;
  const latestDate = latestFlowDate === null ? null : new Date(`${latestFlowDate}T12:00:00+05:30`);
  const todayKey = istDateKey(now);
  const status: FreshnessStatus =
    fiiDii.length === 0 && deals.length === 0
      ? 'empty'
      : freshnessOf(latestDate, now, fiiDii.length + deals.length);

  return {
    fiiDii,
    latest,
    deals,
    shareholding,
    latestFlowDate,
    // A same-day pull before the evening publish is fresh, not stale.
    status: latestFlowDate === todayKey ? 'fresh' : status,
    watchlistOnly,
    hasWatchlists,
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
