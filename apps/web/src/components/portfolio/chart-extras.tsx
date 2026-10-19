'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * What a drawn chart needs so its numbers can be read, not guessed: the values
 * under the pointer (mouse, pen or a finger), and the same figures as a table.
 * Shared by the value, growth and "below the last high" charts.
 */

/** The index of the point nearest an x position; `xs` is ascending. */
export function nearestIndex(xs: readonly number[], px: number): number {
  if (xs.length === 0) return 0;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] ?? 0) < px) lo = mid + 1;
    else hi = mid;
  }
  const after = xs[lo] ?? 0;
  const before = xs[lo - 1];
  return before !== undefined && px - before < after - px ? lo - 1 : lo;
}

/** Hover state for an SVG chart whose points sit at `xs` (in the SVG's own units). */
export function useChartHover(xs: readonly number[]) {
  const [index, setIndex] = React.useState<number | null>(null);
  const move = React.useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      // The viewBox is as wide as the element, but scale anyway so a zoomed page stays right.
      const scale = svg.viewBox.baseVal.width / rect.width;
      setIndex(nearestIndex(xs, (e.clientX - rect.left) * scale));
    },
    [xs],
  );
  const clear = React.useCallback(() => setIndex(null), []);
  return {
    index: index !== null && index < xs.length ? index : null,
    bind: {
      onPointerMove: move,
      onPointerDown: move,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}

export interface TipLine {
  readonly label: string;
  readonly value: string;
  /** A CSS colour for the swatch; omitted for a plain line. */
  readonly colour?: string;
  readonly dash?: string;
}

/** The values at the hovered point, beside the vertical marker; flips so it stays inside. */
export function HoverTip({
  x,
  width,
  title,
  lines,
  note,
}: {
  x: number;
  width: number;
  title: string;
  lines: readonly TipLine[];
  note?: string;
}) {
  const flip = x > width * 0.55;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-subtle"
      style={flip ? { right: Math.max(width - x + 12, 4) } : { left: x + 12 }}
    >
      <div className="font-medium">{title}</div>
      <dl className="mt-1 flex flex-col gap-0.5 tabular-nums">
        {lines.map((l) => (
          <div key={l.label} className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
              {l.colour !== undefined && (
                <svg width="14" height="6" aria-hidden>
                  <line
                    x1="0"
                    x2="14"
                    y1="3"
                    y2="3"
                    strokeWidth="2.5"
                    strokeDasharray={l.dash}
                    style={{ stroke: l.colour }}
                  />
                </svg>
              )}
              {l.label}
            </dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      {note !== undefined && <div className="mt-1 text-muted-foreground">{note}</div>}
    </div>
  );
}

/** A vertical marker and a dot per line at the hovered point. */
export function Marker({
  x,
  top,
  bottom,
  dots,
}: {
  x: number;
  top: number;
  bottom: number;
  dots: readonly { y: number; colour: string }[];
}) {
  return (
    <g aria-hidden>
      <line x1={x} x2={x} y1={top} y2={bottom} style={{ stroke: 'var(--chart-axis)' }} />
      {dots.map((d) => (
        <circle
          key={`${d.colour}${d.y}`}
          cx={x}
          cy={d.y}
          r={3.5}
          style={{ fill: 'var(--surface)', stroke: d.colour, strokeWidth: 2 }}
        />
      ))}
    </g>
  );
}

/** The chart's figures as a table, in a box that scrolls. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`px-2 py-1.5 font-medium ${i === 0 ? '' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) =>
                i === 0 ? (
                  <th
                    key={`${r[0]}-${columns[i]}`}
                    scope="row"
                    className="px-2 py-1 text-left font-normal"
                  >
                    {cell}
                  </th>
                ) : (
                  <td key={`${r[0]}-${columns[i]}`} className="px-2 py-1 text-right">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Show as a table" / "Show as a chart", for a chart that offers both. */
export function TableToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return (
    <div className="flex justify-end">
      <Button type="button" size="sm" variant="ghost" aria-pressed={asTable} onClick={onToggle}>
        {asTable ? 'Show as a chart' : 'Show as a table'}
      </Button>
    </div>
  );
}
