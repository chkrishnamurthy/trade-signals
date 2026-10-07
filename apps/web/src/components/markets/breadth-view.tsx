import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageDisclaimer,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Card } from '@/components/ui/card';
import { encodeFilter, stockHref } from '@/lib/screener-format';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import type { LeaderDto, MarketBreadthDto } from '@/server/market-breadth';

/**
 * Market breadth (plan §7): how many stocks are participating. Every tile and
 * list opens the screener pre-filled with the condition it counts.
 */

function signed(v: number | null, digits = 1, suffix = '%'): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}${suffix}`;
}

function sessionLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function screenHref(filter: Parameters<typeof encodeFilter>[0], universe: string): Route {
  const qs = new URLSearchParams({ f: encodeFilter(filter) });
  if (universe === 'nifty500') qs.set('u', 'index:nifty500');
  return `/screener?${qs.toString()}` as Route;
}

/** Diverging heat class: the value is always printed, colour only reinforces it. */
function heat(v: number | null): string {
  if (v === null) return 'bg-muted text-muted-foreground';
  if (v >= 6) return 'bg-bullish text-white dark:text-background';
  if (v >= 2.5) return 'bg-bullish/45';
  if (v >= 0.5) return 'bg-bullish/20';
  if (v > -0.5) return 'bg-muted';
  if (v > -2.5) return 'bg-bearish/20';
  if (v > -6) return 'bg-bearish/45';
  return 'bg-bearish text-white dark:text-background';
}

export function BreadthView({ data }: { data: MarketBreadthDto }) {
  const last = data.history[data.history.length - 1];
  const weekAgo = data.history[data.history.length - 6];
  const u = data.universe;

  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="gap-y-3">
          <PageHeading>
            <PageTitle>Market breadth</PageTitle>
            <PageDescription>
              How many stocks are participating — not just where the index closed.
            </PageDescription>
          </PageHeading>
          <PageActions className="flex-col items-stretch gap-1.5 sm:items-end">
            <fieldset
              aria-label="Universe"
              className="min-w-0 inline-flex self-start rounded-md border border-border bg-surface-sunken p-0.5 sm:self-end"
            >
              {(['all', 'nifty500'] as const).map((key) => (
                <Link
                  key={key}
                  href={
                    (key === 'all' ? '/markets/breadth' : '/markets/breadth?u=nifty500') as Route
                  }
                  aria-current={u === key ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-7 items-center rounded px-2.5 font-medium text-xs',
                    u === key
                      ? 'bg-surface text-foreground shadow-subtle'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {key === 'all' ? 'All NSE' : 'Nifty 500'}
                </Link>
              ))}
            </fieldset>
            {data.session !== null && (
              <span
                className={cn(
                  'text-2xs',
                  data.stale ? 'text-warning-strong' : 'text-muted-foreground',
                )}
              >
                Session {sessionLabel(data.session)}
                {data.stale ? ' — the nightly build has not run since' : ''}
              </span>
            )}
          </PageActions>
        </PageHeader>

        <PageContent>
          {last === undefined ? (
            <EmptyState
              title="Breadth has not been computed yet"
              description="It is built nightly from every stock’s end-of-day history, after the first snapshot."
            />
          ) : (
            <>
              <section
                aria-label="Breadth summary"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6"
              >
                <Tile
                  label="Advances / declines"
                  value={
                    <>
                      <span className={toneText({ tone: 'bullish' })}>
                        {last.advances.toLocaleString('en-IN')}
                      </span>
                      <span className="text-muted-foreground"> / </span>
                      <span className={toneText({ tone: 'bearish' })}>
                        {last.declines.toLocaleString('en-IN')}
                      </span>
                    </>
                  }
                  hint={`${last.unchanged} unchanged · A/D ${last.declines === 0 ? '—' : (last.advances / last.declines).toFixed(2)}`}
                  href={screenHref({ metric: 'changePct', cmp: 'gt', value: 0 }, u)}
                />
                {(
                  [
                    ['Above 200 EMA', 'above200Pct', 'closeVsEma200'],
                    ['Above 50 EMA', 'above50Pct', 'closeVsEma50'],
                    ['Above 20 EMA', 'above20Pct', 'closeVsEma20'],
                  ] as const
                ).map(([label, key, metric]) => (
                  <Tile
                    key={key}
                    label={label}
                    value={last[key] === null ? '—' : `${last[key]?.toFixed(1)}%`}
                    hint={
                      weekAgo === undefined || last[key] === null || weekAgo[key] === null
                        ? 'of stocks with enough history'
                        : `${signed((last[key] ?? 0) - (weekAgo[key] ?? 0), 1, ' pp')} this week`
                    }
                    href={screenHref({ metric, cmp: 'gt', value: 0 }, u)}
                  />
                ))}
                <Tile
                  label="New 52W highs / lows"
                  value={
                    <>
                      <span className={toneText({ tone: 'bullish' })}>{last.newHighs}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className={toneText({ tone: 'bearish' })}>{last.newLows}</span>
                    </>
                  }
                  hint="Open the highs in the screener"
                  href={screenHref({ metric: 'breakout52w', cmp: 'is', value: true }, u)}
                />
                <Tile
                  label="Delivery spikes"
                  value={
                    data.deliverySpikes === null ? '—' : data.deliverySpikes.toLocaleString('en-IN')
                  }
                  hint="≥ 1.5× average, up on volume"
                  href={screenHref(
                    {
                      op: 'and',
                      children: [
                        { metric: 'deliveryRatio', cmp: 'gte', value: 1.5 },
                        { metric: 'relVolume', cmp: 'gte', value: 1.5 },
                        { metric: 'changePct', cmp: 'gt', value: 0 },
                      ],
                    },
                    u,
                  )}
                />
              </section>

              <div className="grid gap-4 lg:grid-cols-5">
                <Card className="flex flex-col gap-2 p-4 lg:col-span-3">
                  <h2 className="font-semibold text-sm">
                    % of stocks above their 200 EMA · 1 year
                  </h2>
                  <ParticipationChart history={data.history} />
                </Card>
                <Card className="flex flex-col gap-2 p-4 lg:col-span-2">
                  <h2 className="font-semibold text-sm">New 52-week highs vs lows · 60 sessions</h2>
                  <HighsLowsChart history={data.history.slice(-60)} />
                </Card>
              </div>

              {data.industries.length > 0 && (
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold text-sm">Industry rotation</h2>
                    <span className="text-2xs text-muted-foreground">
                      Median return of classified stocks, % · sorted by 1M · every cell shows its
                      value
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
                      <thead>
                        <tr className="text-2xs text-muted-foreground uppercase tracking-wide">
                          <th scope="col" className="text-left font-medium">
                            Industry
                          </th>
                          <th scope="col" className="font-medium">
                            1D
                          </th>
                          <th scope="col" className="font-medium">
                            1W
                          </th>
                          <th scope="col" className="font-medium">
                            1M
                          </th>
                          <th scope="col" className="font-medium">
                            3M
                          </th>
                          <th scope="col" className="text-right font-medium">
                            Above 50 EMA
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.industries.map((row) => (
                          <tr key={row.industry}>
                            <th scope="row" className="text-left font-medium">
                              <Link
                                className="hover:underline"
                                href={screenHref(
                                  { metric: 'industry', cmp: 'in', value: [row.industry] },
                                  'all',
                                )}
                              >
                                {row.industry}
                              </Link>
                              <span className="ml-1 text-2xs text-muted-foreground">
                                {row.stocks}
                              </span>
                            </th>
                            {[row.change1d, row.ret1w, row.ret1m, row.ret3m].map((v, i) => (
                              <td
                                key={['1d', '1w', '1m', '3m'][i]}
                                className={cn(
                                  'figure rounded px-2 py-2 text-center font-medium text-xs',
                                  heat(
                                    v === null
                                      ? null
                                      : i === 0
                                        ? v * 3
                                        : i === 1
                                          ? v * 1.5
                                          : i === 3
                                            ? v * 0.7
                                            : v,
                                  ),
                                )}
                              >
                                {signed(v)}
                              </td>
                            ))}
                            <td className="figure text-right font-medium text-xs">
                              {row.above50Pct === null ? '—' : `${row.above50Pct.toFixed(0)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <section aria-label="Leaders" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Leaders
                  title="Delivery spikes"
                  rows={data.leaders.delivery}
                  metricLabel={(v) => (v === null ? '—' : `${v.toFixed(1)}%`)}
                />
                <Leaders
                  title="Unusual volume"
                  rows={data.leaders.volume}
                  metricLabel={(v) => (v === null ? '—' : `${v.toFixed(1)}×`)}
                />
                <Leaders
                  title="Long build-up"
                  rows={data.leaders.buildup}
                  metricLabel={(v) => `OI ${signed(v)}`}
                />
                <Leaders
                  title="New 52-week highs"
                  rows={data.leaders.highs}
                  metricLabel={(v) => (v === null ? '—' : `${v.toFixed(1)}× vol`)}
                />
              </section>
            </>
          )}
          <PageDisclaimer>
            Computed nightly from every listed equity’s split/bonus-adjusted NSE end-of-day history.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function Tile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  href: Route;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-subtle transition-colors hover:border-border-strong sm:px-4 sm:py-3"
    >
      <span className="truncate text-muted-foreground text-xs">{label}</span>
      <span className="figure font-medium text-2xl tracking-tight">{value}</span>
      <span className="truncate text-2xs text-muted-foreground">{hint}</span>
    </Link>
  );
}

