import 'server-only';
import {
  type AnnouncementRow,
  type DealRow,
  type FiiDiiRow,
  getAnnouncements,
  getRecentDeals,
  getRecentFiiDii,
  latestShareholdingForInstruments,
  listAnnouncementCategories,
  listOwnerWatchedInstrumentIds,
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
  const page = Math.max(1, input.page ?? 1);

  const watched = await listOwnerWatchedInstrumentIds(db, ownerId);
  const watchedSet = new Set(watched);
  const hasWatchlists = watched.length > 0;
  const watchlistOnly = input.watchlistOnly === true && hasWatchlists;

  const range: DateRange =
    input.range !== undefined && isDateRange(input.range) ? input.range : 'all';
  const since = rangeSince(range, now);
  const search = input.search?.trim() ?? '';
  const symbol = input.symbol?.trim().toUpperCase() ?? '';
  const highImpactOnly = input.highImpactOnly === true;
  const activeCategories =
    input.categories !== undefined && input.categories.length > 0 ? input.categories : [];

  const [result, categories] = await Promise.all([
    getAnnouncements(db, {
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
  ]);

  const rows: AnnouncementDto[] = result.rows.map((row: AnnouncementRow) => ({
    id: row.id,
    instrumentId: row.instrumentId,
    symbol: row.symbol,
    companyName: row.companyName,
    category: row.category,
    headline: row.headline,
    detail: row.detail,
    attachmentUrl: row.attachmentUrl,
    announcedAt: row.announcedAt.toISOString(),
    source: row.source,
    onWatchlist: row.instrumentId !== null && watchedSet.has(row.instrumentId),
  }));

  const latestAt = result.rows[0]?.announcedAt ?? null;

  return {
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
