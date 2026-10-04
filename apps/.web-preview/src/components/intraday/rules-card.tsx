import type { IntradayRules } from '@equitywise/shared';
import { formatPaise } from '@equitywise/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';

/** Rendered from the engine's own frozen config, so the page cannot drift from what runs. */
export function RulesCard({ rules }: { rules: IntradayRules }) {
  const p = rules.parameters;
  const n = (k: string) => Number(p[k]);
  const groups: { title: string; items: string[] }[] = [
    {
      title: 'Entry',
      items: [
        `Opening range = the high and low of ${p.openingRange}. It must be ${n('minOrBps') / 100}%–${n('maxOrBps') / 100}% wide.`,
        `BUY when a 5-minute candle closes above the range high and above VWAP. SELL when it closes below the range low and below VWAP.`,
        `The candle needs at least ${n('minRelativeVolume')}× the volume of the previous ${n('volumeLookbackBars')} candles and a body of at least ${n('minBodyRatio') * 100}% of its range.`,
        `The close may sit at most ${n('maxExtensionBps') / 100}% past the range edge — no chasing.`,
        `Signals fire on candles closing ${p.signalWindow}. Entry is simulated at the next observed price; more than ${n('maxSlipBps') / 100}% past the signal close and it is skipped.`,
        'One signal per stock per day, whatever the outcome.',
      ],
    },
    {
      title: 'Exit',
      items: [
        `Stop level: a hair beyond the far side of the opening range (${n('stopBufferBps')} bps), no tighter than ${n('minRiskBps') / 100}% and no wider than ${n('maxRiskBps') / 100}% of the signal close.`,
        `Target 1 = signal close + ${n('target1Multiple')}× the risk distance: ${n('partialAtTarget1') * 100}% of the shares are booked and the stop moves to the entry level.`,
        `Target 2 = signal close + ${n('target2Multiple')}× the risk distance: the rest is booked.`,
        `Anything still open is closed at ${p.squareOff}.`,
        'Estimated charges and 2 bps slippage per side are deducted from every simulated result.',
      ],
    },
    {
      title: 'Risk',
      items: [
        `Risk per trade: ${n('riskBps') / 100}% of the paper portfolio's equity. Shares = risk budget ÷ (entry − stop), capped by the cash free — no leverage.`,
        `At most ${n('maxTradesPerDay')} trades a day and ${n('maxOpenTrades')} open at once. Extra signals are shown but not taken.`,
        `No new trades once the day is down ${n('dailyLossHaltBps') / 100}% of the day's starting equity.`,
        'When several signals fire on the same candle, the strongest relative volume goes first.',
      ],
    },
    {
      title: 'No-trade days',
      items: [
        `A stock that opened more than ${n('maxGapBps') / 100}% away from its previous close.`,
        `Every stock, if NIFTY 50 at 09:30 is more than ${n('maxIndexMoveBps') / 100}% from its previous close.`,
        `Stocks under ${formatPaise(n('minPricePaise'))} or with less than ₹${(n('minTurnoverPaise') / 1e9).toFixed(0)} crore average daily turnover.`,
        'Any candle whose data arrived late or with gaps.',
      ],
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Strategy rules</CardTitle>
          <CardDescription>
            Every rule is a number in the versioned config; this card reads that config.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
                {g.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
