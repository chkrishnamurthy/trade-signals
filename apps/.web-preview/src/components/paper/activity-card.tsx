'use client';
import { type PaperActivity, type PaperDecisionDto, paperActivitySchema } from '@equitywise/shared';
import { usePolledResource } from '@/components/intraday/use-polled-resource';
import { Badge } from '@/components/ui/badge';
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
import { CAP, EVENT, price, reasonLabel, time } from './format';

/** Why 23 shares: the binding cap and the operands, in one sentence. */
export function sizingSentence(d: PaperDecisionDto): string | null {
  const s = d.sizing;
  if (!s) return null;
  return `${s.shares} shares — limited by ${CAP[s.bindingCap] ?? s.bindingCap}. Risk budget ${price(s.riskBudgetPaise)} over ${price(s.perShareRiskPaise)} per share; free cash ${price(s.availableCashPaise)}; ${price(s.reservePaise)} held until the entry fills.`;
}

export function DecisionRow({ d }: { d: PaperDecisionDto }) {
  const accepted = d.status !== 'REJECTED';
  return (
    <li className="flex gap-3 py-2 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{time(d.decidedAt)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{d.symbol}</span>
          <Badge variant={d.direction === 'BUY' ? 'bullish' : 'bearish'}>{d.direction}</Badge>
          <Badge variant={accepted ? 'neutral' : 'secondary'}>
            {accepted
              ? `Taken · ${d.requestedShares} shares`
              : `Declined · ${reasonLabel(d.reasonCode)}`}
          </Badge>
          <span className="text-xs text-muted-foreground">
            signal {time(d.signalAt)} · close {price(d.levels.reference)} · stop{' '}
            {price(d.levels.stop)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {accepted ? sizingSentence(d) : d.reasonText}
        </p>
      </div>
    </li>
  );
}

export function ActivityList({ data }: { data: PaperActivity }) {
  const items = [
    ...data.decisions.map((d) => ({
      at: d.decidedAt,
      key: `d${d.orderId}`,
      node: <DecisionRow d={d} />,
    })),
    ...data.events.map((e) => ({
      at: e.at,
      key: `e${e.positionId}-${e.sequence}`,
      node: (
        <li className="flex gap-3 py-2 text-sm">
          <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{time(e.at)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{e.symbol}</span>
              <Badge
                variant={
                  e.kind === 'STOP' || e.kind === 'COVERAGE_BREAK'
                    ? 'bearish'
                    : e.kind === 'TARGET1_PARTIAL' || e.kind === 'TARGET2'
                      ? 'bullish'
                      : e.kind === 'UNRESOLVED'
                        ? 'warning'
                        : 'neutral'
                }
              >
                {EVENT[e.kind]}
              </Badge>
              {e.pricePaise !== null ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {price(e.pricePaise)}
                  {e.shares !== null ? ` × ${e.shares}` : ''}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{e.explanation}</p>
          </div>
        </li>
      ),
    })),
  ].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing decided yet for this session.</p>;
  return (
    <ol className="divide-y divide-border" aria-live="polite">
      {items.map((i) => (
        <div key={i.key}>{i.node}</div>
      ))}
    </ol>
  );
}

export function ActivityCard({ sessionDate }: { sessionDate: string }) {
  const { data, error } = usePolledResource(
    API_ROUTES.paperActivity(sessionDate),
    paperActivitySchema,
  );
  return (
    <Card aria-labelledby="activity-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="activity-title">Today&apos;s activity</CardTitle>
          <CardDescription>
            Every signal considered for your portfolio, why it was taken or declined, and what each
            paper trade did. Newest first.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        {data ? (
          <ActivityList data={data} />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
