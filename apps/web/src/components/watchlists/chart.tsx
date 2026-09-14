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
import { API_ROUTES } from '@/lib/api-routes';
import { indexLevel, signedPercent, signedPrice } from '@/lib/format';
import { toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

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
  /** Provider-normalised resolution, e.g. `5m` or `1d`. Decides the tooltip's date format. */
  readonly resolution?: string;
  readonly bars: ChartBar[];
}

const WIDTH = 720;
const PRICE_HEIGHT = 220;
const VOLUME_HEIGHT = 48;

/**
 * The tooltip's date, e.g. "Fri 11 Sept 12:00" — or "Fri 11 Sept 2026" for a
 * daily candle, which has no meaningful clock time; printing 00:00 against it
 * would be a fabricated precision.
 */
function barLabel(timestamp: number, resolution: string | undefined): string {
  const daily = resolution === '1d';
  // Parts joined by spaces rather than the locale's own punctuation, so the
  // label reads "Fri 11 Sept 12:00" instead of "Fri, 11 Sept, 12:00".
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(daily ? { year: 'numeric' } : { hour: '2-digit', minute: '2-digit', hour12: false }),
  })
    .formatToParts(new Date(timestamp))
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ')
    .replace(/(\d{2}) (\d{2})$/, '$1:$2');
}

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
    // A stale index would read out of the previous series, so the cursor is
    // dropped whenever the symbol or timeframe changes.
    setHover(null);

    void (async () => {
      try {
        const response = await fetch(API_ROUTES.history(symbol, { tf: timeframe }), {
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

  const fillClass = {
    bullish: 'fill-bullish',
    bearish: 'fill-bearish',
    neutral: 'fill-neutral',
  }[tone];

  const hoverBar = geometry !== null && hover !== null ? geometry.bars[hover] : undefined;

  /**
   * The candle the legend describes: the hovered one, else the latest — so
   * the line above the plot always reads a real candle.
   */
  const legendIndex = geometry === null ? null : (hover ?? geometry.bars.length - 1);
  const legendBar =
    geometry !== null && legendIndex !== null ? geometry.bars[legendIndex] : undefined;

  /**
   * The candle's move against the reference the rest of the row is quoted
   * against — the previous close when the caller supplied one, otherwise the
   * candle before it.
   */
  const legendChange = (() => {
    if (geometry === null || legendIndex === null || legendBar === undefined) return null;
    const base = previousClose ?? geometry.bars[legendIndex - 1]?.c ?? legendBar.o;
    if (base === 0) return null;
    return { absolute: legendBar.c - base, percent: ((legendBar.c - base) / base) * 100 };
  })();

  /** Clamps a raw index to the series; the pointer can run past either edge. */
  const moveCursor = (next: number): void => {
    if (geometry === null) return;
    setHover(Math.max(0, Math.min(geometry.bars.length - 1, next)));
  };

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
          {/* Data legend: the candle's open, high and low and its change,
              following the cursor. The close and the time are the tooltip
              pill's, and the stock's live price sits above the chart in the
              drawer, so neither is repeated here. */}
          {legendBar !== undefined && (
            <div className="flex min-h-6 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
              {(
                [
                  ['Open', indexLevel(legendBar.o)],
                  ['High', indexLevel(legendBar.h)],
                  ['Low', indexLevel(legendBar.l)],
                ] as const
              ).map(([label, value]) => (
                <span key={label} className="text-muted-foreground">
                  {label} <span className="figure text-foreground">{value}</span>
                </span>
              ))}
              {legendChange !== null && (
                <span
                  className={cn(
                    'figure font-medium',
                    toneText({ tone: toneOf(legendChange.absolute) }),
                  )}
                >
                  {signedPrice(legendChange.absolute)} ({signedPercent(legendChange.percent)})
                </span>
              )}
            </div>
          )}

          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${PRICE_HEIGHT + VOLUME_HEIGHT + 8}`}
              className="mt-1 w-full touch-none"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${symbol} price chart, ${timeframe}`}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                moveCursor(Math.round(ratio * (geometry.bars.length - 1)));
              }}
              onPointerLeave={() => setHover(null)}
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
                  y={
                    PRICE_HEIGHT + 8 + VOLUME_HEIGHT - (bar.v / geometry.maxVolume) * VOLUME_HEIGHT
                  }
                  height={(bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                  className={i === hover ? fillClass : undefined}
                  fill={i === hover ? undefined : 'var(--chart-grid)'}
                />
              ))}

              {hover !== null && hoverBar !== undefined && (
                <>
                  <line
                    x1={hover * geometry.step}
                    x2={hover * geometry.step}
                    y1="0"
                    y2={PRICE_HEIGHT + 8 + VOLUME_HEIGHT}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                    stroke="var(--chart-axis)"
                  />
                  {/* A zero-length round-capped stroke, not a <circle>:
                      `preserveAspectRatio="none"` stretches x against y, which
                      would render any radius as an ellipse. A non-scaling
                      stroke is measured in screen pixels, so this stays round
                      at every chart width. */}
                  <line
                    x1={hover * geometry.step}
                    x2={hover * geometry.step}
                    y1={geometry.y(hoverBar.c)}
                    y2={geometry.y(hoverBar.c)}
                    strokeLinecap="round"
                    strokeWidth={6}
                    vectorEffect="non-scaling-stroke"
                    className={strokeClass}
                  />
                </>
              )}
            </svg>

            {/* The tooltip: one pill above the plot at the cursor, showing the
                candle's close and its time — the Google Finance pattern. It
                slides by its own width in proportion to the cursor so it is
                centred mid-plot and flush at either edge, never clipped. */}
            {hoverBar !== undefined && hover !== null && (
              <div
                className="pointer-events-none absolute top-1 z-10 flex items-baseline gap-2 whitespace-nowrap rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm shadow-overlay"
                style={{
                  left: `${(hover / (geometry.bars.length - 1)) * 100}%`,
                  transform: `translateX(-${(hover / (geometry.bars.length - 1)) * 100}%)`,
                }}
              >
                <span className="figure font-semibold text-foreground">
                  {indexLevel(hoverBar.c)} INR
                </span>
                <span className="text-muted-foreground text-xs">
                  {barLabel(hoverBar.t, data?.resolution)}
                </span>
              </div>
            )}
          </div>

          <ChartLegend className="mt-1 justify-between">
            <IndexLevel paise={geometry.min} size="xs" className="text-subtle-foreground" />
            <IndexLevel paise={geometry.max} size="xs" className="text-subtle-foreground" />
          </ChartLegend>
        </div>
      )}
    </ChartContainer>
  );
}
