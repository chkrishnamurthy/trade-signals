'use client';

import { StarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/layout/page';
import { Currency, Percent, Price, Quantity } from '@/components/market/numeric';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import type {
  DealDto,
  FiiDiiDayDto,
  InstitutionalFlowDto,
  ShareholdingDto,
} from '@/lib/disclosure-types';
import {
  aggregateByClient,
  type ClientFlow,
  cumulativeSeries,
  type DealFilters,
  filterDeals,
  NO_DEAL_FILTERS,
  netSeries,
} from '@/lib/flow-analytics';
import { FlowChart } from './flow-chart';
import {
  DealTypeBadge,
  FreshnessBanner,
  formatDateKey,
  NetValue,
  ScopeToggle,
  Segmented,
  SideBadge,
} from './parts';

/**
 * Institutional Flow page (`/flows`).
 *
 * Three official datasets: daily FII/DII net activity (market-wide), bulk &
 * block deals, and quarterly shareholding. The scope toggle narrows deals and
 * shareholding to the user's watchlist; FII/DII is market-wide and always full.
 */
export function FlowView({ data }: { data: InstitutionalFlowDto }) {
  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>Institutional Flow</PageTitle>
            <PageDescription>
              Where the big money went — FII/DII activity, large deals and shareholding.
            </PageDescription>
          </PageHeading>
          <ScopeToggle watchlistOnly={data.watchlistOnly} hasWatchlists={data.hasWatchlists} />
        </PageHeader>

        <PageContent>
          <FreshnessBanner
            status={data.status}
            latestLabel={data.latestFlowDate === null ? null : formatDateKey(data.latestFlowDate)}
          />

          <FiiDiiSection latest={data.latest} history={data.fiiDii} />
          <TopMoversSection deals={data.deals} />
          <DealsSection deals={data.deals} watchlistOnly={data.watchlistOnly} />
          <ShareholdingSection rows={data.shareholding} hasWatchlists={data.hasWatchlists} />

          <PageDisclaimer>{data.disclaimer}</PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function FiiDiiSection({
  latest,
  history,
}: {
  latest: FiiDiiDayDto | null;
  history: readonly FiiDiiDayDto[];
}) {
  const [participant, setParticipant] = useState<'fii' | 'dii'>('fii');
  const [mode, setMode] = useState<'bars' | 'line'>('bars');

  const dailyPoints = useMemo(() => netSeries(history, participant), [history, participant]);
  const points = useMemo(
    () => (mode === 'line' ? cumulativeSeries(dailyPoints) : dailyPoints),
    [mode, dailyPoints],
  );

  return (
    <Section aria-labelledby="fiidii-heading">
      <SectionHeader>
        <SectionTitle id="fiidii-heading">FII / DII activity</SectionTitle>
        <SectionDescription>Net cash-market buying and selling, in ₹</SectionDescription>
      </SectionHeader>

      {latest === null ? (
        <EmptyState title="No FII/DII data yet" description="It is published after the close." />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented
                  ariaLabel="Participant"
                  value={participant}
                  onChange={setParticipant}
                  options={[
                    { id: 'fii', label: 'FII' },
                    { id: 'dii', label: 'DII' },
                  ]}
                />
                <Segmented
                  ariaLabel="Chart mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { id: 'bars', label: 'Daily net' },
                    { id: 'line', label: 'Cumulative' },
                  ]}
                />
              </div>
              <FlowChart
                points={points}
                mode={mode}
                seriesLabel={participant === 'fii' ? 'FII' : 'DII'}
              />
              <Text as="p" variant="caption">
                {mode === 'line'
                  ? 'Running total of net buying over the window. Above the line is net accumulation.'
                  : 'Each bar is one session’s net. Green is net buying, red is net selling.'}
              </Text>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FlowCard
              title="FII net"
              subtitle={formatDateKey(latest.tradingDate)}
              flow={latest.fii}
            />
            <FlowCard
              title="DII net"
              subtitle={formatDateKey(latest.tradingDate)}
              flow={latest.dii}
            />
          </div>

          <Card>
            <CardContent className="overflow-x-auto px-0 py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">FII net</TableHead>
                    <TableHead className="text-right">DII net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((day) => (
                    <TableRow key={day.tradingDate}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateKey(day.tradingDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {day.fii === null ? '—' : <NetValue paise={day.fii.net} />}
                      </TableCell>
                      <TableCell className="text-right">
                        {day.dii === null ? '—' : <NetValue paise={day.dii.net} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </Section>
  );
}

function FlowCard({
  title,
  subtitle,
  flow,
}: {
  title: string;
  subtitle: string;
  flow: { buy: number; sell: number; net: number } | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <div className="flex items-baseline justify-between">
          <Text as="h3" variant="overline">
            {title}
          </Text>
          <Text as="span" variant="caption">
            {subtitle}
          </Text>
        </div>
        {flow === null ? (
          <Text variant="secondary">Not reported</Text>
        ) : (
          <>
            <NetValue paise={flow.net} className="text-lg font-semibold" />
            <Text as="p" variant="caption">
              Bought <Currency paise={flow.buy} /> · Sold <Currency paise={flow.sell} />
            </Text>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TopMoversSection({ deals }: { deals: readonly DealDto[] }) {
  const flows = useMemo(() => aggregateByClient(deals), [deals]);
  if (flows.length === 0) return null;

  const buyers = flows.filter((f) => f.net > 0).slice(0, 5);
  const sellers = flows
    .filter((f) => f.net < 0)
    .sort((a, b) => a.net - b.net)
    .slice(0, 5);

  return (
    <Section aria-labelledby="movers-heading">
      <SectionHeader>
        <SectionTitle id="movers-heading">Top institutional parties</SectionTitle>
        <SectionDescription>
          Net across recent bulk &amp; block deals, by trading party
        </SectionDescription>
      </SectionHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MoversCard title="Net buyers" rows={buyers} empty="No net buyers in recent deals." />
        <MoversCard title="Net sellers" rows={sellers} empty="No net sellers in recent deals." />
      </div>
    </Section>
  );
}

function MoversCard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: readonly ClientFlow[];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <Text as="h3" variant="overline">
          {title}
        </Text>
        {rows.length === 0 ? (
          <Text variant="caption">{empty}</Text>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li key={row.client} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground" title={row.client}>
                  {row.client}
                  <span className="ml-1 text-2xs text-subtle-foreground">
                    ({row.deals} {row.deals === 1 ? 'deal' : 'deals'})
                  </span>
                </span>
                <NetValue paise={row.net} className="shrink-0 text-sm font-medium" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const MIN_VALUE_OPTIONS = [
  { id: '0', label: 'Any size' },
  { id: '1000000000', label: '₹1 Cr+' },
  { id: '5000000000', label: '₹5 Cr+' },
  { id: '25000000000', label: '₹25 Cr+' },
] as const;

function DealsSection({
  deals,
  watchlistOnly,
}: {
  deals: readonly DealDto[];
  watchlistOnly: boolean;
}) {
  const [filters, setFilters] = useState<DealFilters>(NO_DEAL_FILTERS);
  const latestDate = useMemo(
    () => deals.reduce((max, deal) => (deal.tradingDate > max ? deal.tradingDate : max), ''),
    [deals],
  );
  const filtered = useMemo(() => filterDeals(deals, filters), [deals, filters]);
  const patch = (next: Partial<DealFilters>): void => setFilters((prev) => ({ ...prev, ...next }));

  return (
    <Section aria-labelledby="deals-heading">
      <SectionHeader>
        <SectionTitle id="deals-heading">Bulk &amp; block deals</SectionTitle>
        <SectionDescription>
          {deals.length === 0
            ? 'Large single trades reported by the exchange'
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
          <Segmented
            ariaLabel="Dates"
            value={filters.since === null ? 'all' : 'latest'}
            onChange={(id) =>
              patch({ since: id === 'latest' && latestDate !== '' ? latestDate : null })
            }
            options={[
              { id: 'all', label: 'All dates' },
              { id: 'latest', label: 'Latest session' },
            ]}
          />
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto px-0 py-0">
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
                description="Widen the size, side, type or date filters."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                      {formatDateKey(deal.tradingDate)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <span className="font-mono text-xs font-medium">{deal.symbol}</span>
                        {deal.onWatchlist && (
                          <StarIcon
                            aria-label="On your watchlist"
                            className="size-3 fill-warning text-warning"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-xs">
                      {deal.clientName}
                    </TableCell>
                    <TableCell>
                      <SideBadge side={deal.side} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Quantity units={deal.quantity} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Price paise={deal.price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Currency paise={deal.value} />
                    </TableCell>
                    <TableCell>
                      <DealTypeBadge dealType={deal.dealType} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function ShareholdingSection({
  rows,
  hasWatchlists,
}: {
  rows: readonly ShareholdingDto[];
  hasWatchlists: boolean;
}) {
  return (
    <Section aria-labelledby="shareholding-heading">
      <SectionHeader>
        <SectionTitle id="shareholding-heading">Shareholding pattern</SectionTitle>
        <SectionDescription>Latest quarterly ownership for the names you follow</SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="overflow-x-auto px-0 py-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={hasWatchlists ? 'No shareholding data yet' : 'Follow some names first'}
                description={
                  hasWatchlists
                    ? 'It updates once a quarter, after companies file.'
                    : 'Add stocks to a watchlist to see their ownership breakdown here.'
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Promoter</TableHead>
                  <TableHead className="text-right">FII</TableHead>
                  <TableHead className="text-right">DII</TableHead>
                  <TableHead className="text-right">Public</TableHead>
                  <TableHead className="text-right">As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.instrumentId}>
                    <TableCell>
                      <span className="font-mono text-xs font-medium">{row.symbol}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Percent value={row.promoterPercent} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Percent value={row.fiiPercent} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Percent value={row.diiPercent} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Percent value={row.publicPercent} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground text-xs">
                      {formatDateKey(row.asOfDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}
