'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { CardSkeleton, ErrorState, TableSkeleton } from '@/components/data-display/states';
import { ActiveFilters, SearchInput } from '@/components/forms/filter-bar';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageBreadcrumb,
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardToolbar } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { StockDetailDrawer } from '@/components/watchlists/stock-drawer';
import type { MoverDto } from '@/lib/dashboard-types';
import { useWatchlists } from '@/lib/use-watchlists';
import { DEFAULT_COLUMN_IDS } from '@/lib/watchlist-columns';
import {
  activeFilterChips,
  applyWatchlistFilters,
  removeWatchlistFilter,
} from '@/lib/watchlist-filters';
import { exchangesIn, sectorsIn, sortRows, summarise, toggleSort } from '@/lib/watchlist-summary';
import type { SavedViewDto, WatchlistFilterStateDto, WatchlistRowDto } from '@/lib/watchlist-types';
import { getQuickView } from '@/lib/watchlist-views';
import { AddStocks } from './add-stocks';
import { ColumnPanel } from './column-panel';
import { FilterPanel } from './filter-panel';
import { QuickViews } from './quick-views';
import { SummaryBar } from './summary-bar';
import { WatchlistTable } from './watchlist-table';
import { WatchlistTabs } from './watchlist-tabs';

/**
 * The watchlist workspace.
 *
 * Composition only — every decision it renders was made in a tested pure
 * module: `watchlist-filters` decides what is shown, `watchlist-summary`
 * decides how it is ordered and how it is doing, `watchlist-columns` decides
 * what a column is. This file wires them to the feed and to each other.
 *
 * The one piece of judgement that lives here is the ORDER of operations:
 * filter, then sort, then summarise the FILTERED rows. Summarising before
 * filtering would report the advance/decline of stocks the user cannot see,
 * which is the kind of quietly-wrong number this product exists not to print.
 */
