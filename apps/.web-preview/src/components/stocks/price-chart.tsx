'use client';

import { formatPaise } from '@equitywise/shared';
import { useMemo, useState } from 'react';
import type { ChartBarDto } from '@/lib/stock-types';
import { cn } from '@/lib/utils';

/**
 * Daily candles from our own adjusted history (split/bonus adjusted on read),
 * with EMA 20/50 and volume. Inline SVG like the watchlist chart — no chart
 * library, every colour a design token. Corporate actions are marked on the
 * date axis so an adjusted gap is explained, not mysterious.
 */

const RANGES = [
  { key: '1M', bars: 22 },
  { key: '3M', bars: 63 },
  { key: '6M', bars: 126 },
  { key: '1Y', bars: 252 },
  { key: '2Y', bars: 500 },
] as const;

const W = 1000;
const PRICE_H = 300;
const VOL_TOP = 318;
const VOL_H = 70;
const H = VOL_TOP + VOL_H;

function dateLabel(t: number): string {
  return new Date(t).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

export function PriceChart({
  bars,
  ema20,
  ema50,
  actions,
  symbol,
}: {
  bars: readonly ChartBarDto[];
  ema20: readonly (number | null)[];
  ema50: readonly (number | null)[];
  actions: readonly { exDate: string; kind: string }[];
  symbol: string;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('6M');
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    const k = Math.min(RANGES.find((r) => r.key === range)?.bars ?? 126, bars.length);
    const start = bars.length - k;
    const slice = bars.slice(start);
    const e20 = ema20.slice(start);
    const e50 = ema50.slice(start);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let vmax = 0;
    for (const b of slice) {
      lo = Math.min(lo, b.l);
      hi = Math.max(hi, b.h);
      vmax = Math.max(vmax, b.v);
    }
    const pad = (hi - lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
    const y = (p: number) => 8 + ((hi - p) / (hi - lo)) * (PRICE_H - 16);
    const step = W / Math.max(1, slice.length);
    const bw = Math.max(1.2, step * 0.62);
    let up = '';
    let down = '';
    let volUp = '';
    let volDown = '';
    slice.forEach((b, i) => {
      const x = (i + 0.5) * step;
      const top = y(Math.max(b.o, b.c));
      const bottom = Math.max(y(Math.min(b.o, b.c)), top + 0.8);
      const candle = `M${x.toFixed(2)},${y(b.h).toFixed(1)}V${y(b.l).toFixed(1)}M${(x - bw / 2).toFixed(2)},${top.toFixed(1)}h${bw.toFixed(2)}V${bottom.toFixed(1)}h${(-bw).toFixed(2)}Z`;
      const vh = vmax === 0 ? 0 : (b.v / vmax) * VOL_H;
      const vol = `M${(x - bw / 2).toFixed(2)},${H}v${(-vh).toFixed(1)}h${bw.toFixed(2)}v${vh.toFixed(1)}Z`;
      if (b.c >= b.o) {
        up += candle;
        volUp += vol;
      } else {
        down += candle;
        volDown += vol;
      }
    });
    const line = (series: readonly (number | null)[]) =>
      series
        .map((v, i) => (v === null ? null : `${((i + 0.5) * step).toFixed(2)},${y(v).toFixed(1)}`))
        .reduce<string>(
          (d, p, i, all) => (p === null ? d : `${d}${all[i - 1] == null ? 'M' : 'L'}${p}`),
          '',
        );
    const ticks = [0, 1, 2, 3, 4].map((j) => {
      const p = lo + ((hi - lo) * (j + 0.5)) / 5;
      return {
        top: (y(p) / H) * 100,
        label: formatPaise(Math.round(p), { withSymbol: false, decimals: 0 }),
      };
    });
    const marks = actions.flatMap((a) => {
      const t = Date.parse(`${a.exDate}T00:00:00Z`);
      const i = slice.findIndex((b) => b.t >= t);
      return i <= 0 ? [] : [{ left: ((i + 0.5) / slice.length) * 100, label: a.kind }];
    });
    return { slice, up, down, volUp, volDown, e20: line(e20), e50: line(e50), ticks, marks, step };
  }, [bars, ema20, ema50, actions, range]);

  if (bars.length < 2) {
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">
        Price history has not been collected for {symbol} yet.
      </p>
    );
  }

  const first = view.slice[0];
  const last = view.slice[view.slice.length - 1];
  const shown = hover === null ? last : view.slice[hover];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset
          aria-label="Chart range"
          className="min-w-0 inline-flex rounded-md border border-border bg-surface-sunken p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              disabled={bars.length < Math.min(r.bars, 23)}
              className={cn(
                'h-7 cursor-pointer rounded px-2.5 font-medium text-xs disabled:cursor-not-allowed disabled:opacity-40',
                range === r.key
                  ? 'bg-surface text-foreground shadow-subtle'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.key}
            </button>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded bg-chart-1" />
            EMA 20
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded bg-chart-3" />
            EMA 50
          </span>
          {shown !== undefined && (
            <span className="figure text-muted-foreground">
              {dateLabel(shown.t)} · O {formatPaise(shown.o, { withSymbol: false })} H{' '}
              {formatPaise(shown.h, { withSymbol: false })} L{' '}
              {formatPaise(shown.l, { withSymbol: false })} C{' '}
              {formatPaise(shown.c, { withSymbol: false })}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-72 sm:h-96">
        {view.ticks.map((t) => (
          <div
            key={t.label}
            className="pointer-events-none absolute right-14 left-0 border-chart-grid border-t border-dashed"
            style={{ top: `${t.top}%` }}
          />
        ))}
        {view.ticks.map((t) => (
          <span
            key={`l-${t.label}`}
            className="figure pointer-events-none absolute right-0 w-13 -translate-y-1/2 text-right text-2xs text-muted-foreground"
            style={{ top: `${t.top}%` }}
          >
            {t.label}
          </span>
        ))}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-y-0 left-0 h-full w-[calc(100%-3.5rem)] overflow-visible"
          role="img"
          aria-label={`${symbol} daily candles, ${range}, from ${first === undefined ? '' : dateLabel(first.t)} to ${last === undefined ? '' : dateLabel(last.t)}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.floor(((e.clientX - rect.left) / rect.width) * view.slice.length);
            setHover(Math.max(0, Math.min(view.slice.length - 1, i)));
          }}
        >
          <path d={view.volUp} className="fill-bullish opacity-30" />
          <path d={view.volDown} className="fill-bearish opacity-30" />
          <path
            d={view.e50}
            fill="none"
            className="stroke-chart-3"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={view.e20}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={view.down}
            className="fill-bearish stroke-bearish"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={view.up}
            className="fill-bullish stroke-bullish"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <line
              x1={(hover + 0.5) * view.step}
              x2={(hover + 0.5) * view.step}
              y1={0}
              y2={H}
              className="stroke-border-strong"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {view.marks.map((m) => (
          <span
            key={`${m.left}-${m.label}`}
            className="pointer-events-none absolute bottom-[19%] -translate-x-1/2 rounded bg-warning-soft px-1 text-2xs text-warning-foreground"
            style={{ left: `calc((100% - 3.5rem) * ${m.left / 100})` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="figure flex justify-between pr-14 text-2xs text-muted-foreground">
        <span>{first === undefined ? '' : dateLabel(first.t)}</span>
        <span>Split/bonus adjusted · NSE end-of-day</span>
        <span>{last === undefined ? '' : dateLabel(last.t)}</span>
      </div>
    </div>
  );
}
