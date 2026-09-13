import type { FlowPoint } from '@/lib/flow-analytics';
import { largeCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Inline SVG chart for institutional net flow — hand-rolled, no charting
 * dependency (CLAUDE.md: don't add a library for one visualization).
 *
 * Two modes share the same data:
 *  - `bars`: daily net, diverging from a zero baseline, green above / red below.
 *  - `line`: the cumulative running total, the metric traders actually track.
 *
 * Colours come from design tokens via `fill-*` / `stroke-*` utilities and SVG
 * text uses `currentColor`, so it themes correctly in light and dark with no
 * raw hex. Direction is never colour-only: sign is also carried by the bar
 * pointing up/down and by the accessible label.
 */
const W = 720;
const H = 200;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 22;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

export function FlowChart({
  points,
  mode,
  seriesLabel,
  className,
}: {
  points: readonly FlowPoint[];
  mode: 'bars' | 'line';
  seriesLabel: string;
  className?: string | undefined;
}) {
  if (points.length < 2) {
    return (
      <div
        className={cn(
          'flex h-40 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground text-sm',
          className,
        )}
      >
        Not enough sessions yet to chart.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const last = values.at(-1) ?? 0;
  const firstDate = shortDate(points[0]?.date ?? '');
  const lastDate = shortDate(points.at(-1)?.date ?? '');
  const slot = (W - PAD_X * 2) / points.length;

  const summary = `${seriesLabel} ${mode === 'line' ? 'cumulative' : 'daily'} net over ${points.length} sessions; latest ${largeCurrency(last)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-40 w-full', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={summary}
    >
      {mode === 'bars' ? renderBars(values, points, slot) : renderLine(values)}

      {/* X-axis date labels. */}
      <text x={PAD_X} y={H - 6} fill="currentColor" className="text-[10px] text-muted-foreground">
        {firstDate}
      </text>
      <text
        x={W - PAD_X}
        y={H - 6}
        textAnchor="end"
        fill="currentColor"
        className="text-[10px] text-muted-foreground"
      >
        {lastDate}
      </text>
    </svg>
  );
}

function renderBars(values: readonly number[], points: readonly FlowPoint[], slot: number) {
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
  const zeroY = PAD_TOP + PLOT_H / 2;
  const barW = Math.max(1, slot * 0.68);

  return (
    <>
      <line
        x1={PAD_X}
        y1={zeroY}
        x2={W - PAD_X}
        y2={zeroY}
        className="stroke-border"
        strokeWidth={1}
      />
      {values.map((value, i) => {
        const height = (Math.abs(value) / maxAbs) * (PLOT_H / 2);
        const x = PAD_X + i * slot + (slot - barW) / 2;
        const y = value >= 0 ? zeroY - height : zeroY;
        const point = points[i];
        return (
          <rect
            key={point?.date ?? i}
            x={x.toFixed(2)}
            y={y.toFixed(2)}
            width={barW.toFixed(2)}
            height={Math.max(0.5, height).toFixed(2)}
            className={value >= 0 ? 'fill-bullish' : 'fill-bearish'}
          >
            <title>{`${shortDate(point?.date ?? '')}: ${largeCurrency(value)}`}</title>
          </rect>
        );
      })}
    </>
  );
}

function renderLine(values: readonly number[]) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const step = (W - PAD_X * 2) / (values.length - 1);
  const y = (value: number): number => PAD_TOP + PLOT_H - ((value - min) / span) * PLOT_H;

  const coords = values.map(
    (value, i) => `${(PAD_X + i * step).toFixed(2)},${y(value).toFixed(2)}`,
  );
  const last = values.at(-1) ?? 0;
  const tone = last >= 0 ? 'bullish' : 'bearish';

  return (
    <>
      <line
        x1={PAD_X}
        y1={y(0)}
        x2={W - PAD_X}
        y2={y(0)}
        className="stroke-border"
        strokeWidth={1}
      />
      <polygon
        points={`${PAD_X},${y(0)} ${coords.join(' ')} ${W - PAD_X},${y(0)}`}
        className={tone === 'bullish' ? 'fill-bullish/10' : 'fill-bearish/10'}
        stroke="none"
      />
      <polyline
        points={coords.join(' ')}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className={tone === 'bullish' ? 'stroke-bullish' : 'stroke-bearish'}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  );
}

/** `2026-09-11` → `11 Sep`. */
function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  const months = [
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
  ];
  const m = months[Number(month)] ?? '';
  return day === undefined ? dateKey : `${Number(day)} ${m}`;
}
