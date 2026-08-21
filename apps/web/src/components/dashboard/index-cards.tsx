import { Sparkline } from '@/components/ui/sparkline';
import { level } from '@/lib/dashboard-format';
import type { HeadlineIndexDto } from '@/lib/dashboard-types';
import { signedPercent, signedPrice, toneFor } from '@/lib/format';

/**
 * Headline index cards.
 *
 * INDIA VIX is inverted deliberately: rising volatility is risk-off, so a green
 * "up" treatment would read exactly backwards for a trader scanning the row.
 */
export function IndexCards({ indices }: { indices: readonly HeadlineIndexDto[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {indices.map((index) => (
        <IndexCard key={index.symbol} index={index} />
      ))}
    </div>
  );
}

function IndexCard({ index }: { index: HeadlineIndexDto }) {
  const isVix = index.kind === 'volatility';
  // For VIX, a rise is bearish for equities — flip the tone, not the number.
  const toneValue = isVix ? -(index.change ?? 0) : (index.change ?? 0);
  const tone = toneFor(toneValue);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {index.name}
          </h3>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{level(index.ltp)}</p>
        </div>
        <Sparkline values={index.sparkline} />
      </div>

      <div
        className={`mt-2 flex flex-wrap items-baseline gap-x-2 font-mono text-sm tabular-nums ${tone}`}
      >
        <span aria-hidden>{(index.change ?? 0) >= 0 ? '▲' : '▼'}</span>
        <span>{signedPrice(index.change)}</span>
        <span>({signedPercent(index.changePercent)})</span>
      </div>

      {isVix ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {(index.changePercent ?? 0) > 0 ? 'Volatility rising — risk-off' : 'Volatility easing'}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
          {(
            [
              ['Open', index.open],
              ['High', index.high],
              ['Low', index.low],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="font-mono tabular-nums">{level(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
