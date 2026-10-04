'use client';

import {
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LineChartIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cuePosition } from '@/lib/ratio-board';
import { encodeFilter, type Formatted } from '@/lib/screener-format';
import type { StockPageDto } from '@/lib/stock-types';
import { TONE_GLYPH, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { AddToWatchlist } from './add-to-watchlist';

/**
 * The stock page's introduction (stock-header plan §2, §5.1): who the company
 * is, where to find it, and a price band — today's close, the last three
 * months as a line and the close's place in its 52-week range.
 *
 * Every link goes somewhere real (NSE's quote page, a screener filtered to the
 * same industry or index, the F&O tab). Nothing here is order-shaped.
 */

const SERIES_MEANING: Readonly<Record<string, string>> = {
  EQ: 'Rolling settlement: intraday trades net off.',
  BE: 'Trade-for-trade: every trade settles by delivery.',
  BZ: 'Trade-for-trade, restricted: every trade settles by delivery.',
};

/** 63 sessions back plus today: the same closes the 3M return compares. */
const SPARK_CLOSES = 64;

function initials(name: string, symbol: string): string {
  const words = name
    .replace(/\b(limited|ltd|ltd\.|india)\b/gi, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0);
  const first = words[0]?.[0];
  const second = words[1]?.[0];
  if (first === undefined) return symbol.slice(0, 2);
  return `${first}${second ?? words[0]?.[1] ?? ''}`.toUpperCase();
}

function screenerHref(filter: Parameters<typeof encodeFilter>[0]): Route {
  return `/screener?f=${encodeURIComponent(encodeFilter(filter))}` as Route;
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

export function StockHeader({
  data,
  close,
  change,
  ret3m,
  low52w,
  high52w,
  fromHigh,
  formatPrice,
  onExport,
  onOpenFno,
}: {
  data: StockPageDto;
  close: Formatted;
  change: number | null;
  ret3m: Formatted;
  low52w: number | null;
  high52w: number | null;
  fromHigh: Formatted;
  formatPrice: (paise: number) => string;
  onExport: () => void;
  onOpenFno: () => void;
}) {
  const { toast } = useToast();
  const fno = data.values?.fnoEligible === true;
  const tone =
    change === null ? 'neutral' : change > 0 ? 'bullish' : change < 0 ? 'bearish' : 'neutral';
  const closes = data.bars.slice(-SPARK_CLOSES).map((b) => b.c);
  const lastClose = typeof data.values?.close === 'number' ? data.values.close : null;

  const copyIsin = async () => {
    if (data.isin === null) return;
    try {
      await navigator.clipboard.writeText(data.isin);
      toast({ title: 'ISIN copied', description: data.isin, variant: 'success' });
    } catch {
      toast({ title: 'Could not copy the ISIN', variant: 'warning' });
    }
  };

  return (
    <Card className="overflow-hidden p-0" aria-labelledby="stock-name">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display font-semibold text-lg text-primary ring-1 ring-primary/20 sm:size-14 sm:text-xl"
            >
              {initials(data.name, data.symbol)}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1
                id="stock-name"
                className="font-display font-semibold text-2xl leading-tight tracking-tight sm:text-3xl"
              >
                {data.name}
              </h1>
              <p className="figure flex flex-wrap items-center gap-x-1.5 font-mono text-muted-foreground text-xs">
                <span className="font-semibold text-foreground">{data.symbol}</span>
                <span aria-hidden>·</span>
                <span>NSE</span>
                {data.series !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{data.series}</span>
                  </>
                )}
                {data.industry !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-sans">{data.industry}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" onClick={onExport} className="max-sm:px-2.5">
              <DownloadIcon aria-hidden />
              <span className="max-sm:sr-only">Export CSV</span>
            </Button>
            <div className="flex-1 sm:flex-none [&>button]:w-full">
              <AddToWatchlist symbol={data.symbol} />
            </div>
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Identifiers and groups">
          <li>
            <a
              href={`https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(data.symbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={CHIP}
            >
              <ExternalLinkIcon aria-hidden className="size-3.5 text-muted-foreground" />
              NSE: <span className="font-semibold">{data.symbol}</span>
            </a>
          </li>
          {data.isin !== null && (
            <li>
              <button type="button" onClick={() => void copyIsin()} className={CHIP}>
                <CopyIcon aria-hidden className="size-3.5 text-muted-foreground" />
                ISIN <span className="font-mono text-2xs">{data.isin}</span>
              </button>
            </li>
          )}
          {fno && (
            <li>
              <button type="button" onClick={onOpenFno} className={CHIP}>
                <LineChartIcon aria-hidden className="size-3.5 text-muted-foreground" />
                F&amp;O
              </button>
            </li>
          )}
          {data.series !== null && (
            <li>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: focus reveals what the series means
                    tabIndex={0}
                    className={cn(
                      CHIP,
                      'cursor-help',
                      data.series !== 'EQ' &&
                        'border-warning-line bg-warning-soft text-warning-foreground',
                    )}
                  >
                    Series {data.series}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-60">
                  {SERIES_MEANING[data.series] ?? 'NSE trading series.'}
                </TooltipContent>
              </Tooltip>
            </li>
          )}
          {data.industry !== null && (
            <li>
              <Link
                href={screenerHref({
                  op: 'and',
                  children: [{ metric: 'industry', cmp: 'is', value: data.industry }],
                })}
                className={CHIP}
              >
                {data.industry}{' '}
                <span aria-hidden className="text-muted-foreground">
                  ›
                </span>
              </Link>
            </li>
          )}
          {data.indices.slice(0, 3).map((index) => (
            <li key={index.key}>
              <Link
                href={screenerHref({
                  op: 'and',
                  children: [{ metric: 'indexKeys', cmp: 'in', value: [index.key] }],
                })}
                className={CHIP}
              >
                {index.label}
              </Link>
            </li>
          ))}
          {data.indices.length > 3 && (
            <li>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className={CHIP}>
                    +{data.indices.length - 3}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {data.indices
                    .slice(3)
                    .map((i) => i.label)
                    .join(', ')}
                </TooltipContent>
              </Tooltip>
            </li>
          )}
        </ul>

        {data.match !== null && (
          <section
            aria-label="Why this stock matched"
            className={cn(
              'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              data.match.matched
                ? 'border-info-line bg-info-soft'
                : 'border-warning-line bg-warning-soft',
            )}
          >
            {data.match.matched ? (
              <CheckCircle2Icon aria-hidden className="size-4 shrink-0 text-info" />
            ) : (
              <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-warning" />
            )}
            <span className="font-medium">
              {data.match.matched
                ? `Matched${data.match.screenName ? ` “${data.match.screenName}”` : ''} because`
                : 'No longer matches this screen on the latest session'}
            </span>
            {data.match.reasons.map((r) => (
              <Badge key={r} variant="outline" className="bg-surface">
                {r}
              </Badge>
            ))}
          </section>
        )}
      </div>

      <div className="grid gap-px border-border border-t bg-border md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col justify-center gap-0.5 bg-surface-sunken px-4 py-3 sm:px-5">
          <div className="flex items-baseline gap-2.5">
            <span className="figure font-display font-semibold text-3xl tracking-tight">
              {close.text}
            </span>
            {change !== null && (
              <span className={cn('figure font-semibold text-sm', toneText({ tone }))}>
                {TONE_GLYPH[tone]} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
          <span className="text-2xs text-muted-foreground">
            {data.session === null
              ? 'No snapshot yet'
              : `Close · ${sessionLabel(data.session)} · NSE end of day`}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-3 bg-surface-sunken px-4 py-3 sm:px-5">
          <div className="flex shrink-0 flex-col">
            <span className="text-2xs text-muted-foreground">3 months</span>
            <span
              className={cn(
                'figure font-semibold text-sm',
                ret3m.tone !== null && toneText({ tone: ret3m.tone }),
              )}
            >
              {ret3m.text}
            </span>
          </div>
          <Sparkline closes={closes} />
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-1.5 bg-surface-sunken px-4 py-3 sm:px-5 md:col-span-2 lg:col-span-1">
          <div className="figure flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
            <span>52W low {low52w === null ? '—' : formatPrice(low52w)}</span>
            <span className="text-foreground">
              {fromHigh.text === '—' ? '' : `${fromHigh.text} from high`}
            </span>
            <span>52W high {high52w === null ? '—' : formatPrice(high52w)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-bearish-soft via-muted to-bullish-soft ring-1 ring-border ring-inset">
            {low52w !== null && high52w !== null && lastClose !== null && high52w > low52w && (
              <span
                role="img"
                aria-label={`Close at ${cuePosition(lastClose, low52w, high52w).toFixed(0)}% of the 52-week range`}
                className="-top-1 absolute h-4 w-1 -translate-x-1/2 rounded-sm bg-foreground"
                style={{ left: `${cuePosition(lastClose, low52w, high52w)}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {data.stale && data.session !== null && (
        <p className="flex items-center gap-2 border-warning-line border-t bg-warning-soft px-4 py-2 text-sm text-warning-foreground sm:px-5">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          These figures are from {sessionLabel(data.session)}; this stock has no newer session.
        </p>
      )}
    </Card>
  );
}

const CHIP =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-xs hover:border-border-strong hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';

/** The last three months of closes as one line; colour follows the period's sign. */
function Sparkline({ closes }: { closes: readonly number[] }) {
  if (closes.length < 2) {
    return <span className="text-2xs text-muted-foreground">Not enough history</span>;
  }
  const w = 240;
  const h = 40;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - 3 - ((c - min) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  const up = last >= first;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-10 min-w-0 flex-1"
      role="img"
      aria-label={`Closes over the last ${closes.length} sessions, ${up ? 'up' : 'down'} overall`}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        className={up ? 'stroke-positive' : 'stroke-negative'}
      />
    </svg>
  );
}
