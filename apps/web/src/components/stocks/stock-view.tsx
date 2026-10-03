'use client';

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  ListPlusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent, PageDisclaimer } from '@/components/layout/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { API_ROUTES } from '@/lib/api-routes';
import { formatMetric, stockHref } from '@/lib/screener-format';
import type { MetricDto, ScreenerCellValue } from '@/lib/screener-types';
import type { StockPageDto } from '@/lib/stock-types';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { PriceChart } from './price-chart';

/**
 * One stock in full (plan §6): what the price is doing and why it surfaced,
 * from stored end-of-day data only. Technical vocabulary throughout — no
 * order-shaped affordance, no recommendation, no fundamentals in V1.
 */

type Values = Readonly<Record<string, ScreenerCellValue>>;

function useFmt(metrics: readonly MetricDto[], values: Values | null) {
  const map = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);
  return {
    def: (key: string) => map.get(key),
    f: (key: string) => formatMetric(map.get(key), values?.[key] ?? null),
    num: (key: string): number | null => {
      const v = values?.[key];
      return typeof v === 'number' ? v : null;
    },
    raw: (key: string) => values?.[key] ?? null,
  };
}

function Toned({ text, tone }: { text: string; tone: ReturnType<typeof formatMetric>['tone'] }) {
  return <span className={cn('figure', tone !== null && toneText({ tone }))}>{text}</span>;
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

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const TABS = [
  'technicals',
  'delivery',
  'fno',
  'ownership',
  'announcements',
  'events',
  'signal',
] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  technicals: 'Technicals',
  delivery: 'Delivery & deals',
  fno: 'F&O',
  ownership: 'Ownership',
  announcements: 'Announcements',
  events: 'Events',
  signal: 'Signal',
};

