'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
  /**
   * The fixed trading-session window the bars are drawn against, epoch ms.
   * Present on the 1D timeframe only: the x-axis then spans 09:15-15:30 IST
   * whatever bars exist, so a live session reads as partly filled instead of
   * the bars that have formed so far being stretched across the full width.
   */
  readonly session?: { readonly open: number; readonly close: number };
  readonly bars: ChartBar[];
}

const WIDTH = 720;
const PRICE_HEIGHT = 220;
const VOLUME_HEIGHT = 48;

/** Height of the session time axis band under the volume columns. */
const AXIS_HEIGHT = 12;
const MS_PER_MINUTE = 60_000;
/** The session opens at 09:15 IST and closes at 15:30 IST, in minutes of the day. */
const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;
/**
 * Minor tick spacings, finest first: one tick per minute when the chart is
 * wide enough for 375 of them to stay distinct, otherwise one per 5 minutes.
 */
const MINOR_TICK_INTERVALS = [1, 5] as const;
/** Room between minor ticks below which they blur into a solid bar. */
const MINOR_TICK_PX = 4;
/**
 * Label spacings the axis can pick from, finest first. The finest whose
 * labels all fit the rendered width wins, so a wide chart reads to the
 * quarter-hour and a narrow one to the hour.
 */
const LABEL_INTERVALS = [5, 15, 30, 60] as const;
/** Room one `HH:MM` label needs — its glyphs plus a gap to its neighbour. */
const LABEL_PX = 44;

interface SessionAxis {
  /** x of every minor tick, 09:15 through 15:30. */
  readonly minor: readonly number[];
  /** The labelled round times, strictly inside the session so no label is clipped at an edge. */
  readonly major: readonly { x: number; label: string }[];
}

/**
 * The session time axis: a minute ruler with labels on round times.
 *
 * The bars are one minute apart, and the ruler shows that granularity as far
 * as the rendered width allows — a tick per minute on a wide chart, per five
 * minutes on a typical one — since 375 labels could never fit. Labels go on
 * the round times (09:30, 10:00, ...) at the finest spacing the width has
 * room for. Tick positions are minutes after the 09:15 open, so no timezone
 * arithmetic is needed on the client.
 */
function sessionAxis(session: { open: number; close: number }, widthPx: number): SessionAxis {
  const span = session.close - session.open;
  const x = (minuteOfDay: number): number =>
    (((minuteOfDay - OPEN_MINUTE) * MS_PER_MINUTE) / span) * WIDTH;

  const sessionMinutes = CLOSE_MINUTE - OPEN_MINUTE;
  const minorInterval =
    MINOR_TICK_INTERVALS.find(
      (candidate) => widthPx / (sessionMinutes / candidate) >= MINOR_TICK_PX,
    ) ?? 5;
  const minor: number[] = [];
  for (let m = OPEN_MINUTE; m <= CLOSE_MINUTE; m += minorInterval) minor.push(x(m));

  const roundTimes = (interval: number): number[] => {
    const out: number[] = [];
    for (
      let m = Math.ceil((OPEN_MINUTE + 1) / interval) * interval;
      m < CLOSE_MINUTE;
      m += interval
    )
      out.push(m);
    return out;
  };
  // Falls back to the coarsest spacing when even that does not fit.
  const interval =
    LABEL_INTERVALS.find((candidate) => roundTimes(candidate).length * LABEL_PX <= widthPx) ?? 60;

  const major = roundTimes(interval).map((m) => ({
    x: x(m),
    label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  }));

  return { minor, major };
}

/**
 * The spacing between consecutive bars in ms — the width one bar's volume
 * column occupies on a time axis. The smallest gap rather than the first, so
 * a gap left by a missing bar does not widen every column.
 */
