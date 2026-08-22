'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartLegend, ChartLegendItem } from '@/components/charts/chart-container';
import { ChartSkeleton, DataUnavailable, ErrorState } from '@/components/data-display/states';
import { istTime, priceCompact } from '@/lib/format';
import type { TradeDirection } from '@/lib/intraday-types';
import { cn } from '@/lib/utils';

/**
 * The session chart behind a signal.
 *
 * Inline SVG, like every other chart in the product — no charting library, no
 * second visual language, every colour a design token read through a `--chart-*`
 * custom property or a tone class.
 *
 * Bars and overlays arrive pre-computed from the server, derived from stored
 * candles with the same pure functions the engine used. The browser draws; it
 * does not analyse.
 */

interface ChartBar {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

interface ChartResponse {
  readonly symbol: string;
  readonly tradingDate: string;
  readonly minutes: number;
  readonly bars: readonly ChartBar[];
  readonly vwap: readonly (number | null)[];
  readonly ema9: readonly (number | null)[];
  readonly ema20: readonly (number | null)[];
  readonly levels: readonly {
    readonly label: string;
    readonly price: number;
    readonly kind: string;
  }[];
  readonly triggeredAt: string | null;
  readonly direction: TradeDirection;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidation: number;
  readonly target1: number;
  readonly target2: number;
}

const WIDTH = 760;
const PRICE_HEIGHT = 240;
const VOLUME_HEIGHT = 44;

export function SignalChart({ signalId }: { signalId: number }) {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/intraday-signals/${signalId}/chart`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError((payload as { error?: string }).error ?? 'Could not load the chart');
          setData(null);
          return;
        }
        setData(payload as ChartResponse);
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load the chart');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [signalId]);

  const geometry = useMemo(() => {
    if (data === null || data.bars.length < 2) return null;

    const { bars } = data;
    // The scale must include every horizontal line, or the invalidation level
    // lands off-canvas exactly when it matters most.
    const references = [
      data.entryLow,
      data.entryHigh,
      data.invalidation,
      data.target1,
      data.target2,
      ...data.levels.map((level) => level.price),
    ];
    const min = Math.min(...bars.map((bar) => bar.l), ...references);
    const max = Math.max(...bars.map((bar) => bar.h), ...references);
    const span = max - min || 1;
    const step = WIDTH / bars.length;
    const bodyWidth = Math.max(1.5, step * 0.6);
    const maxVolume = Math.max(1, ...bars.map((bar) => bar.v));

    const y = (price: number): number => PRICE_HEIGHT - ((price - min) / span) * PRICE_HEIGHT;
    const x = (index: number): number => index * step + step / 2;

    const line = (series: readonly (number | null)[]): string =>
      series
        .map((value, index) =>
          value === null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`,
        )
        .filter((point): point is string => point !== null)
        .join(' ');

    const triggerIndex =
      data.triggeredAt === null
        ? null
        : bars.findIndex((bar) => bar.t >= new Date(data.triggeredAt ?? '').getTime());

