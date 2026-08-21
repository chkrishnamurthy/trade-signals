/**
 * Inline SVG sparkline.
 *
 * Hand-rolled rather than pulling in a charting library: it is ~30 lines, has
 * no bundle cost, and renders identically on the server.
 */
export function Sparkline({
  values,
  className = '',
  width = 96,
  height = 28,
}: {
  values: readonly number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div className={`h-7 w-24 ${className}`} aria-hidden />;
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
  const rising = last >= first;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-7 w-24 overflow-visible ${className}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend ${rising ? 'up' : 'down'} over the last ${values.length} sessions`}
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={rising ? 'stroke-emerald-500' : 'stroke-rose-500'}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
