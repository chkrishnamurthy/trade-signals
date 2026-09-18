import type { PaperOverview } from '@equitywise/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { time } from './format';
import { TradesTable } from './trades-table';

const EMPTY: Record<PaperOverview['phase'], string> = {
  PRE_OPEN: 'Market not open yet. The first signals can come at 09:35.',
  OPENING_RANGE: 'Opening range forming; the first signals can come at 09:35.',
  SESSION: 'No open paper trades. The next signal candle closes at the next 5-minute boundary.',
  AFTER_ENTRIES: 'No open paper trades. No new entries after 14:30.',
  SQUARE_OFF: 'Everything has been squared off for the day.',
  CLOSED: 'Market closed. No open paper trades.',
};

export function OpenTradesCard({ data }: { data: PaperOverview }) {
  const empty = !data.settings.enabled
    ? 'Paper trading is off, so no new trades are taken.'
    : data.assignments.every((a) => !a.enabled)
      ? 'No strategy is enabled.'
      : EMPTY[data.phase];
  return (
    <Card aria-labelledby="open-trades-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="open-trades-title">Open paper trades</CardTitle>
          <CardDescription>
            Managed automatically to Target 1, Target 2, the stop level or the{' '}
            {time(data.session.squareOffAt)} square-off. Marks use the last sampled price with exit
            slippage.
          </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        <TradesTable trades={data.openTrades} emptyText={empty} />
      </CardContent>
    </Card>
  );
}
