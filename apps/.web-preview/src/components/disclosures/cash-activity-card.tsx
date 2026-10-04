'use client';

import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import { niceScale } from '@/lib/chart-scale';
import type { FiiDiiDayDto } from '@/lib/disclosure-types';
import { type FlowBar, monthBars, sessionBars } from '@/lib/flow-analytics';
import { croreTick, largeCurrency, signedCrore } from '@/lib/format';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { Segmented } from './parts';

/**
 * FII / DII cash activity — the market tape's cash-flow card.
 *
 * One chart, one table, one switch. Each session (or month) is a pair of bars,
 * FII in blue and DII in orange, rising above zero for net buying and falling
 * below it for net selling, on a ₹-crore axis. Hovering a pair opens a card
 * with that session's net and gross figures; the table underneath lists the
 * same numbers newest first, with a small bar beside each so the big days
 * stand out without reading every figure.
 *
 * The chart is hand-drawn SVG rendered at its measured pixel width, so the
 * axis text is never stretched. Participant colour comes from the
 * `--flow-fii` / `--flow-dii` tokens; green and red appear only on figures,
 * where they carry the sign.
 */

type Mode = 'daily' | 'monthly';

/** About one month of sessions — enough bars to read each one. */
const DAILY_SESSIONS = 20;
/** Daily rows shown before "Show all". */
const TABLE_PREVIEW = 7;

const FII = { fill: 'fill-flow-fii', swatch: 'bg-flow-fii' } as const;
const DII = { fill: 'fill-flow-dii', swatch: 'bg-flow-dii' } as const;

export function CashActivityCard({ history }: { history: readonly FiiDiiDayDto[] }) {
  const [mode, setMode] = useState<Mode>('daily');
  const [showAll, setShowAll] = useState(false);

  const bars = useMemo(
    () => (mode === 'daily' ? sessionBars(history, DAILY_SESSIONS) : monthBars(history)),
    [history, mode],
  );
  const first = bars[0];
  const last = bars.at(-1);
  if (first === undefined || last === undefined) return null;

  const span =
    mode === 'daily'
      ? `${bars.length} ${bars.length === 1 ? 'session' : 'sessions'} · ${shortDate(first.key)} – ${shortDate(last.key)} ${last.key.slice(0, 4)}`
      : bars.length === 1
        ? `${monthName(last.key)} ${last.key.slice(0, 4)}`
        : `Last ${bars.length} months · ${monthShort(first.key)} – ${monthShort(last.key)} ${last.key.slice(0, 4)}`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <Text as="h3" variant="card-title" className="text-base">
            FII / DII cash activity
          </Text>
          <Text as="p" variant="caption" className="mt-0.5">
            Net buying (+) and selling (−) in the cash market · ₹ crore · NSE provisional data
          </Text>
        </div>
        <Segmented
          ariaLabel="Period"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setShowAll(false);
          }}
          options={[
            { id: 'daily', label: 'Daily' },
            { id: 'monthly', label: 'Monthly' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-4 text-muted-foreground text-xs sm:px-5">
        <Key swatch={FII.swatch}>FII</Key>
        <Key swatch={DII.swatch}>DII</Key>
        <span className="w-full sm:ml-auto sm:w-auto">{span}</span>
      </div>

      <div className="px-2 pt-2 sm:px-3">
        <FlowBarsChart bars={bars} mode={mode} />
      </div>

      <div className="mt-3 border-border border-t">
        <div className="flex items-baseline justify-between px-4 pt-4 sm:px-5">
          <Text as="h4" variant="card-title">
            {mode === 'daily' ? 'Session by session' : 'Month by month'}
          </Text>
          <Text as="span" variant="caption">
            Newest first
          </Text>
        </div>
        <FlowTable
          bars={bars}
          mode={mode}
          limit={mode === 'daily' && !showAll ? TABLE_PREVIEW : bars.length}
        />
        {mode === 'daily' && bars.length > TABLE_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mx-4 mt-1 mb-4 rounded-sm font-medium text-foreground text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:mx-5"
          >
            {showAll ? 'Show fewer sessions' : `Show all ${bars.length} sessions ›`}
          </button>
        )}
        {(mode === 'monthly' || bars.length <= TABLE_PREVIEW) && <div className="h-3" />}
      </div>
    </Card>
  );
}

function Key({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-2.5 rounded-[3px]', swatch)} />
      {children}
    </span>
  );
}

