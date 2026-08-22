import { Percent } from '@/components/market/numeric';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import type { BreadthDto } from '@/lib/dashboard-types';
import { TONE_GLYPH, toneFill, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/** Advance/decline bar plus EMA participation counts. */
export function MarketBreadth({ breadth }: { breadth: BreadthDto }) {
  const { advancing, declining, unchanged, total } = breadth;
  const denominator = total || 1;
  const pct = (n: number) => (n / denominator) * 100;

  const emaRows: { label: string; value: number }[] = [];
  for (const [label, value] of [
    ['Above 20 EMA', breadth.aboveEma20],
    ['Above 50 EMA', breadth.aboveEma50],
    ['Above 200 EMA', breadth.aboveEma200],
  ] as const) {
    // Null means the indicator pass has not run yet — a missing row, not a zero.
    if (value !== null) emaRows.push({ label, value });
  }

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Market breadth</CardTitle>
          <CardDescription>{total} constituents</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${advancing} advancing, ${declining} declining, ${unchanged} unchanged`}
        >
          <div className="bg-bullish" style={{ width: `${pct(advancing)}%` }} />
          <div className="bg-neutral" style={{ width: `${pct(unchanged)}%` }} />
          <div className="bg-bearish" style={{ width: `${pct(declining)}%` }} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Advancing', advancing, 'bullish'],
              ['Unchanged', unchanged, 'neutral'],
              ['Declining', declining, 'bearish'],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label}>
              <p className={cn('figure text-xl font-semibold', toneText({ tone }))}>
                <span className="mr-1 text-xs" aria-hidden>
                  {TONE_GLYPH[tone]}
                </span>
                {value}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {emaRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              EMA participation loads with the indicator pass.
            </p>
          ) : (
            emaRows.map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', toneFill({ tone: 'bullish' }))}
                    style={{ width: `${pct(value)}%` }}
                  />
                </div>
                <span className="figure w-14 shrink-0 text-right text-muted-foreground">
                  {value}/{total} <Percent value={pct(value)} decimals={0} size="xs" />
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
