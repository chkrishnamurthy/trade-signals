'use client';

import * as React from 'react';
import { MetricHint } from '@/components/data-display/metric-card';
import type { DeepestFallDto, PortfolioRiskDto, RiskFigureDto } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import { ChartTable, HoverTip, Marker, TableToggle, useChartHover } from './chart-extras';
import { longDate } from './portfolio-client';
import { useWidth } from './returns-charts';

/**
 * The Risk tab: how bumpy the ride has been. Volatility, the deepest fall and
 * beta against Nifty 50, a drawdown chart, each stock's own figures and share of
 * the ups and downs, and how the stocks moved together. Every figure describes
 * what happened; none of it says what to do.
 */

/** A fraction as a percentage with a true minus sign: −0.131 → "−13.1%". */
const pct = (v: number, digits = 1) => `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)}%`;

/** Trading days in a month, for "needs about N more months". */
const SESSIONS_A_MONTH = 21;

function waiting(
  f: { sessions: number; needed: number },
  basis: PortfolioRiskDto['basis'],
): string {
  if (basis === 'past_prices')
    return `Only ${f.sessions} trading days of prices exist for all your stocks together; this needs ${f.needed}.`;
  const months = Math.max(1, Math.ceil((f.needed - f.sessions) / SESSIONS_A_MONTH));
  return `Needs about ${months} more ${months === 1 ? 'month' : 'months'} of history (${f.sessions} of ${f.needed} trading days so far).`;
}

function fallSentence(f: DeepestFallDto, subject = 'Your holdings'): string {
  if (f.depth === 0) return `${subject} have not fallen below a previous high.`;
  const back =
    f.recoveredOn === null
      ? 'Not yet back at that high.'
      : `Back at that high on ${longDate(f.recoveredOn)}.`;
  return `From a high on ${longDate(f.peakOn)} to a low on ${longDate(f.troughOn)}. ${back}`;
}

