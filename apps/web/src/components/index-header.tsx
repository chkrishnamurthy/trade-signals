import { indexLevel, istTime, signedPercent, signedPrice, toneFor } from '@/lib/format';
import type { IndexQuoteDto, MarketSnapshotDto } from '@/lib/market-types';
import { MarketStatusBadge } from './market-status-badge';

interface Props {
  readonly title: string;
  readonly index: IndexQuoteDto | null;
  readonly snapshot: MarketSnapshotDto;
  readonly stale: boolean;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}

export function IndexHeader({ title, index, snapshot, stale, isRefreshing, onRefresh }: Props) {
  const tone = toneFor(index?.change ?? null);

  return (
    <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <MarketStatusBadge status={snapshot.market.status} isOpen={snapshot.market.isOpen} />
          </div>

          {index === null ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Index level unavailable
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-semibold tabular-nums">
                {indexLevel(index.ltp)}
              </span>
              <span className={`font-mono text-base tabular-nums ${tone}`}>
                {signedPrice(index.change)}
              </span>
              <span className={`font-mono text-base tabular-nums ${tone}`}>
                ({signedPercent(index.changePercent)})
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <p className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Updated {istTime(snapshot.fetchedAt)} IST
          </p>
          {!snapshot.market.isOpen && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Market closed — showing last available prices
            </p>
          )}
          {stale && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Upstream unreachable — data may be out of date
            </p>
          )}
        </div>
      </div>

      {index !== null && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {[
            ['Open', index.open],
            ['High', index.high],
            ['Low', index.low],
            ['Prev close', index.previousClose],
          ].map(([label, value]) => (
            <div key={label as string} className="flex justify-between gap-2 sm:block">
              <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="font-mono tabular-nums">{indexLevel(value as number | null)}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
