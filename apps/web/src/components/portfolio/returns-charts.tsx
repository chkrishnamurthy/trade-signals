'use client';

import { formatPaise } from '@equitywise/shared';
import * as React from 'react';
import { largeCurrency } from '@/lib/format';
import type { ValuePointDto } from '@/lib/portfolio-types';

/** Width of an element, measured; null until the first measurement. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const first = Math.round(el.getBoundingClientRect().width);
    if (first > 0) setWidth(first);
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

export type Range = '1Y' | '3Y' | 'All';

export function filterRange(
  points: readonly ValuePointDto[],
  range: Range,
  today: string,
): ValuePointDto[] {
  if (range === 'All') return [...points];
  const years = range === '1Y' ? 1 : 3;
  const from = `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
  return points.filter((p) => p.date >= from);
}

/** "Nice" round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (hi <= lo) return [lo];
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Value of what you held against the money you put in, day by day (weekly
 * beyond a year). Stretches where a stock had no recent price are shaded and
 * labelled "partial".
 */
export function ValueChart({
  points,
  height = 260,
}: {
  points: readonly ValuePointDto[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (points.length < 2) {
    return (
      <div ref={ref} className="text-sm text-muted-foreground">
        Not enough history to draw yet.
      </div>
    );
  }
  if (width === null)
    return (
      <div
        ref={ref}
        className="w-full animate-pulse rounded-md bg-surface-sunken"
        style={{ height }}
      />
    );

  const left = 64;
  const right = 12;
  const top = 10;
  const bottom = 26;
  const values = points.flatMap((p) => [p.valuePaise, p.netInvestedPaise]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.06 || hi * 0.05 || 1;
  const yLo = Math.max(lo - pad, 0);
  const yHi = hi + pad;
  const n = points.length;
  // Positioned by date, not by index: weekly points before the last year are
  // spaced like the time they cover.
  const t = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = t[0] ?? 0;
  const span = Math.max((t[n - 1] ?? t0) - t0, 1);
  const xAt = (time: number) => left + ((time - t0) / span) * (width - left - right);
  const x = (i: number) => xAt(t[i] ?? t0);
  const y = (v: number) => top + (1 - (v - yLo) / (yHi - yLo)) * (height - top - bottom);
  const path = (key: 'valuePaise' | 'netInvestedPaise') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(' ');

  const xTickCount = Math.max(2, Math.min(6, Math.floor(width / 120)));
  // Ticks at evenly spaced dates across the span.
  const xTicks = Array.from({ length: xTickCount }, (_, k) => t0 + (k / (xTickCount - 1)) * span);
  const partialRuns: [number, number][] = [];
  points.forEach((p, i) => {
    if (!p.partial) return;
    const last = partialRuns.at(-1);
    if (last !== undefined && last[1] === i - 1) last[1] = i;
    else partialRuns.push([i, i]);
  });
  const first = points[0];
  const last = points[n - 1];

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={
          first && last
            ? `Value went from ${formatPaise(first.valuePaise, { decimals: 0 })} on ${first.date} to ${formatPaise(last.valuePaise, { decimals: 0 })} on ${last.date}; net money put in is ${formatPaise(last.netInvestedPaise, { decimals: 0 })}.`
            : 'Value over time'
        }
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        {partialRuns.map(([a, b]) => (
          <rect
            key={`p${a}`}
            x={x(a) - 2}
            y={top}
            width={Math.max(x(b) - x(a) + 4, 4)}
            height={height - top - bottom}
            style={{ fill: 'var(--surface-sunken)' }}
          />
        ))}
        {niceTicks(yLo, yHi).map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={width - right}
              y1={y(v)}
              y2={y(v)}
              style={{ stroke: 'var(--chart-grid)' }}
            />
            <text
              x={left - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {largeCurrency(v)}
            </text>
          </g>
        ))}
        {xTicks.map((time, k) => (
          <text
            key={time}
            x={xAt(time)}
            y={height - 8}
            textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground text-[11px]"
          >
            {monthLabel(new Date(time).toISOString().slice(0, 10))}
          </text>
        ))}
        <path
          d={path('netInvestedPaise')}
          fill="none"
          strokeWidth={1.75}
          strokeDasharray="5 4"
          style={{ stroke: 'var(--chart-axis)' }}
        />
        <path
          d={path('valuePaise')}
          fill="none"
          strokeWidth={2.25}
          strokeLinejoin="round"
          style={{ stroke: 'var(--chart-1)' }}
        />
        {last && (
          <circle
            cx={x(n - 1)}
            cy={y(last.valuePaise)}
            r={3.5}
            style={{ fill: 'var(--chart-1)' }}
          />
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line
              x1="0"
              x2="22"
              y1="3"
              y2="3"
              strokeWidth="2.5"
              style={{ stroke: 'var(--chart-1)' }}
            />
          </svg>
          Your value
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line
              x1="0"
              x2="22"
              y1="3"
              y2="3"
              strokeWidth="2"
              strokeDasharray="5 4"
              style={{ stroke: 'var(--chart-axis)' }}
            />
          </svg>
          Net money put in
        </span>
        {partialRuns.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-4 rounded-sm bg-surface-sunken ring-1 ring-border"
            />
            Partial: a stock had no recent price
          </span>
        )}
      </div>
    </div>
  );
}

/** Dividends by quarter as labelled columns; the most recent twelve quarters. */
export function QuarterBars({
  quarters,
}: {
  quarters: readonly { label: string; amountPaise: number }[];
}) {
  const shown = quarters.slice(-12);
  const max = Math.max(...shown.map((q) => q.amountPaise), 1);
  if (shown.length === 0) return null;
  return (
    <ul
      className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1"
      aria-label="Dividends received by quarter"
    >
      {shown.map((q) => (
        <li key={q.label} className="flex min-w-10 flex-1 flex-col items-center gap-1 text-[11px]">
          <span className="tabular-nums">{largeCurrency(q.amountPaise)}</span>
          <span
            aria-hidden
            className="w-full rounded-t-sm"
            style={{
              height: `${Math.max((q.amountPaise / max) * 96, 2)}px`,
              background: 'var(--chart-2)',
            }}
          />
          <span className="whitespace-nowrap text-muted-foreground">
            {q.label.replace(/^\d{2}/, "'")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface LineSeries {
  readonly key: string;
  readonly label: string;
  readonly colour: string;
  readonly dash?: string;
  readonly values: readonly (number | null)[];
}

/**
 * Several lines over the same dates (date-scaled x), with a legend that names
 * each line by its pattern as well as its colour. Used for growth of 100.
 */
export function LinesChart({
  dates,
  series,
  format,
  ariaLabel,
  height = 240,
}: {
  dates: readonly string[];
  series: readonly LineSeries[];
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (dates.length < 2) {
    return (
      <div ref={ref} className="text-sm text-muted-foreground">
        Not enough history to draw yet.
      </div>
    );
  }
  if (width === null)
    return (
      <div
        ref={ref}
        className="w-full animate-pulse rounded-md bg-surface-sunken"
        style={{ height }}
      />
    );
  const left = 48;
  const right = 12;
  const top = 10;
  const bottom = 26;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const yLo = lo - pad;
  const yHi = hi + pad;
  const t = dates.map((d) => Date.parse(`${d}T00:00:00Z`));
  const t0 = t[0] ?? 0;
  const span = Math.max((t.at(-1) ?? t0) - t0, 1);
  const xAt = (time: number) => left + ((time - t0) / span) * (width - left - right);
  const y = (v: number) => top + (1 - (v - yLo) / (yHi - yLo)) * (height - top - bottom);
  const path = (values: readonly (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${xAt(t[i] ?? t0).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const xTickCount = Math.max(2, Math.min(6, Math.floor(width / 120)));
  const xTicks = Array.from({ length: xTickCount }, (_, k) => t0 + (k / (xTickCount - 1)) * span);
  const step = (yHi - yLo) / 4;
  const yTicks = [0, 1, 2, 3, 4].map((k) => yLo + step * k);
  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={ariaLabel}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={width - right}
              y1={y(v)}
              y2={y(v)}
              style={{ stroke: 'var(--chart-grid)' }}
            />
            <text
              x={left - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((time, k) => (
          <text
            key={time}
            x={xAt(time)}
            y={height - 8}
            textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground text-[11px]"
          >
            {monthLabel(new Date(time).toISOString().slice(0, 10))}
          </text>
        ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.values)}
            fill="none"
            strokeWidth={s.dash === undefined ? 2.25 : 1.75}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            style={{ stroke: s.colour }}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line
                x1="0"
                x2="22"
                y1="3"
                y2="3"
                strokeWidth="2.25"
                strokeDasharray={s.dash}
                style={{ stroke: s.colour }}
              />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
