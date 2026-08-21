'use client';

import { Card, EmptyState } from '@/components/ui/card';
import { ratio, turnover } from '@/lib/dashboard-format';
import type { MoverDto } from '@/lib/dashboard-types';
import { priceCompact, signedPercent, toneFor, volume } from '@/lib/format';

/**
 * Movers list — gainers, losers, most active and unusual volume all share this.
 *
 * One component rather than four near-identical ones; the differences are the
 * trailing metric and the empty-state wording.
 */

export type MoverMetric = 'changePercent' | 'volume' | 'turnover' | 'relativeVolume';

const METRIC_LABEL: Record<MoverMetric, string> = {
  changePercent: 'Change',
  volume: 'Volume',
  turnover: 'Turnover',
  relativeVolume: 'Rel. vol',
};

function metricValue(mover: MoverDto, metric: MoverMetric): string {
  switch (metric) {
    case 'volume':
      return volume(mover.volume);
    case 'turnover':
      return turnover(mover.turnover);
    case 'relativeVolume':
      return ratio(mover.relativeVolume);
    default:
      return signedPercent(mover.changePercent);
  }
}

export function MoversCard({
  title,
  subtitle,
  movers,
  metric = 'changePercent',
  emptyTitle,
  emptyDetail,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  movers: readonly MoverDto[];
  metric?: MoverMetric;
  emptyTitle: string;
  emptyDetail?: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <Card title={title} subtitle={subtitle} bodyClassName="p-0">
      {movers.length === 0 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {movers.map((mover) => {
            const tone = toneFor(mover.changePercent);
            return (
              <li key={mover.symbol}>
                <button
                  type="button"
                  onClick={() => onSelect(mover.symbol)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{mover.symbol}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {mover.sector}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm tabular-nums">
                      {priceCompact(mover.ltp)}
                    </span>
                    <span className={`block font-mono text-xs tabular-nums ${tone}`}>
                      <span aria-hidden>{(mover.changePercent ?? 0) >= 0 ? '▲' : '▼'}</span>{' '}
                      {signedPercent(mover.changePercent)}
                    </span>
                  </span>

                  {metric !== 'changePercent' && (
                    <span className="w-20 shrink-0 text-right">
                      <span className="block font-mono text-sm tabular-nums">
                        {metricValue(mover, metric)}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                        {METRIC_LABEL[metric]}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
