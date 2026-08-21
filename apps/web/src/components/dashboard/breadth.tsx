import { Card } from '@/components/ui/card';
import type { BreadthDto } from '@/lib/dashboard-types';

/** Advance/decline bar plus EMA participation counts. */
export function MarketBreadth({ breadth }: { breadth: BreadthDto }) {
  const { advancing, declining, unchanged, total } = breadth;
  const denominator = total || 1;
  const pct = (n: number) => (n / denominator) * 100;

  const emaRows: { label: string; value: number }[] = [
    { label: 'Above 20 EMA', value: breadth.aboveEma20 },
    { label: 'Above 50 EMA', value: breadth.aboveEma50 },
    { label: 'Above 200 EMA', value: breadth.aboveEma200 },
  ].filter((row): row is { label: string; value: number } => row.value !== null);

  return (
    <Card title="Market breadth" subtitle={`${total} constituents`}>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="img"
        aria-label={`${advancing} advancing, ${declining} declining, ${unchanged} unchanged`}
      >
        <div className="bg-emerald-500" style={{ width: `${pct(advancing)}%` }} />
        <div className="bg-slate-400 dark:bg-slate-500" style={{ width: `${pct(unchanged)}%` }} />
        <div className="bg-rose-500" style={{ width: `${pct(declining)}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['Advancing', advancing, 'text-emerald-600 dark:text-emerald-400', '▲'],
            ['Unchanged', unchanged, 'text-slate-500 dark:text-slate-400', '→'],
            ['Declining', declining, 'text-rose-600 dark:text-rose-400', '▼'],
          ] as const
        ).map(([label, value, tone, glyph]) => (
          <div key={label}>
            <p className={`font-mono text-xl font-semibold tabular-nums ${tone}`}>
              <span className="mr-1 text-xs" aria-hidden>
                {glyph}
              </span>
              {value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {emaRows.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            EMA participation loads with the indicator pass.
          </p>
        ) : (
          emaRows.map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${pct(value)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono tabular-nums">
                {value}/{total}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
