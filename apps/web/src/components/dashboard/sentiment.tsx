import { Card } from '@/components/ui/card';
import { percentPoint, ratio } from '@/lib/dashboard-format';
import type { SentimentDto } from '@/lib/dashboard-types';

/**
 * Market sentiment.
 *
 * Explicitly labelled as an analytical summary of the current tape, not a
 * forecast — and the inputs are listed so the number is inspectable rather than
 * a black box.
 */
export function MarketSentiment({ sentiment }: { sentiment: SentimentDto }) {
  const { breadth, score, label, drivers } = sentiment;
  const bullish = score >= 50;

  return (
    <Card title="Market sentiment" subtitle="Analytical summary — not a prediction">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-semibold tracking-tight">{label}</span>
        <span className="font-mono text-lg tabular-nums text-slate-600 dark:text-slate-300">
          {score}
          <span className="text-xs text-slate-400">/100</span>
        </span>
      </div>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="img"
        aria-label={`Market sentiment ${score} of 100, ${label}`}
      >
        <div
          className={`h-full rounded-full ${bullish ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        {drivers.map((driver) => (
          <div key={driver.label} className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">{driver.label}</dt>
            <dd className="text-right font-mono tabular-nums">{driver.detail}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5 dark:border-slate-800">
          <dt className="text-slate-500 dark:text-slate-400">A/D ratio</dt>
          <dd className="font-mono tabular-nums">{ratio(breadth.advanceDeclineRatio, '')}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Positive</dt>
          <dd className="font-mono tabular-nums">{percentPoint(breadth.percentPositive)}</dd>
        </div>
      </dl>
    </Card>
  );
}
