'use client';
import {
  formatPaise,
  type PaperPerformance,
  type PaperPerformanceReport,
  type PaperRange,
  paperPerformanceReportSchema,
} from '@equitywise/shared';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { API_ROUTES } from '@/lib/api-routes';
import { redirectToLoginIfUnauthenticated } from '@/lib/session-guard';
import { cn } from '@/lib/utils';
import { duration, EVENT, price, rate, signed } from './format';
import { Money } from './trades-table';

const SAMPLE: Record<
  PaperPerformance['sampleSize'],
  { label: string; tone: 'warning' | 'neutral' | 'bullish' }
> = {
  TOO_FEW: { label: 'Too few trades to judge', tone: 'warning' },
  EARLY: { label: 'Early read', tone: 'neutral' },
  OK: { label: 'Enough trades to read', tone: 'bullish' },
};
const RANGES: PaperRange[] = ['7d', '30d', '90d', 'all'];
const RANGE_LABEL: Record<PaperRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  all: 'All',
};

/** The headline figures for one group, with the honest interval on the win rate. */
export function Figures({ p }: { p: PaperPerformance }) {
  const items: [string, string][] = [
    [
      'Closed trades',
      `${p.closedTrades}${p.unresolvedTrades ? ` (+${p.unresolvedTrades} unavailable)` : ''}`,
    ],
    [
      'Win rate',
      p.winRate === null
        ? '—'
        : `${rate(p.winRate)} (likely ${rate(p.winRateLow95)}–${rate(p.winRateHigh95)})`,
    ],
    [
      'Average win / loss',
      `${price(p.averageWinPaise)} / ${price(p.averageLossPaise === null ? null : Math.abs(p.averageLossPaise))}`,
    ],
    ['Profit factor', p.profitFactor === null ? '—' : p.profitFactor.toFixed(2)],
    [
      'Expectancy per trade',
      p.expectancyPaise === null
        ? '—'
        : `${signed(p.expectancyPaise)}${p.expectancyTimesRisked === null ? '' : ` · ${p.expectancyTimesRisked.toFixed(2)}× the amount risked`}`,
    ],
    [
      'Target 1 / Target 2 / stop hit',
      `${rate(p.target1HitRate)} / ${rate(p.target2HitRate)} / ${rate(p.stopHitRate)}`,
    ],
    ['Average holding time', duration(p.averageHoldingMs)],
    [
      'Gross · charges · net',
      `${signed(p.grossPaise)} · −${formatPaise(p.chargesPaise)} · ${signed(p.netPaise)}`,
    ],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A plain SVG line: equity over the range. A number cannot say the shape of a curve. */
export function EquityCurve({
  points,
  start,
}: {
  points: { at: number; equityPaise: number | null }[];
  start: number;
}) {
  const xs = points.filter((p): p is { at: number; equityPaise: number } => p.equityPaise !== null);
  if (xs.length < 2)
    return (
      <p className="text-xs text-muted-foreground">Equity curve appears after two snapshots.</p>
    );
  const w = 600;
  const h = 120;
  const min = Math.min(start, ...xs.map((p) => p.equityPaise));
  const max = Math.max(start, ...xs.map((p) => p.equityPaise));
  const span = max - min || 1;
  const t0 = xs[0]?.at ?? 0;
  const t1 = xs[xs.length - 1]?.at ?? 1;
  const x = (at: number) => ((at - t0) / (t1 - t0 || 1)) * (w - 8) + 4;
  const y = (v: number) => h - 8 - ((v - min) / span) * (h - 16);
  const d = xs
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.equityPaise).toFixed(1)}`)
    .join(' ');
  const last = xs[xs.length - 1]?.equityPaise ?? start;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-32 w-full"
        role="img"
        aria-label={`Equity from ${price(xs[0]?.equityPaise)} to ${price(last)}`}
      >
        <line
          x1={4}
          x2={w - 4}
          y1={y(start)}
          y2={y(start)}
          className="stroke-border"
          strokeDasharray="4 4"
        />
        <path
          d={d}
          fill="none"
          className={cn(
            'stroke-2',
            last >= start ? 'stroke-bullish-strong' : 'stroke-bearish-strong',
          )}
        />
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        Dashed line: starting capital {price(start)}. Latest {price(last)}.
      </figcaption>
    </figure>
  );
}

function Attribution({
  title,
  rows,
  label,
}: {
  title: string;
  rows: PaperPerformance[];
  label?: (g: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <TableContainer className="mt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Win rate</TableHead>
              <TableHead className="text-right">Profit factor</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Sample</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.group}>
                <TableCell className="font-medium">{label ? label(r.group) : r.group}</TableCell>
                <TableCell className="text-right tabular-nums">{r.closedTrades}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.winRate === null
                    ? '—'
                    : `${rate(r.winRate)} (${rate(r.winRateLow95)}–${rate(r.winRateHigh95)})`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.profitFactor === null ? '—' : r.profitFactor.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <Money v={r.netPaise} />
                </TableCell>
                <TableCell>
                  <Badge variant={SAMPLE[r.sampleSize].tone}>{SAMPLE[r.sampleSize].label}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

export function PerformanceReport({ report }: { report: PaperPerformanceReport }) {
  const p = report.portfolio;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SAMPLE[p.sampleSize].tone}>{SAMPLE[p.sampleSize].label}</Badge>
        <span className="text-xs text-muted-foreground">
          {p.closedTrades} closed trade{p.closedTrades === 1 ? '' : 's'} in the range · max drawdown{' '}
          {price(report.maxDrawdown.paise)}
          {report.maxDrawdown.bps === null
            ? ''
            : ` (${(report.maxDrawdown.bps / 100).toFixed(2)}%)`}
        </span>
      </div>
      <Figures p={p} />
      <EquityCurve points={report.equityCurve} start={report.startingCapitalPaise} />
      {report.dailyNet.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Net by day</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {report.dailyNet.slice(-20).map((d) => (
              <li
                key={d.tradingDate}
                className="rounded border border-border px-2 py-1 tabular-nums"
              >
                <span className="text-muted-foreground">{d.tradingDate.slice(5)}</span>{' '}
                <Money v={d.netPaise} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Attribution title="By strategy" rows={report.byStrategy} />
      <Attribution title="By strategy version" rows={report.byVersion} />
      <Attribution title="By stock" rows={report.byInstrument} />
      <Attribution
        title="By exit"
        rows={report.byExitReason}
        label={(g) => EVENT[g as keyof typeof EVENT] ?? g}
      />
    </div>
  );
}

export function PerformanceCard({ initial }: { initial?: PaperPerformanceReport }) {
  const [range, setRange] = useState<PaperRange>('30d');
  const [report, setReport] = useState<PaperPerformanceReport | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch(API_ROUTES.paperPerformance(range), { cache: 'no-store' })
      .then(async (response) => {
        if (redirectToLoginIfUnauthenticated(response)) return;
        const json: unknown = await response.json();
        if (!response.ok) throw new Error('Performance figures are unavailable right now.');
        if (!cancelled) {
          setReport(paperPerformanceReportSchema.parse(json));
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Performance figures are unavailable.');
      });
    return () => {
      cancelled = true;
    };
  }, [range, initial]);
  return (
    <Card aria-labelledby="performance-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="performance-title">Performance (simulated)</CardTitle>
          <CardDescription>
            Net of estimated charges. Win rates show the range they are likely to fall in — 6 of 10
            is not 60%. No annualised figures: not enough sessions to mean anything.
          </CardDescription>
        </CardHeading>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Range</legend>
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              aria-pressed={r === range}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent>
        {report ? (
          <PerformanceReport report={report} />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
