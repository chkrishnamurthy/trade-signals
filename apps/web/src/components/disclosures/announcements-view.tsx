'use client';

import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_STATUSES } from '@equitywise/core';
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Text } from '@/components/ui/typography';
import { announcementMeta, DATE_RANGES } from '@/lib/announcement-meta';
import type { AnnouncementDto, AnnouncementsPageDto } from '@/lib/disclosure-types';
import { cn } from '@/lib/utils';
import {
  AnnouncementActions,
  AnnouncementInterpretationSheet,
} from './announcement-interpretation';
import { CategoryChips, formatDateTimeIst, ScopeToggle } from './parts';

/**
 * Corporate Announcements page (`/announcements`).
 *
 * A chronological, filterable feed of official filings. All filter state lives
 * in the URL and the server re-renders — no client data fetching. The only
 * reading state is persisted per owner. Interpretations are produced by the worker.
 */
export function AnnouncementsView({
  data,
  activeCategories,
}: {
  data: AnnouncementsPageDto;
  activeCategories: readonly string[];
}) {
  const setParams = useUrlParams();

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Corporate Announcements</PageTitle>
            <PageDescription>
              Company disclosures, with facts, context and unknowns.
            </PageDescription>
          </PageHeading>
          <ScopeToggle watchlistOnly={data.watchlistOnly} hasWatchlists={data.hasWatchlists} />
        </PageHeader>

        <PageContent>
          <div
            role="status"
            className="space-y-1 rounded-lg border border-border bg-muted p-3 text-sm"
          >
            <p className="font-medium">
              {data.coverage.failed
                ? 'Latest ingestion failed'
                : data.coverage.stale
                  ? 'Ingestion is stale or unverified'
                  : 'Latest ingestion succeeded — partial coverage'}
            </p>
            <p>
              Current source: BSE. NSE announcement ingestion is not connected. Complete coverage is
              not verified.
            </p>
            <p className="text-muted-foreground">
              Last successful ingestion:{' '}
              {data.coverage.lastSuccess
                ? `${formatDateTimeIst(data.coverage.lastSuccess)} IST`
                : 'Not recorded'}{' '}
              · Latest attempt:{' '}
              {data.coverage.latestAttempt
                ? `${formatDateTimeIst(data.coverage.latestAttempt)} IST`
                : 'Not recorded'}
            </p>
            <p className="text-muted-foreground">
              Existing filings remain available when a source fails. Attachments are not analysed.
            </p>
          </div>
          {data.rows.some((row) => row.onWatchlist) && (
            <p className="text-sm">
              On this page, {data.rows.filter((row) => row.onWatchlist).length} filings relate to
              companies in your watchlists:{' '}
              {[
                ...new Set(
                  data.rows.filter((row) => row.onWatchlist).map((row) => row.companyName),
                ),
              ].join(', ')}
              .
            </p>
          )}

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <SearchBox
              key={data.query.search ?? ''}
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
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="self-start">
                  More filters
                  {Object.values(data.personalFilters).some(
                    (value) => value !== '' && value !== false && value !== 'all',
                  )
                    ? ' · active'
                    : ''}
                </Button>
              </SheetTrigger>
              <SheetContent className="motion-reduce:animate-none">
                <SheetHeader>
                  <div>
                    <SheetTitle>Announcement filters</SheetTitle>
                    <SheetDescription>
                      Filter stored filings and your own reading state.
                    </SheetDescription>
                  </div>
                </SheetHeader>
                <SheetBody className="space-y-4">
                  <FilterSelect
                    label="Reading state"
                    value={data.personalFilters.state}
                    options={{
                      all: 'All except dismissed',
                      unread: 'Unread',
                      read: 'Read',
                      saved: 'Saved',
                      dismissed: 'Dismissed',
                    }}
                    onChange={(value) =>
                      setParams({ state: value === 'all' ? null : value, page: null })
                    }
                  />
                  <FilterSelect
                    label="Event status"
                    value={data.personalFilters.eventStatus}
                    options={{ '': 'All statuses', ...ANNOUNCEMENT_STATUSES }}
                    onChange={(value) => setParams({ status: value, page: null })}
                  />
                  <FilterSelect
                    label="Interpreted category"
                    value={data.personalFilters.normalizedCategory}
                    options={{ '': 'All interpreted categories', ...ANNOUNCEMENT_CATEGORIES }}
                    onChange={(value) => setParams({ kind: value, page: null })}
                  />
                  <FilterSelect
                    label="Source"
                    value={data.personalFilters.source}
                    options={{ '': 'All stored sources', bse: 'BSE', nse: 'NSE' }}
                    onChange={(value) => setParams({ source: value, page: null })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={data.personalFilters.hasFacts}
                      onChange={(event) =>
                        setParams({ facts: event.target.checked ? '1' : null, page: null })
                      }
                    />
                    Has extracted labelled facts
                  </label>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setParams({
                        state: null,
                        status: null,
                        kind: null,
                        source: null,
                        facts: null,
                        category: null,
                        range: null,
                        impact: null,
                        q: null,
                        symbol: null,
                        page: null,
                      })
                    }
                  >
                    Clear filters
                  </Button>
                </SheetBody>
              </SheetContent>
            </Sheet>
            <CategoryChips categories={data.categories} active={activeCategories} />
            <ActiveFilters
              query={data.query}
              onClear={(patch) => setParams({ ...patch, page: null })}
            />
          </div>

          {data.rows.length === 0 ? (
            <EmptyState
              title={data.watchlistOnly ? 'No watchlist announcements' : 'No announcements match'}
              description="Try clearing a filter, widening the date range, or switching to All names."
            />
          ) : (
            <AnnouncementGroups
              rows={data.rows}
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
  onPickSymbol,
}: {
  rows: readonly AnnouncementDto[];
  onPickSymbol: (symbol: string) => void;
}) {
  const groups = useMemo(() => {
    const byDate = new Map<string, AnnouncementDto[]>();
    for (const row of rows) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.announcedAt));
      byDate.set(date, [...(byDate.get(date) ?? []), row]);
    }
    return [...byDate].map(([bucket, items]) => ({ bucket, rows: items }));
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.bucket} className="flex flex-col gap-2">
          <Text as="h2" variant="overline" className="px-0.5">
            {group.bucket} · IST
          </Text>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <AnnouncementCard key={row.id} row={row} onPickSymbol={onPickSymbol} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AnnouncementCard({
  row,
  onPickSymbol,
}: {
  row: AnnouncementDto;
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
            {!row.userState.read && (
              <Badge variant="secondary" size="sm">
                Unread
              </Badge>
            )}
            {row.userState.saved && (
              <Badge variant="secondary" size="sm">
                Saved
              </Badge>
            )}
            <Badge variant={meta.tone} size="sm" className="ml-auto font-normal">
              {row.interpretation
                ? ANNOUNCEMENT_CATEGORIES[row.interpretation.category]
                : meta.label}
            </Badge>
          </div>

          {row.instrumentId === null && (
            <p className="text-xs text-muted-foreground">
              Company mapping unavailable · watchlist relevance cannot be checked
            </p>
          )}
          <Text as="h3" variant="label" className="text-pretty">
            {row.headline}
          </Text>

          <p className="text-sm">
            {row.interpretation?.summary ??
              (row.attachmentUrl === null
                ? 'Original attachment link unavailable. Interpretation is withheld.'
                : 'Interpretation pending. Read the original filing.')}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.interpretation
              ? ANNOUNCEMENT_STATUSES[row.interpretation.eventStatus]
              : 'Status not established'}{' '}
            · Attachment not analysed
          </p>
          {row.interpretation && row.interpretation.facts.length > 0 && (
            <dl className="space-y-1 text-sm">
              {row.interpretation.facts.slice(0, 3).map((fact) => (
                <div key={`${fact.evidence.field}-${fact.evidence.start}`}>
                  <dt className="inline font-medium">{fact.label}: </dt>
                  <dd className="inline break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {meta.highImpact && row.attachmentUrl !== null && (
            <p className="text-xs text-muted-foreground">
              Reading priority: title/category matches a key-filing keyword ({meta.label}). This
              does not predict price impact.
            </p>
          )}
          {row.interpretation?.relevance.map((area) => (
            <p key={area.area} className="text-xs text-muted-foreground">
              Relates to: {area.area}
            </p>
          ))}
          {row.watchlistNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              In your watchlists: {row.watchlistNames.join(', ')}
            </p>
          )}
          {row.detail !== null && row.detail !== row.headline && (
            <Text as="p" variant="caption" className="line-clamp-3">
              {row.detail}
            </Text>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{row.source.toUpperCase()}</span>
            <AnnouncementInterpretationSheet row={row} />
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
          {row.attachmentUrl === null && (
            <p className="text-xs text-muted-foreground">Original attachment link unavailable.</p>
          )}
          <AnnouncementActions row={row} />
        </CardContent>
      </Card>
    </li>
  );
}

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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Readonly<Record<string, string>>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-surface p-2 text-foreground"
      >
        {Object.entries(options).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
