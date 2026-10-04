'use client';

import { PercentChange, Turnover } from '@/components/market/numeric';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { TONE_GLYPH, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import type { WatchlistPerformance } from '@/lib/watchlist-summary';

/**
 * How this watchlist is doing, in one strip.
 *
 * One card, not eight. Eight metric cards for eight numbers is the default
 * dashboard mistake: it triples the vertical space, and it implies each figure
 * is worth the same amount of attention when in fact the advance/decline split
 * and the average move are the whole story and the rest is context.
 *
 * The breadth bar is the one piece of chrome that earns itself — a 40/8 split
 * is legible as a shape long before the numbers are read.
 */
export function SummaryBar({
  performance,
  filtered,
}: {
  performance: WatchlistPerformance;
  /** True when filters are hiding rows, so the numbers can say what they cover. */
  filtered: boolean;
}) {
  const { total, advancing, declining, unchanged, unquoted } = performance;
  const directional = advancing + declining + unchanged;

  return (
    <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-5">
      {/* Count + breadth */}
      <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="figure text-2xl font-semibold tracking-tight">{total}</span>
          <Text variant="caption">
            {total === 1 ? 'stock' : 'stocks'}
            {filtered && ' shown'}
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="flex h-1.5 w-32 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${advancing} advancing, ${declining} declining, ${unchanged} unchanged`}
          >
            {directional > 0 && (
              <>
                <span
                  className="bg-bullish"
                  style={{ width: `${(advancing / directional) * 100}%` }}
                />
                <span
                  className="bg-neutral"
                  style={{ width: `${(unchanged / directional) * 100}%` }}
                />
                <span
                  className="bg-bearish"
                  style={{ width: `${(declining / directional) * 100}%` }}
                />
              </>
            )}
          </span>

          <span className="flex items-center gap-1.5 text-xs">
            <span className={toneText({ tone: 'bullish' })}>
              {TONE_GLYPH.bullish} {advancing}
            </span>
            <span className={toneText({ tone: 'bearish' })}>
              {TONE_GLYPH.bearish} {declining}
            </span>
            <span className="text-muted-foreground">→ {unchanged}</span>
          </span>
        </div>
      </div>

      <Divider />

      <Stat label="Average move">
        <PercentChange value={performance.averageChangePercent} size="lg" />
      </Stat>

      <Divider />

      <Stat label="Best">
        <Mover
          symbol={performance.best?.symbol ?? null}
          percent={performance.best?.changePercent ?? null}
        />
      </Stat>

      <Stat label="Worst">
        <Mover
          symbol={performance.worst?.symbol ?? null}
          percent={performance.worst?.changePercent ?? null}
        />
      </Stat>

      <Divider className="hidden lg:block" />

      <Stat label="Turnover" className="hidden lg:flex">
        <Turnover paise={performance.totalTurnover} size="lg" />
      </Stat>

      <Stat label="Above all EMAs" className="hidden xl:flex">
        <span className="figure text-base font-medium">
          {performance.withEmas === 0 ? (
            <span className="text-subtle-foreground">—</span>
          ) : (
            `${performance.aboveAllEmas}/${performance.withEmas}`
          )}
        </span>
      </Stat>

      {/*
        Only rendered when it is non-zero. A permanent "0 unquoted" is noise;
        a "3 unquoted" that appears is the signal that three rows in the table
        below are not showing live prices.
      */}
      {unquoted > 0 && (
        <>
          <Divider className="hidden sm:block" />
          <Stat label="No quote">
            <span className="figure text-base font-medium text-warning-foreground">{unquoted}</span>
          </Stat>
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <Text variant="caption" className="whitespace-nowrap">
        {label}
      </Text>
      {children}
    </div>
  );
}

function Divider({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('hidden h-8 w-px shrink-0 bg-border sm:block', className)} />
  );
}

function Mover({ symbol, percent }: { symbol: string | null; percent: number | null }) {
  if (symbol === null) {
    return <span className="text-sm text-subtle-foreground">—</span>;
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate text-sm font-medium">{symbol}</span>
      <PercentChange value={percent} size="sm" />
    </span>
  );
}
