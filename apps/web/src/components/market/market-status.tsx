'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { agoLabel, istTime } from '@/lib/format';
import type { MarketPhase } from '@/lib/market-types';
import { cn } from '@/lib/utils';

/**
 * Session state and data freshness.
 *
 * Phases are the product's own vocabulary, not a data provider's status codes,
 * so a second provider renders identically without touching this file.
 *
 * Only `open` gets the live treatment. A price printed during pre-open or a
 * closing auction is not a continuous trading price, and badging it "live"
 * would misrepresent the data.
 */

const PHASE_LABEL: Record<MarketPhase, string> = {
  pre_open: 'Pre-open',
  open: 'Open',
  closed: 'Closed',
  post_close: 'Post-close',
  closing_auction: 'Closing auction',
  unknown: 'Session state unavailable',
};

const statusVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      state: {
        open: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
        pre: 'bg-warning-soft text-warning-foreground ring-warning-line',
        closed: 'bg-neutral-soft text-neutral-strong ring-neutral-line',
        /* Deliberately not grey: "we do not know" must not look like "closed". */
        unknown: 'bg-warning-soft text-market-unknown ring-warning-line',
      },
    },
    defaultVariants: { state: 'closed' },
  },
);

type StatusState = NonNullable<VariantProps<typeof statusVariants>['state']>;

const PHASE_STATE: Record<MarketPhase, StatusState> = {
  open: 'open',
  pre_open: 'pre',
  closing_auction: 'pre',
  post_close: 'closed',
  closed: 'closed',
  unknown: 'unknown',
};

export function MarketStatus({
  phase,
  isOpen,
  className,
}: {
  phase: MarketPhase;
  isOpen: boolean;
  className?: string | undefined;
}) {
  const state = PHASE_STATE[phase];
  const live = isOpen && phase === 'open';
  return (
    <span className={cn(statusVariants({ state }), className)}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          live ? 'animate-pulse bg-market-open' : 'bg-current opacity-60',
        )}
        aria-hidden
      />
      {PHASE_LABEL[phase]}
    </span>
  );
}

/** The bare ● LIVE / ○ STALE dot, for tight spots where the badge is too big. */
export function LiveIndicator({
  live,
  label,
  className,
}: {
  live: boolean;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const text = label ?? (live ? 'Live' : 'Not live');
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          live ? 'animate-pulse bg-market-open' : 'bg-market-closed',
        )}
        aria-hidden
      />
      {text}
    </span>
  );
}

/**
 * Last-updated stamp.
 *
 * Renders the absolute IST time — the number a trader cross-references against
 * the exchange — and puts the relative age in a tooltip. The relative age
 * re-renders on its own 30-second tick rather than on the data feed, so a quiet
 * feed still shows an honestly ageing timestamp.
 */
export function LastUpdated({
  at,
  className,
  staleAfterSeconds = 120,
}: {
  at: string | null;
  className?: string | undefined;
  staleAfterSeconds?: number | undefined;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (at === null) {
    return <span className={cn('text-xs text-subtle-foreground', className)}>Never updated</span>;
  }

  // `now` is null until after mount; the server cannot know the client's clock
  // and guessing produces a hydration mismatch.
  const ageSeconds = now === null ? 0 : Math.max(0, (now - new Date(at).getTime()) / 1000);
  const stale = now !== null && ageSeconds > staleAfterSeconds;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'figure inline-flex items-center gap-1 font-mono text-xs',
            stale ? 'text-warning' : 'text-muted-foreground',
            className,
          )}
        >
          {istTime(at)} IST
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {stale ? 'Data is stale — ' : 'Updated '}
        {now === null ? 'just now' : agoLabel(at, now)}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Connection / freshness banner state for a whole feed.
 *
 * `stale` is the case that matters: the feed answered from cache because
 * upstream was unreachable. The UI must say so rather than quietly showing an
 * old number as if it were current.
 */
export function DataFreshness({
  state,
  at,
  className,
}: {
  state: 'live' | 'cached' | 'stale' | 'error';
  at: string | null;
  className?: string | undefined;
}) {
  const copy = {
    live: 'Live',
    cached: 'Cached',
    stale: 'Stale',
    error: 'Unavailable',
  }[state];

  const tone = {
    live: 'text-bullish-strong',
    cached: 'text-muted-foreground',
    stale: 'text-warning',
    error: 'text-destructive',
  }[state];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', tone, className)}>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full bg-current',
          state === 'live' && 'animate-pulse',
        )}
        aria-hidden
      />
      {copy}
      {at !== null && (
        <span className="figure font-mono text-subtle-foreground">{istTime(at)}</span>
      )}
    </span>
  );
}
