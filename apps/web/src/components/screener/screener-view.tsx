'use client';

import { type FilterGroup, type FilterNode, validateFilter } from '@equitywise/core';
import {
  BookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LinkIcon,
  ListPlusIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { API_ROUTES } from '@/lib/api-routes';
import { encodeFilter, stockHref } from '@/lib/screener-format';
import type {
  ConditionCountsDto,
  SavedScreenDto,
  ScreenerMetaDto,
  ScreenResultDto,
} from '@/lib/screener-types';
import { cn } from '@/lib/utils';
import { ColumnPicker } from './column-picker';
import { FilterBuilder } from './filter-builder';
import { asGroup, leafCount, toFilter } from './filter-edit';
import { ResultsTable } from './results-table';

export interface ScreenerInitialState {
  readonly filter: FilterNode | null;
  readonly presetId: string | null;
  readonly universe: string;
  readonly sort: string;
  readonly columns: readonly string[];
  readonly asOf: string | null;
}

const PAGE = 50;

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}

function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function istTime(iso: string | null): string {
  if (iso === null) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

export function ScreenerView({
  meta,
  initial,
  initialResult,
  initialCounts,
  initialSaved,
}: {
  meta: ScreenerMetaDto;
  initial: ScreenerInitialState;
  initialResult: ScreenResultDto;
  initialCounts: ConditionCountsDto;
  initialSaved: readonly SavedScreenDto[];
}) {
  const router = useRouter();
  const metricMap = useMemo(() => new Map(meta.metrics.map((m) => [m.key, m])), [meta.metrics]);
  const presetById = useMemo(() => new Map(meta.presets.map((p) => [p.id, p])), [meta.presets]);

  const [group, setGroup] = useState<FilterGroup>(asGroup(initial.filter));
  const [presetId, setPresetId] = useState<string | null>(initial.presetId);
  const [screenName, setScreenName] = useState<string | null>(
    initial.presetId === null ? null : (presetById.get(initial.presetId)?.label ?? null),
  );
  const [universe, setUniverse] = useState(initial.universe);
  const [sort, setSort] = useState(initial.sort);
  const [columns, setColumns] = useState<string[]>([...initial.columns]);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ScreenResultDto>(initialResult);
  const [counts, setCounts] = useState<ConditionCountsDto | null>(initialCounts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<readonly SavedScreenDto[]>(initialSaved);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The screen has changed since its preset or saved version was loaded. */
  const [edited, setEdited] = useState(false);

  const filter = useMemo(() => toFilter(group), [group]);
  const problems = useMemo(
    () => (filter === null ? [] : validateFilter(filter, { isAdmin: meta.isAdmin })),
    [filter, meta.isAdmin],
  );
  const conditions = leafCount(filter);

  // URL state: a screen is a link. `history.replaceState`, not
  // `router.replace`: the router would re-render the server page — and re-run
  // the screen server-side — on every edit, when the client already has the
  // answer. Next keeps its router in sync with native history updates.
  const preset = presetId === null ? null : (presetById.get(presetId) ?? null);
  const defaultSort = preset?.sort ?? 'rsRank:desc';
  const defaultColumns = meta.defaultColumns.join(',');
  const asOf = initial.asOf;
  useEffect(() => {
    const qs = new URLSearchParams();
    if (presetId !== null) qs.set('p', presetId);
    else if (filter !== null) qs.set('f', encodeFilter(filter));
    if (universe !== 'all') qs.set('u', universe);
    if (sort !== defaultSort) qs.set('s', sort);
    if (columns.join(',') !== defaultColumns) qs.set('c', columns.join(','));
    if (asOf !== null) qs.set('a', asOf);
    const next = `/screener${qs.size === 0 ? '' : `?${qs.toString()}`}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [presetId, filter, universe, sort, columns, defaultSort, defaultColumns, asOf]);

  // Debounced queries: results whenever anything changes; counts when the
  // filter or universe does. The previous request is aborted, so a slow answer
  // never overwrites a newer one.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (problems.length > 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const base = { filter, universe, ...(initial.asOf === null ? {} : { asOf: initial.asOf }) };
        const [run, c] = await Promise.all([
          postJson<ScreenResultDto>(
            API_ROUTES.screenerRun,
            { ...base, sort, limit: PAGE, offset },
            controller.signal,
          ),
          postJson<ConditionCountsDto>(API_ROUTES.screenerCounts, base, controller.signal),
        ]);
        setResult(run);
        setCounts(c);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [filter, universe, sort, offset, problems.length, initial.asOf]);

  const editGroup = useCallback((next: FilterGroup) => {
    setGroup(next);
    setPresetId(null);
    setEdited(true);
    setOffset(0);
  }, []);

  const applyPreset = (id: string) => {
    const preset = presetById.get(id);
    if (preset === undefined) return;
    setGroup(asGroup(preset.filter));
    setPresetId(id);
    setEdited(false);
    setScreenName(preset.label);
    setSort(preset.sort);
    setOffset(0);
    setSelected(new Set());
  };

  const loadSaved = (screen: SavedScreenDto) => {
    setGroup(asGroup(screen.filter));
    setPresetId(null);
    setEdited(false);
    setScreenName(screen.name);
    setSort(screen.sort);
    setColumns([...screen.columns]);
    setUniverse(screen.universe);
    setOffset(0);
  };

  const onSort = (key: string) => {
    const [k, dir] = sort.split(':');
    setSort(
      k === key
        ? `${key}:${dir === 'desc' ? 'asc' : 'desc'}`
        : `${key}:${key === 'symbol' ? 'asc' : 'desc'}`,
    );
    setOffset(0);
  };

  const toggleRow = (symbol: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  const addToWatchlist = async (id: number, name: string) => {
    try {
      const response = await fetch(`${API_ROUTES.watchlist(id)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [...selected] }),
      });
      if (!response.ok) throw new Error('Could not add to the watchlist.');
      setNotice(`Added ${selected.size} to ${name}.`);
      setSelected(new Set());
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const hrefSuffix = useMemo(() => {
    if (filter === null) return '';
    const qs = new URLSearchParams({ screen: encodeFilter(filter) });
    if (screenName !== null) qs.set('sn', screenName);
    return `?${qs.toString()}`;
  }, [filter, screenName]);

  const funnel = counts === null ? [] : counts.cumulative;
  const narrowest =
    counts !== null && counts.individual.length > 0 && result.total === 0
      ? counts.individual.indexOf(Math.min(...counts.individual))
      : -1;

  const builder = (
    <FilterBuilder
      group={group}
      onChange={editGroup}
      metrics={meta.metrics}
      categories={meta.categories}
      counts={
        counts === null || counts.individual.length !== group.children.length
          ? null
          : counts.individual
      }
    />
  );

  const noSnapshot = result.tradingDate === null;

  return (
    <AppShell onSearchSelect={(symbol) => router.push(stockHref(symbol) as Route)}>
      <PageContainer>
        <PageHeader className="gap-y-3">
          <PageHeading>
            <PageTitle>Screener</PageTitle>
            <PageDescription>
              Multi-condition technical, delivery, F&amp;O and ownership filters across every NSE
              stock.
            </PageDescription>
          </PageHeading>
          <PageActions className="w-full min-w-0 flex-wrap sm:w-auto">
            {result.tradingDate !== null && (
              <span
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs',
                  result.stale
                    ? 'border-warning-line bg-warning-soft text-warning-strong'
                    : 'border-border text-muted-foreground',
                )}
              >
                <ClockIcon aria-hidden className="size-3.5" />
                Session {shortDate(result.tradingDate)}
                {result.builtAt !== null && ` · built ${istTime(result.builtAt)} IST`}
              </span>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
                setNotice('Link copied.');
              }}
            >
              <LinkIcon aria-hidden />
              Copy link
            </Button>
            <SavedScreensMenu
              saved={saved}
              onLoad={loadSaved}
              onDelete={async (id) => {
                const r = await fetch(API_ROUTES.screenerScreen(id), { method: 'DELETE' });
                if (r.ok) setSaved((s) => s.filter((x) => x.id !== id));
              }}
            />
            <SaveDialog
              disabled={filter === null || problems.length > 0}
              defaultName={screenName ?? ''}
              onSave={async (name) => {
                if (filter === null) return;
                const screen = await postJson<SavedScreenDto>(API_ROUTES.screenerScreens, {
                  name,
                  filter,
                  columns,
                  sort,
                  universe,
                });
                setSaved((s) => [screen, ...s]);
                setScreenName(screen.name);
                setEdited(false);
                setNotice(`Saved “${screen.name}”.`);
              }}
            />
          </PageActions>
        </PageHeader>

        <PageContent>
          {notice !== null && (
            <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckIcon aria-hidden className="size-4 text-bullish" />
              {notice}
              <button
                type="button"
                className="cursor-pointer text-xs underline"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </p>
          )}
          {result.stale && result.tradingDate !== null && (
            <p className="flex items-center gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning-strong">
              <TriangleAlertIcon aria-hidden className="size-4" />
              These values are from {shortDate(result.tradingDate)} — the nightly snapshot has not
              run since.
            </p>
          )}

          <section aria-label="Universe and presets" className="flex flex-col gap-3">
            <UniversePicker
              value={universe}
              meta={meta}
              onChange={(u) => {
                setUniverse(u);
                setOffset(0);
              }}
            />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <span className="sr-only">Presets</span>
              {meta.presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.description}
                  aria-pressed={presetId === p.id}
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    'h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3 font-medium text-xs transition-colors',
                    presetId === p.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-surface text-foreground hover:border-border-strong',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <Card
              className="hidden w-full shrink-0 flex-col gap-3 p-4 lg:flex lg:w-[22rem]"
              aria-label="Filter builder"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-2xs text-muted-foreground uppercase tracking-wide">
                    Screen
                  </span>
                  <h2 className="truncate font-semibold text-base">
                    {screenName ?? (filter === null ? 'All stocks' : 'Custom screen')}
                    {edited && screenName !== null && (
                      <span className="ml-2 align-middle font-normal text-2xs text-muted-foreground">
                        edited
                      </span>
                    )}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editGroup({ op: 'and', children: [] })}
                >
                  Reset
                </Button>
              </div>
              {builder}
              {problems.length > 0 && <p className="text-destructive text-xs">{problems[0]}</p>}
              <p className="text-2xs text-muted-foreground">
                Counts update as you edit. Unknown values never match — a stock without enough
                history is left out, not counted as zero.
              </p>
            </Card>

            <Card className="min-w-0 flex-1 overflow-hidden" aria-label="Results">
              <div className="flex flex-col gap-3 border-border border-b p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="flex items-baseline gap-2" aria-live="polite">
                    <span className="figure font-semibold text-2xl">
                      {result.total.toLocaleString('en-IN')}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      of <span className="figure">{result.base.toLocaleString('en-IN')}</span>{' '}
                      stocks match
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      className="lg:hidden"
                      onClick={() => setSheetOpen(true)}
                    >
                      <SlidersHorizontalIcon aria-hidden />
                      Filters
                      <span className="figure text-muted-foreground text-xs">{conditions}</span>
                    </Button>
                    <ColumnPicker
                      metrics={meta.metrics}
                      categories={meta.categories}
                      columns={columns}
                      onChange={setColumns}
                    />
                    {selected.size > 0 && (
                      <AddToWatchlist
                        count={selected.size}
                        watchlists={meta.watchlists}
                        onAdd={addToWatchlist}
                      />
                    )}
                  </div>
                </div>
                {counts !== null && funnel.length > 0 && (
                  <ol
                    aria-label="How each condition narrows the list"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <FunnelStep n={counts.base} label="Universe" />
                    {funnel.map((n, i) => (
                      <FunnelStep
                        key={counts.labels[i] ?? i}
                        n={n}
                        label={counts.labels[i] ?? ''}
                        arrow
                      />
                    ))}
                  </ol>
                )}
              </div>

              {error !== null && (
                <p
                  role="alert"
                  className="m-4 rounded-md border border-destructive-line bg-destructive-soft px-3 py-2 text-destructive text-sm"
                >
                  {error}
                </p>
              )}

              <div className="p-2 sm:p-0">
                {noSnapshot ? (
                  <EmptyState
                    title="The first snapshot has not been built yet"
                    description="The screener reads a nightly snapshot of every NSE stock. It appears after the evening end-of-day run."
                  />
                ) : result.rows.length === 0 ? (
                  <EmptyState
                    title="No stock matches every condition"
                    description={
                      narrowest >= 0 && counts !== null
                        ? `“${counts.labels[narrowest]}” keeps only ${counts.individual[narrowest]} on its own — try relaxing it.`
                        : 'Try relaxing a condition.'
                    }
                  />
                ) : (
                  <ResultsTable
                    rows={result.rows}
                    columns={columns}
                    metrics={metricMap}
                    sort={sort}
                    onSort={onSort}
                    selected={selected}
                    onToggle={toggleRow}
                    hrefSuffix={hrefSuffix}
                    loading={loading}
                  />
                )}
              </div>

              {result.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-border border-t px-4 py-2.5">
                  <span className="figure text-muted-foreground text-xs">
                    {offset + 1}–{Math.min(offset + PAGE, result.total)} of{' '}
                    {result.total.toLocaleString('en-IN')}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE))}
                    >
                      <ChevronLeftIcon aria-hidden />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + PAGE >= result.total}
                      onClick={() => setOffset(offset + PAGE)}
                    >
                      Next
                      <ChevronRightIcon aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <PageDisclaimer>
            Technical readings describe price structure; nothing here is a recommendation.
            End-of-day NSE data; F&amp;O open interest trails by a session.
          </PageDisclaimer>
        </PageContent>
      </PageContainer>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="lg:hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>{screenName ?? 'Custom screen'}</SheetDescription>
          </SheetHeader>
          <SheetBody className="overflow-y-auto">
            {builder}
            {problems.length > 0 && <p className="mt-2 text-destructive text-xs">{problems[0]}</p>}
          </SheetBody>
          <SheetFooter className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="outline" onClick={() => editGroup({ op: 'and', children: [] })}>
              Reset
            </Button>
            <Button onClick={() => setSheetOpen(false)}>
              Show {result.total.toLocaleString('en-IN')} stocks
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function FunnelStep({ n, label, arrow = false }: { n: number; label: string; arrow?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      {arrow && <ChevronRightIcon aria-hidden className="size-3.5 text-subtle-foreground" />}
      <span
        className="flex max-w-48 flex-col rounded-md border border-border bg-surface-sunken px-2.5 py-1"
        title={label}
      >
        <span className="figure font-semibold text-sm">{n.toLocaleString('en-IN')}</span>
        <span className="truncate text-2xs text-muted-foreground">{label}</span>
      </span>
    </li>
  );
}