function Tile<T>({
  label,
  hint,
  figure,
  value,
  sentence,
  footer,
  basis,
}: {
  basis: PortfolioRiskDto['basis'];
  label: string;
  hint: string;
  figure: RiskFigureDto<T>;
  value: (v: T) => string;
  sentence: (v: T) => string;
  footer?: (v: T) => React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-4 shadow-subtle">
      <h2 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <MetricHint>{hint}</MetricHint>
      </h2>
      {figure.status === 'ok' ? (
        <>
          <div className="text-2xl font-semibold tabular-nums">{value(figure.value)}</div>
          <p className="text-sm">{sentence(figure.value)}</p>
          {footer !== undefined && (
            <div className="text-xs text-muted-foreground">{footer(figure.value)}</div>
          )}
        </>
      ) : (
        <>
          <div className="text-2xl font-semibold text-muted-foreground">—</div>
          <p className="text-sm text-muted-foreground">{waiting(figure, basis)}</p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Drawdown chart
// ---------------------------------------------------------------------------

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

/** Gridlines from 0 down past `low` (a negative fraction), at a round percentage step. */
export function fallTicks(low: number, count = 4): number[] {
  const steps = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];
  const step = steps.find((x) => x >= -low / count) ?? 0.5;
  const out: number[] = [];
  for (let k = 0; k * step <= -low + step / 2 && k <= 10; k++) out.push(-k * step);
  return out;
}

function DrawdownChart({
  points,
  deepest,
  height = 200,
}: {
  points: readonly { date: string; drawdown: number }[];
  deepest: DeepestFallDto | null;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [asTable, setAsTable] = React.useState(false);
  const xs = React.useMemo(() => {
    if (width === null || points.length < 2) return [];
    const times = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
    const start = times[0] ?? 0;
    const length = Math.max((times.at(-1) ?? start) - start, 1);
    return times.map((time) => 48 + ((time - start) / length) * (width - 48 - 12));
  }, [points, width]);
  const hover = useChartHover(xs);
  if (points.length < 2)
    return (
      <div ref={ref} className="text-sm text-muted-foreground">
        Not enough history to draw yet.
      </div>
    );
  if (width === null)
    return (
      <div
        ref={ref}
        className="w-full animate-pulse rounded-md bg-surface-sunken"
        style={{ height }}
      />
    );
  const left = 48;
  const right = 12;
  const top = 8;
  const bottom = 26;
  const low = Math.min(...points.map((p) => p.drawdown), -0.01);
  const ticks = fallTicks(low);
  const yLo = Math.min(low, ...ticks) * 1.05;
  const t = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = t[0] ?? 0;
  const span = Math.max((t.at(-1) ?? t0) - t0, 1);
  const x = (time: number) => left + ((time - t0) / span) * (width - left - right);
  const y = (v: number) => top + (v / yLo) * (height - top - bottom);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(t[i] ?? t0).toFixed(1)},${y(p.drawdown).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(t.at(-1) ?? t0).toFixed(1)},${y(0).toFixed(1)} L${x(t0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const xTickCount = Math.max(2, Math.min(6, Math.floor(width / 120)));
  const xTicks = Array.from({ length: xTickCount }, (_, k) => t0 + (k / (xTickCount - 1)) * span);
  const trough =
    deepest !== null && deepest.depth < 0
      ? { time: Date.parse(`${deepest.troughOn}T00:00:00Z`), depth: deepest.depth }
      : null;
  const at = hover.index;
  const hovered = at === null ? undefined : points[at];
  return (
    <div ref={ref} className="w-full">
      <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      {asTable ? (
        <ChartTable
          caption="How far below its last high your holdings stood, by date"
          columns={['Date', 'Below the last high']}
          rows={points.map((p) => [longDate(p.date), pct(p.drawdown)])}
        />
      ) : (
        <div className="relative">
          <svg
            role="img"
            aria-label="How far below its last high your holdings stood each day. Choose &quot;Show as a table&quot; for every value."
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
            style={{ touchAction: 'pan-y' }}
            {...hover.bind}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(v)}
                  y2={y(v)}
                  style={{ stroke: 'var(--chart-grid)' }}
                />
                <text
                  x={left - 6}
                  y={y(v) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {pct(v, 0)}
                </text>
              </g>
            ))}
            <path
              d={area}
              style={{ fill: 'color-mix(in srgb, var(--chart-1) 18%, transparent)' }}
            />
            <path
              d={line}
              fill="none"
              strokeWidth={1.75}
              strokeLinejoin="round"
              style={{ stroke: 'var(--chart-1)' }}
            />
            {trough !== null && (
              <g>
                <line
                  x1={x(trough.time)}
                  x2={x(trough.time)}
                  y1={y(0)}
                  y2={y(trough.depth)}
                  strokeDasharray="3 3"
                  style={{ stroke: 'var(--chart-axis)' }}
                />
                <circle
                  cx={x(trough.time)}
                  cy={y(trough.depth)}
                  r={4}
                  style={{ fill: 'var(--surface)', stroke: 'var(--chart-1)', strokeWidth: 2 }}
                />
                <text
                  x={Math.min(Math.max(x(trough.time), left + 40), width - right - 40)}
                  y={Math.min(y(trough.depth) + 18, height - bottom - 4)}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium tabular-nums"
                  style={{
                    paintOrder: 'stroke',
                    stroke: 'var(--surface)',
                    strokeWidth: 4,
                    strokeLinejoin: 'round',
                  }}
                >
                  Deepest {pct(trough.depth)}
                </text>
              </g>
            )}
            {xTicks.map((time, k) => (
              <text
                key={time}
                x={x(time)}
                y={height - 8}
                textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[11px]"
              >
                {monthYear(new Date(time).toISOString().slice(0, 10))}
              </text>
            ))}
            {hovered !== undefined && at !== null && (
              <Marker
                x={xs[at] ?? 0}
                top={top}
                bottom={height - bottom}
                dots={[{ y: y(hovered.drawdown), colour: 'var(--chart-1)' }]}
              />
            )}
          </svg>
          {hovered !== undefined && at !== null && (
            <HoverTip
              x={xs[at] ?? 0}
              width={width}
              title={longDate(hovered.date)}
              lines={[
                {
                  label: 'Below the last high',
                  value: hovered.drawdown === 0 ? '0%' : pct(hovered.drawdown),
                  colour: 'var(--chart-1)',
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Correlation grid
// ---------------------------------------------------------------------------

/** Colour by strength, not by good or bad: one hue for together, another for opposite. */
function cellStyle(v: number | null): React.CSSProperties {
  if (v === null) return {};
  const strength = Math.round(Math.min(1, Math.abs(v)) * 55);
  const token = v >= 0 ? '--chart-1' : '--chart-4';
  return { background: `color-mix(in srgb, var(${token}) ${strength}%, var(--surface))` };
}

const corr = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

/** A plain word for a correlation, so the number never has to be decoded. */
export function togetherWord(v: number): string {
  if (v >= 0.7) return 'very often on the same days';
  if (v >= 0.4) return 'often on the same days';
  if (v >= 0.2) return 'a little on the same days';
  if (v > -0.2) return 'little relation';
  return 'tend to go opposite ways';
}

function CorrelationGridView({ grid }: { grid: PortfolioRiskDto['correlation'] }) {
  const { symbols, cells } = grid;
  const pairs: { a: string; b: string; v: number }[] = [];
  symbols.forEach((a, i) => {
    symbols.forEach((b, j) => {
      const v = cells[i]?.[j];
      if (j > i && v !== null && v !== undefined) pairs.push({ a, b, v });
    });
  });
  const sorted = [...pairs].sort((p, q) => q.v - p.v);
  const most = sorted.slice(0, 3);
  const least = sorted
    .slice(-3)
    .reverse()
    .filter((p) => !most.includes(p));

  if (symbols.length < 2)
    return (
      <p className="text-sm text-muted-foreground">This needs at least two holdings with prices.</p>
    );
  if (pairs.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No pair of your stocks has 60 trading days of prices in common in the last year yet.
      </p>
    );
  const average = pairs.reduce((sum, p) => sum + p.v, 0) / pairs.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm">
        Each pair of your stocks is scored from −1 to 1 on how their daily price changes lined up
        over the last year. Pairs that rise and fall on the same days move your total more together;
        pairs that don&apos;t, less. On average your pairs score{' '}
        <span className="font-semibold tabular-nums">{corr(average)}</span> ({togetherWord(average)}
        ).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <PairList title="Moved most alike" pairs={most} />
        <PairList title="Moved least alike" pairs={least} />
      </div>
      <details className="rounded-md border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
          See every pair
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            Read across a row and down a column to a stock: the cell is how alike the two moved.
            Deeper colour means more alike; a dash means fewer than 60 shared trading days.
          </p>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
              <caption className="sr-only">
                Correlation of daily returns over the last year between your largest holdings, from
                −1 (opposite) to 1 (together). A dash means too few shared trading days.
              </caption>
              <thead>
                <tr>
                  <td />
                  {symbols.map((sym) => (
                    <th key={sym} scope="col" className="px-1.5 py-1 text-center font-medium">
                      <span className="block max-w-[5.5rem] truncate">{sym}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((row, i) => (
                  <tr key={row}>
                    <th scope="row" className="pr-2 text-left font-medium">
                      {row}
                    </th>
                    {symbols.map((col, j) => {
                      const v = cells[i]?.[j] ?? null;
                      return (
                        <td
                          key={col}
                          className={cn(
                            'h-9 min-w-[3.25rem] rounded-sm px-1 text-center',
                            v === null && 'text-muted-foreground',
                          )}
                          style={cellStyle(v)}
                        >
                          {v === null ? '—' : corr(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

function PairList({
  title,
  pairs,
}: {
  title: string;
  pairs: { a: string; b: string; v: number }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="flex justify-between gap-3 py-1.5 tabular-nums">
              <span className="min-w-0 truncate">
                {p.a} · {p.b}
              </span>
              <span className="shrink-0 text-right">
                <span className="font-medium">{corr(p.v)}</span>
                <span className="block text-xs text-muted-foreground">{togetherWord(p.v)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-stock table
// ---------------------------------------------------------------------------

type SortKey = 'weight' | 'volatility' | 'fall' | 'share';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'weight', label: 'Of your value' },
  { key: 'volatility', label: 'Volatility (1 year)' },
  { key: 'fall', label: 'Deepest fall (1 year)' },
  { key: 'share', label: 'Share of ups and downs' },
];

type StockRow = PortfolioRiskDto['stocks'][number];

const sortValue = (s: StockRow, key: SortKey): number | null =>
  key === 'weight'
    ? s.weight
    : key === 'volatility'
      ? s.volatility
      : key === 'fall'
        ? (s.deepestFall?.depth ?? null)
        : s.share;

function StockTable({ stocks }: { stocks: PortfolioRiskDto['stocks'] }) {
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: 'weight',
    desc: true,
  });
  const rows = [...stocks].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    // Rows without a figure always go last.
    if (va === null) return vb === null ? 0 : 1;
    if (vb === null) return -1;
    return sort.desc ? vb - va : va - vb;
  });
  const fmt = {
    weight: (s: StockRow) => pct(s.weight),
    volatility: (s: StockRow) => (s.volatility === null ? '—' : pct(s.volatility)),
    fall: (s: StockRow) => (s.deepestFall === null ? '—' : pct(s.deepestFall.depth)),
    share: (s: StockRow) => (s.share === null ? '—' : pct(s.share)),
  } satisfies Record<SortKey, (s: StockRow) => string>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Each holding over the last year. Select a column heading to sort.
          </caption>
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Stock
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined
                  }
                  className="py-1.5 pr-3 text-right font-medium last:pr-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))
                    }
                    className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                  >
                    {c.label}
                    <span aria-hidden className={cn(sort.key !== c.key && 'invisible')}>
                      {sort.desc ? '↓' : '↑'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {rows.map((s) => (
              <tr key={s.symbol}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  <span className="block">{s.symbol}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{s.name}</span>
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="py-1.5 pr-3 text-right last:pr-0">
                    {fmt[c.key](s)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {rows.map((s) => (
          <li key={s.symbol} className="py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{s.symbol}</span>
              <span className="tabular-nums text-muted-foreground">{fmt.weight(s)} of value</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
              <span>Volatility {fmt.volatility(s)}</span>
              <span>Deepest fall {fmt.fall(s)}</span>
              <span>Share of ups and downs {fmt.share(s)}</span>
            </div>
          </li>
        ))}
      </ul>
      {stocks.some((s) => s.volatility === null) && (
        <p className="text-xs text-muted-foreground">
          A dash: fewer than about six months of prices in the last year for that stock.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle">
      <h2 className="flex items-center gap-1 text-sm font-semibold">
        {title}
        <MetricHint>{hint}</MetricHint>
      </h2>
      {children}
    </section>
  );
}

export function RiskTab({ risk }: { risk: PortfolioRiskDto }) {
  const all = risk.volatility.all;
  const deepest = risk.deepestFall.status === 'ok' ? risk.deepestFall.value : null;
  const past = risk.basis === 'past_prices';
  const subject = past ? 'The shares you hold now' : 'Your holdings';
  return (
    <div className="flex flex-col gap-4">
      {past && (
        <p role="note" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          These figures use the{' '}
          <strong>shares you hold now at the last twelve months&apos; prices</strong>
          {risk.basisFrom !== null && <> (since {longDate(risk.basisFrom)})</>}, because your own
          record is shorter than a year. They show how this set of shares behaved, not your own
          history, and switch to your own record once it covers a year.
        </p>
      )}
      {risk.skippedDays > 0 && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {risk.skippedDays} {risk.skippedDays === 1 ? 'day was' : 'days were'} left out because a
          stock you held had no recent price.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Tile
          basis={risk.basis}
          label="Volatility"
          hint="How much your holdings' value moved up and down, as a yearly figure: the spread of daily returns × √252, over the last year, with money you added or took out removed. It describes the past, not what comes next."
          figure={risk.volatility.oneYear}
          value={(v) => pct(v)}
          sentence={(v) =>
            `In a typical year ${past ? 'their' : 'your'} value moved about ${pct(v)} up or down.`
          }
          footer={() => (all.status === 'ok' ? `All history: ${pct(all.value)}` : 'Last year')}
        />
        <Tile
          basis={risk.basis}
          label="Deepest fall"
          hint="The biggest drop from a high to the next low, since you started. Money you added or took out is removed, so only price moves count."
          figure={risk.deepestFall}
          value={(f) => (f.depth === 0 ? '0%' : pct(f.depth))}
          sentence={(f) => fallSentence(f, subject)}
        />
        <Tile
          basis={risk.basis}
          label="Beta against Nifty 50"
          hint="How strongly your holdings moved with Nifty 50 over the last year, on days both had a price: covariance ÷ Nifty's variance. 1 means in step; below 1, smaller moves; above 1, bigger. Nifty 50 here is a price index."
          figure={risk.beta}
          value={(b) => b.beta.toFixed(2)}
          sentence={(b) =>
            b.beta >= 0
              ? `When Nifty 50 moved 1%, ${past ? 'these shares' : 'your holdings'} moved about ${b.beta.toFixed(2)}% the same way, on average.`
              : `When Nifty 50 moved 1%, ${past ? 'these shares' : 'your holdings'} moved about ${Math.abs(b.beta).toFixed(2)}% the other way, on average.`
          }
          footer={(b) =>
            b.correlation === null ? null : `Correlation with Nifty 50: ${corr(b.correlation)}`
          }
        />
      </div>

      <Section
        title="Below the last high"
        hint="Each day, how far your holdings stood below their highest point so far. 0% is a new high. Money you added or took out is removed."
      >
        {risk.sessions < 2 ? (
          <p className="text-sm text-muted-foreground">Not enough history to draw yet.</p>
        ) : (
          <>
            <DrawdownChart points={risk.drawdown} deepest={deepest} />
            {deepest !== null && (
              <p className="text-sm text-muted-foreground">{fallSentence(deepest, subject)}</p>
            )}
          </>
        )}
      </Section>

      <Section
        title="Your stocks"
        hint="Each holding over the last year. Share of ups and downs: how much of your holdings' day-to-day movement came from that stock at today's weights. A bumpier stock carries more than its weight, one that moved against the rest can be negative, and the shares add up to 100%."
      >
        {risk.stocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">None of your holdings has a price yet.</p>
        ) : (
          <StockTable stocks={risk.stocks} />
        )}
      </Section>

      <Section
        title="Do your stocks move alike?"
        hint="Correlation of daily returns over the last year: −1 means opposite days, 0 unrelated, 1 the same days. Your largest holdings, up to 15. Needs 60 shared trading days for a pair."
      >
        <CorrelationGridView grid={risk.correlation} />
      </Section>

      <details className="rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <summary className="cursor-pointer text-sm font-semibold">How this is worked out</summary>
        <ul className="mt-3 flex max-w-prose list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            Daily return: the day&apos;s value less any money you added that day, divided by the day
            before&apos;s value. Days when a stock you held had no recent price are left out.
          </li>
          <li>
            Volatility: the standard deviation of daily returns over the last year, times √252
            (trading days in a year).
          </li>
          <li>
            Deepest fall: daily returns chained from the day you started; the biggest drop from a
            high to a later low.
          </li>
          <li>
            Beta: how your daily returns moved with Nifty 50&apos;s over the last year, on days both
            had a close. Nifty 50 is a price index, without dividends.
          </li>
          <li>
            Stock figures use each stock&apos;s own closes over the last year, with splits and
            bonuses taken out, whenever you added it.
          </li>
          <li>
            Figures need about six months of prices ({risk.minSessions} trading days). Until your
            own record is a year long, they use the shares you hold now at the last twelve
            months&apos; prices. They describe what happened, not what will.
          </li>
        </ul>
      </details>
    </div>
  );
}
