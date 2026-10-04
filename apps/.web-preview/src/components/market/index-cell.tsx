'use client';

import { FlashOnChange } from '@/components/market/flash-on-change';
import { IndexLevel, PercentChange, PriceChange } from '@/components/market/numeric';
import { Skeleton } from '@/components/ui/skeleton';
import * as fmt from '@/lib/format';
import type { IndexSnapshotDto } from '@/lib/market-types';
import { invertedToneOf, toneOf } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * One index in the market indices strip: name · level · change, on one line,
 * with a hairline divider to the next (mockup v3, V1 — the NSE-site /
 * Moneycontrol ticker bar). No box: the strip is the container, so the row
 * reads as part of the app's top chrome rather than a shelf of widgets.
 *
 * The cell is as wide as its own numbers. The first build fixed cards at 212px
 * and "+302.95 (+0.54%)" overflowed at the dark theme's metrics; a strip whose
 * members come from config must never assume a width.
 *
 * Open / high / low / previous close live in the tooltip, and the session
 * state (pre-open, at close, delayed) is said once on the strip's status line.
 *
 * INDIA VIX is inverted deliberately: rising volatility is risk-off, so a
 * green "up" treatment would read exactly backwards for a trader scanning the
 * row. The inversion is a tone override — the number itself is never flipped.
 */
export function IndexCell({
  index,
  stale = false,
  className,
}: {
  index: IndexSnapshotDto;
  /** The snapshot is a last-good copy served through a provider fault. */
  stale?: boolean | undefined;
  className?: string | undefined;
}) {
  const isVix = index.display === 'volatility';
  const tone = isVix ? invertedToneOf(index.change) : toneOf(index.change);

  const detail = [
    ['Open', index.open],
    ['High', index.high],
    ['Low', index.low],
    ['Prev close', index.previousClose],
  ]
    .map(([label, paise]) => `${label} ${fmt.indexLevel(paise as number | null)}`)
    .join(' · ');
  const hint = isVix
    ? `${detail}\nImplied 30-day volatility of NIFTY options. Rising VIX means the market is pricing more risk.`
    : detail;

  return (
    <div
      data-slot="index-cell"
      title={hint}
      className={cn(
        'flex shrink-0 items-baseline gap-2 whitespace-nowrap border-border border-r px-3 first:pl-0 last:border-r-0 last:pr-0 2xl:px-4',
        stale && 'opacity-70',
        className,
      )}
    >
      <span className="font-semibold text-2xs text-muted-foreground uppercase tracking-wider">
        {index.name}
      </span>
      <FlashOnChange value={index.ltp}>
        <IndexLevel paise={index.ltp} size="sm" weight="semibold" />
      </FlashOnChange>
      {/* Both figures only where seven cells still fit beside them; the percent is the one to keep. */}
      <PriceChange
        paise={index.change}
        percent={index.changePercent}
        tone={tone}
        size="xs"
        weight="medium"
        className="hidden 2xl:inline-flex"
      />
      <PercentChange
        value={index.changePercent}
        tone={tone}
        size="xs"
        weight="medium"
        className="2xl:hidden"
      />
    </div>
  );
}

/** Same footprint as a cell, so the strip does not shift when data lands. */
export function IndexCellSkeleton({ className }: { className?: string | undefined }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center gap-2 border-border border-r px-3 first:pl-0 last:border-r-0 2xl:px-4',
        className,
      )}
    >
      <Skeleton className="h-2.5 w-14" />
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
