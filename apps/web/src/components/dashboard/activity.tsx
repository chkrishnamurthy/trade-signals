import { Card, EmptyState, SkeletonRows } from '@/components/ui/card';
import { turnover } from '@/lib/dashboard-format';
import type { ActivityEventDto, QuickStatsDto } from '@/lib/dashboard-types';
import { istTime, volume } from '@/lib/format';

/**
 * Market activity.
 *
 * Every entry is a technical setup the engine actually detected on real
 * candles — nothing is synthesised to make the feed look busy.
 */
export function MarketActivity({
  events,
  loading,
}: {
  events: readonly ActivityEventDto[];
  loading: boolean;
}) {
  return (
    <Card title="Market activity" subtitle="Detected technical events" bodyClassName="p-0">
      {loading ? (
        <SkeletonRows rows={5} className="p-4" />
      ) : events.length === 0 ? (
        <EmptyState
          title="No events detected"
          detail="Nothing in the index triggered a named technical setup on the latest close."
        />
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {events.map((event) => (
            <li
              // One setup fires at most once per symbol per bar, so this is unique.
              key={`${event.symbol}-${event.message}-${event.at}`}
              className="flex items-start gap-2 px-4 py-2"
            >
              <span
                className={`mt-1 size-1.5 shrink-0 rounded-full ${
                  event.tone === 'bullish'
                    ? 'bg-emerald-500'
                    : event.tone === 'bearish'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                }`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  <span className="font-medium">{event.symbol}</span>{' '}
                  <span className="text-slate-600 dark:text-slate-300">{event.message}</span>
                </span>
                <span className="block font-mono text-[11px] tabular-nums text-slate-400">
                  {istTime(event.at)} IST
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Compact statistic tiles — deliberately smaller than the index cards. */
export function QuickStats({ stats }: { stats: QuickStatsDto }) {
  const tiles: [string, string][] = [
    ['Total volume', volume(stats.totalVolume)],
    ['Turnover', turnover(stats.totalTurnover)],
    ['Advancing', String(stats.advancing)],
    ['Declining', String(stats.declining)],
    ['Near 52W high', stats.nearHigh52w === null ? '—' : String(stats.nearHigh52w)],
    ['Near 52W low', stats.nearLow52w === null ? '—' : String(stats.nearLow52w)],
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50"
        >
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="font-mono text-sm font-medium tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}
