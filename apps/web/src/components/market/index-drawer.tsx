'use client';

import { DefinitionGrid, DefinitionRow } from '@/components/data-display/metric-card';
import { IndexLevel, PriceChange } from '@/components/market/numeric';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Text } from '@/components/ui/typography';
import { MarketChart } from '@/components/watchlists/chart';
import { rangePosition } from '@/lib/market-math';
import type { IndexSnapshotDto } from '@/lib/market-types';
import { invertedToneOf, toneOf } from '@/lib/tone';

/**
 * Detail for one index, opened from the indices strip (EW-133 phase 4).
 *
 * Everything shown comes from the strip's own snapshot (level, change, open, high,
 * low, previous close) plus the same self-fetching chart the watchlist uses, so
 * opening it costs no extra provider call beyond the chart's history request. A
 * 52-week range and constituent breadth are not shown: neither is in the snapshot,
 * and a number the page cannot source is left out rather than invented.
 *
 * Built on the Sheet primitive: focus is trapped, Escape closes, and focus returns
 * to the cell that opened it.
 */
export function IndexDrawer({
  index,
  onClose,
}: {
  index: IndexSnapshotDto | null;
  onClose: () => void;
}) {
  if (index === null) return null;

  const isVix = index.display === 'volatility';
  const tone = isVix ? invertedToneOf(index.change) : toneOf(index.change);
  const position = rangePosition(index.ltp, index.low, index.high);
  const rangePercent = position === null ? null : position * 100;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-3xl">
        <SheetHeader>
          <div className="min-w-0">
            <SheetTitle>{index.name}</SheetTitle>
            <SheetDescription>
              {isVix
                ? 'Implied 30-day volatility of NIFTY options. A rising VIX means the market is pricing more risk.'
                : `${index.exchange} index`}
            </SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <IndexLevel paise={index.ltp} size="display" />
            <PriceChange paise={index.change} percent={index.changePercent} tone={tone} />
          </div>

          {rangePercent !== null && (
            <div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <IndexLevel paise={index.low} size="xs" />
                <span>Day range</span>
                <IndexLevel paise={index.high} size="xs" />
              </div>
              <div
                className="relative mt-1.5 h-1.5 rounded-full bg-muted"
                role="img"
                aria-label={`At ${rangePercent.toFixed(0)}% of the day's range`}
              >
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-foreground"
                  style={{ left: `${Math.min(100, Math.max(0, rangePercent))}%` }}
                  aria-hidden
                />
              </div>
            </div>
          )}

          <MarketChart symbol={index.symbol} title="Level" previousClose={index.previousClose} />

          <section>
            <Text as="h3" variant="overline" className="mb-1 block">
              Session
            </Text>
            <DefinitionGrid>
              <DefinitionRow label="Open" value={<IndexLevel paise={index.open} size="sm" />} />
              <DefinitionRow
                label="Previous close"
                value={<IndexLevel paise={index.previousClose} size="sm" />}
              />
              <DefinitionRow label="High" value={<IndexLevel paise={index.high} size="sm" />} />
              <DefinitionRow label="Low" value={<IndexLevel paise={index.low} size="sm" />} />
            </DefinitionGrid>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
