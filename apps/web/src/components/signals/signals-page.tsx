'use client';
import {
  formatPaise,
  istDateKey,
  type SignalCondition,
  type SignalDto,
  type SignalSummary,
  STRATEGY_NAME,
  signalDetailSchema,
  signalListSchema,
  signalStateSchema,
  signalSummarySchema,
} from '@equitywise/shared';
import { ArrowDownIcon, ArrowUpIcon, PauseIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { API_ROUTES } from '@/lib/api-routes';
import { PaperStudyForm } from './paper-study-form';
import { SignalChart } from './signal-chart';
import { useSignalResource } from './use-signal-resource';

const statusLabel = (state: string) => state.toLowerCase().replaceAll('_', ' ');
const time = (at: number) =>
  new Date(at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
const price = (p: number | null) => (p === null ? '—' : formatPaise(p));
const selectClass =
  'h-11 sm:h-9 min-w-0 rounded-md border border-input bg-surface px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring';
/** Formats stored evidence only; indicator calculations stay in the core evaluator. */
export function conditionValue(c: SignalCondition, signal: SignalDto): string {
  const e = signal.evidence;
  switch (c.id) {
    case 'SESSION':
      return `${Number(c.actualValue) / 1000}s after candle close`;
    case 'CLOSED_HISTORY':
      return `${c.actualValue} closed candles`;
    case 'OPENING_RANGE':
      return `${c.actualValue} complete session candles`;
    case 'BENCHMARK_UNAVAILABLE':
      return `Candle open ${time(Number(c.actualValue))} IST`;
    case 'PRICE_VWAP': {
      const close = Number(c.actualValue.split(' / ')[0]);
      return Number.isSafeInteger(close)
        ? `Close ${price(close)} / VWAP ${price(e.indicators.vwap)}`
        : c.actualValue;
    }
    case 'TREND':
      return `EMA9 ${price(e.indicators.ema9)}; EMA21 ${price(e.indicators.ema21)}; opening midpoint ${price(e.indicators.openingMid)}`;
    case 'NIFTY_ALIGNMENT':
      return `Close ${price(e.benchmark.close)}; VWAP ${price(e.benchmark.vwap)}; EMA9 ${price(e.benchmark.ema9)} / EMA21 ${price(e.benchmark.ema21)}`;
    case 'PULLBACK':
      return c.actualValue.replace(/(\d+) paise/, (_match, n: string) => price(Number(n)));
    case 'RISK_REWARD':
      return `Risk ${price(e.levels.risk)}; target 1 ${(((e.levels.target1 - e.levels.trigger) / e.levels.risk) * (e.direction === 'BUY' ? 1 : -1)).toFixed(2)}R`;
    default:
      return c.actualValue;
  }
}
export function signalDataMode(signal: SignalDto, now: number): string {
  if (signal.dataOrigin === 'SIMULATED') return 'SIMULATED';
  if (signal.evidence.sessionDate !== istDateKey(new Date(now))) return 'HISTORICAL';
  if (signal.quoteAt === null || now < signal.quoteAt) return 'UNAVAILABLE';
  return now - signal.quoteAt > 15_000 ? 'DELAYED' : 'LIVE';
}
export function SignalCard({
  signal: s,
  now,
  onInspect,
}: {
  signal: SignalDto;
  now: number;
  onInspect: () => void;
}) {
  const e = s.evidence;
  const bullish = e.direction === 'BUY';
  return (
    <article
      className={`min-w-0 rounded-lg border bg-surface shadow-xs ${now >= s.publishedAt && now - s.publishedAt < 60_000 ? 'border-primary/60' : 'border-border'}`}
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">{s.symbol}</h2>
            <p className="truncate text-muted-foreground text-xs">{s.companyName}</p>
          </div>
          <span
            className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 font-semibold text-xs ${bullish ? 'bg-bullish/10 text-bullish' : 'bg-bearish/10 text-bearish'}`}
          >
            {bullish ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            {e.direction}
          </span>
        </div>
        <p className="font-medium text-muted-foreground text-xs">{e.strategyName}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded bg-muted px-2 py-1 capitalize">
            {statusLabel(s.projection.state)}
          </span>
          {now >= s.publishedAt && now - s.publishedAt < 60_000 && (
            <span className="text-primary font-medium">New</span>
          )}
          <span className="text-muted-foreground">
            {signalDataMode(s, now)} · {time(s.publishedAt)} IST
          </span>
        </div>
        {s.projection.resolution === 'UNAVAILABLE' && (
          <p className="text-bearish text-xs">Outcome unresolved · feed coverage interrupted</p>
        )}
        <dl className="grid grid-cols-3 gap-x-2 gap-y-3">
          {[
            ['Last price', price(s.lastPrice)],
            ['Trigger level', price(e.levels.trigger)],
            ['Invalidation', price(e.levels.invalidation)],
            ['Target 1', price(e.levels.target1)],
            ['Target 2', price(e.levels.target2)],
            [
              'Gross reward / risk',
              `${((e.levels.target1 - e.levels.trigger) / (e.direction === 'BUY' ? e.levels.risk : -e.levels.risk)).toFixed(2)}R`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-mono text-xs tabular-nums sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <span>
            RVOL <b className="font-mono">{e.indicators.relativeVolume.toFixed(2)}×</b>
          </span>
          <span>
            ADX <b className="font-mono">{e.indicators.adx.toFixed(1)}</b>
          </span>
          <span className="text-muted-foreground">5m · v{s.strategyVersionId}</span>
        </div>
        <details className="rounded bg-muted/30 px-2 py-1.5 text-xs">
          <summary className="cursor-pointer">
            Setup quality <b className="font-mono">{e.score}/100</b> ·{' '}
            {e.score >= 85 ? 'High quality' : 'Qualified'}
          </summary>
          <dl className="mt-2 space-y-1">
            {e.factors.map((f) => (
              <div key={f.id} className="flex justify-between">
                <dt>{f.label}</dt>
                <dd className="font-mono">
                  {f.earned}/{f.max}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-muted-foreground">
            An explained rule score, not a profit probability.
          </p>
        </details>
        <Button
          className="min-h-11 w-full"
          variant="outline"
          size="sm"
          onClick={onInspect}
          aria-label={`Inspect ${s.symbol} signal`}
        >
          Inspect setup
        </Button>
      </div>
    </article>
  );
}
function Performance({ summary }: { summary: SignalSummary }) {
  const p = summary.performance;
  const ratio = (v: number | null, suffix = '') => (v === null ? '—' : `${v.toFixed(2)}${suffix}`);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-sm">Your paper research today</h2>
        <p className="text-muted-foreground text-xs">
          Private to your account · {p.sampleSize} resolved, filled studies · Costs included
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4 xl:grid-cols-6">
        {[
          ['Winners / losers', `${p.winners} / ${p.losers}`],
          ['Win rate', ratio(p.winRate, '%')],
          ['Average win / loss', `${price(p.averageWin)} / ${price(p.averageLoss)}`],
          ['Expectancy', ratio(p.expectancyR, 'R')],
          ['Profit factor', ratio(p.profitFactor)],
          ['Net paper P&L', price(p.netPaise)],
          ['Maximum drawdown', price(p.maxDrawdownPaise)],
          ['Break-even studies', String(p.breakeven)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-mono text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">
        Dash means insufficient or unavailable observations. Drawdown includes recorded open-study
        marks. {p.openMarksComplete ? '' : 'Some open studies have no fresh mark.'} Shared target
        hits above are separate from your realised outcomes.
      </p>
      {summary.papers.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Your paper journal studies today</caption>
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {['Stock', 'Study status', 'Simulated shares', 'Simulated fill', 'Net result'].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {summary.papers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{s.symbol}</td>
                  <td className="px-3 py-2 capitalize">
                    {s.projection.resolution === 'UNAVAILABLE'
                      ? 'Unresolved'
                      : statusLabel(s.projection.state)}
                  </td>
                  <td className="px-3 py-2 font-mono">{s.sizing.shares}</td>
                  <td className="px-3 py-2 font-mono">{price(s.projection.fill)}</td>
                  <td className="px-3 py-2 font-mono">{price(s.netPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-5 text-muted-foreground text-sm">
          Your journal is empty. Inspect a fresh pending setup to start a prospective paper study.
        </p>
      )}
    </section>
  );
}
export function SignalsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const requestedPageSize = Number(params.get('pageSize') ?? 24);
  const pageSize =
    Number.isInteger(requestedPageSize) && requestedPageSize > 0 && requestedPageSize <= 100
      ? requestedPageSize
      : 24;
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState(params.get('symbol') ?? '');
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page' && key !== 'selected') next.delete('page');
    router.push(`/signals?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setSearch(params.get('symbol') ?? '');
  }, [params]);
  const symbol = params.get('symbol') ?? '';
  useEffect(() => {
    if (search === symbol) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(query);
      if (search) next.set('symbol', search);
      else next.delete('symbol');
      next.delete('page');
      router.replace(`/signals?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, symbol, query, router]);
  const feedParams = new URLSearchParams(query);
  feedParams.delete('selected');
  const feed = useSignalResource(`${API_ROUTES.signals}?${feedParams}`, signalListSchema, paused);
  const summary = useSignalResource(API_ROUTES.signalSummary, signalSummarySchema, paused);
  const selectedId = Number(params.get('selected'));
  const selected = Number.isSafeInteger(selectedId) && selectedId > 0 ? selectedId : null;
  const detail = useSignalResource(
    selected ? API_ROUTES.signal(selected) : null,
    signalDetailSchema,
    paused,
  );
  const scanner = feed.data?.scanner;
  const scanStale = !scanner || now - scanner.checkedAt > 360_000;
  const refresh = () => {
    feed.refresh();
    summary.refresh();
    detail.refresh();
  };
  const field = (name: string, label: string, options: readonly (readonly [string, string])[]) => (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] text-muted-foreground">
      {label}
      <select
        className={selectClass}
        aria-label={label}
        value={params.get(name) ?? ''}
        onChange={(e) => setParam(name, e.target.value)}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <AppShell onSearchSelect={(symbol) => setParam('symbol', symbol)}>
      <PageContainer>
        <PageHeader className="flex-col sm:flex-row">
          <PageHeading className="w-full sm:w-auto">
            <PageTitle>Signals</PageTitle>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-2 py-1">Paper research</span>
              <time suppressHydrationWarning>{time(now)} IST</time>
            </div>
            <PageDescription>
              {STRATEGY_NAME} · NSE cash equities · Closed 5m candles
            </PageDescription>
          </PageHeading>
          <PageActions>
            <Button variant="outline" size="sm" onClick={() => setPaused((v) => !v)}>
              {paused ? <PlayIcon className="size-3" /> : <PauseIcon className="size-3" />}
              {paused ? 'Resume updates' : 'Pause updates'}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={feed.refreshing}>
              <RefreshCwIcon className="size-3" />
              Refresh
            </Button>
          </PageActions>
        </PageHeader>
        <PageContent>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs">
            <span className="font-medium">
              {paused
                ? 'View paused'
                : scanner?.phase === 'paused'
                  ? 'Scanner paused'
                  : scanStale
                    ? 'Scanner status unavailable'
                    : scanner?.phase === 'open'
                      ? 'Market open'
                      : scanner?.phase === 'unknown'
                        ? 'Market status unknown'
                        : 'Market closed'}
            </span>
            <span className="text-muted-foreground">
              {scanner
                ? `${scanner.message} Last scan ${time(scanner.checkedAt)} IST`
                : 'Waiting for the worker’s first verified scan.'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [
                'Today’s signals',
                summary.data ? String(summary.data.total) : '—',
                'All scanned stocks',
              ],
              [
                'Pending / active',
                summary.data ? `${summary.data.pending} / ${summary.data.triggered}` : '—',
                `${summary.data?.closed ?? 0} closed signals`,
              ],
              [
                'Targets / stops today',
                summary.data ? `${summary.data.targetHits} / ${summary.data.stopHits}` : '—',
                'One count per signal',
              ],
              [
                'NIFTY confirmation',
                scanner?.benchmark && !scanStale ? scanner.benchmark.direction : 'Unavailable',
                scanner?.benchmark && !scanStale
                  ? `${scanner.benchmark.regime} · ADX ${scanner.benchmark.adx.toFixed(1)}`
                  : 'VWAP · constituent volume',
              ],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-lg border border-border bg-surface p-4">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-1 font-mono font-semibold text-xl">{value}</p>
                <p className="mt-1 text-muted-foreground text-[10px]">{note}</p>
              </div>
            ))}
          </div>
          {scanner?.benchmark && !scanStale && (
            <p className="text-muted-foreground text-xs">
              NIFTY {price(scanner.benchmark.close)} · VWAP {price(scanner.benchmark.vwap)} ·
              Constituent volume · Closed at {time(scanner.benchmark.at)} IST
            </p>
          )}
          <section
            aria-label="Signal filters"
            className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-4"
          >
            <label
              htmlFor="signal-search"
              className="flex flex-col gap-1 text-[10px] text-muted-foreground"
            >
              Search stock
              <Input
                id="signal-search"
                aria-label="Search stock"
                placeholder="Symbol"
                value={search}
                onChange={(e) => setSearch(e.target.value.toUpperCase())}
                className="h-9"
              />
            </label>
            {field('direction', 'Direction', [
              ['', 'All directions'],
              ['BUY', 'BUY'],
              ['SELL', 'SELL'],
            ])}
            {field('status', 'Lifecycle', [
              ['', 'All statuses'],
              ...signalStateSchema.options.map((s) => [s, statusLabel(s)] as const),
            ])}
            {field('minimumScore', 'Quality', [
              ['', 'All qualifying'],
              ['85', 'High quality · 85+'],
              ['90', '90+'],
            ])}
            <details className="col-span-full">
              <summary className="cursor-pointer py-1 text-muted-foreground text-xs">
                Universe, date & sorting
              </summary>
              <div className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {field('watchlistId', 'Universe', [
                  ['', 'NIFTY 50'],
                  ...(feed.data?.watchlists ?? []).map((w) => [String(w.id), w.name] as const),
                ])}
                {field('sortBy', 'Sort by', [
                  ['', 'Newest'],
                  ['score', 'Quality score'],
                  ['symbol', 'Stock symbol'],
                ])}
                {field('sortDirection', 'Sort direction', [
                  ['', 'Descending'],
                  ['asc', 'Ascending'],
                ])}
                <label
                  htmlFor="signal-sector"
                  className="flex flex-col gap-1 text-[10px] text-muted-foreground"
                >
                  Sector
                  <Input
                    id="signal-sector"
                    aria-label="Sector"
                    placeholder="Exact sector"
                    defaultValue={params.get('sector') ?? ''}
                    key={params.get('sector') ?? ''}
                    onBlur={(e) => setParam('sector', e.target.value)}
                    className="h-9"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                  Session date
                  <input
                    aria-label="Session date"
                    type="date"
                    className={selectClass}
                    value={
                      params.get('from')
                        ? istDateKey(new Date(params.get('from') ?? now))
                        : istDateKey(new Date(now))
                    }
                    onChange={(e) => {
                      const next = new URLSearchParams(query);
                      if (e.target.value) {
                        next.set(
                          'from',
                          new Date(`${e.target.value}T00:00:00+05:30`).toISOString(),
                        );
                        next.set('to', new Date(`${e.target.value}T23:59:59+05:30`).toISOString());
                      } else {
                        next.delete('from');
                        next.delete('to');
                      }
                      next.delete('page');
                      router.push(`/signals?${next}`, { scroll: false });
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    router.push('/signals', { scroll: false });
                  }}
                >
                  Reset filters
                </Button>
              </div>
            </details>
          </section>
          {(feed.error || summary.error) && (
            <div role="alert" className="rounded border border-bearish/30 bg-bearish/5 p-4 text-sm">
              {feed.error ?? summary.error} {feed.data ? 'Showing the last received snapshot.' : ''}
              <Button variant="ghost" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          )}
          {!feed.data && !feed.error && (
            <div
              role="status"
              className="rounded-lg border border-border p-8 text-muted-foreground"
            >
              Loading verified signals…
            </div>
          )}
          {feed.data && (
            <>
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>
                  {feed.data.total} matching signals ·{' '}
                  {paused
                    ? 'Updates paused for this view'
                    : feed.refreshing
                      ? 'Refreshing…'
                      : 'Shared feed'}
                </span>
                <span>
                  {scanner?.evaluated ?? 0}/{scanner?.requested ?? 50} stocks evaluated
                </span>
              </div>
              {feed.data.signals.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {feed.data.signals.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      now={now}
                      onInspect={() => setParam('selected', String(signal.id))}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
                  <h2 className="font-semibold text-sm">
                    {feedParams.size
                      ? 'No signals match these filters'
                      : 'No qualifying setups yet'}
                  </h2>
                  <p className="mx-auto mt-2 max-w-lg text-muted-foreground text-sm">
                    {scanner?.phase === 'open'
                      ? 'Only complete, timely data and fully confirmed setups qualify. Check coverage below or adjust your filters.'
                      : 'Setups appear during a verified market session. You can choose a previous session to review its signals.'}
                  </p>
                </div>
              )}
              {feed.data.total > pageSize && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Number(params.get('page') ?? 1) <= 1}
                    onClick={() => setParam('page', String(Number(params.get('page') ?? 1) - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs">
                    Page {params.get('page') ?? 1} of {Math.ceil(feed.data.total / pageSize)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={Number(params.get('page') ?? 1) * pageSize >= feed.data.total}
                    onClick={() => setParam('page', String(Number(params.get('page') ?? 1) + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
          {scanner && Object.keys(scanner.reasons).length > 0 && (
            <details className="rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Scan coverage and rejected gates
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(scanner.reasons).map(([code, count]) => (
                  <span key={code} className="rounded bg-muted px-2 py-1">
                    {statusLabel(code)} · {count}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-muted-foreground">
                A stock may fail several gates in each direction. Counts are not unique-stock
                totals.
              </p>
            </details>
          )}
          {summary.data && <Performance summary={summary.data} />}
          <p className="text-muted-foreground text-xs">
            Signals are generated using predefined technical rules for educational and research
            purposes. They are not guaranteed to be profitable and are not investment advice.
          </p>
        </PageContent>
        <Sheet
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setParam('selected', '');
          }}
        >
          <SheetContent className="sm:max-w-3xl [&>button]:size-11 [&>button]:flex [&>button]:items-center [&>button]:justify-center">
            <SheetHeader className="pr-12">
              <div>
                <SheetTitle>{detail.data?.signal.symbol ?? 'Signal details'}</SheetTitle>
                {detail.data && (
                  <p className="text-muted-foreground text-xs">{detail.data.signal.companyName}</p>
                )}
                <SheetDescription className="whitespace-normal">
                  {detail.data?.signal.evidence.strategyName ?? STRATEGY_NAME}
                </SheetDescription>
              </div>
            </SheetHeader>
            <SheetBody className="space-y-5">
              {detail.error && <p role="alert">{detail.error}</p>}
              {!detail.data && !detail.error && <p role="status">Loading evidence…</p>}
              {detail.data && (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span
                      className={
                        detail.data.signal.evidence.direction === 'BUY'
                          ? 'font-semibold text-bullish'
                          : 'font-semibold text-bearish'
                      }
                    >
                      {detail.data.signal.evidence.direction}
                    </span>
                    <span className="capitalize">
                      {statusLabel(detail.data.signal.projection.state)}
                    </span>
                    <span>
                      {signalDataMode(detail.data.signal, now)} ·{' '}
                      {time(detail.data.signal.publishedAt)} IST
                    </span>
                    <span>Strategy v{detail.data.signal.strategyVersionId}</span>
                  </div>
                  <SignalChart detail={detail.data} />
                  <dl className="grid grid-cols-3 gap-3 text-xs">
                    {[
                      ['Trigger level', price(detail.data.signal.evidence.levels.trigger)],
                      [
                        'Invalidation level',
                        price(detail.data.signal.evidence.levels.invalidation),
                      ],
                      ['Risk / share', price(detail.data.signal.evidence.levels.risk)],
                      ['Target 1', price(detail.data.signal.evidence.levels.target1)],
                      ['Target 2', price(detail.data.signal.evidence.levels.target2)],
                      ['Simulated fill', price(detail.data.signal.projection.fill)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <section className="space-y-3">
                    <h3 className="font-semibold text-sm">
                      Why this signal? · {detail.data.signal.evidence.score}/100
                    </h3>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {detail.data.signal.evidence.factors.map((f) => (
                        <span className="rounded bg-muted px-2 py-1" key={f.id}>
                          {f.label} {f.earned}/{f.max}
                        </span>
                      ))}
                    </div>
                    {detail.data.signal.evidence.conditions.map((c) => (
                      <div key={c.id} className="border-b border-border pb-2 text-xs">
                        <p className="font-medium">
                          <span className={c.passed ? 'text-bullish' : 'text-bearish'}>
                            {c.passed ? '✓' : '×'}
                          </span>{' '}
                          {c.label}
                        </p>
                        <p className="mt-1 text-muted-foreground">Required: {c.requiredValue}</p>
                        <p>
                          Observed:{' '}
                          {detail.data ? conditionValue(c, detail.data.signal) : c.actualValue}
                        </p>
                        <p className="text-muted-foreground">{c.explanation}</p>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h3 className="mb-3 font-semibold text-sm">Signal timeline</h3>
                    <ol className="space-y-3 border-l border-border pl-4">
                      {detail.data.events.map((e) => (
                        <li key={e.sequence} className="text-xs">
                          <p className="font-medium capitalize">
                            {statusLabel(e.state)} · {time(e.effectiveAt)} IST
                          </p>
                          <p className="text-muted-foreground">{e.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <PaperStudyForm
                    key={detail.data.signal.id}
                    signal={detail.data.signal}
                    onSaved={refresh}
                  />
                </>
              )}
            </SheetBody>
          </SheetContent>
        </Sheet>
      </PageContainer>
    </AppShell>
  );
}