export function StockView({ data, backHref }: { data: StockPageDto; backHref: string | null }) {
  const router = useRouter();
  const { f, num, raw, def } = useFmt(data.metrics, data.values);
  const [tab, setTab] = useState<Tab>('technicals');
  const tabs = TABS.filter((t) => t !== 'signal' || data.signal !== null);

  const close = num('close');
  const change = num('changePct');
  const high = num('high52w') ?? (raw('high52w') as number | null);
  const low = num('low52w');
  const position =
    close !== null && high !== null && low !== null && high > low
      ? ((close - low) / (high - low)) * 100
      : null;
  const fno = raw('fnoEligible') === true;

  return (
    <AppShell onSearchSelect={(symbol) => router.push(stockHref(symbol) as Route)}>
      <PageContainer>
        <PageContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={(backHref ?? '/screener') as Route}
              className="inline-flex h-8 items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
            >
              <ArrowLeftIcon aria-hidden className="size-4" />
              {backHref === null
                ? 'Screener'
                : `Back to screen${data.match?.screenName ? ` · ${data.match.screenName}` : ''}`}
            </Link>
          </div>

          {data.match !== null && (
            <section
              aria-label="Why this stock matched"
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3',
                data.match.matched
                  ? 'border-info-line bg-info-soft'
                  : 'border-warning-line bg-warning-soft',
              )}
            >
              {data.match.matched ? (
                <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              ) : (
                <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="flex min-w-0 flex-col gap-2">
                <p className="font-medium text-sm">
                  {data.match.matched
                    ? 'Matched because'
                    : 'No longer matches this screen on the latest session'}
                </p>
                {data.match.reasons.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {data.match.reasons.map((r) => (
                      <li key={r}>
                        <Badge variant="outline" className="bg-surface">
                          {r}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display font-semibold text-3xl tracking-tight">
                    {data.symbol}
                  </h1>
                  {data.series !== null && <Badge variant="neutral">NSE · {data.series}</Badge>}
                  {data.indexLabels.slice(0, 2).map((l) => (
                    <Badge key={l} variant="neutral">
                      {l}
                    </Badge>
                  ))}
                  {fno && <Badge variant="neutral">F&amp;O</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">
                  {data.name}
                  {data.industry !== null && ` · ${data.industry}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="figure font-semibold text-3xl tracking-tight">
                    {f('close').text}
                  </span>
                  {change !== null && (
                    <span
                      className={cn(
                        'figure font-medium text-sm',
                        toneText({
                          tone: change > 0 ? 'bullish' : change < 0 ? 'bearish' : 'neutral',
                        }),
                      )}
                    >
                      {change > 0 ? '▲' : change < 0 ? '▼' : '→'} {f('changePct').text}
                    </span>
                  )}
                  <span className="text-2xs text-muted-foreground">
                    {data.session === null
                      ? 'No snapshot yet'
                      : `Close · ${sessionLabel(data.session)} · NSE end-of-day`}
                  </span>
                </div>
                <AddToWatchlist symbol={data.symbol} />
              </div>
            </div>

            {data.stale && data.session !== null && (
              <p className="flex items-center gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                <TriangleAlertIcon aria-hidden className="size-4" />
                These figures are from {sessionLabel(data.session)}; this stock has no newer
                session.
              </p>
            )}

            {position !== null && low !== null && high !== null && (
              <div className="flex flex-col gap-1.5">
                <div className="figure flex justify-between gap-2 text-2xs text-muted-foreground">
                  <span>52W low {formatMetric(def('close'), low).text}</span>
                  <span className="text-foreground">
                    {f('dist52wHigh').text} from the 52-week high
                  </span>
                  <span>52W high {formatMetric(def('close'), high).text}</span>
                </div>
                <div className="relative h-2 rounded-full border border-border bg-gradient-to-r from-bearish-soft via-muted to-bullish-soft">
                  <span
                    aria-label={`Close at ${position.toFixed(0)}% of the 52-week range`}
                    role="img"
                    className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-foreground"
                    style={{ left: `${Math.min(100, Math.max(0, position))}%` }}
                  />
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3 xl:grid-cols-6">
              <Stat
                label="Relative volume"
                value={f('relVolume')}
                hint={`avg ${f('avgVolume20').text}`}
              />
              <Stat
                label="Delivery"
                value={f('deliveryPct')}
                hint={`20D avg ${f('avgDelivery20').text}`}
              />
              <Stat label="ATR (14)" value={f('atrPct')} hint={f('atr14').text} />
              <Stat label="RS rank (3M)" value={f('rsRank')} hint={`vs Nifty ${f('rs3m').text}`} />
              <Stat
                label="OI build-up"
                value={fno ? f('oiBuildup') : { text: 'Not in F&O', tone: null, badge: false }}
                hint={fno ? `OI ${f('futOiChgPct').text}` : 'no stock futures'}
              />
              <Stat
                label="Promoter"
                value={f('promoterPct')}
                hint={`QoQ ${f('promoterChgQoq').text}`}
              />
            </dl>
          </Card>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Card className="p-4">
                <PriceChart
                  bars={data.bars}
                  ema20={data.ema20}
                  ema50={data.ema50}
                  actions={data.corporateActions}
                  symbol={data.symbol}
                />
              </Card>

              <Card className="overflow-hidden">
                <div
                  role="tablist"
                  aria-label="Analysis"
                  className="flex gap-1 overflow-x-auto border-border border-b px-2"
                >
                  {tabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      id={`tab-${t}`}
                      aria-selected={tab === t}
                      aria-controls={`panel-${t}`}
                      onClick={() => setTab(t)}
                      className={cn(
                        '-mb-px h-11 shrink-0 cursor-pointer border-b-2 px-3 text-sm',
                        tab === t
                          ? 'border-primary font-medium text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {TAB_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id={`panel-${tab}`}
                  aria-labelledby={`tab-${tab}`}
                  className="p-4"
                >
                  {tab === 'technicals' && (
                    <Technicals values={data.values} metrics={data.metrics} />
                  )}
                  {tab === 'delivery' && <DeliveryTab data={data} />}
                  {tab === 'fno' && <FnoTab data={data} />}
                  {tab === 'ownership' && <OwnershipTab data={data} />}
                  {tab === 'announcements' && <AnnouncementsTab data={data} />}
                  {tab === 'events' && <EventsTab data={data} />}
                  {tab === 'signal' && data.signal !== null && <SignalTab signal={data.signal} />}
                </div>
              </Card>
            </div>

            <aside
              className="flex w-full shrink-0 flex-col gap-4 xl:w-[22rem]"
              aria-label="Levels and context"
            >
              <Card className="p-4">
                <h2 className="mb-1 font-semibold text-sm">Technical levels</h2>
                {data.levels.length === 0 ? (
                  <p className="py-3 text-muted-foreground text-xs">
                    Levels appear once this stock has a snapshot.
                  </p>
                ) : (
                  <ul>
                    {data.levels.map((l) => {
                      const d = close === null || close === 0 ? null : (l.paise / close - 1) * 100;
                      return (
                        <li
                          key={l.label}
                          className="flex items-center justify-between gap-2 border-border border-b py-2 text-sm last:border-b-0"
                        >
                          <span className="flex items-center gap-1.5">
                            {l.label}
                            {l.note !== null && (
                              <Badge size="sm" variant="neutral">
                                {l.note}
                              </Badge>
                            )}
                          </span>
                          <span className="flex items-baseline gap-3">
                            <span className="figure font-mono text-xs">
                              {formatMetric(def('close'), l.paise).text}
                            </span>
                            <span className="figure w-14 text-right text-muted-foreground text-xs">
                              {d === null
                                ? '—'
                                : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}%`}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm">Relative strength vs Nifty 50</h2>
                  {raw('rsNewHigh') === true && <Badge variant="bullish">RS at 52W high</Badge>}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {(['rs1m', 'rs3m', 'rs6m'] as const).map((k, i) => (
                    <div key={k} className="rounded-md bg-surface-sunken px-2 py-2">
                      <dt className="text-2xs text-muted-foreground">
                        {['1 month', '3 months', '6 months'][i]}
                      </dt>
                      <dd className="font-semibold text-sm">
                        <Toned {...f(k)} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-2xs text-muted-foreground">
                  Stock return minus the Nifty 50’s over the same sessions, in percentage points.
                </p>
              </Card>

              <Card className="p-4">
                <h2 className="mb-1 font-semibold text-sm">
                  Peers{data.industry !== null ? ` · ${data.industry}` : ''}
                </h2>
                {data.peers.length === 0 ? (
                  <p className="py-3 text-muted-foreground text-xs">
                    No classified peers for this stock.
                  </p>
                ) : (
                  <ul>
                    {data.peers.map((p) => (
                      <li key={p.symbol} className="border-border border-b last:border-b-0">
                        <Link
                          href={stockHref(p.symbol) as Route}
                          className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium">{p.symbol}</span>
                            <span className="truncate text-2xs text-muted-foreground">
                              RS {p.rsRank ?? '—'} · 3M{' '}
                              <Toned {...formatMetric(def('ret3m'), p.ret3m)} />
                            </span>
                          </span>
                          <span className="flex flex-col items-end">
                            <span className="figure font-mono text-xs">
                              {formatMetric(def('close'), p.close).text}
                            </span>
                            <Toned {...formatMetric(def('changePct'), p.changePct)} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>

          <PageDisclaimer>
            Prices are split/bonus-adjusted NSE end-of-day values. Readings describe price
            structure, not advice. Fundamentals are not shown in this version.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReturnType<typeof formatMetric>;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-border border-r border-b px-3 py-2.5 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(6n)]:border-r-0">
      <dt className="truncate text-2xs text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold text-lg">
        <Toned {...value} />
      </dd>
      <dd className="figure truncate text-2xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function AddToWatchlist({ symbol }: { symbol: string }) {
  const [lists, setLists] = useState<readonly { id: number; name: string }[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const load = async () => {
    if (lists !== null) return;
    const r = await fetch(API_ROUTES.watchlists);
    const body = (await r.json().catch(() => [])) as unknown;
    const rows = Array.isArray(body)
      ? body
      : ((body as { watchlists?: unknown[] }).watchlists ?? []);
    setLists(
      rows.flatMap((w) =>
        typeof w === 'object' && w !== null && 'id' in w && 'name' in w
          ? [{ id: Number(w.id), name: String(w.name) }]
          : [],
      ),
    );
  };
  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <Button>
          <ListPlusIcon aria-hidden />
          Add to watchlist
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        {status !== null && <p className="px-2 py-1.5 text-muted-foreground text-xs">{status}</p>}
        {lists === null ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">Create a watchlist first.</p>
        ) : (
          lists.map((w) => (
            <button
              key={w.id}
              type="button"
              className="w-full cursor-pointer truncate rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={async () => {
                const r = await fetch(`${API_ROUTES.watchlist(w.id)}/items`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbols: [symbol] }),
                });
                setStatus(r.ok ? `Added to ${w.name}.` : 'Could not add it.');
              }}
            >
              {w.name}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Four reading cards; each badge is a fixed rule over the stored values, stated in its summary. */
function Technicals({ values, metrics }: { values: Values | null; metrics: readonly MetricDto[] }) {
  const { f, raw, num } = useFmt(metrics, values);
  if (values === null)
    return (
      <p className="text-muted-foreground text-sm">
        Technicals appear once this stock has a snapshot.
      </p>
    );
  const stack = raw('emaStack');
  const rsi = num('rsi14');
  const patterns = [
    'insideBar',
    'outsideBar',
    'bullishEngulfing',
    'bearishEngulfing',
    'hammer',
    'shootingStar',
    'doji',
  ]
    .filter((k) => raw(k) === true)
    .map((k) => metrics.find((m) => m.key === k)?.label ?? k);
  const cards: {
    title: string;
    badge: string;
    tone: 'bullish' | 'bearish' | 'neutral';
    summary: string;
    rows: [string, string][];
  }[] = [
    {
      title: 'Trend',
      badge:
        stack === 'bullish'
          ? 'EMAs stacked up'
          : stack === 'bearish'
            ? 'EMAs stacked down'
            : stack === 'mixed'
              ? 'Mixed'
              : 'Warming up',
      tone: stack === 'bullish' ? 'bullish' : stack === 'bearish' ? 'bearish' : 'neutral',
      summary: 'Where the close sits against its moving averages, and trend strength.',
      rows: [
        ['Close vs EMA 20', f('closeVsEma20').text],
        ['Close vs EMA 50', f('closeVsEma50').text],
        ['Close vs EMA 200', f('closeVsEma200').text],
        [
          'Supertrend (10, 3)',
          `${f('supertrendDir').text}${raw('supertrendFlipDays') === null ? '' : ` · flipped ${f('supertrendFlipDays').text}`}`,
        ],
        ['ADX (14)', f('adx14').text],
      ],
    },
    {
      title: 'Momentum',
      badge:
        rsi === null
          ? 'Warming up'
          : rsi >= 60
            ? 'RSI above 60'
            : rsi <= 40
              ? 'RSI below 40'
              : 'RSI 40–60',
      tone: rsi === null ? 'neutral' : rsi >= 60 ? 'bullish' : rsi <= 40 ? 'bearish' : 'neutral',
      summary: 'Oscillators and how they have moved recently.',
      rows: [
        ['RSI (14)', f('rsi14').text],
        [
          'MACD histogram',
          `${f('macdHist').text}${raw('macdHistRising') === true ? ' · rising' : raw('macdHistRising') === false ? ' · falling' : ''}`,
        ],
        ['Stochastic %K / %D', `${f('stochK').text} / ${f('stochD').text}`],
        ['Rate of change (20)', f('roc20').text],
      ],
    },
    {
      title: 'Volatility & range',
      badge:
        raw('bbSqueeze') === true
          ? 'Bollinger squeeze'
          : raw('nr7') === true
            ? 'NR7'
            : 'No squeeze',
      tone: 'neutral',
      summary: 'How wide the recent range is compared with its own history.',
      rows: [
        ['ATR (14)', `${f('atr14').text} · ${f('atrPct').text}`],
        ['Bollinger width', f('bbWidth').text],
        ['20-session range', f('range20Pct').text],
        ['Volatility (20, ann.)', f('volatility20').text],
      ],
    },
    {
      title: 'Structure',
      badge:
        raw('breakout52w') === true
          ? 'Above 52W high'
          : raw('breakout20d') === true
            ? 'Above 20-session high'
            : raw('breakdown52w') === true
              ? 'Below 52W low'
              : raw('breakdown20d') === true
                ? 'Below 20-session low'
                : 'Inside its range',
      tone:
        raw('breakout20d') === true
          ? 'bullish'
          : raw('breakdown20d') === true
            ? 'bearish'
            : 'neutral',
      summary: 'Breakouts, swing structure and today’s candle.',
      rows: [
        ['Higher highs and lows (10 v 10)', f('higherHighs').text],
        ['Gap at the open', f('gapPct').text],
        ['Close in day’s range', f('rangePosDay').text],
        ['Candle patterns today', patterns.length === 0 ? 'None' : patterns.join(', ')],
      ],
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {cards.map((c) => (
        <section key={c.title} className="rounded-lg border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">{c.title}</h3>
            <Badge variant={c.tone}>{c.badge}</Badge>
          </div>
          <p className="mt-0.5 mb-1.5 text-muted-foreground text-xs">{c.summary}</p>
          <dl>
            {c.rows.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-3 border-border border-b py-1.5 text-sm last:border-b-0"
              >
                <dt>{k}</dt>
                <dd className="figure text-right font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {raw('dataIssue') !== null && (
        <p className="text-warning-foreground text-xs md:col-span-2">
          History-dependent readings are withheld: the stored series has an overnight jump with no
          recorded split or bonus.
        </p>
      )}
    </div>
  );
}

function DeliveryTab({ data }: { data: StockPageDto }) {
  const avg = typeof data.values?.avgDelivery20 === 'number' ? data.values.avgDelivery20 : null;
  const rows = data.delivery.slice(-60);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-sm">Delivery % · last {rows.length} sessions</h3>
          <span className="text-2xs text-muted-foreground">
            Dashed line = 20-session average · NSE bhavcopy
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No delivery data recorded for this stock yet (trade-to-trade series report no delivery
            split).
          </p>
        ) : (
          <svg
            viewBox="0 0 600 140"
            preserveAspectRatio="none"
            className="h-36 w-full"
            role="img"
            aria-label={`Delivery percentage, latest ${rows.at(-1)?.pct.toFixed(1)}%`}
          >
            {rows.map((d, i) => {
              const w = 600 / rows.length;
              const h = (Math.min(100, d.pct) / 100) * 132;
              return (
                <rect
                  key={d.date}
                  x={i * w + 1}
                  y={136 - h}
                  width={Math.max(1, w - 2)}
                  height={h}
                  className={avg !== null && d.pct > avg ? 'fill-bullish' : 'fill-border-strong'}
                >
                  <title>{`${shortDate(d.date)}: ${d.pct.toFixed(1)}%`}</title>
                </rect>
              );
            })}
            {avg !== null && (
              <line
                x1={0}
                x2={600}
                y1={136 - (avg / 100) * 132}
                y2={136 - (avg / 100) * 132}
                className="stroke-muted-foreground"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-semibold text-sm">Bulk &amp; block deals</h3>
        {data.deals.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bulk or block deals on record.</p>
        ) : (
          <ul>
            {data.deals.map((d) => (
              <li
                key={`${d.date}-${d.client}-${d.side}-${d.quantity}`}
                className="grid grid-cols-[6rem_3.5rem_minmax(0,1fr)_auto] items-center gap-2 border-border border-b py-2 text-sm last:border-b-0"
              >
                <span className="figure text-muted-foreground text-xs">{shortDate(d.date)}</span>
                <Badge size="sm" variant="neutral" className="capitalize">
                  {d.type}
                </Badge>
                <span className="truncate" title={d.client}>
                  {d.client}
                </span>
                <span className="figure text-right font-mono text-xs">
                  <span
                    className={toneText({
                      tone: d.side.toLowerCase().startsWith('b') ? 'bullish' : 'bearish',
                    })}
                  >
                    {d.side.toLowerCase().startsWith('b') ? 'Bought' : 'Sold'}
                  </span>{' '}
                  {d.quantity.toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const BUILDUP_LABEL: Record<string, string> = {
  long_buildup: 'Long build-up',
  short_covering: 'Short covering',
  short_buildup: 'Short build-up',
  long_unwinding: 'Long unwinding',
};

function FnoTab({ data }: { data: StockPageDto }) {
  if (data.oi.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {data.symbol} has no stock futures on record, so there is no open interest to show.
      </p>
    );
  }
  const rows = data.oi.slice(-30);
  const ois = rows.map((r) => r.oi);
  const lo = Math.min(...ois);
  const hi = Math.max(...ois);
  const path = rows
    .map(
      (r, i) =>
        `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, rows.length - 1)) * 600).toFixed(1)},${(130 - ((r.oi - lo) / (hi - lo || 1)) * 120).toFixed(1)}`,
    )
    .join('');
  const latest = rows[rows.length - 1];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat
          label="Futures OI"
          value={latest === undefined ? '—' : latest.oi.toLocaleString('en-IN')}
          hint="shares, all expiries"
        />
        <MiniStat
          label="OI change"
          value={
            latest?.change == null || latest.oi - latest.change <= 0
              ? '—'
              : `${((latest.change / (latest.oi - latest.change)) * 100).toFixed(1)}%`
          }
          hint="vs previous session"
        />
        <MiniStat
          label="Build-up"
          value={latest?.buildup == null ? '—' : (BUILDUP_LABEL[latest.buildup] ?? latest.buildup)}
          hint="price × OI change"
        />
        <MiniStat
          label="As of"
          value={latest === undefined ? '—' : shortDate(latest.date)}
          hint="ingested the next morning"
        />
      </dl>
      <svg
        viewBox="0 0 600 140"
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label="Futures open interest, last 30 sessions"
      >
        <path
          d={path}
          fill="none"
          className="stroke-chart-1"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div>
        <h3 className="mb-2 font-semibold text-sm">
          Build-up · last {Math.min(10, rows.length)} sessions (oldest → newest)
        </h3>
        <ol className="flex flex-wrap gap-1.5">
          {rows.slice(-10).map((r) => (
            <li key={r.date}>
              <Badge
                variant={
                  r.buildup === 'long_buildup' || r.buildup === 'short_covering'
                    ? 'bullish'
                    : r.buildup === null
                      ? 'neutral'
                      : 'bearish'
                }
                title={shortDate(r.date)}
              >
                {r.buildup === null ? 'No read' : (BUILDUP_LABEL[r.buildup] ?? r.buildup)}
              </Badge>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-2xs text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="figure font-semibold text-sm">{value}</dd>
      <dd className="text-2xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function OwnershipTab({ data }: { data: StockPageDto }) {
  if (data.shareholding.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No shareholding pattern recorded yet; the nightly sweep fills every stock within about a
        week.
      </p>
    );
  }
  const rows = data.shareholding;
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <div className="flex-1">
        <div className="mb-2 flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-chart-1" />
            Promoter
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-border-strong" />
            Public
          </span>
        </div>
        <ol
          className="flex h-44 items-end gap-2"
          aria-label="Promoter and public holding by quarter"
        >
          {rows.map((r) => (
            <li
              key={r.asOf}
              className="flex min-w-0 flex-1 flex-col items-stretch gap-1"
              title={`${shortDate(r.asOf)}: promoter ${r.promoter ?? '—'}%, public ${r.public ?? '—'}%`}
            >
              <div className="flex h-36 flex-col-reverse overflow-hidden rounded">
                <div className="bg-chart-1" style={{ height: `${r.promoter ?? 0}%` }} />
                <div className="bg-border-strong" style={{ height: `${r.public ?? 0}%` }} />
              </div>
              <span className="figure truncate text-center text-2xs text-muted-foreground">
                {new Date(`${r.asOf}T00:00:00Z`).toLocaleDateString('en-IN', {
                  month: 'short',
                  year: '2-digit',
                  timeZone: 'UTC',
                })}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="md:w-60">
        {rows
          .slice(-1)
          .flatMap((latest) => {
            const prev = rows[rows.length - 2];
            const delta = (a: number | null, b: number | null | undefined) =>
              a === null || b === null || b === undefined
                ? '—'
                : `${a - b > 0 ? '+' : a - b < 0 ? '−' : ''}${Math.abs(a - b).toFixed(2)} pp`;
            return [
              ['Promoter', latest.promoter, delta(latest.promoter, prev?.promoter)],
              ['Public', latest.public, delta(latest.public, prev?.public)],
            ] as const;
          })
          .map(([k, v, d]) => (
            <div key={k} className="flex justify-between gap-2 border-border border-b py-2 text-sm">
              <dt>{k}</dt>
              <dd className="figure">
                {v === null ? '—' : `${v.toFixed(2)}%`}{' '}
                <span className="text-muted-foreground text-xs">{d}</span>
              </dd>
            </div>
          ))}
        <p className="mt-2 text-2xs text-muted-foreground">
          NSE shareholding pattern, quarter ended {shortDate(rows[rows.length - 1]?.asOf ?? '')}.
          FII/DII split and pledge are not in this source.
        </p>
      </dl>
    </div>
  );
}

function AnnouncementsTab({ data }: { data: StockPageDto }) {
  if (data.announcements.length === 0)
    return <p className="text-muted-foreground text-sm">No announcements on record.</p>;
  return (
    <ul>
      {data.announcements.map((a) => (
        <li
          key={a.id}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-3 border-border border-b py-2.5 last:border-b-0"
        >
          <span className="figure text-muted-foreground text-xs">
            {new Date(a.at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'Asia/Kolkata',
            })}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm">{a.headline}</span>
            {a.category !== null && (
              <Badge size="sm" variant="neutral" className="self-start">
                {a.category}
              </Badge>
            )}
          </span>
          {a.url !== null && (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-xs hover:underline"
            >
              Filing
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function EventsTab({ data }: { data: StockPageDto }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.events.filter((e) => e.date >= today);
  const past = data.events.filter((e) => e.date < today).reverse();
  const list = (rows: typeof data.events, empty: string) =>
    rows.length === 0 ? (
      <p className="py-2 text-muted-foreground text-sm">{empty}</p>
    ) : (
      <ul>
        {rows.map((e) => (
          <li
            key={`${e.date}-${e.title}`}
            className="flex justify-between gap-3 border-border border-b py-2 text-sm last:border-b-0"
          >
            <span className="min-w-0 truncate">{e.title}</span>
            <span className="figure whitespace-nowrap text-muted-foreground text-xs">
              {shortDate(e.date)}
            </span>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <h3 className="mb-1 font-semibold text-sm">Upcoming</h3>
        {list(upcoming, 'Nothing scheduled in the next 90 days.')}
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-sm">Recent and corporate actions</h3>
        {list(past, 'No events in the last 120 days.')}
        {data.corporateActions.length > 0 && (
          <ul className="mt-2">
            {data.corporateActions.map((a) => (
              <li
                key={`${a.exDate}-${a.kind}`}
                className="flex justify-between gap-3 border-border border-b py-2 text-sm last:border-b-0"
              >
                <span className="capitalize">
                  {a.kind} · prices before ex-date × {Number(a.ratio).toFixed(4)}
                </span>
                <span className="figure text-muted-foreground text-xs">{shortDate(a.exDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SignalTab({ signal }: { signal: NonNullable<StockPageDto['signal']> }) {
  const tone =
    signal.direction === 'bullish'
      ? 'bullish'
      : signal.direction === 'bearish'
        ? 'bearish'
        : 'neutral';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone}>
          {signal.direction === 'bullish'
            ? 'Bullish setup'
            : signal.direction === 'bearish'
              ? 'Bearish setup'
              : 'Neutral'}
        </Badge>
        <span className="text-sm">
          Strength <span className="figure font-semibold">{signal.strength}</span> ·{' '}
          {shortDate(signal.date)}
        </span>
        <Badge size="sm" variant="warning">
          Admin only
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        The score is shown with every factor that produced it, as stored when it was computed.
      </p>
      <ul>
        {signal.factors.map((factor) => (
          <li
            key={factor.label}
            className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] gap-2 border-border border-b py-2 text-sm last:border-b-0"
          >
            <span className="flex min-w-0 flex-col">
              <span>{factor.label}</span>
              {factor.detail !== null && (
                <span className="truncate text-2xs text-muted-foreground">{factor.detail}</span>
              )}
            </span>
            <span className="figure text-right font-mono text-xs">{factor.score.toFixed(2)}</span>
            <span className="figure text-right font-mono text-muted-foreground text-xs">
              × {factor.weight.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
