'use client';

import { SearchIcon, StarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/layout/page';
import { Currency, Price, Quantity } from '@/components/market/numeric';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/typography';
import type { DealDto } from '@/lib/disclosure-types';
import {
  aggregateByClient,
  type ClientFlow,
  type DealFilters,
  filterDeals,
  NO_DEAL_FILTERS,
} from '@/lib/flow-analytics';
import { DealTypeBadge, formatDateKey, NetValue, Segmented, SideBadge } from './parts';

/**
 * The deals ledger: every reported bulk and block deal, grouped by session,
 * with the party name given the room it deserves. Secondary to the stock
 * table — the same deals already roll up into its Deals column.
 */

/** Deals rendered before a "show more"; the ledger is secondary to the table above it. */
const PAGE = 30;

const MIN_VALUE_OPTIONS = [
  { id: '0', label: 'Any size' },
  { id: '1000000000', label: '₹1 Cr+' },
  { id: '5000000000', label: '₹5 Cr+' },
  { id: '25000000000', label: '₹25 Cr+' },
] as const;

export function DealsSection({
  deals,
  watchlistOnly,
  onOpen,
}: {
  deals: readonly DealDto[];
  watchlistOnly: boolean;
  onOpen: (symbol: string) => void;
}) {
  const [filters, setFilters] = useState<DealFilters>(NO_DEAL_FILTERS);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const patch = (next: Partial<DealFilters>): void => setFilters((prev) => ({ ...prev, ...next }));

  const filtered = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return filterDeals(deals, filters).filter(
      (deal) =>
        needle === '' ||
        deal.symbol.includes(needle) ||
        deal.clientName.toUpperCase().includes(needle) ||
        deal.companyName.toUpperCase().includes(needle),
    );
  }, [deals, filters, search]);

  // Newest session first; within a session the biggest deals lead, since
  // the exchange file's own order (by symbol) says nothing about weight.
  const ordered = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (a.tradingDate < b.tradingDate ? 1 : a.tradingDate > b.tradingDate ? -1 : 0) ||
          b.value - a.value,
      ),
    [filtered],
  );
  const bySession = useMemo(() => {
    const groups = new Map<string, DealDto[]>();
    for (const deal of ordered.slice(0, limit)) {
      const list = groups.get(deal.tradingDate) ?? [];
      list.push(deal);
      groups.set(deal.tradingDate, list);
    }
    return [...groups.entries()];
  }, [ordered, limit]);

  const parties = useMemo(() => aggregateByClient(deals), [deals]);

  return (
    <Section aria-labelledby="deals-heading">
      <SectionHeader>
        <SectionTitle id="deals-heading">Bulk &amp; block deals</SectionTitle>
        <SectionDescription>
          {deals.length === 0
            ? 'Large single trades reported by the exchange, with the party named'
            : `Showing ${filtered.length} of ${deals.length} recent deals`}
        </SectionDescription>
      </SectionHeader>

      {deals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Side"
            value={filters.side}
            onChange={(side) => patch({ side })}
            options={[
              { id: 'all', label: 'All' },
              { id: 'buy', label: 'Buy' },
              { id: 'sell', label: 'Sell' },
            ]}
          />
          <Segmented
            ariaLabel="Deal type"
            value={filters.type}
            onChange={(type) => patch({ type })}
            options={[
              { id: 'all', label: 'All' },
              { id: 'bulk', label: 'Bulk' },
              { id: 'block', label: 'Block' },
            ]}
          />
          <Segmented
            ariaLabel="Minimum value"
            value={String(filters.minValue)}
            onChange={(id) => patch({ minValue: Number(id) })}
            options={MIN_VALUE_OPTIONS}
          />
          <div className="relative ml-auto w-full sm:w-56">
            <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Stock or party"
              className="h-8 pl-7 text-xs"
              aria-label="Find a deal by stock or party"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="px-0 py-0">
            {deals.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={watchlistOnly ? 'No deals in your watchlist' : 'No recent deals'}
                  description="Bulk and block deals are published after the close."
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No deals match these filters"
                  description="Widen the size, side or type, or clear the search."
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {bySession.map(([date, list]) => (
                  <section key={date} aria-label={formatDateKey(date)}>
                    <header className="sticky top-0 bg-muted/60 px-4 py-1.5 backdrop-blur">
                      <Text as="h3" variant="overline">
                        {formatDateKey(date)} · {list.length}
                      </Text>
                    </header>
                    <ul className="divide-y divide-border">
                      {list.map((deal) => (
                        <li key={deal.id} className="flex flex-col gap-1 px-4 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpen(deal.symbol)}
                                className="shrink-0 font-medium text-sm hover:underline"
                              >
                                {deal.symbol}
                              </button>
                              {deal.onWatchlist && (
                                <StarIcon
                                  aria-label="On your watchlist"
                                  className="size-3 shrink-0 fill-warning text-warning"
                                />
                              )}
                              <span className="min-w-0 truncate text-muted-foreground text-xs">
                                {deal.companyName}
                              </span>
                            </span>
                            <Currency paise={deal.value} className="shrink-0 font-medium" />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-xs" title={deal.clientName}>
                              {deal.clientName}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground">
                              <span className="figure">
                                <Quantity units={deal.quantity} size="xs" /> @{' '}
                                <Price paise={deal.price} size="xs" />
                              </span>
                              <SideBadge side={deal.side} />
                              <DealTypeBadge dealType={deal.dealType} />
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {filtered.length > limit && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE)}
                      className="text-primary text-xs hover:underline"
                    >
                      Show {Math.min(PAGE, filtered.length - limit)} more of {filtered.length}
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <PartiesCard parties={parties} />
      </div>
    </Section>
  );
}

/**
 * Most active parties across the loaded deals. Named honestly: many are
 * proprietary desks or individuals, so "institutional" is not claimed.
 */
function PartiesCard({ parties }: { parties: readonly ClientFlow[] }) {
  const buyers = parties.filter((p) => p.net > 0).slice(0, 6);
  const sellers = parties
    .filter((p) => p.net < 0)
    .sort((a, b) => a.net - b.net)
    .slice(0, 6);
  return (
    <Card className="self-start">
      <CardContent className="flex flex-col gap-3 py-4">
        <div>
          <Text as="h3" variant="card-title">
            Most active parties
          </Text>
          <Text as="p" variant="caption">
            Net across the deals shown, by trading party
          </Text>
        </div>
        <PartyList title="Net buyers" rows={buyers} empty="No net buyers in these deals." />
        <PartyList title="Net sellers" rows={sellers} empty="No net sellers in these deals." />
      </CardContent>
    </Card>
  );
}

function PartyList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: readonly ClientFlow[];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Text as="h4" variant="overline">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text variant="caption">{empty}</Text>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li key={row.client} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-xs" title={row.client}>
                {row.client}
                <span className="ml-1 text-2xs text-subtle-foreground">
                  ({row.deals} {row.deals === 1 ? 'deal' : 'deals'})
                </span>
              </span>
              <NetValue paise={row.net} className="shrink-0 text-xs font-medium" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