/** A signed crore figure, green for net buying and red for net selling. */
function Signed({ paise, unit = true }: { paise: number | null; unit?: boolean | undefined }) {
  if (paise === null) return <span className="text-muted-foreground">—</span>;
  const tone = paise > 0 ? 'bullish' : paise < 0 ? 'bearish' : 'neutral';
  return (
    <span className={cn('figure font-semibold', toneText({ tone }))}>
      {signedCrore(paise, { unit })}
    </span>
  );
}

function combinedNet(bar: FlowBar): number | null {
  return bar.fii === null || bar.dii === null ? null : bar.fii.net + bar.dii.net;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const BAR_GAP = 3;
/** Room one "30 Sep" label needs, glyphs plus a gap to its neighbour. */
const DATE_LABEL_PX = 64;

function FlowBarsChart({ bars, mode }: { bars: readonly FlowBar[]; mode: Mode }) {
  const [width, setWidth] = useState(720);
  const [cursor, setCursor] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const next = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0) setWidth(Math.round(w));
    });
    next.observe(element);
    observer.current = next;
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  // An index into the old bars would point at the wrong session.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the bars change
  useEffect(() => setCursor(null), [bars]);

  const n = bars.length;
  const compact = width < 520;
  const height = compact ? 230 : 290;
  const left = compact ? 46 : 58;
  const right = width - 10;
  const top = 14;
  const bottom = height - 30;
  const slot = (right - left) / Math.max(1, n);
  const cx = (i: number): number => left + slot * (i + 0.5);
  const barW = Math.max(2, Math.min(compact ? 9 : 16, (slot * 0.62 - BAR_GAP) / 2));

  const scale = useMemo(() => {
    const nets = bars
      .flatMap((b) => [b.fii?.net, b.dii?.net])
      .filter((v): v is number => v !== undefined);
    return niceScale(Math.min(0, ...nets), Math.max(0, ...nets), {
      target: compact ? 4 : 5,
      integer: true,
    });
  }, [bars, compact]);
  const y = (paise: number): number =>
    bottom - ((paise - scale.min) / (scale.max - scale.min || 1)) * (bottom - top);

  const labels = axisLabels(bars, mode, slot, cursor);
  const active = cursor !== null && cursor < n ? cursor : null;
  const focus = active ?? n - 1;

  const indexAt = (clientX: number, element: Element): number => {
    const rect = element.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - left) / slot)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = active ?? n - 1;
    const keys: Record<string, number | null> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(n - 1, current + 1),
      Home: 0,
      End: n - 1,
      Escape: null,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    setCursor(keys[event.key] ?? null);
  };

  return (
    <div
      ref={measure}
      role="slider"
      tabIndex={0}
      aria-label={`FII and DII net cash flow by ${mode === 'daily' ? 'session' : 'month'}. Use the arrow keys to move between bars.`}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={focus + 1}
      aria-valuetext={describe(bars[focus], mode)}
      onKeyDown={onKeyDown}
      onBlur={() => setCursor(null)}
      className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full touch-pan-y select-none"
        style={{ height }}
        preserveAspectRatio="none"
        aria-hidden
        onPointerMove={(event) => setCursor(indexAt(event.clientX, event.currentTarget))}
        onPointerDown={(event) => setCursor(indexAt(event.clientX, event.currentTarget))}
        onPointerLeave={(event) => {
          // A finger lifting is not "moving away" — keep the bar it chose.
          if (event.pointerType !== 'touch') setCursor(null);
        }}
      >
        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              fill="currentColor"
              className="text-[11px] text-muted-foreground tabular-nums"
            >
              {croreTick(tick, scale.step)}
            </text>
          </g>
        ))}

        {active !== null && (
          <rect
            x={left + slot * active}
            y={top}
            width={slot}
            height={bottom - top}
            rx={4}
            className="fill-foreground/5"
          />
        )}

        {bars.map((bar, i) => (
          <g key={bar.key}>
            {bar.fii !== null && (
              <path
                d={barPath(cx(i) - barW - BAR_GAP / 2, barW, y(0), y(bar.fii.net))}
                className={FII.fill}
              />
            )}
            {bar.dii !== null && (
              <path
                d={barPath(cx(i) + BAR_GAP / 2, barW, y(0), y(bar.dii.net))}
                className={DII.fill}
              />
            )}
          </g>
        ))}

        {labels.map(({ index, text }) => (
          <text
            key={`${index}-${text}`}
            x={Math.min(width - 24, Math.max(24, cx(index)))}
            y={height - 9}
            textAnchor="middle"
            fill="currentColor"
            className={cn(
              'text-[11px]',
              index === active ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {text}
          </text>
        ))}
      </svg>

      {active !== null && bars[active] !== undefined && (
        <FlowTooltip
          bar={bars[active]}
          mode={mode}
          style={tooltipPlacement(cx(active), slot, width, top)}
        />
      )}
    </div>
  );
}