    return { bars, min, max, span, step, bodyWidth, maxVolume, y, x, line, triggerIndex };
  }, [data]);

  if (loading) return <ChartSkeleton />;
  if (error !== null) return <ErrorState title="Chart unavailable" detail={error} />;
  if (data === null || geometry === null) {
    return (
      <DataUnavailable
        what="Session chart"
        reason="Not enough stored one-minute candles for this session yet."
      />
    );
  }

  const { y, x, line, bars, bodyWidth, maxVolume, triggerIndex } = geometry;
  const long = data.direction === 'long';

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${PRICE_HEIGHT + VOLUME_HEIGHT + 8}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${data.symbol} ${data.minutes}-minute candles for ${data.tradingDate}, with VWAP, EMAs and the signal's technical levels`}
      >
        <title>
          {data.symbol} {data.minutes}m session chart
        </title>

        {/* Technical entry zone — a band, because the setup is not a single price */}
        <rect
          x={0}
          y={y(Math.max(data.entryHigh, data.entryLow))}
          width={WIDTH}
          height={Math.max(1, Math.abs(y(data.entryLow) - y(data.entryHigh)))}
          className={long ? 'fill-bullish/10' : 'fill-bearish/10'}
        />

        {/* Support / resistance the engine actually used */}
        {data.levels.map((level) => (
          <g key={`${level.label}-${level.price}`}>
            <line
              x1={0}
              x2={WIDTH}
              y1={y(level.price)}
              y2={y(level.price)}
              className="stroke-chart-grid"
              strokeWidth={1}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {/* Invalidation and targets */}
        <ReferenceLine y={y(data.invalidation)} className="stroke-bearish" dash="4 3" />
        <ReferenceLine y={y(data.target1)} className="stroke-bullish" dash="4 3" />
        <ReferenceLine y={y(data.target2)} className="stroke-bullish/60" dash="2 5" />

        {/* Candles */}
        {bars.map((bar, index) => {
          const up = bar.c >= bar.o;
          const bodyTop = y(Math.max(bar.o, bar.c));
          const bodyBottom = y(Math.min(bar.o, bar.c));
          return (
            <g
              key={bar.t}
              className={up ? 'fill-bullish stroke-bullish' : 'fill-bearish stroke-bearish'}
            >
              <line
                x1={x(index)}
                x2={x(index)}
                y1={y(bar.h)}
                y2={y(bar.l)}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x(index) - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={Math.max(1, bodyBottom - bodyTop)}
                stroke="none"
              />
            </g>
          );
        })}

        {/* Overlays */}
        <polyline
          points={line(data.vwap)}
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--chart-1)' }}
        />
        <polyline
          points={line(data.ema9)}
          fill="none"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--chart-3)' }}
        />
        <polyline
          points={line(data.ema20)}
          fill="none"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--chart-4)' }}
        />

        {/* Where the signal triggered */}
        {triggerIndex !== null && triggerIndex >= 0 && (
          <g>
            <line
              x1={x(triggerIndex)}
              x2={x(triggerIndex)}
              y1={0}
              y2={PRICE_HEIGHT}
              className="stroke-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(triggerIndex)}
              cy={y(bars[triggerIndex]?.c ?? 0)}
              r={3.5}
              className={long ? 'fill-bullish' : 'fill-bearish'}
            />
          </g>
        )}

        {/* Volume */}
        <g transform={`translate(0, ${PRICE_HEIGHT + 8})`}>
          {bars.map((bar, index) => {
            const height = (bar.v / maxVolume) * VOLUME_HEIGHT;
            return (
              <rect
                key={`v-${bar.t}`}
                x={x(index) - bodyWidth / 2}
                y={VOLUME_HEIGHT - height}
                width={bodyWidth}
                height={Math.max(0.5, height)}
                className={bar.c >= bar.o ? 'fill-bullish/40' : 'fill-bearish/40'}
              />
            );
          })}
        </g>
      </svg>

      <div className="flex items-center justify-between gap-2">
        <ChartLegend>
          <ChartLegendItem swatch="var(--chart-1)">VWAP</ChartLegendItem>
          <ChartLegendItem swatch="var(--chart-3)">EMA 9</ChartLegendItem>
          <ChartLegendItem swatch="var(--chart-4)">EMA 20</ChartLegendItem>
          <ChartLegendItem tone="bearish">Invalidation</ChartLegendItem>
          <ChartLegendItem tone="bullish">Targets</ChartLegendItem>
        </ChartLegend>
        <span className="figure shrink-0 font-mono text-xs text-subtle-foreground">
          {data.minutes}m · {bars.length} bars ·{' '}
          {bars[0] === undefined ? '' : istTime(new Date(bars[0].t).toISOString())}–
          {istTime(new Date(bars[bars.length - 1]?.t ?? 0).toISOString())} IST
        </span>
      </div>

      <p className="text-xs text-subtle-foreground">
        Levels shown are technical reference prices derived from structure and ATR — the range this
        setup was measured against ({priceCompact(data.invalidation)} to{' '}
        {priceCompact(data.target2)}). They are not orders.
      </p>
    </div>
  );
}

function ReferenceLine({ y, className, dash }: { y: number; className: string; dash: string }) {
  return (
    <line
      x1={0}
      x2={WIDTH}
      y1={y}
      y2={y}
      className={cn(className)}
      strokeWidth={1}
      strokeDasharray={dash}
      vectorEffect="non-scaling-stroke"
    />
  );
}
