'use client';

import { formatPaise } from '@signal/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Card, EmptyState, SkeletonRows } from '@/components/ui/card';
import { level } from '@/lib/dashboard-format';

/**
 * Price chart.
 *
 * Inline SVG rather than a charting library: it keeps the bundle small, avoids
 * a third-party dependency in the render path, and there is nothing here a
 * library would do better at this scale. Reusable for any symbol.
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
  previousClose?: number | null;
  compact?: boolean;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();

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

    return {
      bars,
      closes,
      min,
      max,
      step,
      maxVolume,
      y,
      points: bars.map((b, i) => `${(i * step).toFixed(2)},${y(b.c).toFixed(2)}`).join(' '),
      area: `${bars.map((b, i) => `${(i * step).toFixed(2)},${y(b.c).toFixed(2)}`).join(' ')} ${WIDTH},${PRICE_HEIGHT} 0,${PRICE_HEIGHT}`,
    };
  }, [data, previousClose]);

  const rising =
    geometry === null
      ? true
      : (geometry.closes.at(-1) ?? 0) >= (previousClose ?? geometry.closes[0] ?? 0);

  const hoverBar = geometry !== null && hover !== null ? geometry.bars[hover] : undefined;

  return (
    <Card
      title={title ?? symbol}
      subtitle={data?.name}
      action={
        <fieldset className="flex flex-wrap gap-0.5 border-0 p-0">
          <legend className="sr-only">Chart timeframe</legend>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              aria-pressed={timeframe === tf}
              className={`rounded px-1.5 py-1 text-xs font-medium ${
                timeframe === tf
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tf}
            </button>
          ))}
        </fieldset>
      }
    >
      {loading ? (
        <SkeletonRows rows={compact ? 3 : 6} />
      ) : error !== null ? (
        <EmptyState title="Chart unavailable" detail={error} />
      ) : geometry === null ? (
        <EmptyState title="Not enough data" detail="Fyers returned too few candles to plot." />
      ) : (
        <div>
          <div className="flex h-6 items-center justify-between text-xs">
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
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
              <span className="flex gap-3 font-mono tabular-nums">
                <span>O {level(hoverBar.o)}</span>
                <span>H {level(hoverBar.h)}</span>
                <span>L {level(hoverBar.l)}</span>
                <span className="font-semibold">C {level(hoverBar.c)}</span>
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
              <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={rising ? 'rgb(16 185 129)' : 'rgb(244 63 94)'}
                  stopOpacity="0.18"
                />
                <stop
                  offset="100%"
                  stopColor={rising ? 'rgb(16 185 129)' : 'rgb(244 63 94)'}
                  stopOpacity="0"
                />
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
                className="stroke-slate-400 dark:stroke-slate-500"
              />
            )}

            <polygon points={geometry.area} fill={`url(#${clipId})`} />
            <polyline
              points={geometry.points}
              fill="none"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              className={rising ? 'stroke-emerald-500' : 'stroke-rose-500'}
              strokeLinejoin="round"
            />

            {geometry.bars.map((bar, i) => (
              <rect
                key={bar.t}
                x={i * geometry.step}
                width={Math.max(0.5, geometry.step * 0.7)}
                y={PRICE_HEIGHT + 8 + VOLUME_HEIGHT - (bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                height={(bar.v / geometry.maxVolume) * VOLUME_HEIGHT}
                className="fill-slate-300 dark:fill-slate-700"
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
                className="stroke-slate-400 dark:stroke-slate-500"
              />
            )}
          </svg>

          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>{formatPaise(geometry.min, { withSymbol: false })}</span>
            <span>{formatPaise(geometry.max, { withSymbol: false })}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