const TOOLTIP_PX = 292;

/**
 * Beside the hovered pair — right of it, or left when there is no room —
 * and always inside the chart, so a phone never scrolls sideways for it.
 */
function tooltipPlacement(
  x: number,
  slot: number,
  width: number,
  top: number,
): React.CSSProperties {
  const w = Math.min(TOOLTIP_PX, width - 8);
  const after = x + slot / 2 + 8;
  const before = x - slot / 2 - 8 - w;
  const left = after + w <= width ? after : before >= 0 ? before : (width - w) / 2;
  return { top: top + 6, left: Math.max(0, Math.min(width - w, left)), width: w };
}

function FlowTooltip({
  bar,
  mode,
  style,
}: {
  bar: FlowBar;
  mode: Mode;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-xs shadow-elevated"
      style={style}
    >
      <div className="mb-1.5 font-semibold text-foreground text-sm">
        {mode === 'daily' ? sessionTitle(bar.key) : `${monthName(bar.key)} ${bar.key.slice(0, 4)}`}
      </div>
      {mode === 'monthly' && (
        <div className="-mt-1 mb-1.5 text-2xs text-muted-foreground">
          {bar.sessions} {bar.sessions === 1 ? 'session' : 'sessions'}
        </div>
      )}
      <TipSide label="FII" swatch={FII.swatch} side={bar.fii} gross={mode === 'daily'} />
      <TipSide label="DII" swatch={DII.swatch} side={bar.dii} gross={mode === 'daily'} />
      <div className="mt-1.5 flex items-center justify-between gap-4 border-border border-t pt-1.5">
        <span className="pl-4 text-muted-foreground">FII + DII</span>
        <Signed paise={combinedNet(bar)} />
      </div>
    </div>
  );
}

function TipSide({
  label,
  swatch,
  side,
  gross,
}: {
  label: string;
  swatch: string;
  side: FlowBar['fii'];
  gross: boolean;
}) {
  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden className={cn('size-2.5 rounded-[3px]', swatch)} />
          {label}
        </span>
        {side === null ? (
          <span className="text-muted-foreground">Not reported</span>
        ) : (
          <Signed paise={side.net} />
        )}
      </div>
      {gross && side !== null && (
        <div className="whitespace-nowrap pl-4 text-2xs text-muted-foreground">
          Bought {largeCurrency(side.buy)} · Sold {largeCurrency(side.sell)}
        </div>
      )}
    </div>
  );
}

/**
 * A bar from the zero line to `end` with a 3px rounded data end and a square
 * foot. A near-zero session still gets a 1px sliver so it reads as present.
 */
function barPath(x: number, w: number, base: number, end: number): string {
  const up = end <= base;
  const length = Math.max(1, Math.abs(end - base));
  const tip = up ? base - length : base + length;
  const r = Math.min(3, w / 2, length);
  const s = up ? 1 : -1;
  const f = (v: number): string => v.toFixed(2);
  return `M${f(x)},${f(base)}V${f(tip + s * r)}Q${f(x)},${f(tip)} ${f(x + r)},${f(tip)}H${f(x + w - r)}Q${f(x + w)},${f(tip)} ${f(x + w)},${f(tip + s * r)}V${f(base)}Z`;
}

/**
 * Axis labels. Months are all named; sessions are named on a stride counted
 * back from the latest, as dense as the width allows. The bar under the
 * cursor is always named, and stride labels too close to it step aside.
 */
function axisLabels(
  bars: readonly FlowBar[],
  mode: Mode,
  slot: number,
  cursor: number | null,
): { index: number; text: string }[] {
  const text = (bar: FlowBar): string =>
    mode === 'daily' ? shortDate(bar.key) : monthShort(bar.key);
  if (mode === 'monthly') return bars.map((bar, index) => ({ index, text: text(bar) }));
  const stride = Math.max(1, Math.ceil(DATE_LABEL_PX / slot));
  const out: { index: number; text: string }[] = [];
  for (let i = bars.length - 1; i >= 0; i -= stride) {
    if (cursor !== null && i !== cursor && Math.abs(i - cursor) * slot < DATE_LABEL_PX) continue;
    const bar = bars[i];
    if (bar !== undefined) out.push({ index: i, text: text(bar) });
  }
  const hovered = cursor === null ? undefined : bars[cursor];
  if (cursor !== null && hovered !== undefined && !out.some((l) => l.index === cursor)) {
    out.push({ index: cursor, text: text(hovered) });
  }
  return out;
}

