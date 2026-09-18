'use client';
import { type PaperOverview, paperOverviewSchema } from '@equitywise/shared';
import Link from 'next/link';
import { usePolledResource } from '@/components/intraday/use-polled-resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ROUTES } from '@/lib/api-routes';
import { price, signed } from './format';

/** The compact card on /intraday (plan §4): state, value, today, open trades, strategies, link. */
export function PaperStatus({ data }: { data: PaperOverview }) {
  const strategies = data.assignments
    .filter((a) => a.enabled)
    .map((a) => data.strategies.find((s) => s.id === a.strategyId)?.shortName ?? a.strategyId);
  const items: [string, string][] = [
    ['Portfolio value (simulated)', price(data.balances.equityPaise)],
    ['Today, net', signed(data.today.netPaise)],
    ['Open paper trades', `${data.today.open} of ${data.settings.maxOpenPositions}`],
    ['Strategies', strategies.length ? strategies.join(', ') : 'none enabled'],
  ];
  return (
    <Card aria-labelledby="paper-status-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="paper-status-title">Paper trading</CardTitle>
          <CardDescription>
            {data.settings.enabled
              ? data.settings.entriesPaused
                ? 'On, with new entries stopped.'
                : 'On. Signals are taken automatically on your virtual capital.'
              : `Off. Switch on to simulate these signals on ${price(data.portfolio.startingCapitalPaise)}.`}
          </CardDescription>
        </CardHeading>
        <Badge variant={data.settings.enabled ? 'bullish' : 'secondary'}>
          {data.settings.enabled ? 'ON' : 'OFF'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {items.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <Button asChild variant="outline" size="sm">
          <Link href="/paper-trading">Open paper trading</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function PaperStatusCard() {
  const { data, error } = usePolledResource(API_ROUTES.paperOverview, paperOverviewSchema);
  if (data) return <PaperStatus data={data} />;
  if (error) return null;
  return <Skeleton className="h-32 w-full" />;
}
