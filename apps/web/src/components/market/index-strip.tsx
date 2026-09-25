'use client';

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { IndexCell, IndexCellSkeleton } from '@/components/market/index-cell';
import { LiveIndicator } from '@/components/market/market-status';
import * as fmt from '@/lib/format';
import type { IndexStripDto, MarketPhase } from '@/lib/market-types';
import { type IndexStripState, useIndexStrip } from '@/lib/use-index-strip';
import { cn } from '@/lib/utils';
import type { LiveSourceState } from '@/lib/watchlist-types';

/**
 * The market indices strip — app chrome, rendered once by `AppShell` directly
 * under the top bar, above every page's own header.
 *
 * It answers the product's first question ("what is happening in the market?")
 * before the user reads a row of whatever the page is for, and it is STICKY:
 * it stays with the top bar as the page scrolls. Sticky chrome is paid for on
 * every screen, which is why it is one 36px line — name · level · change per
 * index, divided by hairlines — and never wraps: when seven indices do not fit
 * the row scrolls sideways under an edge fade (`docs/reference/market-indices-strip.md`).
 *
 * It never blanks: a provider blip shows the last snapshot marked "Delayed",
 * and only a first load with nothing to show falls back to one muted line.
 */

/** The strip's height, px. One text line with air; the top bar is 56. */
const STRIP_HEIGHT = 36;
/** The top bar's height, px — `h-14` in `AppShell`. */
const TOPBAR_HEIGHT = 56;

/** Slots to reserve while loading, so the row does not reflow on data. */
const SKELETON_SLOTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

/** An edge fade says "there is more" without a scrollbar or arrows. */
const EDGE_FADE = '[mask-image:linear-gradient(90deg,#000_calc(100%-40px),transparent)] pr-10';

export function IndexStrip({ className }: { className?: string | undefined }) {
  const { state, liveState } = useIndexStrip();
  return <IndexStripView state={state} liveState={liveState} className={className} />;
}

/** The strip with its data supplied — what Storybook renders, and what the container feeds. */
export function IndexStripView({
  state,
  liveState,
  className,
}: {
  state: IndexStripState;
  liveState: LiveSourceState | null;
  className?: string | undefined;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const overflowing = useOverflows(scroller);
  return (
    <div
      data-slot="index-strip"
      style={{ height: STRIP_HEIGHT, top: TOPBAR_HEIGHT }}
      className={cn(
        'sticky z-30 border-border border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75',
        className,
      )}
    >
      <div className="mx-auto flex h-full max-w-[1800px] items-center gap-3 px-4 sm:px-6">
        {state.status === 'error' ? (
          <span className="text-subtle-foreground text-xs">
            Market indices unavailable
            {state.error.remedy === undefined ? '' : ` — ${state.error.remedy}`}
          </span>
        ) : (
          <>
            <div
              ref={scroller}
              className={cn(
                'flex min-w-0 flex-1 snap-x snap-mandatory items-baseline overflow-x-auto scrollbar-none',
                overflowing && EDGE_FADE,
              )}
            >
              {state.status === 'loading'
                ? SKELETON_SLOTS.map((slot) => <IndexCellSkeleton key={slot} />)
                : state.data.indices.map((index) => (
                    <IndexCell
                      key={`${index.exchange}:${index.symbol}`}
                      index={index}
                      stale={state.data.stale !== undefined}
                      className="snap-start"
                    />
                  ))}
            </div>
            {state.status === 'ready' && (
              <StripStatus data={state.data} liveState={liveState} className="shrink-0" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Where the levels are coming from, in one honest phrase. "Live" is claimed
 * only while ticks are actually streaming, exactly as the watchlist page does.
 * Prefixed with the exchanges (both keep the same session) so it does not read as a duplicate of a page's own Live badge;
 * a phone gets the one-word form and no clock.
 */
function StripStatus({
  data,
  liveState,
  className,
}: {
  data: IndexStripDto;
  liveState: LiveSourceState | null;
  className?: string | undefined;
}) {
  const { long, brief } = statusLabel(data, liveState);
  const streaming = liveState === 'streaming' && data.stale === undefined;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-2xs', className)}>
      <LiveIndicator live={streaming} label={long} className="text-2xs max-sm:hidden" />
      <LiveIndicator live={streaming} label={brief} className="text-2xs sm:hidden" />
      {streaming && <Clock className="max-sm:hidden" />}
    </span>
  );
}

function statusLabel(
  data: IndexStripDto,
  liveState: LiveSourceState | null,
): { long: string; brief: string } {
  if (data.stale !== undefined) {
    return { long: `Delayed · last update ${fmt.istTime(data.asOf)} IST`, brief: 'Delayed' };
  }
  if (liveState === 'streaming') return { long: 'NSE & BSE · Live', brief: 'Live' };
  if (liveState === 'polling') {
    return { long: 'NSE & BSE · Updating every few seconds', brief: 'Updating' };
  }
  return PHASE_LABEL[data.market.phase](data);
}

const PHASE_LABEL: Record<MarketPhase, (data: IndexStripDto) => { long: string; brief: string }> = {
  open: () => ({ long: 'NSE & BSE · Connecting…', brief: 'Connecting' }),
  pre_open: () => ({
    long: 'NSE & BSE · Pre-open · indicative until 09:15 IST',
    brief: 'Pre-open',
  }),
  closing_auction: () => ({ long: 'NSE & BSE · Closing auction', brief: 'Auction' }),
  post_close: (data) => ({
    long: `NSE & BSE · At close · ${fmt.istDate(latestAt(data))}`,
    brief: 'Closed',
  }),
  closed: (data) => ({
    long: `NSE & BSE · At close · ${fmt.istDate(latestAt(data))}`,
    brief: 'Closed',
  }),
  unknown: (data) => ({ long: `As of ${fmt.istTime(data.asOf)} IST`, brief: 'As of' }),
};

/** The most recent exchange feed instant across the cells; the snapshot's otherwise. */
function latestAt(data: IndexStripDto): string {
  let latest: string | null = null;
  for (const index of data.indices) {
    if (index.at !== null && (latest === null || index.at > latest)) latest = index.at;
  }
  return latest ?? data.asOf;
}

/** A running IST wall clock, shown while ticks stream. Mounts blank to avoid a hydration mismatch. */
function Clock({ className }: { className?: string | undefined }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = (): void => setNow(new Date().toISOString());
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  return (
    <span className={cn('figure font-mono text-2xs text-subtle-foreground', className)}>
      {fmt.istTime(now)} IST
    </span>
  );
}

/** Whether the horizontal scroller has more than fits — drives the edge fade. */
function useOverflows(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return overflowing;
}
