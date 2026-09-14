'use client';
import { formatPaise, type SignalDetail } from '@equitywise/shared';

/** Presentation only: candles come from stored minutes; indicator overlays from frozen evidence. */
export function SignalChart({ detail }: { detail: SignalDetail }) {
  const { bars, signal } = detail;
  const e = signal.evidence;
  if (!bars.length)
    return (
      <p className="rounded border border-border p-4 text-muted-foreground text-sm">
        Chart history unavailable.
      </p>
    );
  const levels = [
    { name: 'Trigger', price: e.levels.trigger, color: 'var(--primary)' },
    { name: 'Invalidation', price: e.levels.invalidation, color: 'var(--bearish)' },
    { name: 'T1', price: e.levels.target1, color: 'var(--bullish)' },
    { name: 'T2', price: e.levels.target2, color: 'var(--bullish)' },
    { name: 'OR high', price: e.indicators.openingHigh, color: 'var(--muted-foreground)' },
    { name: 'OR low', price: e.indicators.openingLow, color: 'var(--muted-foreground)' },
    { name: 'OR mid', price: e.indicators.openingMid, color: 'var(--muted-foreground)' },
  ];
  const min = Math.min(...bars.map((b) => b.low), ...levels.map((l) => l.price));
  const max = Math.max(...bars.map((b) => b.high), ...levels.map((l) => l.price));
  const spread = Math.max(1, max - min);
  const y = (price: number) => 245 - ((price - min) / spread) * 215;
  const x = (i: number) => 20 + ((i + 0.5) * 520) / bars.length;
  const width = Math.max(2, Math.min(12, 380 / bars.length));
  const generated = bars.findIndex((b) => b.timestamp + 300_000 === e.confirmationAt);
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto rounded border border-border bg-surface">
        <svg
          viewBox="0 0 670 290"
          className="min-w-[600px] w-full"
          role="img"
          aria-label={`${signal.symbol} five-minute candlesticks with frozen strategy overlays and technical levels`}
        >
          {levels.map((l) => (
            <g key={l.name}>
              <line
                x1="15"
                x2="540"
                y1={y(l.price)}
                y2={y(l.price)}
                stroke={l.color}
                strokeDasharray="4 4"
                opacity="0.5"
              />
              <text x="545" y={y(l.price) + 3} fill={l.color} fontSize="9">
                {l.name} {formatPaise(l.price)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => (
            <g
              key={b.timestamp}
              stroke={b.close >= b.open ? 'var(--bullish)' : 'var(--bearish)'}
              fill={b.close >= b.open ? 'var(--bullish)' : 'var(--bearish)'}
            >
              <title>
                {new Date(b.timestamp).toLocaleTimeString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · O {formatPaise(b.open)} H {formatPaise(b.high)} L {formatPaise(b.low)} C{' '}
                {formatPaise(b.close)}
              </title>
              <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} />
              <rect
                x={x(i) - width / 2}
                width={width}
                y={Math.min(y(b.open), y(b.close))}
                height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
              />
            </g>
          ))}
          {(['vwap', 'ema9', 'ema21'] as const).map((key, line) => (
            <polyline
              key={key}
              fill="none"
              stroke={['var(--primary)', '#b48a43', '#8176bf'][line]}
              strokeWidth="1.5"
              points={bars
                .flatMap((b, i) => {
                  const p = e.overlays.find((o) => o.timestamp === b.timestamp)?.[key];
                  return p ? [`${x(i)},${y(p)}`] : [];
                })
                .join(' ')}
            />
          ))}
          {generated >= 0 && (
            <g>
              <line
                x1={x(generated)}
                x2={x(generated)}
                y1="16"
                y2="255"
                stroke="var(--foreground)"
                strokeDasharray="2 4"
              />
              <text x={Math.min(x(generated), 420)} y="275" fontSize="10" fill="var(--foreground)">
                Signal generated
              </text>
            </g>
          )}
        </svg>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        Closed 5m · <span className="text-primary">VWAP</span> ·{' '}
        <span style={{ color: '#b48a43' }}>EMA9</span> ·{' '}
        <span style={{ color: '#8176bf' }}>EMA21</span>. Indicator lines are frozen at confirmation;
        subsequent candles show observed history. Scroll the chart horizontally on small screens.
      </figcaption>
    </figure>
  );
}
