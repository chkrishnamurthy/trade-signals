import { DefinitionRow, MetricCard } from '@/components/data-display/metric-card';
import { ContentGrid } from '@/components/layout/grid';
import { IndexLevel, PriceChange } from '@/components/market/numeric';
import { Sparkline } from '@/components/market/sparkline';
import type { HeadlineIndexDto } from '@/lib/dashboard-types';
import { invertedToneOf, toneOf } from '@/lib/tone';

/**
 * Headline index cards.
 *
 * INDIA VIX is inverted deliberately: rising volatility is risk-off, so a green
 * "up" treatment would read exactly backwards for a trader scanning the row.
 * The inversion is expressed once, as a tone override — the number itself is
 * never flipped.
 */
export function IndexCards({ indices }: { indices: readonly HeadlineIndexDto[] }) {
  return (
    <ContentGrid columns="metrics">
      {indices.map((index) => (
        <IndexCard key={index.symbol} index={index} />
      ))}
    </ContentGrid>
  );
}

function IndexCard({ index }: { index: HeadlineIndexDto }) {
  const isVix = index.display === 'volatility';
  const tone = isVix ? invertedToneOf(index.change) : toneOf(index.change);

  return (
    <MetricCard
      label={index.name}
      hint={
        isVix
          ? 'Implied 30-day volatility of NIFTY options. Rising VIX means the market is pricing more risk.'
          : undefined
      }
      value={<IndexLevel paise={index.ltp} size="xl" />}
      aside={<Sparkline values={index.sparkline} tone={tone} />}
      change={<PriceChange paise={index.change} percent={index.changePercent} tone={tone} />}
      footer={
        isVix ? (
          <p className="text-xs text-muted-foreground">
            {(index.changePercent ?? 0) > 0 ? 'Volatility rising — risk-off' : 'Volatility easing'}
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-x-3">
            {(
              [
                ['Open', index.open],
                ['High', index.high],
                ['Low', index.low],
              ] as const
            ).map(([label, value]) => (
              <DefinitionRow
                key={label}
                label={label}
                layout="stacked"
                value={<IndexLevel paise={value} size="sm" />}
              />
            ))}
          </dl>
        )
      }
    />
  );
}
