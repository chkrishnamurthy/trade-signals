'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { PercentChange } from '@/components/market/numeric';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { MoverDto, SectorDto } from '@/lib/dashboard-types';
import { toneFill, toneOf } from '@/lib/tone';
import { cn } from '@/lib/utils';

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
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Sector performance</CardTitle>
          <CardDescription>Mean change of constituents</CardDescription>
        </CardHeading>
        <CardToolbar>
          <Button variant="outline" size="sm" onClick={() => setAscending((v) => !v)}>
            {ascending ? 'Weakest first' : 'Strongest first'}
          </Button>
        </CardToolbar>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState title="No sector data" />
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((sector) => {
              const width = (Math.abs(sector.changePercent) / max) * 50;
              const tone = toneOf(sector.changePercent);
              const positive = sector.changePercent >= 0;
              return (
                <li key={sector.name} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate" title={sector.name}>
                    {sector.name}
                  </span>
                  {/* Diverging bar: zero sits at the centre line. */}
                  <span className="relative flex h-4 flex-1 items-center">
                    <span className="absolute left-1/2 h-full w-px bg-border-strong" />
                    <span
                      className={cn('absolute h-2 rounded-sm', toneFill({ tone }))}
                      style={
                        positive
                          ? { left: '50%', width: `${width}%` }
                          : { right: '50%', width: `${width}%` }
                      }
                    />
                  </span>
                  <PercentChange
                    value={sector.changePercent}
                    size="xs"
                    className="w-20 shrink-0 justify-end"
                  />
                  <span className="figure w-10 shrink-0 text-right text-subtle-foreground">
                    {sector.advancing}/{sector.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sector heatmap.
 *
 * Tile size is driven by turnover rather than market capitalisation — the
 * provider does not publish share counts, and inventing a market cap would be
 * fabricated data. Turnover is a genuine measure of where money actually moved
 * today.
 *
 * Tile colour interpolates the tone token rather than a literal RGB, so the
 * heatmap re-themes with everything else.
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
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Market heatmap</CardTitle>
          <CardDescription>Tile size by turnover, colour by change</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        {sectors.length === 0 ? (
          <EmptyState title="No heatmap data" />
        ) : (
          <div className="space-y-3">
            {sectors.map((sector) => (
              <div key={sector.name}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{sector.name}</p>
                <div className="flex flex-wrap gap-1">
                  {sector.symbols.map((symbol) => {
                    const quote = bySymbol.get(symbol);
                    if (quote === undefined) return null;
                    const change = quote.changePercent ?? 0;
                    // Scale intensity by move size, capped so a 5% mover does
                    // not wash out every other tile.
                    const intensity = Math.min(1, Math.abs(change) / 3);
                    const weight = (quote.turnover ?? 0) / maxTurnover;
                    const tone = toneOf(change);
                    return (
                      <Tooltip key={symbol}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onSelect(symbol)}
                            style={{
                              minWidth: `${52 + weight * 46}px`,
                              backgroundColor: `color-mix(in oklch, var(--${tone}) ${(0.15 + intensity * 0.6) * 100}%, transparent)`,
                            }}
                            className="rounded-md px-1.5 py-1 text-left text-[0.625rem] leading-tight text-foreground transition-transform hover:scale-105"
                          >
                            <span className="block truncate font-medium">{symbol}</span>
                            <PercentChange
                              value={quote.changePercent}
                              size="xs"
                              className="block"
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="font-medium">{symbol}</span>
                          <span className="block text-muted-foreground">
                            <PercentChange value={quote.changePercent} size="xs" /> · sized by
                            turnover
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