export function WatchlistsPage() {
  const router = useRouter();
  const {
    lists,
    detail,
    activeId,
    isRefreshing,
    setActiveId,
    refresh,
    createList,
    renameList,
    deleteList,
    makeDefault,
    reorderLists,
    addSymbols,
    addSymbolsTo,
    removeSymbols,
    setLayout,
    saveView,
    deleteView,
  } = useWatchlists();

  const [selected, setSelected] = useState<WatchlistRowDto | null>(null);

  const allLists = lists.status === 'ready' ? lists.data : [];
  const data = detail.status === 'ready' ? detail.data : null;
  const layout = data?.layout ?? { columns: [], sort: [], filters: {}, quickView: null };

  // An empty stored layout means "the registry default", not "no columns".
  const columnIds = layout.columns.length > 0 ? layout.columns : DEFAULT_COLUMN_IDS.slice(1);

  const allRows = data?.rows ?? [];
  const filtered = useMemo(
    () => applyWatchlistFilters(allRows, layout.filters),
    [allRows, layout.filters],
  );
  const rows = useMemo(() => sortRows(filtered, layout.sort), [filtered, layout.sort]);
  const performance = useMemo(() => summarise(rows), [rows]);

  const sectors = useMemo(() => sectorsIn(allRows), [allRows]);
  const exchanges = useMemo(() => exchangesIn(allRows), [allRows]);
  const chips = useMemo(() => activeFilterChips(layout.filters), [layout.filters]);

  const otherLists = useMemo(
    () => allLists.filter((list) => list.id !== activeId),
    [allLists, activeId],
  );

  // --- Layout edits ---------------------------------------------------------

  const setFilters = useCallback(
    (filters: WatchlistFilterStateDto) => {
      // Editing a filter by hand means the quick view no longer describes what
      // is on screen, so it stops being shown as active.
      setLayout({ ...layout, filters, quickView: null });
    },
    [layout, setLayout],
  );

  const applyQuickView = useCallback(
    (viewId: string) => {
      const view = getQuickView(viewId);
      if (view === null) return;
      setLayout({
        columns: [...view.columns],
        sort: [...view.sort],
        filters: view.filters,
        quickView: view.id,
      });
    },
    [setLayout],
  );

  const applySavedView = useCallback(
    (view: SavedViewDto) => {
      setLayout({
        columns: [...view.columns],
        sort: [...view.sort],
        filters: view.filters,
        quickView: null,
      });
    },
    [setLayout],
  );

  const onSortChange = useCallback(
    (columnId: string, additive: boolean) => {
      setLayout({ ...layout, sort: toggleSort(layout.sort, columnId, additive) });
    },
    [layout, setLayout],
  );

  // --- Chrome ---------------------------------------------------------------

  if (lists.status === 'error') {
    return (
      <AppShell>
        <PageContainer width="narrow">
          <PageHeader>
            <PageHeading>
              <PageTitle>My watchlists</PageTitle>
              <PageDescription>
                Live prices and daily technical readings for the names you follow.
              </PageDescription>
            </PageHeading>
          </PageHeader>
          <ErrorState
            title="Could not load your watchlists"
            description={lists.error.remedy ?? 'The database did not respond.'}
            detail={lists.error.error}
            onRetry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  const hasFilters = chips.length > 0;
  const hasList = activeId !== null && data !== null && data.watchlist.id !== 0;
  // Covers both the very first load (no watchlist chosen yet) and switching
  // between watchlists (a new `activeId` restarts `detail` at 'loading') —
  // the two moments this page has no data to show yet but isn't empty either.
  const loadingList =
    lists.status === 'loading' || (activeId !== null && detail.status === 'loading');

  return (
    <AppShell>
      <PageContainer>
        {/* With a list open its NAME is the title, because that is what the user
            navigated to. The breadcrumb above it is then the only thing saying
            which section they are in, which is exactly what it is for. */}
        <PageHeader>
          <PageHeading>
            {hasList && (
              <PageBreadcrumb trail={[{ label: 'My watchlists', href: '/watchlists' }]} />
            )}
            <PageTitle>{hasList ? data.watchlist.name : 'My watchlists'}</PageTitle>
            <PageDescription>
              {hasList
                ? 'Live prices and daily technical readings for the names on this list.'
                : 'Group the stocks you follow and track their prices and technical readings side by side.'}
            </PageDescription>
          </PageHeading>

          {hasList && (
            <PageActions>
              {/* Refreshing THIS list's prices is page functionality, so it sits
                  with the page's own actions. The header bar owns market state,
                  not per-page reloads. */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={refresh}
                disabled={isRefreshing}
                aria-label="Refresh prices"
              >
                <RefreshCwIcon className={isRefreshing ? 'animate-spin' : undefined} />
              </Button>
              <AddStocks
                existingSymbols={allRows.map((row) => row.symbol)}
                onAdd={async (symbols) => {
                  const result = await addSymbols(symbols);
                  return result.ok ? { ok: true } : { ok: false, error: result.error.error };
                }}
              />
            </PageActions>
          )}
        </PageHeader>

        <WatchlistTabs
          lists={allLists}
          activeId={activeId}
          loading={lists.status === 'loading'}
          onSelect={setActiveId}
          onCreate={async (name) => {
            const result = await createList(name);
            return result.ok ? { ok: true } : { ok: false, error: result.error.error };
          }}
          onRename={async (id, name) => {
            const result = await renameList(id, name);
            return result.ok ? { ok: true } : { ok: false, error: result.error.error };
          }}
          onDelete={(id) => void deleteList(id)}
          onMakeDefault={(id) => void makeDefault(id)}
          onReorder={(ids) => void reorderLists(ids)}
        />

        <PageContent className="mt-4 min-w-0">
          {loadingList && <WatchlistPageSkeleton />}

          {!loadingList && !hasList && lists.status === 'ready' && allLists.length === 0 && (
            <Card className="px-4 py-12 text-center">
              <Text variant="section-title">No watchlists yet</Text>
              <Text variant="caption" className="mx-auto mt-1 max-w-sm text-balance">
                Create a list — a sector, a strategy, a theme — and add the stocks you want to keep
                an eye on.
              </Text>
            </Card>
          )}

          {hasList && (
            <>
              <SummaryBar performance={performance} filtered={hasFilters} />

              {data.quotesStale && (
                <Alert variant="warning">
                  <AlertTitle>Prices are not live</AlertTitle>
                  <AlertDescription>
                    The market-data provider did not answer, so the price columns are empty.
                    Indicator columns still show the last session the worker computed.
                  </AlertDescription>
                </Alert>
              )}

              {!data.quotesStale && data.missingQuotes.length > 0 && (
                <Alert variant="warning">
                  <AlertTitle>No quote for {data.missingQuotes.length} of these</AlertTitle>
                  <AlertDescription>
                    {data.missingQuotes.join(', ')} — the exchange returned nothing for them. They
                    are still on the list and are excluded from the averages above.
                  </AlertDescription>
                </Alert>
              )}

              <QuickViews
                activeId={layout.quickView}
                savedViews={data.savedViews}
                layout={layout}
                onApply={applyQuickView}
                onApplySaved={applySavedView}
                onSave={async ({ name, global }) => {
                  const result = await saveView({
                    name,
                    global,
                    columns: columnIds,
                    sort: layout.sort,
                    filters: layout.filters,
                  });
                  return result.ok ? { ok: true } : { ok: false, error: result.error.error };
                }}
                onDeleteSaved={(id) => void deleteView(id)}
              />

              <Card>
                <CardHeader className="flex-wrap items-center gap-2 py-2.5">
                  <SearchInput
                    value={layout.filters.query ?? ''}
                    onValueChange={(query) => setFilters({ ...layout.filters, query })}
                    placeholder="Filter these stocks…"
                    aria-label="Filter the watchlist"
                    className="w-full sm:w-56"
                  />
                  <CardToolbar className="flex-wrap gap-2">
                    <FilterPanel
                      filters={layout.filters}
                      sectors={sectors}
                      exchanges={exchanges}
                      onChange={setFilters}
                      onClear={() => setFilters({})}
                    />
                    <ColumnPanel
                      columnIds={columnIds}
                      onChange={(columns) =>
                        setLayout({ ...layout, columns: [...columns], quickView: null })
                      }
                    />
                    <Text variant="caption" className="whitespace-nowrap">
                      {rows.length === allRows.length
                        ? `${allRows.length} stocks`
                        : `${rows.length} of ${allRows.length}`}
                    </Text>
                  </CardToolbar>
                </CardHeader>

                {hasFilters && (
                  <div className="border-b border-border px-4 py-2">
                    <ActiveFilters
                      filters={chips}
                      onRemove={(id) => setFilters(removeWatchlistFilter(layout.filters, id))}
                      onClear={() => setFilters({})}
                    />
                  </div>
                )}

                <CardContent flush>
                  <WatchlistTable
                    rows={rows}
                    columnIds={columnIds}
                    sort={layout.sort}
                    isLive={data.market.isOpen}
                    status={
                      detail.status === 'loading'
                        ? 'loading'
                        : detail.status === 'error'
                          ? 'error'
                          : 'ready'
                    }
                    errorMessage={detail.status === 'error' ? detail.error.error : undefined}
                    onRetry={refresh}
                    otherLists={otherLists}
                    hasFilters={hasFilters}
                    emptyAction={
                      hasFilters ? (
                        <Button variant="outline" size="sm" onClick={() => setFilters({})}>
                          Clear filters
                        </Button>
                      ) : (
                        <AddStocks
                          existingSymbols={allRows.map((row) => row.symbol)}
                          onAdd={async (symbols) => {
                            const result = await addSymbols(symbols);
                            return result.ok
                              ? { ok: true }
                              : { ok: false, error: result.error.error };
                          }}
                        />
                      )
                    }
                    onSortChange={onSortChange}
                    onRemove={(row) => void removeSymbols([row.instrumentId])}
                    onOpenDetail={setSelected}
                    onOpenSignals={(row) => router.push(`/signals?symbol=${row.symbol}`)}
                    onAddToList={(watchlistId, symbol) => void addSymbolsTo(watchlistId, [symbol])}
                  />
                </CardContent>
              </Card>
            </>
          )}

          <PageDisclaimer />
        </PageContent>
      </PageContainer>

      <StockDetailDrawer
        quote={selected === null ? null : toMoverDto(selected)}
        signal={null}
        isLive={data?.market.isOpen ?? false}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}

/**
 * Mirrors the real layout so nothing jumps once the list's data lands —
 * same shape and the same `CardSkeleton`/`TableSkeleton` primitives every
 * other page's loading state is built from (see `DashboardSkeleton` in
 * `dashboard.tsx`), not a bespoke skeleton for this one page.
 */
function WatchlistPageSkeleton() {
  return (
    <div aria-busy="true">
      <CardSkeleton className="h-20" />
      <TableSkeleton className="mt-4" />
      <span className="sr-only">Loading watchlist</span>
    </div>
  );
}

/**
 * Adapts a watchlist row to the shape the shared detail drawer reads.
 *
 * The drawer is the product's one stock-detail surface and already renders the
 * chart, the day range and the identity block. Reshaping four fields is much
 * cheaper than a second drawer that would immediately drift from it.
 *
 * `ltp` is non-nullable on `MoverDto` because a quote without a last price is
 * dropped upstream; a watchlist row can legitimately have none, and 0 is the
 * only representable stand-in. The drawer renders a zero price as a zero, which
 * is why the row's own "quote only" badge and the missing-quotes alert carry
 * that information instead.
 */
function toMoverDto(row: WatchlistRowDto): MoverDto {
  return {
    symbol: row.symbol,
    name: row.name,
    ltp: row.ltp ?? 0,
    change: row.change,
    changePercent: row.changePercent,
    open: row.open,
    high: row.dayHigh,
    low: row.dayLow,
    previousClose: row.previousClose,
    averagePrice: row.averagePrice,
    volume: row.volume,
    timestamp: row.quoteAt,
    sector: row.sector ?? 'Other',
    relativeVolume: row.relativeVolume,
    turnover: row.ltp === null || row.volume === null ? null : row.ltp * row.volume,
  };
}