function ParticipationChart({ history }: { history: MarketBreadthDto['history'] }) {
  const points = history.filter((d) => d.above200Pct !== null);
  if (points.length < 2)
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">Not enough history yet.</p>
    );
  const x = (i: number) => (i / (points.length - 1)) * 600;
  const y = (v: number) => 236 - (v / 100) * 232;
  const line = points
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.above200Pct ?? 0).toFixed(1)}`)
    .join('');
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
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

function HighsLowsChart({ history }: { history: MarketBreadthDto['history'] }) {
  if (history.length === 0)
    return (
      <p className="py-10 text-center text-muted-foreground text-sm">Not enough history yet.</p>
    );
  const max = Math.max(1, ...history.map((d) => Math.max(d.newHighs, d.newLows)));
  const w = 400 / history.length;
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
        {history.map((d, i) => {
          const hh = (d.newHighs / max) * 112;
          const lh = (d.newLows / max) * 96;
          return (
            <g key={d.date}>
              <title>{`${sessionLabel(d.date)}: ${d.newHighs} highs, ${d.newLows} lows`}</title>
              <rect
                x={i * w + 0.5}
                y={120 - hh}
                width={Math.max(0.5, w - 1)}
                height={hh}
                className="fill-bullish"
              />
              <rect
                x={i * w + 0.5}
                y={120}
                width={Math.max(0.5, w - 1)}
                height={lh}
                className="fill-bearish"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Leaders({
  title,
  rows,
  metricLabel,
}: {
  title: string;
  rows: readonly LeaderDto[];
  metricLabel: (v: number | null) => string;
}) {
  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold text-sm">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-3 text-muted-foreground text-xs">None on this session.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.symbol} className="border-border border-b last:border-b-0">
              <Link
                href={stockHref(r.symbol) as Route}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm hover:underline"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{r.symbol}</span>
                  <span className="truncate text-2xs text-muted-foreground">
                    {r.industry ?? r.name}
                  </span>
                </span>
                <span className="figure font-medium text-xs">{metricLabel(r.metric)}</span>
                <span
                  className={cn(
                    'figure w-14 text-right text-xs',
                    toneText({
                      tone:
                        (r.changePct ?? 0) > 0
                          ? 'bullish'
                          : (r.changePct ?? 0) < 0
                            ? 'bearish'
                            : 'neutral',
                    }),
                  )}
                >
                  {signed(r.changePct, 2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
