'use client';

import { useMemo, useState } from 'react';
import { Card, EmptyState } from '@/components/ui/card';
import type { MoverDto, SectorDto } from '@/lib/dashboard-types';
import { signedPercent, toneFor } from '@/lib/format';

/** Sector performance: mean change% of each sector's constituents. */
export function SectorPerformance({ sectors }: { sectors: readonly SectorDto[] }) {
  const [ascending, setAscending] = useState(false);

  const sorted = useMemo(
    () =>
      [...sectors].sort((a, b) =>
        ascending ? a.changePercent - b.changePercent : b.changePercent - a.changePercent,
      ),
    [sectors, ascending],
  );

  // Bars are scaled to the largest absolute move so the strongest sector fills
  // the row; a fixed scale would render every bar as a stub on a quiet day.
  const max = Math.max(0.01, ...sectors.map((s) => Math.abs(s.changePercent)));

  return (
    <Card
      title="Sector performance"
      subtitle="Mean change of constituents"
      action={
        <button
          type="button"
          onClick={() => setAscending((v) => !v)}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {ascending ? 'Weakest first' : 'Strongest first'}
        </button>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState title="No sector data" />
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((sector) => {
            const width = (Math.abs(sector.changePercent) / max) * 50;
            const positive = sector.changePercent >= 0;
            return (
              <li key={sector.name} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate" title={sector.name}>
                  {sector.name}
                </span>
                {/* Diverging bar: zero sits at the centre line. */}
                <span className="relative flex h-4 flex-1 items-center">
                  <span className="absolute left-1/2 h-full w-px bg-slate-300 dark:bg-slate-600" />
                  <span
                    className={`absolute h-2 rounded-sm ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={
                      positive
                        ? { left: '50%', width: `${width}%` }
                        : { right: '50%', width: `${width}%` }
                    }
                  />
                </span>
                <span
                  className={`w-16 shrink-0 text-right font-mono tabular-nums ${toneFor(sector.changePercent)}`}
                >
                  {signedPercent(sector.changePercent)}
                </span>
                <span className="w-10 shrink-0 text-right text-slate-400 dark:text-slate-500">
                  {sector.advancing}/{sector.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * Sector heatmap.
 *
 * Tile size is driven by turnover rather than market capitalisation — Fyers
 * does not publish share counts, and inventing a market cap would be fabricated
 * data. Turnover is a genuine measure of where money actually moved today.
 */
export function SectorHeatmap({
  sectors,
  quotes,
  onSelect,
}: {
  sectors: readonly SectorDto[];
  quotes: readonly MoverDto[];
  onSelect: (symbol: string) => void;
}) {
  const bySymbol = useMemo(() => new Map(quotes.map((q) => [q.symbol, q])), [quotes]);

  const maxTurnover = useMemo(() => Math.max(1, ...quotes.map((q) => q.turnover ?? 0)), [quotes]);

  return (
    <Card title="Market heatmap" subtitle="Tile size by turnover, colour by change">
      {sectors.length === 0 ? (
        <EmptyState title="No heatmap data" />
      ) : (
        <div className="space-y-3">
          {sectors.map((sector) => (
            <div key={sector.name}>
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {sector.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {sector.symbols.map((symbol) => {
                  const quote = bySymbol.get(symbol);
                  if (quote === undefined) return null;
                  const change = quote.changePercent ?? 0;
                  // Scale intensity by move size, capped so a 5% mover does not
                  // wash out every other tile.
                  const intensity = Math.min(1, Math.abs(change) / 3);
                  const weight = (quote.turnover ?? 0) / maxTurnover;
                  return (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => onSelect(symbol)}
                      title={`${symbol} · ${signedPercent(quote.changePercent)} · turnover-weighted`}
                      style={{
                        minWidth: `${52 + weight * 46}px`,
                        backgroundColor:
                          change >= 0
                            ? `rgba(16, 185, 129, ${0.15 + intensity * 0.65})`
                            : `rgba(244, 63, 94, ${0.15 + intensity * 0.65})`,
                      }}
                      className="rounded px-1.5 py-1 text-left text-[10px] leading-tight text-slate-900 transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:text-slate-50"
                    >
                      <span className="block truncate font-medium">{symbol}</span>
                      <span className="block font-mono tabular-nums">
                        {signedPercent(quote.changePercent)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
