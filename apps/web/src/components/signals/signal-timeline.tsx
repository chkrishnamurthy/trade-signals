import { Text } from '@/components/ui/typography';
import { istTime } from '@/lib/format';
import type { IntradayEventDto } from '@/lib/intraday-types';
import { cn } from '@/lib/utils';

/**
 * The signal timeline.
 *
 * The account of how a signal reached its current state: when it was detected,
 * when it triggered, every material score move, and how it ended. This is the
 * transparency the score alone cannot provide — a recomputation could produce
 * today's number, but only this record shows what the engine believed at 10:18.
 *
 * Entries are stored by the engine and read here. Nothing on this page is
 * inferred from the current state.
 */

const TONE: Record<string, string> = {
  detected: 'bg-neutral',
  state_change: 'bg-chart-1',
  score_change: 'bg-chart-3',
  target_reached: 'bg-bullish',
  invalidated: 'bg-bearish',
  expired: 'bg-neutral',
};

export function SignalTimeline({
  events,
  className,
}: {
  events: readonly IntradayEventDto[];
  className?: string | undefined;
}) {
  if (events.length === 0) {
    return (
      <Text variant="caption" className={className}>
        No timeline entries recorded yet.
      </Text>
    );
  }

  return (
    <ol className={cn('flex flex-col', className)}>
      {events.map((event, index) => (
        <li key={`${event.at}-${event.kind}`} className="flex gap-3">
          {/* The rail: a dot per entry, a line between them. */}
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                TONE[event.kind] ?? 'bg-neutral',
              )}
              aria-hidden
            />
            {index < events.length - 1 && <span className="w-px flex-1 bg-border" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <Text variant="label" className="min-w-0 truncate">
                {event.message}
              </Text>
              <span className="figure shrink-0 font-mono text-xs text-muted-foreground">
                {istTime(event.at)}
              </span>
            </div>
            {event.detail !== null && (
              <Text as="p" variant="caption" className="mt-0.5">
                {event.detail}
              </Text>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
