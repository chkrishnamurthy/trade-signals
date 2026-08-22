'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendItem,
  ChartToolbar,
} from '@/components/charts/chart-container';
import { ChartSkeleton, DataUnavailable, ErrorState } from '@/components/data-display/states';
import { IndexLevel } from '@/components/market/numeric';
import { indexLevel } from '@/lib/format';
import { toneOf } from '@/lib/tone';

/**
 * Price chart.
 *
 * Inline SVG rather than a charting library: it keeps the bundle small, avoids
 * a third-party dependency in the render path, and there is nothing here a
 * library would do better at this scale. Reusable for any symbol.
 *
 * Every colour is a design token read through `currentColor` or a `--chart-*`
 * / tone custom property, so the chart follows the theme like the rest of the
 * application. It previously hardcoded `rgb(16 185 129)`.
 */

export const TIMEFRAMES = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

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
  readonly name: string;
  readonly bars: ChartBar[];
}

const WIDTH = 720;
const PRICE_HEIGHT = 220;
const VOLUME_HEIGHT = 48;

export function MarketChart({
  symbol,
  title,
  previousClose = null,
  compact = false,
}: {
  symbol: string;
  title?: string | undefined;
  previousClose?: number | null | undefined;
  compact?: boolean | undefined;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/history/${encodeURIComponent(symbol)}?tf=${timeframe}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError((payload as { error?: string }).error ?? 'Could not load chart data');
          setData(null);
          return;
        }
        setData(payload as ChartResponse);
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load chart data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, timeframe]);

  const geometry = useMemo(() => {
    const bars = data?.bars ?? [];
    if (bars.length < 2) return null;

    const closes = bars.map((b) => b.c);
    const lows = bars.map((b) => b.l);
    const highs = bars.map((b) => b.h);
    // Include the previous close so the reference line is never off-canvas.
    const min = Math.min(...lows, previousClose ?? Number.POSITIVE_INFINITY);
    const max = Math.max(...highs, previousClose ?? Number.NEGATIVE_INFINITY);
    const span = max - min || 1;
    const step = WIDTH / (bars.length - 1);
    const maxVolume = Math.max(1, ...bars.map((b) => b.v));

    const y = (price: number): number => PRICE_HEIGHT - ((price - min) / span) * PRICE_HEIGHT;

    const points = bars.map((b, i) => `${(i * step).toFixed(2)},${y(b.c).toFixed(2)}`).join(' ');

    return {
      bars,
      closes,
      min,
      max,
      step,
      maxVolume,
      y,
      points,
      area: `${points} ${WIDTH},${PRICE_HEIGHT} 0,${PRICE_HEIGHT}`,
    };
  }, [data, previousClose]);

  // Toned against the previous close, which is the reference a trader reads the
  // session against — not against the first candle drawn.
  const tone =
    geometry === null
      ? 'neutral'
      : toneOf((geometry.closes.at(-1) ?? 0) - (previousClose ?? geometry.closes[0] ?? 0));

  const strokeClass = {
    bullish: 'stroke-bullish',
    bearish: 'stroke-bearish',
    neutral: 'stroke-neutral',
  }[tone];

  const hoverBar = geometry !== null && hover !== null ? geometry.bars[hover] : undefined;

  return (
    <ChartContainer
      title={title ?? symbol}
      subtitle={data?.name}
      toolbar={
        <ChartToolbar
          options={TIMEFRAMES}
          value={timeframe}
          onChange={setTimeframe}
          label="Chart timeframe"
        />
      }
      legend={
        geometry === null ? undefined : (
          <>
            <ChartLegendItem tone={tone}>Close</ChartLegendItem>
            <ChartLegendItem swatch="var(--chart-axis)">Volume</ChartLegendItem>
            {previousClose !== null && (
              <ChartLegendItem swatch="var(--chart-axis)">
                Previous close {indexLevel(previousClose)}
              </ChartLegendItem>
            )}
          </>
        )
      }
    >
      {loading ? (
        <ChartSkeleton className={compact ? 'h-40' : 'h-64'} />
      ) : error !== null ? (
        <ErrorState title="Chart unavailable" detail={error} />
      ) : geometry === null ? (
        <DataUnavailable
          what="Price history"
          reason="The data source returned too few candles to plot."
        />
      ) : (
        <div>
          {/* Hover readout. Reserves its height so the chart never shifts. */}
          <div className="flex h-6 items-center justify-between gap-3 text-xs">
            <span className="figure font-mono text-muted-foreground">
              {hoverBar === undefined
                ? `${geometry.bars.length} candles`
                : new Date(hoverBar.t).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
            </span>
            {hoverBar !== undefined && (
              <span className="figure flex gap-3 font-mono">
                <span className="text-muted-foreground">
                  O <span className="text-foreground">{indexLevel(hoverBar.o)}</span>
                </span>
                <span className="text-muted-foreground">
                  H <span className="text-foreground">{indexLevel(hoverBar.h)}</span>
                </span>
                <span className="text-muted-foreground">
                  L <span className="text-foreground">{indexLevel(hoverBar.l)}</span>
                </span>
                <span className="text-muted-foreground">
                  C <span className="font-semibold text-foreground">{indexLevel(hoverBar.c)}</span>
                </span>
              </span>
            )}
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${PRICE_HEIGHT + VOLUME_HEIGHT + 8}`}
            className="mt-1 w-full touch-none"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${symbol} price chart, ${timeframe}`}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              setHover(
                Math.max(
                  0,
                  Math.min(
                    geometry.bars.length - 1,
                    Math.round(ratio * (geometry.bars.length - 1)),
                  ),
                ),
              );
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--${tone})`} stopOpacity="0.18" />
                <stop offset="100%" stopColor={`var(--${tone})`} stopOpacity="0" />
              </linearGradient>
            </defs>

            {previousClose !== null && (
              <line
                x1="0"
                x2={WIDTH}
                y1={geometry.y(previousClose)}
                y2={geometry.y(previousClose)}
                strokeDasharray="4 4"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                stroke="var(--chart-axis)"
              />
            )}

            <polygon points={geometry.area} fill={`url(#${gradientId})`} />
            <polyline
              points={geometry.points}
              fill="none"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className={strokeClass}
              strokeLinejoin="round"
            />

            {geometry.bars.map((bar, i) => (
              <rect
                key={bar.t}
                x={i * geometry.step}
                width={Math.max(0.5, geometry.step * 0.7)}
                y={PRICE_HEIGHT + 8 + VOLUME_HEIGHT - (bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                height={(bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                fill="var(--chart-grid)"
              />
            ))}

            {hover !== null && (
              <line
                x1={hover * geometry.step}
                x2={hover * geometry.step}
                y1="0"
                y2={PRICE_HEIGHT}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                stroke="var(--chart-axis)"
              />
            )}
          </svg>

          <ChartLegend className="mt-1 justify-between">
            <IndexLevel paise={geometry.min} size="xs" className="text-subtle-foreground" />
            <IndexLevel paise={geometry.max} size="xs" className="text-subtle-foreground" />
          </ChartLegend>
        </div>
      )}
    </ChartContainer>
  );
}
