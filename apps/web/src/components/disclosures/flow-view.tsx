'use client';

import { StarIcon } from 'lucide-react';
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
  DealTypeBadge,
  FreshnessBanner,
  formatDateKey,
  NetValue,
  ScopeToggle,
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

function DealsSection({
  deals,
  watchlistOnly,
}: {
  deals: readonly DealDto[];
  watchlistOnly: boolean;
}) {
  return (
    <Section aria-labelledby="deals-heading">
      <SectionHeader>
        <SectionTitle id="deals-heading">Bulk &amp; block deals</SectionTitle>
        <SectionDescription>Large single trades reported by the exchange</SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="overflow-x-auto px-0 py-0">
          {deals.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={watchlistOnly ? 'No deals in your watchlist' : 'No recent deals'}
                description="Bulk and block deals are published after the close."
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
                {deals.map((deal) => (
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
