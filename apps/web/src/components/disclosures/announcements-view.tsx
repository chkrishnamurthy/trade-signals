'use client';

import { ExternalLinkIcon, SearchIcon, StarIcon, XIcon, ZapIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/typography';
import {
  announcementMeta,
  DATE_RANGES,
  RELATIVE_DAY_LABEL,
  type RelativeDayBucket,
  relativeDayBucket,
} from '@/lib/announcement-meta';
import type { AnnouncementDto, AnnouncementsPageDto } from '@/lib/disclosure-types';
import { cn } from '@/lib/utils';
import { CategoryChips, FreshnessBanner, formatDateTimeIst, ScopeToggle } from './parts';

/**
 * Corporate Announcements page (`/announcements`).
 *
 * A chronological, filterable feed of official filings. All filter state lives
 * in the URL and the server re-renders — no client data fetching. The only
 * client-only state is the per-device "new since last visit" marker, kept in
 * localStorage.
 */
export function AnnouncementsView({
  data,
  activeCategories,
}: {
  data: AnnouncementsPageDto;
  activeCategories: readonly string[];
}) {
  const setParams = useUrlParams();
  const isNew = useNewSince(data.rows);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Announcements</PageTitle>
            <PageDescription>
              Official corporate filings published by the exchanges.
            </PageDescription>
          </PageHeading>
          <ScopeToggle watchlistOnly={data.watchlistOnly} hasWatchlists={data.hasWatchlists} />
        </PageHeader>

        <PageContent>
          <FreshnessBanner
            status={data.status}
            latestLabel={data.latestAt === null ? null : formatDateTimeIst(data.latestAt)}
          />

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <SearchBox
              initial={data.query.search ?? ''}
              onSearch={(q) => setParams({ q, page: null })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter
                active={data.query.range}
                onSelect={(range) => setParams({ range, page: null })}
              />
              <HighImpactToggle
                active={data.query.highImpactOnly}
                onToggle={(on) => setParams({ impact: on ? '1' : null, page: null })}
              />
            </div>
            <CategoryChips categories={data.categories} active={activeCategories} />
            <ActiveFilters
              query={data.query}
              onClear={(patch) => setParams({ ...patch, page: null })}
            />
          </div>

          {data.rows.length === 0 ? (
            <EmptyState
              title="No announcements match"
              description="Try clearing a filter, widening the date range, or switching to All names."
            />
          ) : (
            <AnnouncementGroups
              rows={data.rows}
              nowIso={data.nowIso}
              isNew={isNew}
              onPickSymbol={(symbol) => setParams({ symbol, page: null })}
            />
          )}

          <Pagination total={data.total} page={data.page} pageSize={data.pageSize} />

          <PageDisclaimer>{data.disclaimer}</PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// URL helper
// ---------------------------------------------------------------------------

/** Returns a setter that merges param updates into the URL (null deletes a key). */
function useUrlParams(): (updates: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (updates) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs === '' ? pathname : `${pathname}?${qs}`);
    },
    [params, pathname, router],
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);

  // Debounce so a keystroke does not fire a navigation per character.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (value.trim() !== initial.trim()) onSearch(value.trim());
    }, 350);
    return () => clearTimeout(handle);
    // onSearch/initial are stable enough; re-running on `value` is the intent.
  }, [value, initial, onSearch]);

  return (
    <div className="relative max-w-md">
      <SearchIcon
        aria-hidden
        className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search company, symbol or headline"
        aria-label="Search announcements"
        className="pl-8"
      />
    </div>
  );
}

