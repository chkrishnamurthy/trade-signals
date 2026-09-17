'use client';

import { AlertTriangleIcon, CheckIcon, CircleDashedIcon, ClockIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FeedStatus, FeedStatusDto } from '@/lib/disclosure-types';
import { cn } from '@/lib/utils';
import { formatDateKey, formatDateTimeIst } from './parts';

/**
 * One chip per feed: what it is, the session it is current to, and — when
 * it is not — why. Status is never colour alone: each state has its own
 * icon and the tooltip spells it out.
 */

const STYLE: Readonly<
  Record<FeedStatus, { icon: typeof CheckIcon; className: string; word: string }>
> = {
  fresh: {
    icon: CheckIcon,
    className: 'text-bullish-strong ring-bullish-line bg-bullish-soft',
    word: 'Current',
  },
  stale: {
    icon: ClockIcon,
    className: 'text-warning-foreground ring-warning-line bg-warning-soft',
    word: 'Older',
  },
  failed: {
    icon: AlertTriangleIcon,
    className: 'text-destructive ring-destructive-line bg-destructive-soft',
    word: 'Last fetch failed',
  },
  empty: {
    icon: CircleDashedIcon,
    className: 'text-muted-foreground ring-border bg-muted',
    word: 'No data yet',
  },
};

export function FeedChips({ feeds }: { feeds: readonly FeedStatusDto[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Data feeds">
      {feeds.map((feed) => {
        const style = STYLE[feed.status];
        const Icon = style.icon;
        return (
          <li key={feed.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-2xs ring-1 ring-inset',
                    style.className,
                  )}
                >
                  <Icon className="size-3" aria-hidden />
                  <span className="font-medium">{feed.label}</span>
                  <span className="opacity-80">
                    {feed.asOf === null ? style.word : shortAsOf(feed.asOf)}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                <p className="font-medium">
                  {feed.label}: {style.word.toLowerCase()}
                </p>
                {feed.asOf !== null && <p>Data through {formatDateKey(feed.asOf)}.</p>}
                {feed.lastAttemptAt !== null && (
                  <p>Last checked {formatDateTimeIst(feed.lastAttemptAt)} IST.</p>
                )}
                {feed.error !== null && <p className="text-destructive">{feed.error}</p>}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** `2026-09-16` → `16 Sep`. */
function shortAsOf(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
