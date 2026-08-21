'use client';

import { useState } from 'react';
import { Card, EmptyState, SkeletonRows } from '@/components/ui/card';
import { SignalBadge, SignalStrength } from '@/components/ui/signal-badge';
import { ratio } from '@/lib/dashboard-format';
import type { StockSignalDto, SwingCandidateDto } from '@/lib/dashboard-types';
import { priceCompact, signedPercent, toneFor } from '@/lib/format';

/**
 * Technical signals.
 *
 * These describe what the indicators currently show. They are not
 * recommendations, and nothing here emits BUY or SELL — that vocabulary is
 * reserved for the strategy layer, which does not exist yet.
 */
export function TradingSignals({
  signals,
  loading,
  onSelect,
}: {
  signals: readonly StockSignalDto[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');

  const visible = signals.filter((s) => {
    if (filter === 'bullish') return s.direction.includes('bullish');
    if (filter === 'bearish') return s.direction.includes('bearish');
    return s.direction !== 'neutral';
  });

  return (
    <Card
      title="Technical signals"
      subtitle="Indicator readings — not recommendations"
      action={
        <fieldset className="flex gap-1 border-0 p-0">
          <legend className="sr-only">Filter signals</legend>
          {(['all', 'bullish', 'bearish'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded px-2 py-1 text-xs capitalize ${
                filter === value
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {value}
            </button>
          ))}
        </fieldset>
      }
      bodyClassName="p-0"
    >
      {loading ? (
        <SkeletonRows rows={6} className="p-4" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No directional signals"
          detail="Every constituent is reading neutral on the current indicator set."
        />
      ) : (
        <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {visible.slice(0, 20).map((signal) => (
            <li key={signal.symbol}>
              <button
                type="button"
                onClick={() => onSelect(signal.symbol)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{signal.symbol}</span>
                    <SignalBadge direction={signal.direction} compact />
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {priceCompact(signal.ltp)}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-3">
                  <SignalStrength
                    strength={signal.strength}
                    direction={signal.direction}
                    className="max-w-40 flex-1"
                  />
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    RSI {signal.rsi === null ? '—' : signal.rsi.toFixed(0)}
                  </span>
                </div>

                {signal.setups.length > 0 && (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {signal.setups.join(' · ')}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Swing screener — multi-condition technical filter, explicitly not advice. */
export function SwingOpportunities({
  candidates,
  loading,
  onSelect,
}: {
  candidates: readonly SwingCandidateDto[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  return (
    <Card
      title="Swing opportunities"
      subtitle="Technical screen — not financial advice"
      bodyClassName="p-0"
    >
      {loading ? (
        <SkeletonRows rows={5} className="p-4" />
      ) : candidates.length === 0 ? (
        <EmptyState
          title="No setups match"
          detail="No constituent currently satisfies enough of the screen's conditions."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Stock
                </th>
                <th scope="col" className="px-2 py-2 text-left font-medium">
                  Setup
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  RSI
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Rel vol
                </th>
                <th scope="col" className="px-2 py-2 text-left font-medium">
                  Strength
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  LTP
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 12).map((c) => (
                <tr
                  key={c.symbol}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 focus-within:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50 dark:focus-within:bg-slate-800/50"
                >
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onSelect(c.symbol)}
                      className="text-left font-medium hover:underline focus:outline-none focus-visible:underline"
                    >
                      {c.symbol}
                      <span
                        className={`ml-2 font-mono text-xs tabular-nums ${toneFor(c.changePercent)}`}
                      >
                        {signedPercent(c.changePercent)}
                      </span>
                    </button>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {c.setup}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {c.rsi === null ? '—' : c.rsi.toFixed(0)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                    {ratio(c.relativeVolume)}
                  </td>
                  <td className="px-2 py-2">
                    <SignalStrength strength={c.strength} direction={c.direction} />
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {c.met}/{c.total} criteria
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {priceCompact(c.ltp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
