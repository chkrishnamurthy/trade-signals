'use client';

import { StarIcon } from 'lucide-react';
import { DefinitionGrid, DefinitionRow } from '@/components/data-display/metric-card';
import { LiveIndicator } from '@/components/market/market-status';
import {
  IndicatorValue,
  Price,
  PriceChange,
  Ratio,
  Turnover,
  Volume,
} from '@/components/market/numeric';
import { SetupTag, SignalBadge, SignalReason, SignalScore } from '@/components/market/signal';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Text } from '@/components/ui/typography';
import type { MoverDto, StockSignalDto } from '@/lib/dashboard-types';
import { signedPrice } from '@/lib/format';
import { useWatchlist } from '@/lib/watchlist';
import { MarketChart } from './chart';

/**
 * Stock detail drawer.
 *
 * Opened from anywhere in the dashboard. Quote fields come from the fast feed;
 * indicator fields from the slow one, and each renders "—" rather than a
 * placeholder number when its feed has not arrived.
 *
 * Built on the Sheet primitive, so focus is trapped inside, Escape closes, the
 * page behind is inert and focus returns to whatever opened it. The hand-rolled
 * version this replaces did none of that.
 */
export function StockDetailDrawer({
  quote,
  signal,
  isLive,
  onClose,
}: {
  quote: MoverDto | null;
  signal: StockSignalDto | null;
  isLive: boolean;
  onClose: () => void;
}) {
  const { has, toggle } = useWatchlist();
  const symbol = quote?.symbol ?? signal?.symbol ?? null;

  if (symbol === null) return null;

  const rangePosition =
    quote?.low != null && quote.high != null && quote.high > quote.low
      ? ((quote.ltp - quote.low) / (quote.high - quote.low)) * 100
      : null;

  const watching = has(symbol);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SheetTitle>{symbol}</SheetTitle>
              {signal !== null && <SignalBadge direction={signal.direction} />}
            </div>
            <SheetDescription>{quote?.name ?? signal?.name ?? ''}</SheetDescription>
          </div>
          <div className="mr-8 flex shrink-0 gap-1">
            <Button
              variant={watching ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => toggle(symbol)}
              aria-pressed={watching}
            >
              <StarIcon className={watching ? 'fill-current' : undefined} />
              {watching ? 'Watching' : 'Watch'}
            </Button>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-5">
          {quote !== null && (
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Price paise={quote.ltp} size="display" />
                <PriceChange paise={quote.change} percent={quote.changePercent} />
              </div>
              <LiveIndicator
                live={isLive}
                label={
                  isLive ? 'Live — updating automatically' : 'Market closed — last traded price'
                }
                className="mt-1"
              />
            </div>
          )}

          {rangePosition !== null && quote !== null && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <Price paise={quote.low} size="xs" />
                <span>Day range</span>
                <Price paise={quote.high} size="xs" />
              </div>
              <div
                className="relative mt-1.5 h-1.5 rounded-full bg-muted"
                role="img"
                aria-label={`Trading at ${rangePosition.toFixed(0)}% of the day's range`}
              >
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-foreground"
                  style={{ left: `${Math.min(100, Math.max(0, rangePosition))}%` }}
                  aria-hidden
                />
              </div>
            </div>
          )}

          {signal !== null && (
            <div className="rounded-lg border border-border p-3">
              <SignalScore score={signal.strength} direction={signal.direction}>
                {signal.setups.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {signal.setups.map((setup) => (
                      <SetupTag key={setup}>{setup}</SetupTag>
                    ))}
                  </div>
                )}
                {/* The breakdown is what earns the number the right to be shown. */}
                <ul className="space-y-1">
                  {signal.factors.map((factor) => (
                    <SignalReason
                      key={factor.key}
                      label={factor.label}
                      detail={factor.detail}
                      score={factor.score}
                    />
                  ))}
                </ul>
              </SignalScore>
              <p className="mt-3 border-t border-border pt-2 text-[0.6875rem] text-subtle-foreground">
                Technical observation from indicator readings. Not a recommendation.
              </p>
            </div>
          )}

          <MarketChart
            symbol={symbol}
            title="Price"
            previousClose={quote?.previousClose ?? null}
            compact
          />

          <section>
            <Text as="h3" variant="overline" className="mb-1 block">
              Metrics
            </Text>
            <DefinitionGrid>
              <DefinitionRow label="Open" value={<Price paise={quote?.open} size="sm" />} />
              <DefinitionRow
                label="Previous close"
                value={<Price paise={quote?.previousClose} size="sm" />}
              />
              <DefinitionRow label="High" value={<Price paise={quote?.high} size="sm" />} />
              <DefinitionRow label="Low" value={<Price paise={quote?.low} size="sm" />} />
              <DefinitionRow label="Volume" value={<Volume shares={quote?.volume} size="sm" />} />
              <DefinitionRow
                label="Turnover"
                value={<Turnover paise={quote?.turnover} size="sm" />}
              />
              <DefinitionRow label="52W high" value={<Price paise={signal?.high52w} size="sm" />} />
              <DefinitionRow label="52W low" value={<Price paise={signal?.low52w} size="sm" />} />
            </DefinitionGrid>
          </section>

          {signal !== null && (
            <section>
              <Text as="h3" variant="overline" className="mb-1 block">
                Technical indicators
              </Text>
              <DefinitionGrid>
                <DefinitionRow label="RSI (14)" value={<IndicatorValue value={signal.rsi} />} />
                <DefinitionRow label="EMA 20" value={<Price paise={signal.ema20} size="sm" />} />
                <DefinitionRow label="EMA 50" value={<Price paise={signal.ema50} size="sm" />} />
                <DefinitionRow label="EMA 200" value={<Price paise={signal.ema200} size="sm" />} />
                <DefinitionRow
                  label="MACD hist"
                  value={
                    <span className="figure text-sm">
                      {signal.macdHistogram == null ? '—' : signedPrice(signal.macdHistogram)}
                    </span>
                  }
                />
                <DefinitionRow label="ATR (14)" value={<Price paise={signal.atr} size="sm" />} />
                <DefinitionRow
                  label="Rel. volume"
                  value={<Ratio value={quote?.relativeVolume ?? signal.relativeVolume} size="sm" />}
                />
              </DefinitionGrid>
            </section>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