function UniversePicker({
  value,
  meta,
  onChange,
}: {
  value: string;
  meta: ScreenerMetaDto;
  onChange: (u: string) => void;
}) {
  const quick = [
    { value: 'all', label: 'All NSE' },
    { value: 'index:nifty500', label: 'Nifty 500' },
    { value: 'index:nifty50', label: 'Nifty 50' },
  ];
  const inQuick = quick.some((q) => q.value === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Screen within
      </span>
      <fieldset
        aria-label="Universe"
        className="min-w-0 inline-flex rounded-md border border-border bg-surface-sunken p-0.5"
      >
        {quick.map((q) => (
          <button
            key={q.value}
            type="button"
            aria-pressed={value === q.value}
            onClick={() => onChange(q.value)}
            className={cn(
              'h-7 cursor-pointer rounded px-2.5 font-medium text-xs',
              value === q.value
                ? 'bg-surface text-foreground shadow-subtle'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {q.label}
          </button>
        ))}
      </fieldset>
      <label className="inline-flex items-center">
        <span className="sr-only">Other universe</span>
        <select
          value={inQuick ? '' : value}
          onChange={(e) => e.target.value !== '' && onChange(e.target.value)}
          className={cn(
            'h-8 cursor-pointer rounded-md border bg-surface px-2 text-xs',
            inQuick
              ? 'border-border text-muted-foreground'
              : 'border-foreground font-medium text-foreground',
          )}
        >
          <option value="">More indices or a watchlist…</option>
          <optgroup label="Indices">
            {meta.indices.map((i) => (
              <option key={i.value} value={`index:${i.value}`}>
                {i.label}
              </option>
            ))}
          </optgroup>
          {meta.watchlists.length > 0 && (
            <optgroup label="My watchlists">
              {meta.watchlists.map((w) => (
                <option key={w.id} value={`watchlist:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
    </div>
  );
}

function SavedScreensMenu({
  saved,
  onLoad,
  onDelete,
}: {
  saved: readonly SavedScreenDto[];
  onLoad: (s: SavedScreenDto) => void;
  onDelete: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <BookmarkIcon aria-hidden />
          My screens
          <span className="figure text-muted-foreground text-xs">{saved.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        {saved.length === 0 ? (
          <p className="px-2 py-4 text-center text-muted-foreground text-xs">
            No saved screens yet. Build one and press Save.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-1 rounded-md hover:bg-accent">
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer truncate px-2 py-2 text-left text-sm"
                  onClick={() => {
                    onLoad(s);
                    setOpen(false);
                  }}
                >
                  {s.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => onDelete(s.id)}
                >
                  <TrashIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SaveDialog({
  disabled,
  defaultName,
  onSave,
}: {
  disabled: boolean;
  defaultName: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => {
          setName(defaultName);
          setError(null);
          setOpen(true);
        }}
      >
        Save screen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save screen</DialogTitle>
            <DialogDescription>
              Saved screens keep the conditions, columns, sort and universe. Only you can see them.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await onSave(name.trim());
                setOpen(false);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="screen-name" className="text-sm">
              Name
            </label>
            <Input
              id="screen-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
            {error !== null && <p className="text-destructive text-xs">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim() === ''}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddToWatchlist({
  count,
  watchlists,
  onAdd,
}: {
  count: number;
  watchlists: readonly { id: number; name: string }[];
  onAdd: (id: number, name: string) => Promise<void>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <ListPlusIcon aria-hidden />
          Add {count} to watchlist
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        {watchlists.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">Create a watchlist first.</p>
        ) : (
          watchlists.map((w) => (
            <button
              key={w.id}
              type="button"
              className="w-full cursor-pointer truncate rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              onClick={() => onAdd(w.id, w.name)}
            >
              {w.name}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
