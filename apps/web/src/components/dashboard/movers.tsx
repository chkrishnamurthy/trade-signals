'use client';

import { EmptyState } from '@/components/data-display/states';
import { PercentChange, Price, Ratio, Turnover, Volume } from '@/components/market/numeric';
import { StockIdentity } from '@/components/market/stock-identity';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import type { MoverDto } from '@/lib/dashboard-types';

/**
 * Movers list — gainers, losers, most active and unusual volume all share this.
 *
 * One component rather than four near-identical ones; the differences are the
 * trailing metric and the empty-state wording.
 */

export type MoverMetric = 'changePercent' | 'volume' | 'turnover' | 'relativeVolume';

const METRIC_LABEL: Record<MoverMetric, string> = {
  changePercent: 'Change',
  volume: 'Volume',
  turnover: 'Turnover',
  relativeVolume: 'Rel. vol',
};

function MetricValue({ mover, metric }: { mover: MoverDto; metric: MoverMetric }) {
  switch (metric) {
    case 'volume':
      return <Volume shares={mover.volume} size="sm" />;
    case 'turnover':
      return <Turnover paise={mover.turnover} size="sm" />;
    case 'relativeVolume':
      return <Ratio value={mover.relativeVolume} size="sm" />;
    default:
      return <PercentChange value={mover.changePercent} size="sm" />;
  }
}

export function MoversCard({
  title,
  subtitle,
  movers,
  metric = 'changePercent',
  emptyTitle,
  emptyDetail,
  onSelect,
}: {
  title: string;
  subtitle?: string | undefined;
  movers: readonly MoverDto[];
  metric?: MoverMetric | undefined;
  emptyTitle: string;
  emptyDetail?: string | undefined;
  onSelect: (symbol: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>{title}</CardTitle>
          {subtitle !== undefined && <CardDescription>{subtitle}</CardDescription>}
        </CardHeading>
      </CardHeader>
      <CardContent flush>
        {movers.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDetail} />
        ) : (
          <ul className="divide-y divide-border">
            {movers.map((mover) => (
              <li key={mover.symbol}>
                <button
                  type="button"
                  onClick={() => onSelect(mover.symbol)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
                >
                  <StockIdentity symbol={mover.symbol} name={mover.sector} className="flex-1" />

                  <span className="flex shrink-0 flex-col items-end">
                    <Price paise={mover.ltp} bare size="sm" />
                    <PercentChange value={mover.changePercent} size="xs" />
                  </span>

                  {metric !== 'changePercent' && (
                    <span className="flex w-20 shrink-0 flex-col items-end">
                      <MetricValue mover={mover} metric={metric} />
                      <span className="text-[0.625rem] tracking-wide text-subtle-foreground uppercase">
                        {METRIC_LABEL[metric]}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
