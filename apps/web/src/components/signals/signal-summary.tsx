import { MetricCard, StatTile } from '@/components/data-display/metric-card';
import { ContentGrid } from '@/components/layout/grid';
import { Text } from '@/components/ui/typography';
import type { IntradayFeedDto } from '@/lib/intraday-types';

/**
 * The summary strip.
 *
 * Counts, not judgements. "Six live setups" is a fact about the feed; anything
 * implying those six are good, or that more is better, would be a claim the
 * data does not support — a quiet session with two setups is a normal and
 * perfectly healthy outcome for a quality-filtered engine.
 */
export function SignalSummary({ feed }: { feed: IntradayFeedDto }) {
  const { summary } = feed;

  return (
    <div className="flex flex-col gap-3">
      <ContentGrid columns="metrics">
        <MetricCard
          label="Live setups"
          hint="Signals that have triggered and whose invalidation conditions have not fired."
          value={<Text variant="metric">{summary.live}</Text>}
          footer={
            <Text variant="caption">
              {summary.longs} BUY · {summary.shorts} SELL
            </Text>
          }
        />
        <MetricCard
          label="BUY setups"
          hint="Live bullish structures. Direction only — not a recommendation."
          value={<Text variant="metric">{summary.longs}</Text>}
          footer={<Text variant="caption">Bullish intraday structure</Text>}
        />
        <MetricCard
          label="SELL setups"
          hint="Live bearish structures. Direction only — not a recommendation."
          value={<Text variant="metric">{summary.shorts}</Text>}
          footer={<Text variant="caption">Bearish intraday structure</Text>}
        />
        <MetricCard
          label="Symbols evaluated"
          hint="How many instruments the last engine pass actually measured."
          value={<Text variant="metric">{feed.run?.symbolsEvaluated ?? 0}</Text>}
          footer={
            <Text variant="caption">
              {feed.run === null ? 'Engine has not run' : `Last pass ${feed.run.status}`}
            </Text>
          }
        />
      </ContentGrid>

      <ContentGrid columns="stats">
        <StatTile label="Breakouts" value={summary.breakouts} />
        <StatTile label="Breakdowns" value={summary.breakdowns} />
        <StatTile
          label="Invalidated"
          value={summary.invalidated}
          hint="Setups whose premise failed during the session. Shown so nothing vanishes silently."
        />
        <StatTile
          label="Target reached"
          value={summary.targetMet}
          hint="Setups that reached their second technical target. An observation about price, not a realised result."
        />
        <StatTile label="Session" value={feed.regime.replace('_', ' ')} />
        <StatTile label="Trading date" value={feed.tradingDate} />
      </ContentGrid>
    </div>
  );
}
