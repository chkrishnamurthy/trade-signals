import { StatTile } from '@/components/data-display/metric-card';
import { EmptyState, SkeletonRows } from '@/components/data-display/states';
import { ContentGrid } from '@/components/layout/grid';
import { Turnover, Volume } from '@/components/market/numeric';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ActivityEventDto, QuickStatsDto } from '@/lib/dashboard-types';
import { istTime } from '@/lib/format';
import { toneFill } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Market activity.
 *
 * Every entry is a technical setup the engine actually detected on real
 * candles — nothing is synthesised to make the feed look busy.
 */
export function MarketActivity({
  events,
  loading,
}: {
  events: readonly ActivityEventDto[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Market activity</CardTitle>
          <CardDescription>Detected technical events</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent flush>
        {loading ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : events.length === 0 ? (
          <EmptyState
            title="No events detected"
            description="Nothing in the index triggered a named technical setup on the latest close."
          />
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <li
                  // One setup fires at most once per symbol per bar, so this is unique.
                  key={`${event.symbol}-${event.message}-${event.at}`}
                  className="flex items-start gap-2 px-4 py-2"
                >
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      toneFill({
                        tone:
                          event.tone === 'bullish'
                            ? 'bullish'
                            : event.tone === 'bearish'
                              ? 'bearish'
                              : 'neutral',
                      }),
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{event.symbol}</span>{' '}
                      <span className="text-muted-foreground">{event.message}</span>
                    </span>
                    <span className="figure block font-mono text-[0.6875rem] text-subtle-foreground">
                      {istTime(event.at)} IST
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact statistic tiles — deliberately smaller than the index cards. */
export function QuickStats({ stats }: { stats: QuickStatsDto }) {
  return (
    <ContentGrid columns="stats">
      <StatTile label="Total volume" value={<Volume shares={stats.totalVolume} />} />
      <StatTile label="Turnover" value={<Turnover paise={stats.totalTurnover} />} />
      <StatTile
        label="Advancing"
        value={<span className="figure text-bullish-strong">{stats.advancing}</span>}
      />
      <StatTile
        label="Declining"
        value={<span className="figure text-bearish-strong">{stats.declining}</span>}
      />
      <StatTile
        label="Near 52W high"
        hint="Constituents trading within 2% of their 52-week high."
        value={<span className="figure">{stats.nearHigh52w ?? '—'}</span>}
      />
      <StatTile
        label="Near 52W low"
        hint="Constituents trading within 2% of their 52-week low."
        value={<span className="figure">{stats.nearLow52w ?? '—'}</span>}
      />
    </ContentGrid>
  );
}
