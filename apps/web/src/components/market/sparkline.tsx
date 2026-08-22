import { type Tone, toneOf } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Inline SVG sparkline.
 *
 * Hand-rolled rather than pulling in a charting library: it is ~40 lines, has
 * no bundle cost, and renders identically on the server.
 *
 * Tone is derived from first-to-last, not from the last two points — a series
 * that dipped and recovered is up, and colouring it by the final tick would
 * contradict the change figure printed beside it.
 */
export function Sparkline({
  values,
  tone,
  className,
  width = 96,
  height = 28,
  fill = false,
}: {
  values: readonly number[];
  /** Overrides the derived tone. Used where a rise is bad news, e.g. INDIA VIX. */
  tone?: Tone | undefined;
  className?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  fill?: boolean | undefined;
}) {
  if (values.length < 2) {
    return <div className={cn('h-7 w-24', className)} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, i) => {
    const x = i * step;
    // SVG y grows downward; invert so higher prices sit higher.
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const resolved = tone ?? toneOf(last - first);
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
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-7 w-24 overflow-visible', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend ${last >= first ? 'up' : 'down'} over the last ${values.length} sessions`}
    >
      {fill && (
        <polygon
          points={`0,${height} ${points.join(' ')} ${width},${height}`}
          className={area}
          stroke="none"
        />
      )}
      <polyline
        points={points.join(' ')}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={stroke}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