function barIntervalMs(bars: readonly ChartBar[]): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < bars.length; i++) {
    const gap = (bars[i]?.t ?? 0) - (bars[i - 1]?.t ?? 0);
    if (gap > 0 && gap < smallest) smallest = gap;
  }
  return Number.isFinite(smallest) ? smallest : 5 * MS_PER_MINUTE;
}

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

  // The rendered width of the plot, for the session axis to pick how many
  // labels fit. Measured through a callback ref because the plot mounts only
  // once data has arrived, after the first render.
  const [plotWidth, setPlotWidth] = useState(WIDTH);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const measurePlot = useCallback((element: HTMLDivElement | null) => {
    resizeObserver.current?.disconnect();
    resizeObserver.current = null;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) setPlotWidth(width);
    });
    observer.observe(element);
    resizeObserver.current = observer;
  }, []);
  useEffect(() => () => resizeObserver.current?.disconnect(), []);

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
    const maxVolume = Math.max(1, ...bars.map((b) => b.v));

    // Two x-axes. With a session window the axis is TIME — a bar sits where
    // its open falls between 09:15 and 15:30, and the plot past the latest bar
    // stays empty until the session gets there. Without one the axis is the
    // bar INDEX, spread evenly across the width, since those timeframes are
    // always complete and their gaps (nights, weekends) carry no information.
    const session = data?.session;
    const xs =
      session === undefined
        ? bars.map((_, i) => (i * WIDTH) / (bars.length - 1))
        : bars.map((b) => {
            const ratio = (b.t - session.open) / (session.close - session.open);
            return Math.max(0, Math.min(WIDTH, ratio * WIDTH));
          });
    const x = (index: number): number => xs[index] ?? 0;
    // A volume column's width: one bar's slot on the time axis, or the gap
    // between neighbours on the index axis.
    const slot =
      session === undefined
        ? WIDTH / (bars.length - 1)
        : (barIntervalMs(bars) / (session.close - session.open)) * WIDTH;

    const y = (price: number): number => PRICE_HEIGHT - ((price - min) / span) * PRICE_HEIGHT;

    const points = bars.map((b, i) => `${x(i).toFixed(2)},${y(b.c).toFixed(2)}`).join(' ');
    const first = x(0).toFixed(2);
    const last = x(bars.length - 1).toFixed(2);

    return {
      bars,
      closes,
      min,
      max,
      slot,
      maxVolume,
      x,
      y,
      points,
      // The area closes under the drawn line, not the full width, so on a time
      // axis nothing is shaded where no bar has formed yet.
      area: `${points} ${last},${PRICE_HEIGHT} ${first},${PRICE_HEIGHT}`,
    };
  }, [data, previousClose]);

  const axis = useMemo(
    () => (data?.session === undefined ? null : sessionAxis(data.session, plotWidth)),
    [data, plotWidth],
  );
  /** Bottom of the volume columns; the time axis band sits under it. */
  const plotBottom = PRICE_HEIGHT + 8 + VOLUME_HEIGHT;
  const svgHeight = plotBottom + (axis === null ? 0 : AXIS_HEIGHT);

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

  /**
   * Moves the cursor to the bar nearest a horizontal position along the width.
   * The pointer can run past either edge, and on a time axis into the empty
   * part of the session; both snap to the closest bar.
   */
  const moveCursor = (px: number): void => {
    if (geometry === null) return;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < geometry.bars.length; i++) {
      const d = Math.abs(geometry.x(i) - px);
      if (d < distance) {
        distance = d;
        nearest = i;
      }
    }
    setHover(nearest);
  };

  /** The cursor's position as a fraction of the width, for the tooltip. */
  const hoverRatio = geometry !== null && hover !== null ? geometry.x(hover) / WIDTH : 0;

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

          <div className="relative" ref={measurePlot}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${svgHeight}`}
              className="mt-1 w-full touch-none"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${symbol} price chart, ${timeframe}`}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                moveCursor(ratio * WIDTH);
              }}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`var(--${tone})`} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={`var(--${tone})`} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Session time axis: gridlines at the labelled times behind
                  everything else, and a ruler under the plot — a short tick
                  every 5 minutes, a taller one at each labelled time. */}
              {axis !== null && (
                <>
                  {axis.major.map((tick) => (
                    <line
                      key={tick.label}
                      x1={tick.x}
                      x2={tick.x}
                      y1="0"
                      y2={plotBottom}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--chart-grid)"
                    />
                  ))}
                  <line
                    x1="0"
                    x2={WIDTH}
                    y1={plotBottom}
                    y2={plotBottom}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    stroke="var(--chart-axis)"
                  />
                  {axis.minor.map((x) => (
                    <line
                      key={x}
                      x1={x}
                      x2={x}
                      y1={plotBottom}
                      y2={plotBottom + AXIS_HEIGHT / 3}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--chart-axis)"
                    />
                  ))}
                  {axis.major.map((tick) => (
                    <line
                      key={tick.label}
                      x1={tick.x}
                      x2={tick.x}
                      y1={plotBottom}
                      y2={plotBottom + AXIS_HEIGHT}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      stroke="var(--chart-axis)"
                    />
                  ))}
                </>
              )}

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
                  x={geometry.x(i)}
                  width={Math.max(0.5, geometry.slot * 0.7)}
                  y={plotBottom - (bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                  height={(bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                  className={i === hover ? fillClass : undefined}
                  fill={i === hover ? undefined : 'var(--chart-grid)'}
                />
              ))}

              {hover !== null && hoverBar !== undefined && (
                <>
                  <line
                    x1={geometry.x(hover)}
                    x2={geometry.x(hover)}
                    y1="0"
                    y2={plotBottom}
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
                    x1={geometry.x(hover)}
                    x2={geometry.x(hover)}
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
                  left: `${hoverRatio * 100}%`,
                  transform: `translateX(-${hoverRatio * 100}%)`,
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

          {/* Session time labels. HTML rather than SVG text: the SVG is
              stretched non-uniformly to fill its box, which would distort
              glyphs. Each label is centred on its tick. */}
          {axis !== null && (
            <div className="relative h-4 text-subtle-foreground text-xs">
              {axis.major.map((tick) => (
                <span
                  key={tick.label}
                  className="figure absolute top-0 -translate-x-1/2"
                  style={{ left: `${(tick.x / WIDTH) * 100}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          )}

          <ChartLegend className="mt-1 justify-between">
            <IndexLevel paise={geometry.min} size="xs" className="text-subtle-foreground" />
            <IndexLevel paise={geometry.max} size="xs" className="text-subtle-foreground" />
          </ChartLegend>
        </div>
      )}
    </ChartContainer>
  );
}
