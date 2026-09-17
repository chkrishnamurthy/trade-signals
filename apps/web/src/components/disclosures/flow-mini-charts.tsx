import { shortDate } from '@/lib/flow-labels';
import { cn } from '@/lib/utils';

/**
 * Small inline SVG charts for the flow page and the stock drawer.
 *
 * Hand-rolled like `FlowChart` and `Sparkline`: no charting dependency, they
 * render identically on the server, and colour comes only from design tokens
 * via `fill-*` / `stroke-*` classes so light and dark both hold. Each mark
 * carries a `<title>` so hovering reads the exact figure. Every chart is one
 * measure on one axis — two measures are two charts, never a dual axis.
 */

const W = 640;
const H = 140;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

export interface SeriesPoint {
  readonly date: string;
  readonly value: number;
}

function EmptyPlot({ className, children }: { className?: string | undefined; children: string }) {
  return (
    <div
      className={cn(
        'flex h-32 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function AxisDates({ points }: { points: readonly SeriesPoint[] }) {
  return (
    <>
      <text x={PAD_X} y={H - 6} fill="currentColor" className="text-[10px] text-muted-foreground">
        {shortDate(points[0]?.date ?? '')}
      </text>
      <text
        x={W - PAD_X}
        y={H - 6}
        textAnchor="end"
        fill="currentColor"
        className="text-[10px] text-muted-foreground"
      >
        {shortDate(points.at(-1)?.date ?? '')}
      </text>
    </>
  );
}

/**
 * Bars from a zero baseline with an optional reference line (an average).
 *
 * Bars above the reference read as the accent tone, below as muted, so the
 * "unusual sessions" pop without a legend. Values are >= 0 (percentages,
 * quantities); use `DivergingBars` for signed series.
 */
export function ReferenceBars({
  points,
  reference,
  format,
  label,
  className,
}: {
  points: readonly SeriesPoint[];
  reference: number | null;
  format: (value: number) => string;
  label: string;
  className?: string | undefined;
}) {
  if (points.length < 2)
    return <EmptyPlot className={className}>Not enough sessions yet.</EmptyPlot>;
  const max = Math.max(1e-9, reference ?? 0, ...points.map((p) => p.value));
  const slot = (W - PAD_X * 2) / points.length;
  const barW = Math.max(1, slot * 0.7);
  const y = (v: number): number => PAD_TOP + PLOT_H - (v / max) * PLOT_H;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-32 w-full', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} over ${points.length} sessions; latest ${format(points.at(-1)?.value ?? 0)}`}
    >
      {points.map((p, i) => {
        const above = reference !== null && p.value > reference;
        return (
          <rect
            key={p.date}
            x={(PAD_X + i * slot + (slot - barW) / 2).toFixed(2)}
            y={y(p.value).toFixed(2)}
            width={barW.toFixed(2)}
            height={Math.max(0.5, PAD_TOP + PLOT_H - y(p.value)).toFixed(2)}
            rx={1.5}
            className={above ? 'fill-primary' : 'fill-neutral/50'}
          >
            <title>{`${shortDate(p.date)}: ${format(p.value)}`}</title>
          </rect>
        );
      })}
      {reference !== null && (
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={y(reference)}
          y2={y(reference)}
          className="stroke-foreground/60"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        >
          <title>{`Average ${format(reference)}`}</title>
        </line>
      )}
      <AxisDates points={points} />
    </svg>
  );
}

/** A single line, toned by first-to-last, with a soft area fill. */
export function TrendLine({
  points,
  format,
  label,
  className,
  tone = 'auto',
}: {
  points: readonly SeriesPoint[];
  format: (value: number) => string;
  label: string;
  className?: string | undefined;
  /** `auto` tones by first→last; `neutral` for a series with no good direction. */
  tone?: 'auto' | 'neutral' | undefined;
}) {
  if (points.length < 2)
    return <EmptyPlot className={className}>Not enough sessions yet.</EmptyPlot>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (W - PAD_X * 2) / (points.length - 1);
  const y = (v: number): number => PAD_TOP + PLOT_H - ((v - min) / span) * PLOT_H;
  const coords = points.map((p, i) => `${(PAD_X + i * step).toFixed(2)},${y(p.value).toFixed(2)}`);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const resolved =
    tone === 'neutral'
      ? 'neutral'
      : last > first
        ? 'bullish'
        : last < first
          ? 'bearish'
          : 'neutral';
  const stroke = {
    bullish: 'stroke-bullish',
    bearish: 'stroke-bearish',
    neutral: 'stroke-neutral',
  }[resolved];
  const area = {
    bullish: 'fill-bullish/10',
    bearish: 'fill-bearish/10',
    neutral: 'fill-neutral/10',
  }[resolved];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-32 w-full', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} over ${points.length} sessions; from ${format(first)} to ${format(last)}`}
    >
      <polygon
        points={`${PAD_X},${PAD_TOP + PLOT_H} ${coords.join(' ')} ${W - PAD_X},${PAD_TOP + PLOT_H}`}
        className={area}
        stroke="none"
      />
      <polyline
        points={coords.join(' ')}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className={stroke}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={p.date}
          cx={(PAD_X + i * step).toFixed(2)}
          cy={y(p.value).toFixed(2)}
          r={6}
          className="fill-transparent"
        >
          <title>{`${shortDate(p.date)}: ${format(p.value)}`}</title>
        </circle>
      ))}
      <AxisDates points={points} />
    </svg>
  );
}

