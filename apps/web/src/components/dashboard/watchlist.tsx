'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { SignalBadge } from '@/components/ui/signal-badge';
import type { MoverDto, StockSignalDto } from '@/lib/dashboard-types';
import { priceCompact, signedPercent, toneFor, volume } from '@/lib/format';
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

  if (!hydrated) {
    return (
      <Card title="My watchlist">
        <div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
      </Card>
    );
  }

  if (symbols.length === 0) {
    return (
      <Card title="My watchlist">
        <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
          <p className="text-sm font-medium">Your watchlist is empty</p>
          <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
            Add stocks to track them across every session.
          </p>
          <button
            type="button"
            onClick={onBrowse}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Add stocks
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="My watchlist" subtitle={`${symbols.length} tracked`} bodyClassName="p-0">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {symbols.map((symbol, position) => {
          const quote = quoteBySymbol.get(symbol);
          const signal = signalBySymbol.get(symbol);
          return (
            <li key={symbol} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => onSelect(symbol)}
                className="min-w-0 flex-1 text-left focus:outline-none focus-visible:underline"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{symbol}</span>
                  {signal !== undefined && <SignalBadge direction={signal.direction} compact />}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {quote?.name ?? 'Not in the current index'}
                </span>
              </button>

              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm tabular-nums">
                  {quote === undefined ? '—' : priceCompact(quote.ltp)}
                </span>
                <span
                  className={`block font-mono text-xs tabular-nums ${toneFor(quote?.changePercent ?? null)}`}
                >
                  {quote === undefined ? '' : signedPercent(quote.changePercent)}
                </span>
              </span>

              <span className="hidden w-16 shrink-0 text-right font-mono text-xs tabular-nums text-slate-500 sm:block dark:text-slate-400">
                {quote === undefined ? '—' : volume(quote.volume)}
              </span>

              <span className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(symbol, position - 1)}
                  disabled={position === 0}
                  aria-label={`Move ${symbol} up`}
                  className="px-1 text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(symbol, position + 1)}
                  disabled={position === symbols.length - 1}
                  aria-label={`Move ${symbol} down`}
                  className="px-1 text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                >
                  ▼
                </button>
              </span>

              <button
                type="button"
                onClick={() => remove(symbol)}
                aria-label={`Remove ${symbol} from watchlist`}
                className="shrink-0 rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
