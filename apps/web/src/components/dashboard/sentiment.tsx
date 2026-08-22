import { DefinitionRow } from '@/components/data-display/metric-card';
import { Percent, Ratio } from '@/components/market/numeric';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import type { SentimentDto } from '@/lib/dashboard-types';
import { toneFill, toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Market sentiment.
 *
 * Explicitly labelled as an analytical summary of the current tape, not a
 * forecast — and the inputs are listed so the number is inspectable rather than
 * a black box. The score never renders without its drivers.
 */
export function MarketSentiment({ sentiment }: { sentiment: SentimentDto }) {
  const { breadth, score, label, drivers } = sentiment;
  // Centred on 50: the score is a position on a bullish/bearish axis, not a
  // magnitude, so the tone comes from the distance either side of neutral.
  const tone = toneOf(score - 50);

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Market sentiment</CardTitle>
          <CardDescription>Analytical summary — not a prediction</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-2">
          <Text variant="section-title" className="text-base">
            {label}
          </Text>
          <span className={cn('figure text-lg font-semibold', toneText({ tone }))}>
            {score}
            <span className="text-xs font-normal text-subtle-foreground">/100</span>
          </span>
        </div>

        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`Market sentiment ${score} of 100, ${label}`}
        >
          <div
            className={cn('h-full rounded-full', toneFill({ tone }))}
            style={{ width: `${Math.max(2, score)}%` }}
          />
        </div>

        <dl className="mt-3">
          {drivers.map((driver) => (
            <DefinitionRow
              key={driver.label}
              label={driver.label}
              value={<span className="figure text-xs">{driver.detail}</span>}
            />
          ))}
          <DefinitionRow
            label="A/D ratio"
            value={<Ratio value={breadth.advanceDeclineRatio} suffix="" size="sm" />}
          />
          <DefinitionRow
            label="Positive"
            value={<Percent value={breadth.percentPositive} size="sm" />}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