/** Signed bars from a centred zero line: green above, red below. */
export function DivergingBars({
  points,
  format,
  label,
  className,
}: {
  points: readonly SeriesPoint[];
  format: (value: number) => string;
  label: string;
  className?: string | undefined;
}) {
  if (points.length < 2)
    return <EmptyPlot className={className}>Not enough sessions yet.</EmptyPlot>;
  const maxAbs = Math.max(1e-9, ...points.map((p) => Math.abs(p.value)));
  const slot = (W - PAD_X * 2) / points.length;
  const barW = Math.max(1, slot * 0.7);
  const zeroY = PAD_TOP + PLOT_H / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-32 w-full', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} over ${points.length} sessions; latest ${format(points.at(-1)?.value ?? 0)}`}
    >
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={zeroY}
        y2={zeroY}
        className="stroke-border"
        strokeWidth={1}
      />
      {points.map((p, i) => {
        const height = (Math.abs(p.value) / maxAbs) * (PLOT_H / 2);
        return (
          <rect
            key={p.date}
            x={(PAD_X + i * slot + (slot - barW) / 2).toFixed(2)}
            y={(p.value >= 0 ? zeroY - height : zeroY).toFixed(2)}
            width={barW.toFixed(2)}
            height={Math.max(0.5, height).toFixed(2)}
            rx={1.5}
            className={p.value >= 0 ? 'fill-bullish' : 'fill-bearish'}
          >
            <title>{`${shortDate(p.date)}: ${format(p.value)}`}</title>
          </rect>
        );
      })}
      <AxisDates points={points} />
    </svg>
  );
}

export interface ShareQuarter {
  readonly asOfDate: string;
  readonly segments: readonly {
    readonly id: string;
    readonly label: string;
    readonly percent: number | null;
  }[];
}

/**
 * Fixed hue per holder class from the categorical chart ramp, in a fixed
 * order — never cycled, and never the bullish/bearish pair, which would read
 * a holder class as a direction.
 */
const SHARE_FILL: Readonly<Record<string, string>> = {
  promoter: 'fill-chart-1',
  fii: 'fill-chart-2',
  dii: 'fill-chart-3',
  public: 'fill-neutral/40',
};

/** `2025-12-31` → `Dec ’25`. */
function quarterLabel(dateKey: string): string {
  const [year, month] = dateKey.split('-');
  const m = [
    '',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][Number(month)];
  return year === undefined || m === undefined ? dateKey : `${m} ’${year.slice(2)}`;
}

/**
 * One 100 % horizontal bar per quarter, oldest at the top, so a holder class
 * growing or shrinking reads as a wedge widening down the chart.
 */
export function ShareholdingBars({
  quarters,
  className,
}: {
  quarters: readonly ShareQuarter[];
  className?: string | undefined;
}) {
  if (quarters.length === 0)
    return <EmptyPlot className={className}>No quarters on file.</EmptyPlot>;
  const rowH = 18;
  const gap = 6;
  const labelW = 64;
  const height = quarters.length * (rowH + gap);
  const plotW = W - labelW - PAD_X;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className={cn('w-full', className)}
      style={{ height: `${Math.max(56, quarters.length * 26)}px` }}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Shareholding by quarter, ${quarters.length} quarters`}
    >
      {quarters.map((quarter, row) => {
        const y = row * (rowH + gap);
        let x = labelW;
        return (
          <g key={quarter.asOfDate}>
            <text
              x={0}
              y={y + rowH * 0.7}
              fill="currentColor"
              className="text-[10px] text-muted-foreground"
            >
              {quarterLabel(quarter.asOfDate)}
            </text>
            {quarter.segments.map((segment) => {
              if (segment.percent === null) return null;
              const w = Math.max(0, (segment.percent / 100) * plotW);
              const rect = (
                <rect
                  key={segment.id}
                  x={x.toFixed(2)}
                  y={y}
                  width={Math.max(0, w - 2).toFixed(2)}
                  height={rowH}
                  rx={2}
                  className={SHARE_FILL[segment.id] ?? 'fill-neutral/50'}
                >
                  <title>{`${quarterLabel(quarter.asOfDate)} · ${segment.label} ${segment.percent.toFixed(2)}%`}</title>
                </rect>
              );
              x += w;
              return rect;
            })}
          </g>
        );
      })}
    </svg>
  );
}

export const SHARE_LEGEND = [
  { id: 'promoter', label: 'Promoter', swatch: 'bg-chart-1' },
  { id: 'fii', label: 'FII', swatch: 'bg-chart-2' },
  { id: 'dii', label: 'DII', swatch: 'bg-chart-3' },
  { id: 'public', label: 'Public', swatch: 'bg-neutral/40' },
] as const;
