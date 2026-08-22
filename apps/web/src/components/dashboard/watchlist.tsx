'use client';

import { ChevronDownIcon, ChevronUpIcon, ListPlusIcon, XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState, SkeletonRows } from '@/components/data-display/states';
import { PercentChange, Price, Volume } from '@/components/market/numeric';
import { SignalBadge } from '@/components/market/signal';
import { StockIdentity } from '@/components/market/stock-identity';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import type { MoverDto, StockSignalDto } from '@/lib/dashboard-types';
import { useWatchlist } from '@/lib/watchlist';

/**
 * Watchlist.
 *
 * Rows are joined from the quote feed and the signal feed by symbol, so a
 * watchlist entry shows a live price even before the slower indicator pass has
 * produced a signal for it.
 */
export function Watchlist({
  quotes,
  signals,
  onSelect,
  onBrowse,
}: {
  quotes: readonly MoverDto[];
  signals: readonly StockSignalDto[];
  onSelect: (symbol: string) => void;
  onBrowse: () => void;
}) {
  const { symbols, hydrated, remove, move } = useWatchlist();

  const quoteBySymbol = useMemo(() => new Map(quotes.map((q) => [q.symbol, q])), [quotes]);
  const signalBySymbol = useMemo(() => new Map(signals.map((s) => [s.symbol, s])), [signals]);

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>My watchlist</CardTitle>
          <CardDescription>
            {hydrated ? `${symbols.length} tracked` : 'Loading your list'}
          </CardDescription>
        </CardHeading>
      </CardHeader>

      <CardContent flush>
        {!hydrated ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : symbols.length === 0 ? (
          <EmptyState
            icon={<ListPlusIcon />}
            title="Your watchlist is empty"
            description="Add stocks to track them across every session."
            action={
              <Button size="sm" onClick={onBrowse}>
                Add stocks
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {symbols.map((symbol, position) => {
              const quote = quoteBySymbol.get(symbol);
              const signal = signalBySymbol.get(symbol);
              return (
                <li key={symbol} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(symbol)}
                    className="min-w-0 flex-1 text-left focus-visible:underline"
                  >
                    <StockIdentity symbol={symbol} name={quote?.name ?? 'Not in the current index'}>
                      {signal !== undefined && <SignalBadge direction={signal.direction} compact />}
                    </StockIdentity>
                  </button>

                  <span className="flex shrink-0 flex-col items-end">
                    <Price paise={quote?.ltp} bare size="sm" />
                    <PercentChange value={quote?.changePercent} size="xs" />
                  </span>

                  <span className="hidden w-16 shrink-0 text-right sm:block">
                    <Volume shares={quote?.volume} size="xs" className="text-muted-foreground" />
                  </span>

                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => move(symbol, position - 1)}
                      disabled={position === 0}
                      aria-label={`Move ${symbol} up`}
                      className="rounded-sm px-0.5 text-subtle-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUpIcon className="size-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(symbol, position + 1)}
                      disabled={position === symbols.length - 1}
                      aria-label={`Move ${symbol} down`}
                      className="rounded-sm px-0.5 text-subtle-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDownIcon className="size-3" aria-hidden />
                    </button>
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(symbol)}
                    aria-label={`Remove ${symbol} from watchlist`}
                    className="shrink-0 text-subtle-foreground hover:text-destructive"
                  >
                    <XIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
