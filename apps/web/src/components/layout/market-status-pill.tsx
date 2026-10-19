'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { istDate, istTime } from '@/lib/format';
import type { MarketPhase } from '@/lib/market-types';
import type { IndexStripState } from '@/lib/use-index-strip';
import { cn } from '@/lib/utils';
import type { LiveSourceState } from '@/lib/watchlist-types';

/**
 * Market session state for the top bar — the "is the market open?" answer
 * every trading platform keeps in the same corner.
 *
 * It reads the same snapshot as the indices strip (AppShell owns one
 * `useIndexStrip()` and hands it to both), so the two can never disagree and
 * the page makes no extra request.
 *
 * Text is `foreground` on the bar and the phase colour lives on the dot only:
 * the old tinted badge measured 4.5:1 (open, light) and 1.3:1 (pre-open, dark),
 * and the words already say what the colour says.
 *
 * The pill is a button that opens a small panel with the freshness detail
 * (as-of time, delayed reason). A popover rather than a hover tooltip, so it
 * opens on a tap — tablets show the pill and have no hover.
 */
const LABEL: Record<MarketPhase, string> = {
  pre_open: 'Pre-open',
  open: 'Market open',
  closing_auction: 'Closing auction',
  post_close: 'Market closed',
  closed: 'Market closed',
  unknown: 'Status unknown',
};

const DOT: Record<MarketPhase, string> = {
  pre_open: 'bg-market-pre',
  open: 'bg-market-open',
  closing_auction: 'bg-market-pre',
  post_close: 'bg-market-closed',
  closed: 'bg-market-closed',
  unknown: 'bg-market-unknown',
};

export function MarketStatusPill({
  state,
  liveState,
  className,
}: {
  state: IndexStripState;
  liveState: LiveSourceState | null;
  className?: string | undefined;
}) {
  if (state.status === 'loading') {
    // Same footprint as the loaded pill, so nothing to its left moves.
    return (
      <span
        aria-hidden
        className={cn('h-7 w-28 shrink-0 animate-pulse rounded-full bg-muted', className)}
      />
    );
  }

  const phase: MarketPhase = state.status === 'ready' ? state.data.market.phase : 'unknown';
  const stale = state.status === 'ready' && state.data.stale !== undefined;
  const streaming = phase === 'open' && liveState === 'streaming' && !stale;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-2.5 font-medium text-foreground text-xs transition-colors hover:bg-accent/60 data-[state=open]:bg-accent',
            'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
            className,
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              DOT[phase],
              streaming && 'motion-safe:animate-pulse',
            )}
          />
          <span className="whitespace-nowrap">
            <span className="sr-only">NSE: </span>
            {LABEL[phase]}
          </span>
          {stale && (
            <span className="rounded-sm bg-warning-soft px-1 text-3xs text-foreground uppercase tracking-wide">
              Delayed
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 text-sm">
        <p className="m-0 font-semibold">NSE · {LABEL[phase]}</p>
        <p className="m-0 mt-1 text-muted-foreground">{detail(state, streaming)}</p>
      </PopoverContent>
    </Popover>
  );
}

function detail(state: IndexStripState, streaming: boolean): string {
  if (state.status === 'error')
    return 'Session state could not be fetched. Prices may be out of date.';
  if (state.status !== 'ready') return '';
  const { data } = state;
  if (data.stale !== undefined) {
    return `Showing the last good snapshot from ${istTime(data.asOf)} IST — ${data.stale.reason}`;
  }
  if (streaming) return 'Index levels are streaming live.';
  if (data.market.phase === 'pre_open') return 'Prices are indicative until 09:15 IST.';
  if (data.market.phase === 'open') return `Index levels as of ${istTime(data.asOf)} IST.`;
  return `Levels are the close of ${istDate(data.asOf)}. Trading hours 09:15–15:30 IST.`;
}
