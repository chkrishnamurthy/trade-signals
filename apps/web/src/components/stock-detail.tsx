'use client';

import { useEffect } from 'react';
import { istTime, price, signedPercent, signedPrice, toneFor, volume } from '@/lib/format';
import type { QuoteDto } from '@/lib/market-types';

interface Props {
  readonly quote: QuoteDto;
  readonly isLive: boolean;
  readonly onClose: () => void;
}

/** Percent of the day's range the last price sits at, or null if unknowable. */
function rangePosition(quote: QuoteDto): number | null {
  const { low, high, ltp } = quote;
  if (low === null || high === null || high <= low) return null;
  return ((ltp - low) / (high - low)) * 100;
}

export function StockDetail({ quote, isLive, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tone = toneFor(quote.change);
  const position = rangePosition(quote);

  const stats: [string, string][] = [
    ['Open', price(quote.open)],
    ['High', price(quote.high)],
    ['Low', price(quote.low)],
    ['Previous close', price(quote.previousClose)],
    ['Average price', price(quote.averagePrice)],
    ['Volume', volume(quote.volume)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* A real button, so dismiss-by-backdrop is keyboard reachable too. */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 size-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${quote.name} details`}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:rounded-xl dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{quote.symbol}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{quote.name}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
              {quote.fyersSymbol}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-3xl font-semibold tabular-nums">{price(quote.ltp)}</span>
          <span className={`font-mono tabular-nums ${tone}`}>{signedPrice(quote.change)}</span>
          <span className={`font-mono tabular-nums ${tone}`}>
            ({signedPercent(quote.changePercent)})
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs">
          <span
            className={`size-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-400'}`}
            aria-hidden
          />
          <span className="text-slate-500 dark:text-slate-400">
            {isLive ? 'Live — updating automatically' : 'Market closed — last traded price'}
            {quote.timestamp !== null && ` · ${istTime(quote.timestamp)} IST`}
          </span>
        </div>

        {position !== null && (
          <div className="mt-6">
            <div className="flex justify-between font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              <span>{price(quote.low)}</span>
              <span className="text-slate-400 dark:text-slate-500">Day range</span>
              <span>{price(quote.high)}</span>
            </div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 dark:border-slate-900 dark:bg-white"
                style={{ left: `${Math.min(100, Math.max(0, position))}%` }}
                aria-hidden
              />
            </div>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"
            >
              <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Intraday chart slots in here once candles are being ingested. */}
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
          Intraday chart — available once candle ingestion lands
        </div>
      </div>
    </div>
  );
}
