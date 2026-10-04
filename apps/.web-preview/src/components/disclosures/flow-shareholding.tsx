'use client';

import { EmptyState } from '@/components/data-display/states';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/layout/page';
import { Percent } from '@/components/market/numeric';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ShareholdingDto } from '@/lib/disclosure-types';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { formatDateKey } from './parts';

/**
 * Quarterly ownership for followed names, with the change since the prior
 * quarter on file — a snapshot alone says nothing about flow.
 */
export function ShareholdingSection({
  rows,
  hasWatchlists,
  onOpen,
}: {
  rows: readonly ShareholdingDto[];
  hasWatchlists: boolean;
  onOpen: (symbol: string) => void;
}) {
  return (
    <Section aria-labelledby="shareholding-heading">
      <SectionHeader>
        <SectionTitle id="shareholding-heading">Shareholding pattern</SectionTitle>
        <SectionDescription>
          Latest quarterly ownership for the names you follow, with the quarter-on-quarter change
        </SectionDescription>
      </SectionHeader>
      <Card>
        <CardContent className="overflow-x-auto px-0 py-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={hasWatchlists ? 'No shareholding data yet' : 'Follow some names first'}
                description={
                  hasWatchlists
                    ? 'It updates weekly for followed names, from the exchange’s quarterly filings.'
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
                  <TableHead className="text-right">Quarter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.instrumentId}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpen(row.symbol)}
                        className="font-medium text-sm hover:underline"
                      >
                        {row.symbol}
                      </button>
                    </TableCell>
                    <ShareCell value={row.promoterPercent} change={row.promoterChange} />
                    <ShareCell value={row.fiiPercent} change={row.fiiChange} />
                    <ShareCell value={row.diiPercent} change={row.diiChange} />
                    <ShareCell value={row.publicPercent} change={row.publicChange} />
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground text-xs">
                      {formatDateKey(row.asOfDate).replace(/^\w+, /, '')}
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

function ShareCell({ value, change }: { value: number | null; change: number | null }) {
  const tone =
    change === null ? 'neutral' : change > 0 ? 'bullish' : change < 0 ? 'bearish' : 'neutral';
  return (
    <TableCell className="text-right">
      <span className="flex flex-col items-end">
        <Percent value={value} decimals={2} />
        {value !== null && (
          <span className={cn('figure text-2xs', toneText({ tone }))}>
            {change === null
              ? 'first quarter on file'
              : `${change > 0 ? '+' : ''}${change.toFixed(2)} pts`}
          </span>
        )}
      </span>
    </TableCell>
  );
}
