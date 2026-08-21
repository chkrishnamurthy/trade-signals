'use client';

import { useEffect } from 'react';
import { SignalBadge, SignalStrength } from '@/components/ui/signal-badge';
import { ratio, turnover } from '@/lib/dashboard-format';
import type { MoverDto, StockSignalDto } from '@/lib/dashboard-types';
import { price, signedPercent, signedPrice, toneFor, volume } from '@/lib/format';
import { useWatchlist } from '@/lib/watchlist';
import { MarketChart } from './chart';

/**
 * Stock detail drawer.
 *
 * Opened from anywhere in the dashboard. Quote fields come from the fast feed;
 * indicator fields from the slow one, and each renders "—" rather than a
 * placeholder number when its feed has not arrived.
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Prevent the page behind the drawer from scrolling.
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (symbol === null) return null;

  const rangePosition =
    quote?.low != null && quote.high != null && quote.high > quote.low
      ? ((quote.ltp - quote.low) / (quote.high - quote.low)) * 100
      : null;

  const metrics: [string, string][] = [
    ['Open', price(quote?.open ?? null)],
    ['Previous close', price(quote?.previousClose ?? null)],
    ['High', price(quote?.high ?? null)],
    ['Low', price(quote?.low ?? null)],
    ['Volume', volume(quote?.volume ?? null)],
    ['Turnover', turnover(quote?.turnover ?? null)],
    ['52W high', price(signal?.high52w ?? null)],
    ['52W low', price(signal?.low52w ?? null)],
  ];

  const indicators: [string, string][] = [
    ['RSI (14)', signal?.rsi == null ? '—' : signal.rsi.toFixed(1)],
    ['EMA 20', price(signal?.ema20 ?? null)],
    ['EMA 50', price(signal?.ema50 ?? null)],
    ['EMA 200', price(signal?.ema200 ?? null)],
    ['MACD hist', signal?.macdHistogram == null ? '—' : signedPrice(signal.macdHistogram)],
    ['ATR (14)', price(signal?.atr ?? null)],
    ['Rel. volume', ratio(quote?.relativeVolume ?? signal?.relativeVolume ?? null)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 size-full cursor-default bg-slate-900/40 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} details`}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{symbol}</h2>
              {signal !== null && <SignalBadge direction={signal.direction} />}
            </div>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {quote?.name ?? signal?.name ?? ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => toggle(symbol)}
              aria-pressed={has(symbol)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {has(symbol) ? '★ Watching' : '☆ Watch'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="space-y-5 px-5 py-4">
          {quote !== null && (
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-3xl font-semibold tabular-nums">
                  {price(quote.ltp)}
                </span>
                <span className={`font-mono tabular-nums ${toneFor(quote.change)}`}>
                  <span aria-hidden>{(quote.change ?? 0) >= 0 ? '▲' : '▼'}</span>{' '}
                  {signedPrice(quote.change)} ({signedPercent(quote.changePercent)})
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={`size-1.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  aria-hidden
                />
                {isLive ? 'Live — updating automatically' : 'Market closed — last traded price'}
              </p>
            </div>
          )}

          {rangePosition !== null && quote !== null && (
            <div>
              <div className="flex justify-between font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                <span>{price(quote.low)}</span>
                <span className="text-slate-400">Day range</span>
                <span>{price(quote.high)}</span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 dark:border-slate-950 dark:bg-white"
                  style={{ left: `${Math.min(100, Math.max(0, rangePosition))}%` }}
                  aria-hidden
                />
              </div>
            </div>
          )}

          {signal !== null && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Signal</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {signal.setups.length > 0 ? signal.setups.join(' · ') : 'No named setup'}
                </span>
              </div>
              <SignalStrength
                strength={signal.strength}
                direction={signal.direction}
                className="mt-2"
              />
              <ul className="mt-3 space-y-1">
                {signal.factors.map((factor) => (
                  <li key={factor.key} className="flex items-start gap-2 text-xs">
                    <span
                      className={
                        factor.score > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : factor.score < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                      }
                      aria-hidden
                    >
                      {factor.score > 0 ? '✓' : factor.score < 0 ? '✕' : '·'}
                    </span>
                    <span className="flex-1 text-slate-600 dark:text-slate-300">
                      {factor.label}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">{factor.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
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

          <Section title="Metrics" rows={metrics} />
          {signal !== null && <Section title="Technical indicators" rows={indicators} />}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: readonly [string, string][] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-slate-800"
          >
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
