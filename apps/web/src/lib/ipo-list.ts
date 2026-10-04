import type { IpoStatus } from '@equitywise/shared';
import type { IpoListItemDto, IpoListingsMonthDto, IpoListingsStatsDto } from './ipo-types';

/**
 * The board list's sort keys, as they appear in the URL (`?sort=demand`).
 * `stage` is the default: open issues first, then those waiting to list,
 * then upcoming, then listed — what needs attention soonest, first.
 */
export const IPO_LIST_SORT_KEYS = [
  'stage',
  'company',
  'close',
  'min',
  'size',
  'demand',
  'gmp',
  'day1',
  'now',
] as const;
export type IpoListSortKey = (typeof IPO_LIST_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export interface IpoListSort {
  readonly key: IpoListSortKey;
  readonly dir: SortDir;
}

/** The direction a column sorts in on its first click: words and dates up, figures down. */
export const DEFAULT_SORT_DIR: Readonly<Record<IpoListSortKey, SortDir>> = {
  stage: 'asc',
  company: 'asc',
  close: 'asc',
  min: 'desc',
  size: 'desc',
  demand: 'desc',
  gmp: 'desc',
  day1: 'desc',
  now: 'desc',
};

/** How the footer and the phone's sort menu name each order. */
export const SORT_LABEL: Readonly<Record<IpoListSortKey, string>> = {
  stage: 'Stage',
  company: 'Company',
  close: 'Bidding closes',
  min: 'Min. investment',
  size: 'Issue size',
  demand: 'Demand',
  gmp: 'GMP',
  day1: 'Listing-day gain',
  now: 'Gain since issue',
};

const STAGE_RANK: Readonly<Record<IpoStatus, number>> = {
  open: 0,
  closed: 1,
  upcoming: 2,
  listed: 3,
  postponed: 4,
  withdrawn: 5,
};

/** Days since the epoch for a `YYYY-MM-DD` key; null stays null. */
function dayNumber(dateKey: string | null): number | null {
  if (dateKey === null) return null;
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isNaN(t) ? null : t / 86_400_000;
}

/**
 * Where a row falls in the stage order: its stage, then the date that matters
 * within it — open by closing day, waiting by listing day, upcoming by opening
 * day, listed newest first. A missing date sorts last within its stage.
 */
function stageKey(row: IpoListItemDto): readonly [number, number] {
  const last = Number.POSITIVE_INFINITY;
  const rank = STAGE_RANK[row.status];
  switch (row.status) {
    case 'open':
      return [rank, dayNumber(row.closeDate) ?? last];
    case 'closed': {
      // Past T+3 with no listing reported goes after the issues still on their way.
      if (row.closedStage === 'listing_unconfirmed') return [rank + 0.5, 0];
      return [rank, dayNumber(row.listingDate ?? row.expectedListingDate) ?? last];
    }
    case 'upcoming':
      return [rank, dayNumber(row.openDate) ?? last];
    case 'listed': {
      const day = dayNumber(row.listingDate);
      return [rank, day === null ? last : -day];
    }
    case 'postponed':
    case 'withdrawn': {
      const day = dayNumber(row.openDate);
      return [rank, day === null ? last : -day];
    }
  }
}

/** The value a column sorts by. Null is absent, not small: it sinks in both directions. */
function sortValue(row: IpoListItemDto, key: Exclude<IpoListSortKey, 'stage'>) {
  switch (key) {
    case 'company':
      return row.companyName;
    case 'close':
      return dayNumber(row.closeDate);
    case 'min':
      return row.minInvestmentPaise;
    case 'size':
      return row.issueSizePaise;
    case 'demand':
      return row.subscription?.totalTimes ?? null;
    case 'gmp':
      return row.gmp === null || row.gmp.latestPaise === null ? null : row.gmp.percentOfUpperBand;
    case 'day1':
      return row.listing?.listingGainPercent ?? null;
    case 'now':
      return row.listing?.sinceIssuePercent ?? null;
  }
}

const byName = (a: IpoListItemDto, b: IpoListItemDto) =>
  a.companyName.localeCompare(b.companyName, 'en-IN');

/**
 * The board's rows in the asked order. Ties fall back to the company name so
 * the order — and so every page boundary — is the same on every request.
 */
export function sortListItems(
  rows: readonly IpoListItemDto[],
  sort: IpoListSort,
): IpoListItemDto[] {
  const factor = sort.dir === 'asc' ? 1 : -1;
  const compare =
    sort.key === 'stage'
      ? (a: IpoListItemDto, b: IpoListItemDto) => {
          const [ra, da] = stageKey(a);
          const [rb, db] = stageKey(b);
          if (ra !== rb) return (ra - rb) * factor;
          if (da !== db) return (da < db ? -1 : 1) * factor;
          return 0;
        }
      : (a: IpoListItemDto, b: IpoListItemDto) => {
          const key = sort.key as Exclude<IpoListSortKey, 'stage'>;
          const x = sortValue(a, key);
          const y = sortValue(b, key);
          if (x === null && y === null) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          if (typeof x === 'string' || typeof y === 'string')
            return String(x).localeCompare(String(y), 'en-IN') * factor;
          return (x - y) * factor;
        };
  return [...rows].sort((a, b) => compare(a, b) || byName(a, b));
}

/** Rows per status — the status pills' counts. */
export function countByStatus(rows: readonly IpoListItemDto[]): Record<IpoStatus, number> {
  const out: Record<IpoStatus, number> = {
    upcoming: 0,
    open: 0,
    closed: 0,
    listed: 0,
    withdrawn: 0,
    postponed: 0,
  };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/**
 * Where a subscription figure sits on the demand bar, 0–100. The scale is
 * logarithmic from 0.1× to 100×, so 1× (fully subscribed) is always the
 * same tick a third of the way along and 50× does not flatten 2×.
 */
export function demandBarPercent(times: number): number {
  if (!(times > 0)) return 0;
  const raw = ((Math.log10(times) + 1) / 3) * 100;
  return Math.max(2, Math.min(100, raw));
}

/** Where the 1× tick sits on the demand bar. */
export const DEMAND_BAR_ONE_TIMES = 100 / 3;

/** The middle value (the mean of the middle two for an even count); null for none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] as number;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}

const listingGain = (r: IpoListItemDto) => r.listing?.listingGainPercent ?? null;
const sinceIssue = (r: IpoListItemDto) => r.listing?.sinceIssuePercent ?? null;
const present = (v: number | null): v is number => v !== null;

/**
 * How listings went against their issue price: counts with their
 * denominators (only listings the exchange has priced count) and the middle
 * gain — outcomes recorded, never a forecast.
 */
export function listingStats(rows: readonly IpoListItemDto[]): IpoListingsStatsDto {
  const gains = rows.map(listingGain).filter(present);
  const now = rows.map(sinceIssue).filter(present);
  return {
    listed: rows.length,
    withListingPrice: gains.length,
    openedAbove: gains.filter((g) => g > 0).length,
    withLatestClose: now.length,
    latestAbove: now.filter((g) => g > 0).length,
    medianListingGain: median(gains),
    medianSinceIssue: median(now),
  };
}

/** Listings grouped by the month they listed in, newest month first. */
export function listingMonths(rows: readonly IpoListItemDto[]): IpoListingsMonthDto[] {
  const byMonth = new Map<string, IpoListItemDto[]>();
  for (const r of rows) {
    if (r.listingDate === null) continue;
    const month = r.listingDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), r]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => {
      const gains = list.map(listingGain).filter(present);
      return {
        month,
        listed: list.length,
        withListingPrice: gains.length,
        openedAbove: gains.filter((g) => g > 0).length,
        medianListingGain: median(gains),
      };
    });
}
