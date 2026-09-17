import type { IntradayRules } from '@equitywise/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';

/** What the strategy does, in the words of the plan's one-minute summary, plus its key numbers. */
export function OverviewCard({ rules, capital }: { rules: IntradayRules; capital: string }) {
  const p = rules.parameters;
  const items: [string, string][] = [
    ['Timeframe', rules.timeframe],
    ['Universe', rules.universe],
    ['Indicators', 'Opening range (09:15–09:30), session VWAP, relative volume'],
    ['Signal window', `${p.signalWindow}`],
    ['Risk per trade', `${Number(p.riskBps) / 100}% of ${capital}`],
    [
      'Stop level',
      `Just beyond the far side of the opening range (${p.minRiskBps}–${p.maxRiskBps} bps from the signal close)`,
    ],
    ['Target 1', 'Signal close + one risk distance · half the shares booked, stop moves to entry'],
    ['Target 2', 'Signal close + two risk distances · remainder booked'],
    ['Square-off', `${p.squareOff} — nothing carries overnight`],
  ];
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>{rules.strategyName}</CardTitle>
          <CardDescription>
            {rules.shortName} · revision {rules.revision}
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">
          The first 15 minutes of the session set a price range for every NIFTY 50 stock. When a
          5-minute candle later <strong>closes</strong> outside that range — above it for a BUY,
          below it for a SELL — with price on the right side of the day&apos;s VWAP and at least
          1.5× normal volume, that is the signal. The stop sits just beyond the other side of the
          range; Target 1 is one risk distance away, Target 2 is two.
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
