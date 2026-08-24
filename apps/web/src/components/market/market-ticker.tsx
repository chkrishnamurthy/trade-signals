'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { MarketStatus } from '@/components/market/market-status';
import { IndexLevel, PercentChange, PriceChange } from '@/components/market/numeric';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { istTime } from '@/lib/format';
import type { TickerIndexDto, TickerSentimentDto } from '@/lib/ticker-types';
import { invertedToneOf, type Tone, toneOf, toneText } from '@/lib/tone';
import { useMarketTicker } from '@/lib/use-market-ticker';
import { cn } from '@/lib/utils';

/**
 * The global market ticker.
 *
 * A persistent strip in the top bar rather than a row of cards, because it is
 * on screen on every route and the vertical space belongs to the table the user
 * actually came for. One line, one text size, subtle rules between items.
 *
 * It reads the shared feed from context — there is exactly one poller per tab
 * regardless of how many places render this.
 *
 * The list is whatever `config/indices.yaml` declares under `headlineIndices`.
 * Nothing here names an index, so adding one is a change to that file alone.
 *
 * The SESSION BADGE is inside the scroller, as its leading item. That is what
 * lets the bar survive a 375px phone: everything that must never be dropped —
 * "is the market open" first, then the indices in priority order — lives in one
 * strip that absorbs the pressure by scrolling. Hiding the badge at a
 * breakpoint instead would remove the one fact the user cannot infer from what
 * remains on screen.
 */
export function MarketTicker({ className }: { className?: string | undefined }) {
  const feed = useMarketTicker();

  if (feed.status === 'loading') {
    return (
      <div className={cn('flex min-w-0 items-center gap-3', className)} aria-hidden>
        <Skeleton className="h-6 w-28 shrink-0 rounded-full" />
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-4 w-24 shrink-0" />
        ))}
      </div>
    );
  }

  // No prices, and no pretending otherwise: the strip says the feed is down and
  // the tooltip carries the remedy. It never falls back to a stale number
  // without saying so, and never to a zero.
  if (feed.status === 'error') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex min-w-0 shrink items-center gap-1.5 text-warning text-xs',
              className,
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
            <span className="truncate">Market data unavailable</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{feed.error.remedy ?? feed.error.error}</TooltipContent>
      </Tooltip>
    );
  }

  const { indices, market, fetchedAt } = feed.data;

  return (
    // The scroller is the responsive strategy: on a narrow viewport the first
    // few indices stay visible and the rest scroll, rather than being dropped or
    // shrunk to an unreadable size. Its bar is hidden because a 48px header has
    // no room for one; the strip is still swipeable and keyboard-scrollable.
    <ul
      className={cn(
        'flex min-w-0 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="Market session and indices"
    >
      <li className="flex shrink-0 items-center">
        <MarketStatus phase={market.phase} isOpen={market.isOpen} verbose className="shrink-0" />
        {/* The numbers to the right are real but OLD. The freshness stamp says
            so, and drops off below xl — so the strip carries its own mark. A
            price that is quietly out of date is the one failure this bar must
            never have. */}
        {feed.stale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-1.5 inline-flex shrink-0 items-center text-warning">
                <TriangleAlertIcon className="size-3.5" />
                <span className="sr-only">Showing a cached snapshot</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium">Not live</span>
              <span className="block text-muted-foreground">
                The market data source is unreachable. These are the last good figures, from{' '}
                {istTime(fetchedAt)} IST.
              </span>
            </TooltipContent>
          </Tooltip>
        )}
        <span aria-hidden className="mx-2 h-3 w-px shrink-0 bg-border" />
      </li>
      {indices.map((index, position) => (
        <li key={index.symbol} className="flex shrink-0 items-center">
          {position > 0 && <span aria-hidden className="mx-1 h-3 w-px shrink-0 bg-border" />}
          <TickerItem index={index} fetchedAt={fetchedAt} stale={feed.stale} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One index.
 *
 * INDIA VIX is toned by `invertedToneOf`, the same override the dashboard cards
 * use: rising volatility is risk-off, so a green "up" would read exactly
 * backwards to anyone scanning the strip. The NUMBER is never flipped, only its
 * colour — and the glyph keeps the meaning for anyone who cannot separate red
 * from green.
 */
function TickerItem({
  index,
  fetchedAt,
  stale,
}: {
  index: TickerIndexDto;
  fetchedAt: string;
  stale: boolean;
}) {
  const isVix = index.display === 'volatility';
  const tone = isVix ? invertedToneOf(index.changePercent) : toneOf(index.changePercent);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-baseline gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1"
        >
          <span className="whitespace-nowrap font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-wide">
            {index.name}
          </span>
          <PercentChange value={index.changePercent} tone={tone} size="sm" weight="medium" />
        </button>
      </PopoverTrigger>

      {/* Everything the header itself has no room for. There is no index detail
          route to link to yet — the nav declares one as `planned` — so the
          popover is the detail surface rather than a dead link. */}
      <PopoverContent align="start" className="w-64">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-sm">{index.name}</span>
          <IndexLevel paise={index.ltp} size="lg" />
        </div>

        <PriceChange
          paise={index.change}
          percent={index.changePercent}
          tone={tone}
          size="sm"
          className="mt-0.5"
        />

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Row label="Open" paise={index.open} />
          <Row label="Previous close" paise={index.previousClose} />
          <Row label="Day high" paise={index.high} />
          <Row label="Day low" paise={index.low} />
        </dl>

        <p className="mt-3 border-border border-t pt-2 text-[0.6875rem] text-subtle-foreground">
          {stale ? 'Last good snapshot' : 'Updated'} {istTime(fetchedAt)} IST
          {isVix && ' · a rise in VIX is risk-off, so it is toned inversely'}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, paise }: { label: string; paise: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>
        <IndexLevel paise={paise} size="sm" />
      </dd>
    </div>
  );
}

const SENTIMENT_TONE: Record<TickerSentimentDto['label'], Tone> = {
  Bullish: 'bullish',
  'Mildly bullish': 'bullish',
  Neutral: 'neutral',
  'Mildly bearish': 'bearish',
  Bearish: 'bearish',
};

/**
 * The compact sentiment pill.
 *
 * The LABEL only — never the 0–100 score. CLAUDE.md forbids showing a
 * confidence number without the factors that produced it, and a 48px bar has no
 * room for the drivers. The full breakdown stays on Market overview, and the
 * tooltip points there.
 */
export function MarketSentimentPill({ className }: { className?: string | undefined }) {
  const feed = useMarketTicker();
  if (feed.status !== 'ready') return null;

  const { label } = feed.data.sentiment;
  const tone = SENTIMENT_TONE[label];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs',
            toneText({ tone }),
            className,
          )}
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">Market sentiment: {label}</span>
        <span className="block text-muted-foreground">
          A summary of the current tape, not a forecast. The inputs behind it are on Market
          overview.
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
