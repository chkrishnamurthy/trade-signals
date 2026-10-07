import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GMP_SHORT_NOTE, gmpText, istDayTime } from '@/lib/ipo-format';
import type { GmpChipDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';

/**
 * The compact grey-market premium for cards and table rows.
 *
 * It takes only the `official: false` DTO and ALWAYS renders the "Unofficial"
 * badge and the source — there is no prop to hide either (plan §10.3). It is
 * never styled as the card's headline, and a stale quote is muted and says so.
 */
export function GmpChip({
  gmp,
  compact = false,
  className,
}: {
  gmp: GmpChipDto;
  /** Drops the "GMP" prefix where a column header already names it. */
  compact?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-w-0 items-center gap-1.5 rounded-sm text-left text-xs',
            gmp.stale ? 'text-subtle-foreground' : 'text-muted-foreground',
            className,
          )}
        >
          <Badge variant="warning" size="sm">
            Unofficial
          </Badge>
          <span className="figure truncate">
            {compact ? '' : 'GMP '}
            {gmpText(gmp)}
          </span>
          {gmp.stale && <span className="text-2xs">(stale)</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{GMP_SHORT_NOTE}</p>
        <p className="mt-1 text-2xs opacity-80">
          Reported by {gmp.sourceName}, {istDayTime(gmp.observedAt)} IST.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