function describe(bar: FlowBar | undefined, mode: Mode): string {
  if (bar === undefined) return '';
  const when =
    mode === 'daily' ? sessionTitle(bar.key) : `${monthName(bar.key)} ${bar.key.slice(0, 4)}`;
  return `${when}: FII ${signedCrore(bar.fii?.net ?? null)}, DII ${signedCrore(bar.dii?.net ?? null)}`;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function FlowTable({ bars, mode, limit }: { bars: readonly FlowBar[]; mode: Mode; limit: number }) {
  // One scale for every bar in the table, so lengths compare across columns.
  const maxAbs = Math.max(
    1,
    ...bars.flatMap((b) => [Math.abs(b.fii?.net ?? 0), Math.abs(b.dii?.net ?? 0)]),
  );
  const rows = [...bars].reverse().slice(0, limit);

  return (
    <div className="px-1 pt-1 sm:px-2">
      <Table>
        {/* A plain header: the chart above already carries the card's weight. */}
        <TableHeader className="bg-transparent">
          <TableRow>
            <TableHead>{mode === 'daily' ? 'Date' : 'Month'}</TableHead>
            <TableHead numeric>FII net (₹ Cr)</TableHead>
            <TableHead numeric>DII net (₹ Cr)</TableHead>
            <TableHead numeric className="hidden sm:table-cell">
              FII + DII
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((bar, row) => {
            const edge = row === 0 || row === rows.length - 1;
            return (
              <TableRow key={bar.key}>
                <TableCell>
                  {mode === 'daily' ? (
                    <>
                      <span className="hidden sm:inline">{tableDate(bar.key)}</span>
                      <span className="sm:hidden">{shortDate(bar.key)}</span>
                    </>
                  ) : (
                    <>
                      {monthName(bar.key)} {bar.key.slice(0, 4)}
                      {edge && bars.length > 1 && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({bar.sessions} {bar.sessions === 1 ? 'session' : 'sessions'})
                        </span>
                      )}
                    </>
                  )}
                </TableCell>
                <NetCell side={bar.fii} maxAbs={maxAbs} fill={FII.swatch} />
                <NetCell side={bar.dii} maxAbs={maxAbs} fill={DII.swatch} />
                <TableCell numeric className="hidden sm:table-cell">
                  <Signed paise={combinedNet(bar)} unit={false} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A net figure with a small diverging bar: it grows left of the centre line
 * for selling and right of it for buying, on the table's shared scale.
 * Phones drop the bar so the date and figures keep their room.
 */
function NetCell({ side, maxAbs, fill }: { side: FlowBar['fii']; maxAbs: number; fill: string }) {
  if (side === null) {
    return (
      <TableCell numeric className="text-muted-foreground">
        —
      </TableCell>
    );
  }
  const half = (Math.abs(side.net) / maxAbs) * 50;
  return (
    <TableCell numeric>
      <div className="flex items-center justify-end gap-3">
        <span aria-hidden className="relative hidden h-2 w-24 shrink-0 sm:block lg:w-36">
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-chart-axis" />
          <span
            className={cn('absolute inset-y-0 rounded-[3px]', fill)}
            style={
              side.net >= 0
                ? { left: '50%', width: `${half}%` }
                : { right: '50%', width: `${half}%` }
            }
          />
        </span>
        <span className="min-w-[6.5rem]">
          <Signed paise={side.net} unit={false} />
        </span>
      </div>
    </TableCell>
  );
}

// ---------------------------------------------------------------------------
// Dates — calendar arithmetic on `YYYY-MM-DD` keys, no clock, no time zone
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function weekday(dateKey: string): string {
  const { y, m, d } = parts(dateKey);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

/** `2026-09-29` → `29 Sep`. */
function shortDate(dateKey: string): string {
  const { m, d } = parts(dateKey);
  return `${d} ${MONTHS[m - 1] ?? ''}`;
}

/** `2026-09-29` → `Tue, 29 Sep`. */
function tableDate(dateKey: string): string {
  return `${weekday(dateKey)}, ${shortDate(dateKey)}`;
}

/** `2026-09-29` → `Tue, 29 Sep 2026`. */
function sessionTitle(dateKey: string): string {
  return `${tableDate(dateKey)} ${parts(dateKey).y}`;
}

/** `2026-09` → `Sep`. */
function monthShort(monthKey: string): string {
  return MONTHS[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}

/** `2026-09` → `September`. */
function monthName(monthKey: string): string {
  return MONTHS_LONG[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}