function DateRangeFilter({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (range: string | null) => void;
}) {
  return (
    <fieldset
      className="m-0 inline-flex items-center gap-0.5 rounded-md border-0 bg-muted p-0.5 text-muted-foreground text-xs"
      aria-label="Date range"
    >
      {DATE_RANGES.map((range) => {
        const on = active === range.id;
        return (
          <button
            key={range.id}
            type="button"
            onClick={() => onSelect(range.id === 'all' ? null : range.id)}
            aria-pressed={on}
            className={cn(
              'rounded-sm px-2.5 py-1 font-medium transition-colors',
              on ? 'bg-surface text-foreground shadow-subtle' : 'hover:text-foreground',
            )}
          >
            {range.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function HighImpactToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-7 gap-1 px-2.5 text-xs"
      aria-pressed={active}
      onClick={() => onToggle(!active)}
    >
      <ZapIcon aria-hidden />
      Key filings only
    </Button>
  );
}

function ActiveFilters({
  query,
  onClear,
}: {
  query: AnnouncementsPageDto['query'];
  onClear: (patch: Record<string, null>) => void;
}) {
  const pills: { key: string; label: string; patch: Record<string, null> }[] = [];
  if (query.symbol !== null) {
    pills.push({ key: 'symbol', label: `Stock: ${query.symbol}`, patch: { symbol: null } });
  }
  if (query.search !== null) {
    pills.push({ key: 'search', label: `Search: "${query.search}"`, patch: { q: null } });
  }
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => onClear(pill.patch)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-foreground text-xs hover:bg-muted"
        >
          {pill.label}
          <XIcon aria-label="Remove filter" className="size-3" />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouped list
// ---------------------------------------------------------------------------

function AnnouncementGroups({
  rows,
  nowIso,
  isNew,
  onPickSymbol,
}: {
  rows: readonly AnnouncementDto[];
  nowIso: string;
  isNew: (iso: string) => boolean;
  onPickSymbol: (symbol: string) => void;
}) {
  const groups = useMemo(() => {
    const now = new Date(nowIso);
    const order: RelativeDayBucket[] = ['today', 'yesterday', 'week', 'earlier'];
    const byBucket = new Map<RelativeDayBucket, AnnouncementDto[]>();
    for (const row of rows) {
      const bucket = relativeDayBucket(row.announcedAt, now);
      const list = byBucket.get(bucket) ?? [];
      list.push(row);
      byBucket.set(bucket, list);
    }
    return order
      .filter((bucket) => byBucket.has(bucket))
      .map((bucket) => ({ bucket, rows: byBucket.get(bucket) ?? [] }));
  }, [rows, nowIso]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.bucket} className="flex flex-col gap-2">
          <Text as="h2" variant="overline" className="px-0.5">
            {RELATIVE_DAY_LABEL[group.bucket]}
          </Text>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <AnnouncementCard
                key={row.id}
                row={row}
                isNew={isNew(row.announcedAt)}
                onPickSymbol={onPickSymbol}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AnnouncementCard({
  row,
  isNew,
  onPickSymbol,
}: {
  row: AnnouncementDto;
  isNew: boolean;
  onPickSymbol: (symbol: string) => void;
}) {
  const meta = announcementMeta(row.category, row.headline);
  return (
    <li>
      <Card className={cn(meta.highImpact && 'border-l-2 border-l-primary')}>
        <CardContent className="flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onPickSymbol(row.symbol)}
              className="font-mono text-xs font-medium text-foreground underline-offset-2 hover:underline"
              title={`Show all ${row.symbol} filings`}
            >
              {row.symbol}
            </button>
            <Text as="span" variant="caption" className="min-w-0 truncate">
              {row.companyName}
            </Text>
            {row.onWatchlist && (
              <StarIcon
                aria-label="On your watchlist"
                className="size-3.5 fill-warning text-warning"
              />
            )}
            {isNew && (
              <Badge variant="bullish" size="sm">
                New
              </Badge>
            )}
            <Badge variant={meta.tone} size="sm" className="ml-auto font-normal">
              {meta.label}
            </Badge>
          </div>

          <Text as="h3" variant="label" className="text-pretty">
            {row.headline}
          </Text>

          {row.detail !== null && row.detail !== row.headline && (
            <Text as="p" variant="caption" className="line-clamp-3">
              {row.detail}
            </Text>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <time className="text-2xs text-subtle-foreground" dateTime={row.announcedAt}>
              {formatDateTimeIst(row.announcedAt)} IST
            </time>
            {row.attachmentUrl !== null && (
              <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
                <a href={row.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden />
                  View filing
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------------------
// "New since last visit" (per-device)
// ---------------------------------------------------------------------------

const LAST_SEEN_KEY = 'announcements:lastSeenAt';

function useNewSince(rows: readonly AnnouncementDto[]): (iso: string) => boolean {
  const [seenBefore, setSeenBefore] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SEEN_KEY);
      const prior = raw !== null ? Number(raw) : null;
      setSeenBefore(prior !== null && !Number.isNaN(prior) ? prior : null);
      const newest = rows.reduce(
        (max, row) => Math.max(max, Date.parse(row.announcedAt)),
        prior ?? 0,
      );
      if (newest > 0) localStorage.setItem(LAST_SEEN_KEY, String(newest));
    } catch {
      // Storage unavailable (private mode etc.) — no "new" markers, no crash.
    }
  }, [rows]);

  return useCallback(
    (iso: string) => seenBefore !== null && Date.parse(iso) > seenBefore,
    [seenBefore],
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const setParams = useUrlParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => setParams({ page: page - 1 <= 1 ? null : String(page - 1) })}
      >
        Previous
      </Button>
      <Text variant="caption">
        Page {page} of {lastPage}
      </Text>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => setParams({ page: String(page + 1) })}
      >
        Next
      </Button>
    </nav>
  );
}
