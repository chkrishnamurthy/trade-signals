import type { PaperOverview } from '@equitywise/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { percent, price, signed } from './format';

/** Five numbers a user checks first. Every figure is simulated and read from the server. */
export function SummaryCards({ data }: { data: PaperOverview }) {
  const { balances, today, portfolio } = data;
  const tone = (v: number | null) =>
    v === null ? '' : v > 0 ? 'text-positive-strong' : v < 0 ? 'text-negative-strong' : '';
  const items: { label: string; value: string; sub: string; className?: string }[] = [
    {
      label: 'Portfolio value (simulated)',
      value: price(balances.equityPaise),
      sub: balances.marksComplete
        ? `${percent(
            balances.equityPaise === null
              ? null
              : balances.equityPaise - portfolio.startingCapitalPaise,
            portfolio.startingCapitalPaise,
          )} since ${price(portfolio.startingCapitalPaise)}`
        : 'Some marks unavailable',
    },
    {
      label: 'Free virtual cash',
      value: price(balances.cashPaise),
      sub: `${price(balances.reservedPaise)} held for pending entries · ${price(balances.lockedPaise)} in open trades`,
    },
    {
      label: 'Today (net of estimated charges)',
      value: signed(today.netPaise),
      sub: `${signed(today.realisedPaise)} booked · ${today.unrealisedPaise === null ? 'open marks unavailable' : `${signed(today.unrealisedPaise)} open`}`,
      className: tone(today.netPaise),
    },
    {
      label: 'Open paper trades',
      value: `${today.open} of ${data.settings.maxOpenPositions}`,
      sub: `${today.trades} of ${data.settings.maxTradesPerDay} trades taken today · ${today.rejected} declined`,
    },
    {
      label: 'Drawdown from peak',
      value: balances.drawdownPaise === null ? '—' : `−${price(balances.drawdownPaise)}`,
      sub: `Peak ${price(balances.peakEquityPaise)} · halt at −${(data.settings.maxDrawdownHaltBps / 100).toFixed(0)}%`,
      className: balances.drawdownPaise ? 'text-negative-strong' : '',
    },
  ];
  return (
    <section
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Paper portfolio summary"
    >
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className={cn('mt-1 text-xl font-semibold tabular-nums', i.className)}>
              {i.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{i.sub}</div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
