import { cn } from '@/lib/utils';
import type { MarketBreadthDto } from '@/server/market-breadth';

function sessionLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function ParticipationChart({ history }: { history: MarketBreadthDto['history'] }) {
  const points = history.filter((day) => day.above200Pct !== null);
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">Not enough history yet.</p>
    );
  }

  const x = (index: number) => (index / (points.length - 1)) * 600;
  const y = (value: number) => 236 - (value / 100) * 232;
  const line = points
    .map(
      (day, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(day.above200Pct ?? 0).toFixed(1)}`,
    )
    .join('');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-56">
        {[80, 50, 20].map((level) => (
          <div
            key={level}
            className={cn(
              'pointer-events-none absolute right-9 left-0 border-t',
              level === 50
                ? 'border-muted-foreground/60 border-dashed'
                : 'border-chart-grid border-dashed',
            )}
            style={{ top: `${(y(level) / 240) * 100}%` }}
          >
            <span className="figure absolute -right-9 -translate-y-1/2 text-2xs text-muted-foreground">
              {level}%
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 600 240"
          preserveAspectRatio="none"
          className="absolute inset-y-0 left-0 h-full w-[calc(100%-2.25rem)]"
          role="img"
          aria-label={`Percent of stocks above their 200 EMA; latest ${lastPoint?.above200Pct?.toFixed(1)}%`}
        >
          <path d={`${line}L600,240L0,240Z`} className="fill-chart-1 opacity-10" />
          <path
            d={line}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="figure flex justify-between pr-9 text-2xs text-muted-foreground">
        <span>{firstPoint === undefined ? '' : sessionLabel(firstPoint.date)}</span>
        <span>{lastPoint === undefined ? '' : sessionLabel(lastPoint.date)}</span>
      </div>
    </div>
  );
}

export function HighsLowsChart({ history }: { history: MarketBreadthDto['history'] }) {
  if (history.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">Not enough history yet.</p>
    );
  }

  const max = Math.max(1, ...history.map((day) => Math.max(day.newHighs, day.newLows)));
  const width = 400 / history.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-bullish" />
          Highs (above the line)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-bearish" />
          Lows (below)
        </span>
      </div>
      <svg
        viewBox="0 0 400 220"
        preserveAspectRatio="none"
        className="h-56 w-full"
        role="img"
        aria-label="Daily counts of new 52-week highs and lows"
      >
        <line
          x1={0}
          x2={400}
          y1={120}
          y2={120}
          className="stroke-border-strong"
          vectorEffect="non-scaling-stroke"
        />
        {history.map((day, index) => {
          const highHeight = (day.newHighs / max) * 112;
          const lowHeight = (day.newLows / max) * 96;
          return (
            <g key={day.date}>
              <title>{`${sessionLabel(day.date)}: ${day.newHighs} highs, ${day.newLows} lows`}</title>
              <rect
                x={index * width + 0.5}
                y={120 - highHeight}
                width={Math.max(0.5, width - 1)}
                height={highHeight}
                className="fill-bullish"
              />
              <rect
                x={index * width + 0.5}
                y={120}
                width={Math.max(0.5, width - 1)}
                height={lowHeight}
                className="fill-bearish"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
