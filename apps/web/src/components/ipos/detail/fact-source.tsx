import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { istDayTime } from '@/lib/ipo-format';
import type { FactSourceDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';

/**
 * The provenance marker beside a fact (plan §6.3, §10.2): where the value came
 * from and when. Official values show a quiet "·" source; derived values say
 * "calculated"; a disagreement between official sources says so.
 */
export function FactSource({
  source,
  className,
}: {
  source: FactSourceDto | undefined;
  className?: string | undefined;
}) {
  if (source === undefined) return null;
  const word =
    source.basis === 'derived'
      ? 'calculated'
      : source.basis === 'conflict'
        ? 'sources differ'
        : source.sourceName;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'ml-1.5 rounded-sm text-2xs underline decoration-dotted underline-offset-2',
            source.basis === 'conflict' ? 'text-warning-strong' : 'text-subtle-foreground',
            className,
          )}
        >
          {word}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {source.basis === 'derived' ? (
          <p>Calculated by EquityWise from the exchange&apos;s published figures.</p>
        ) : source.basis === 'conflict' ? (
          <p>
            Official sources disagree on this value. Showing {source.sourceName}&apos;s, the
            issue&apos;s designated exchange.
          </p>
        ) : (
          <p>As published by {source.sourceName}.</p>
        )}
        {source.observedAt !== '' && (
          <p className="mt-1 text-2xs opacity-80">Last seen {istDayTime(source.observedAt)} IST</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
