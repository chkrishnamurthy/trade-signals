'use client';

import { useCallback, useMemo, useState } from 'react';
import { StockDetailDrawer } from '@/components/dashboard/stock-drawer';
import { ErrorState, SkeletonRows } from '@/components/data-display/states';
import { ActiveFilters, FilterBar, FilterGroup, SearchInput } from '@/components/forms/filter-bar';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { LastUpdated, MarketStatus } from '@/components/market/market-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  activeStockFilterChips,
  applyStockFilters,
  DEFAULT_STOCK_FILTERS,
  removeStockFilter,
  type StockDirectionFilter,
  type StockFilterState,
  toggleStockFacet,
} from '@/lib/stocks-display';
import { useStocks } from '@/lib/use-stocks';
import { SectorStrip } from './sector-strip';
import { StocksTable } from './stocks-table';

/**
 * Every tracked stock, sliceable by sector.
 *
 * The dashboard answers "what is the market doing"; this answers "which of
 * these fifty-odd names should I look at". Same data, different shape: the
 * dashboard renders slices of the constituent list, this renders all of it and
 * lets you sort and filter your way to the slice you want.
 *
 * Two feeds on different cadences, as everywhere else. Quotes render the table
 * immediately; indicators fill three more columns when they arrive. An
 * indicator feed that fails is a degraded page, not a broken one, so it never
 * becomes a page-level error.
 */
export function StocksPage() {
  const { stocks, technicals, refresh, isRefreshing } = useStocks();
  const [filters, setFilters] = useState<StockFilterState>(DEFAULT_STOCK_FILTERS);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const data = stocks.status === 'ready' ? stocks.data : null;
  const technicalData = technicals.status === 'ready' ? technicals.data : null;

  const bySymbol = useMemo(
    () => new Map((technicalData?.signals ?? []).map((signal) => [signal.symbol, signal])),
    [technicalData],
  );

  const indexNames = useMemo(
    () => new Map((data?.indices ?? []).map((index) => [index.key, index.name])),
    [data],
  );

  const rows = useMemo(() => applyStockFilters(data?.rows ?? [], filters), [data, filters]);

  const chips = useMemo(() => activeStockFilterChips(filters, indexNames), [filters, indexNames]);

  const selectedRow = useMemo(
    () => data?.rows.find((row) => row.symbol === selectedSymbol) ?? null,
    [data, selectedSymbol],
  );

  const toggleSector = useCallback((sector: string) => {
    setFilters((current) => ({
      ...current,
      sectors: toggleStockFacet(current.sectors, sector),
    }));
  }, []);

  const clearSectors = useCallback(() => {
    setFilters((current) => ({ ...current, sectors: [] }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_STOCK_FILTERS), []);

  const topbar = (
    <div className="ml-auto hidden items-center gap-2 sm:flex">
      <MarketStatus phase={data?.market.phase ?? 'unknown'} isOpen={data?.market.isOpen ?? false} />
      <LastUpdated at={data?.fetchedAt ?? null} />
    </div>
  );

  // Built once and rendered in both branches, so a failed load still says which
  // page the user is on.
  const header = (
    <PageHeader>
      <PageHeading>
        <PageTitle>All stocks</PageTitle>
        <PageDescription>
          Every NSE name we track, with today&rsquo;s price and its daily technical readings. Filter
          by sector to compare like with like.
        </PageDescription>
      </PageHeading>
      <PageActions>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </PageActions>
    </PageHeader>
  );

  if (stocks.status === 'error') {
    return (
      <AppShell topbar={topbar}>
        <PageContainer width="narrow">
          {header}
          <ErrorState
            title="Could not load the stock list"
            description={stocks.error.remedy ?? 'The market-data provider did not respond.'}
            detail={stocks.error.error}
            onRetry={refresh}
          />
        </PageContainer>
      </AppShell>
    );
  }

  const hasFilters = chips.length > 0;

  return (
    <AppShell topbar={topbar}>
      <PageContainer>
        {header}

        <PageContent>
          {data !== null && data.missing.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>
                {data.missing.length} symbol{data.missing.length === 1 ? '' : 's'} without a quote
              </AlertTitle>
              <AlertDescription>
                The provider returned nothing for {data.missing.join(', ')}. They are omitted rather
                than shown at a stale price.
              </AlertDescription>
            </Alert>
          )}

          <FilterBar>
            <SearchInput
              value={filters.query}
              onValueChange={(query) => setFilters((current) => ({ ...current, query }))}
              placeholder="Search ticker, company or sector…"
              className="w-full sm:w-72"
              aria-label="Search stocks"
            />

            {(data?.indices.length ?? 0) > 1 && (
              <FilterGroup label="Index">
                <ToggleGroup
                  type="multiple"
                  value={[...filters.indices]}
                  onValueChange={(indices: string[]) =>
                    setFilters((current) => ({ ...current, indices }))
                  }
                >
                  {(data?.indices ?? []).map((index) => (
                    <ToggleGroupItem key={index.key} value={index.key} aria-label={index.name}>
                      {index.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FilterGroup>
            )}

            <FilterGroup label="Direction">
              <ToggleGroup
                type="single"
                value={filters.direction}
                onValueChange={(direction: string) => {
                  // Radix emits '' when the active item is clicked again; a
                  // single-choice filter must not be deselectable into nothing.
                  if (direction === '') return;
                  setFilters((current) => ({
                    ...current,
                    direction: direction as StockDirectionFilter,
                  }));
                }}
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="advancing">Advancing</ToggleGroupItem>
                <ToggleGroupItem value="declining">Declining</ToggleGroupItem>
              </ToggleGroup>
            </FilterGroup>
          </FilterBar>

          <ActiveFilters
            filters={chips}
            onRemove={(id) => setFilters((current) => removeStockFilter(current, id))}
            onClear={resetFilters}
          />

          {data === null ? (
            <SectorStripSkeleton />
          ) : (
            <SectorStrip
              sectors={data.sectors}
              selected={filters.sectors}
              onToggle={toggleSector}
              onClear={clearSectors}
              total={data.rows.length}
            />
          )}

          {technicals.status === 'error' && (
            <Alert variant="warning">
              <AlertTitle>Indicators unavailable</AlertTitle>
              <AlertDescription>
                RSI, EMA position and 52-week position are blank for now. Quotes are unaffected.
              </AlertDescription>
            </Alert>
          )}

          <StocksTable
            rows={rows}
            technicals={bySymbol}
            status={data === null ? 'loading' : 'ready'}
            onRowClick={(row) => setSelectedSymbol(row.symbol)}
            onResetFilters={resetFilters}
            filtered={hasFilters}
          />

          {data !== null && (
            <p className="text-muted-foreground text-xs">
              Showing {rows.length} of {data.rows.length} tracked names
              {technicalData === null && ' · indicators still loading'}
              {technicalData !== null &&
                technicalData.skipped.length > 0 &&
                ` · no daily history for ${technicalData.skipped.join(', ')}`}
            </p>
          )}

          <PageDisclaimer />
        </PageContent>
      </PageContainer>

      <StockDetailDrawer
        quote={selectedRow}
        signal={selectedSymbol === null ? null : (bySymbol.get(selectedSymbol) ?? null)}
        isLive={data?.market.isOpen ?? false}
        onClose={() => setSelectedSymbol(null)}
      />
    </AppShell>
  );
}

/** Holds the strip's height while the first quote poll is in flight. */
function SectorStripSkeleton() {
  return (
    <Card>
      <CardContent>
        <SkeletonRows rows={2} />
      </CardContent>
    </Card>
  );
}
