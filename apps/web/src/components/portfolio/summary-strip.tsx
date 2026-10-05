import { formatPaise } from '@equitywise/shared';
import { PriceChange } from '@/components/market/numeric';
import type { PortfolioDto } from '@/lib/portfolio-types';

/**
 * The portfolio's headline numbers, pinned under the app bar and the indices strip
 * (56 + 36 px) so they stay in sight while the analysis scrolls.
 */
export function SummaryStrip({
  totals,
  holdings,
}: {
  totals: PortfolioDto['totals'];
  holdings: number;
}) {
  return (
    <div className="sticky top-[92px] z-20 -mx-1 bg-background/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Value">
          <span className="font-semibold">{formatPaise(totals.valuePaise, { decimals: 0 })}</span>
        </Cell>
        <Cell label="Today">
          <PriceChange
            paise={totals.dayChangePaise}
            percent={totals.dayChangeRatio === null ? null : totals.dayChangeRatio * 100}
          />
        </Cell>
        <Cell label="Total gain">
          <PriceChange
            paise={totals.gainPaise}
            percent={totals.gainRatio === null ? null : totals.gainRatio * 100}
          />
        </Cell>
        <Cell label={`You paid · ${holdings} ${holdings === 1 ? 'holding' : 'holdings'}`}>
          <span className="font-semibold">{formatPaise(totals.costPaise, { decimals: 0 })}</span>
        </Cell>
      </dl>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface px-3 py-2 shadow-subtle">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums sm:text-base [&>span]:flex-wrap">{children}</dd>
    </div>
  );
}
