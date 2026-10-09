'use client';

import { treemapLayout } from '@equitywise/core';
import { formatPaise } from '@equitywise/shared';
import * as React from 'react';
import { SkeletonChart } from '@/components/data-display/loading';
import { TONE_GLYPH, toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Small, dependency-free charts for the portfolio analysis page. Every chart
 * prints its numbers beside the colour (a legend, a label, a value column), so
 * colour is never the only way to read it.
 */

const PALETTE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

/** Colour for the n-th group. After five, the hues repeat at a lighter strength. */
export function groupColour(index: number): { fill: string; solid: string } {
  const token = PALETTE[index % PALETTE.length] ?? '--chart-1';
  return {
    fill:
      index < PALETTE.length
        ? `color-mix(in srgb, var(${token}) var(--chart-fill), var(--surface))`
        : `color-mix(in srgb, var(${token}) calc(var(--chart-fill) * 0.6), var(--surface))`,
    // Repeated hues are drawn lighter so a sixth group never matches the first.
    solid:
      index < PALETTE.length
        ? `var(${token})`
        : `color-mix(in srgb, var(${token}) 50%, var(--surface))`,
  };
}

export interface TreemapItem {
  readonly key: string;
  readonly value: number;
  readonly label: string;
  readonly caption: string;
  readonly colourIndex: number;
  readonly title: string;
}

export function Treemap({
  items,
  height = 300,
  ariaLabel,
}: {
  items: readonly TreemapItem[];
  height?: number;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Null until measured: drawing at a guessed width would flash a scaled-down chart.
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const first = Math.round(el.getBoundingClientRect().width);
    if (first > 0) setWidth(Math.max(first, 200));
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(Math.round(entry.contentRect.width), 200));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const h = width !== null && width < 500 ? Math.min(height, 260) : height;
  if (width === null)
    return (
      <div ref={ref} className="w-full" style={{ height }}>
        <SkeletonChart className="h-full border-0 p-0 shadow-none" />
      </div>
    );
  // One group (say, every stock unclassified) would paint every tile alike: tell them apart instead.
  const oneGroup = new Set(items.map((i) => i.colourIndex)).size === 1 && items.length > 1;
  const cells = treemapLayout(items, width, h);
  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={ariaLabel}
        width="100%"
        height={h}
        viewBox={`0 0 ${width} ${h}`}
        className="block"
      >
        {cells.map((cell) => {
          const colour = groupColour(
            oneGroup ? cells.findIndex((c) => c.item.key === cell.item.key) : cell.item.colourIndex,
          );
          const showName = cell.w > cell.item.label.length * 7.2 + 14 && cell.h > 26;
          const showCaption = cell.w > cell.item.caption.length * 6.3 + 16 && cell.h > 48;
          return (
            <g key={cell.item.key}>
              <title>{cell.item.title}</title>
              <rect
                x={cell.x + 1.5}
                y={cell.y + 1.5}
                width={Math.max(cell.w - 3, 0)}
                height={Math.max(cell.h - 3, 0)}
                rx={5}
                style={{ fill: colour.fill, stroke: colour.solid, strokeWidth: 1.25 }}
              />
              {showName && (
                <text
                  x={cell.x + 9}
                  y={cell.y + 20}
                  className="text-[12px] font-semibold"
                  style={{ fill: 'var(--chart-fill-ink)' }}
                >
                  {cell.item.label}
                </text>
              )}
              {showCaption && (
                <text
                  x={cell.x + 9}
                  y={cell.y + 36}
                  className="text-[11px] tabular-nums"
                  style={{ fill: 'var(--chart-fill-ink)' }}
                >
                  {cell.item.caption}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface DonutPart {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly valuePaise: number;
  readonly colourIndex: number;
}

export function DonutWithLegend({
  parts,
  centre,
  caption,
  ariaLabel,
}: {
  parts: readonly DonutPart[];
  centre: string;
  caption: string;
  ariaLabel: string;
}) {
  const size = 160;
  const thick = 26;
  const r = (size - thick) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-36 sm:w-40"
      >
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={thick}
          style={{ stroke: 'var(--surface-sunken)' }}
        />
        {parts.map((part) => {
          const length = part.weight * circumference;
          const gap = parts.length > 1 ? 1.5 : 0;
          const dash = Math.max(length - gap, 0.1);
          const el = (
            <circle
              key={part.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              strokeWidth={thick}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
              style={{ stroke: groupColour(part.colourIndex).solid }}
            />
          );
          offset += length;
          return el;
        })}
        <text
          x={c}
          y={c - 2}
          textAnchor="middle"
          className="fill-foreground text-[13px] font-semibold"
        >
          {centre}
        </text>
        <text x={c} y={c + 15} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {caption}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-col gap-1 text-sm">
        {parts.map((part) => (
          <li
            key={part.key}
            className="flex items-center gap-2"
            title={`${part.label}: ${formatPaise(part.valuePaise, { decimals: 0 })}`}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: groupColour(part.colourIndex).solid }}
            />
            <span className="min-w-0 flex-1 truncate">{part.label}</span>
            <span className="w-14 text-right font-medium tabular-nums">
              {(part.weight * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars from a centre line: gains to the right, losses to the left. */
export function GainBars({
  rows,
}: {
  rows: readonly { key: string; label: string; gainPaise: number }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.gainPaise)), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const tone = toneOf(row.gainPaise);
        const width = (Math.abs(row.gainPaise) / max) * 48;
        const positive = row.gainPaise >= 0;
        return (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm"
          >
            <span className="truncate">{row.label}</span>
            <span className="relative h-3.5 rounded-sm bg-surface-sunken" aria-hidden>
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
              <span
                className={cn(
                  'absolute inset-y-0.5 rounded-sm',
                  positive ? 'bg-positive' : 'bg-negative',
                )}
                style={
                  positive
                    ? { left: '50%', width: `${width}%` }
                    : { left: `${50 - width}%`, width: `${width}%` }
                }
              />
            </span>
            <span className={cn('min-w-24 text-right tabular-nums', toneText({ tone }))}>
              <span aria-hidden className="mr-1 text-[0.75em]">
                {TONE_GLYPH[tone]}
              </span>
              {formatPaise(row.gainPaise, { decimals: 0, signDisplay: 'exceptZero' })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled share bar: label, a filled track, the percentage. */
export function ShareBar({
  label,
  detail,
  share,
}: {
  label: string;
  detail?: string;
  share: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
      <span className="truncate">
        {label}
        {detail !== undefined && (
          <span className="ml-1 text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(share, 1) * 100}%`, background: 'var(--chart-1)' }}
        />
      </span>
      <span className="text-right font-medium tabular-nums">{(share * 100).toFixed(1)}%</span>
    </div>
  );
}
