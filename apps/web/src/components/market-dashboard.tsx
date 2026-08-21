'use client';

import { useState } from 'react';
import type { QuoteDto } from '@/lib/market-types';
import { useMarket } from '@/lib/use-market';
import { IndexHeader } from './index-header';
import { StockDetail } from './stock-detail';
import { StockTable } from './stock-table';

/**
 * The market dashboard.
 *
 * Index-agnostic: pass `indexKey="banknifty"` and the same component renders
 * NIFTY BANK, because the API route resolves the key against
 * `config/indices.yaml`.
 */
export function MarketDashboard({ indexKey, title }: { indexKey: string; title: string }) {
  const { state, refresh, isRefreshing } = useMarket(indexKey);
  const [selected, setSelected] = useState<QuoteDto | null>(null);

  if (state.status === 'loading') {
    return <DashboardSkeleton title={title} />;
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/40">
        <h2 className="font-semibold text-rose-900 dark:text-rose-200">
          Could not load market data
        </h2>
        <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{state.error.error}</p>
        {state.error.remedy !== undefined && (
          <p className="mt-3 rounded bg-rose-100 px-3 py-2 font-mono text-xs text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">
            {state.error.remedy}
          </p>
        )}
        <button
          type="button"
          onClick={refresh}
          className="mt-4 rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
        >
          Try again
        </button>
      </div>
    );
  }

  const { snapshot, stale } = state;

  return (
    <>
      <IndexHeader
        title={title}
        index={snapshot.index}
        snapshot={snapshot}
        stale={stale}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />

      <div className="mt-6">
        {snapshot.constituents.length === 0 ? (
          <div className="rounded-lg border border-slate-200 p-10 text-center dark:border-slate-800">
            <p className="font-medium">No quotes returned</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Fyers accepted the request but returned no usable prices. This is normal well before
              the pre-open session.
            </p>
          </div>
        ) : (
          <StockTable quotes={snapshot.constituents} onSelect={setSelected} />
        )}
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {snapshot.constituents.length} of {snapshot.constituents.length + snapshot.missing.length}{' '}
          symbols
          {snapshot.cached && ' · served from cache'}
        </span>
        {snapshot.missing.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            No quote for: {snapshot.missing.join(', ')}
          </span>
        )}
      </footer>

      {selected !== null && (
        <StockDetail
          quote={
            // Always show the freshest row, not the one captured at click time.
            snapshot.constituents.find((q) => q.symbol === selected.symbol) ?? selected
          }
          isLive={snapshot.market.isOpen}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function DashboardSkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3 h-9 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mt-6 space-y-px overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton, never reordered
            key={i}
            className="h-12 animate-pulse bg-slate-100 dark:bg-slate-800/60"
          />
        ))}
      </div>
      <p className="sr-only">Loading market data</p>
    </div>
  );
}
