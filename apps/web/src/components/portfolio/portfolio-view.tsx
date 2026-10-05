'use client';

import { formatPaise } from '@equitywise/shared';
import {
  DownloadIcon,
  FileUpIcon,
  ListIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { MetricCard } from '@/components/data-display/metric-card';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
  Section,
} from '@/components/layout/page';
import { PercentChange, Price, PriceChange } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_ROUTES } from '@/lib/api-routes';
import type {
  AddEntryBody,
  ImportPreviewDto,
  PortfolioDto,
  PortfolioEntryDto,
  PortfolioHoldingDto,
} from '@/lib/portfolio-types';
import { paiseToPlain, parseRupeesInput } from './portfolio-format';

/**
 * My portfolio — shares the signed-in user typed in or uploaded themselves.
 *
 * It describes their own numbers and nothing else: no broker link, no order
 * affordance, no verdicts. Wording follows the portfolio vocabulary in CLAUDE.md
 * ("Added shares", "Removed shares", "Number of shares", "Average cost").
 */

type Result = { ok: true } | { ok: false; message: string };

async function request(
  url: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<Result & { data?: unknown }> {
  try {
    const init: RequestInit =
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const response = await fetch(url, init);
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: payload };
    const err = payload as { error?: string; remedy?: string } | null;
    return {
      ok: false,
      message: [err?.error, err?.remedy].filter(Boolean).join(' ') || 'Something went wrong.',
    };
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }
}

const KIND_LABEL: Record<PortfolioEntryDto['kind'], string> = {
  opening: 'Shares I own',
  add: 'Added shares',
  remove: 'Removed shares',
};

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const pctText = (ratio: number, decimals = 1) => `${(Math.abs(ratio) * 100).toFixed(decimals)}%`;

export function PortfolioView({ portfolio }: { portfolio: PortfolioDto }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [entriesOpen, setEntriesOpen] = React.useState(false);
  const refresh = React.useCallback(() => router.refresh(), [router]);
  const empty = portfolio.entryCount === 0;

  return (
    <AppShell>
      <PageContainer>
        <PageHeader>
          <PageHeading>
            <PageTitle>My portfolio</PageTitle>
            <PageDescription>
              The shares you hold, valued at the latest price we have. You type them in or upload a
              file. EquityWise never connects to your broker, and nothing here places an order.
            </PageDescription>
          </PageHeading>
          <PageActions className="max-w-full flex-wrap">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon /> Add shares
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <FileUpIcon /> Upload a file
            </Button>
            {!empty && (
              <>
                <Button size="sm" variant="outline" onClick={() => exportCsv(portfolio.holdings)}>
                  <DownloadIcon /> Export CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEntriesOpen(true)}>
                  <ListIcon /> Your entries
                </Button>
              </>
            )}
          </PageActions>
        </PageHeader>

        <PageContent>
          {empty ? (
            <Onboarding onAdd={() => setAddOpen(true)} onImport={() => setImportOpen(true)} />
          ) : (
            <Overview portfolio={portfolio} />
          )}
          <p className="text-xs text-muted-foreground">
            This page describes the numbers you entered. It is not a recommendation, and EquityWise
            is not a SEBI-registered adviser.
          </p>
        </PageContent>
      </PageContainer>

      <AddEntryDialog open={addOpen} onOpenChange={setAddOpen} onSaved={refresh} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onSaved={refresh} />
      <EntriesDialog
        open={entriesOpen}
        onOpenChange={setEntriesOpen}
        portfolio={portfolio}
        onChanged={refresh}
      />
    </AppShell>
  );
}

function Onboarding({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="rounded-lg border border-border bg-surface shadow-subtle">
        <EmptyState
          icon={<ListIcon />}
          title="See how your shares are doing"
          description="Add what you own and this page shows its value, what changed today, your gain since you added them, and how the money is spread. You can type one stock in about twenty seconds, or upload your broker's holdings file."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onAdd}>
                <PlusIcon /> Add shares by hand
              </Button>
              <Button variant="outline" onClick={onImport}>
                <FileUpIcon /> Upload a file
              </Button>
            </div>
          }
        />
      </div>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheckIcon className="size-4" /> Who can see this
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Only you.</strong> No other user, and no staff
            screen, shows your shares.
          </li>
          <li>
            <strong className="text-foreground">No broker link.</strong> We never ask for your
            broker login.
          </li>
          <li>
            <strong className="text-foreground">Files are not kept.</strong> We read your file, show
            you every row, and save only the rows you approve.
          </li>
          <li>
            <strong className="text-foreground">You can delete everything</strong> with one button.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Overview({ portfolio }: { portfolio: PortfolioDto }) {
  const { totals } = portfolio;
  const facts = standOut(portfolio.holdings);
  return (
    <>
      {portfolio.pricesStale && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          The prices below are from{' '}
          {portfolio.pricesAsOf === null
            ? 'an earlier day'
            : longDate(portfolio.pricesAsOf.slice(0, 10))}
          . Today&apos;s prices have not arrived, so values may be out of date.
        </p>
      )}
      {totals.unpriced > 0 && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {totals.unpriced} {totals.unpriced === 1 ? 'holding has' : 'holdings have'} no price yet
          and {totals.unpriced === 1 ? 'is' : 'are'} left out of value and gain. Prices are fetched
          for new names within a few minutes.
        </p>
      )}
      {portfolio.problems.map((problem) => (
        <p
          key={problem}
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {problem}
        </p>
      ))}

      <Section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Value"
          hint="Shares you hold times the latest price we have for each."
          value={
            <span className="text-2xl font-semibold tabular-nums">
              {formatPaise(totals.valuePaise, { decimals: 0 })}
            </span>
          }
          footer={
            portfolio.pricesAsOf === null
              ? 'No prices yet'
              : `Prices as of ${longDate(portfolio.pricesAsOf.slice(0, 10))}`
          }
        />
        <MetricCard
          label="Today"
          hint="How much your holdings moved since yesterday's close."
          value={
            <PriceChange
              paise={totals.dayChangePaise}
              percent={totals.dayChangeRatio === null ? null : totals.dayChangeRatio * 100}
              size="lg"
            />
          }
        />
        <MetricCard
          label="Total gain"
          hint="What your shares are worth now minus what you paid for them. It leaves out shares you removed and dividends."
          value={
            <PriceChange
              paise={totals.gainPaise}
              percent={totals.gainRatio === null ? null : totals.gainRatio * 100}
              size="lg"
            />
          }
        />
        <MetricCard
          label="You paid"
          hint="The total you spent on the shares you still hold, with any charges you entered."
          value={
            <span className="text-2xl font-semibold tabular-nums">
              {formatPaise(totals.costPaise, { decimals: 0 })}
            </span>
          }
          footer={`${portfolio.holdings.length} ${portfolio.holdings.length === 1 ? 'holding' : 'holdings'}`}
        />
      </Section>

      {facts.length > 0 && (
        <Section
          aria-labelledby="stands-out"
          className="rounded-lg border border-border bg-surface p-4 shadow-subtle"
        >
          <h2 id="stands-out" className="mb-2 text-sm font-semibold">
            What stands out
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Facts about your own list. Not a suggestion to do anything.
          </p>
        </Section>
      )}

      <HoldingsTable holdings={portfolio.holdings} />
    </>
  );
}

/** Plain facts about the user's own list: the largest holding, anything below cost. */
export function standOut(holdings: readonly PortfolioHoldingDto[]): string[] {
  const out: string[] = [];
  const priced = holdings.filter((h) => h.weight !== null && h.valuePaise !== null);
  const top = [...priced].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  if (top !== undefined && priced.length >= 2 && top.weight !== null) {
    out.push(`${top.name} is ${pctText(top.weight)} of your value. It is your largest holding.`);
  }
  const below = priced.filter((h) => (h.gainRatio ?? 0) < 0);
  if (below.length > 0) {
    const worst = [...below].sort((a, b) => (a.gainRatio ?? 0) - (b.gainRatio ?? 0))[0];
    out.push(
      `${below.length} of ${priced.length} ${priced.length === 1 ? 'holding is' : 'holdings are'} below your average cost${worst?.gainRatio == null ? '' : `; ${worst.name} is ${pctText(worst.gainRatio)} below`}.`,
    );
  }
  for (const h of holdings) {
    for (const a of h.adjustments) {
      out.push(
        `${h.name}: share count adjusted for a ${a.kind} with ex-date ${longDate(a.exDate)}.`,
      );
    }
  }
  return out;
}

function HoldingsTable({ holdings }: { holdings: readonly PortfolioHoldingDto[] }) {
  const [sort, setSort] = React.useState<'value' | 'gain' | 'day' | 'name'>('value');
  const [query, setQuery] = React.useState('');
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter(
      (h) => q === '' || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q),
    );
    const key = (h: PortfolioHoldingDto) =>
      sort === 'gain'
        ? (h.gainRatio ?? -Infinity)
        : sort === 'day'
          ? (h.dayChangeRatio ?? -Infinity)
          : (h.valuePaise ?? h.costPaise);
    return [...filtered].sort((a, b) =>
      sort === 'name' ? a.symbol.localeCompare(b.symbol) : key(b) - key(a),
    );
  }, [holdings, sort, query]);

  return (
    <Section aria-labelledby="holdings-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="holdings-h" className="text-sm font-semibold">
          Your holdings ({holdings.length})
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your holdings"
            aria-label="Search your holdings"
            className="h-8 w-48"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-8 w-40" aria-label="Sort holdings">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value">Sort: Value</SelectItem>
              <SelectItem value="gain">Sort: Total gain %</SelectItem>
              <SelectItem value="day">Sort: Today %</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-subtle md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 text-right font-medium">Shares</th>
              <th className="px-3 py-2 text-right font-medium">Average cost</th>
              <th className="px-3 py-2 text-right font-medium">Last price</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">Today</th>
              <th className="px-3 py-2 text-right font-medium">Total gain</th>
              <th className="px-3 py-2 text-right font-medium">Share of value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {rows.map((h) => (
              <tr key={h.instrumentId}>
                <td className="px-3 py-2">
                  <div className="font-medium">{h.symbol}</div>
                  <div className="max-w-56 truncate text-xs text-muted-foreground">{h.name}</div>
                </td>
                <td className="px-3 py-2 text-right">{h.shares.toLocaleString('en-IN')}</td>
                <td className="px-3 py-2 text-right">
                  <Price paise={h.avgCostPaise} />
                </td>
                <td className="px-3 py-2 text-right">
                  {h.ltpPaise === null ? (
                    <span className="text-muted-foreground">No price yet</span>
                  ) : (
                    <Price paise={h.ltpPaise} />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {h.valuePaise === null ? '—' : formatPaise(h.valuePaise, { decimals: 0 })}
                </td>
                <td className="px-3 py-2 text-right">
                  <PercentChange
                    value={h.dayChangeRatio === null ? null : h.dayChangeRatio * 100}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {h.gainPaise === null ? (
                    '—'
                  ) : (
                    <div className="flex flex-col items-end">
                      <PriceChange paise={h.gainPaise} />
                      <PercentChange
                        value={h.gainRatio === null ? null : h.gainRatio * 100}
                        className="text-xs"
                      />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {h.weight === null ? '—' : pctText(h.weight)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No holdings match your search.</p>
        )}
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((h) => (
          <li
            key={h.instrumentId}
            className="rounded-lg border border-border bg-surface p-3 shadow-subtle"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{h.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">{h.name}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-medium">
                  {h.valuePaise === null ? '—' : formatPaise(h.valuePaise, { decimals: 0 })}
                </div>
                {h.gainPaise !== null && (
                  <PriceChange
                    paise={h.gainPaise}
                    percent={h.gainRatio === null ? null : h.gainRatio * 100}
                    className="text-xs"
                  />
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
              <span>
                {h.shares.toLocaleString('en-IN')} shares · average {formatPaise(h.avgCostPaise)}
              </span>
              <span>{h.weight === null ? '' : `${pctText(h.weight)} of value`}</span>
              <span>
                {h.dayChangeRatio === null ? '' : <PercentChange value={h.dayChangeRatio * 100} />}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Add by hand
// ---------------------------------------------------------------------------

interface SearchHit {
  readonly symbol: string;
  readonly name: string;
}

function AddEntryDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [kind, setKind] = React.useState<AddEntryBody['kind']>('opening');
  const [query, setQuery] = React.useState('');
  const [picked, setPicked] = React.useState<SearchHit | null>(null);
  const [hits, setHits] = React.useState<readonly SearchHit[]>([]);
  const [shares, setShares] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [charges, setCharges] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [more, setMore] = React.useState(false);

  React.useEffect(() => {
    if (!open || picked !== null || query.trim() === '') {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(API_ROUTES.search(query.trim()), { signal: controller.signal, cache: 'no-store' })
        .then((r) => r.json())
        .then((p: { results?: readonly SearchHit[] }) => setHits((p.results ?? []).slice(0, 6)))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, picked, open]);

  const reset = () => {
    setQuery('');
    setPicked(null);
    setHits([]);
    setShares('');
    setPrice('');
    setCharges('');
    setDate(today);
    setError(null);
  };

  const save = async (another: boolean) => {
    if (picked === null) return setError('Choose a stock from the list.');
    const n = Number(shares.replace(/,/g, ''));
    if (!Number.isInteger(n) || n < 1)
      return setError('Enter the number of shares as a whole number.');
    const pricePaise = parseRupeesInput(price);
    if (pricePaise === null || pricePaise <= 0)
      return setError(
        kind === 'opening'
          ? 'Enter your average cost a share in rupees, for example 1245.50.'
          : 'Enter the price a share in rupees, for example 1245.50.',
      );
    const chargesPaise = charges.trim() === '' ? 0 : parseRupeesInput(charges);
    if (chargesPaise === null || chargesPaise < 0)
      return setError('Enter charges in rupees, or leave it empty.');
    setBusy(true);
    setError(null);
    const result = await request('/api/portfolio/entries', 'POST', {
      symbol: picked.symbol,
      kind,
      tradeDate: date,
      shares: n,
      pricePaise,
      chargesPaise,
    } satisfies AddEntryBody);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onSaved();
    if (another) reset();
    else {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add shares</DialogTitle>
          <DialogDescription>
            Enter what you own, or shares you added or removed. We keep your numbers exactly as
            typed.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-kind">What are you entering?</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AddEntryBody['kind'])}>
              <SelectTrigger id="pf-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opening">Shares I own now</SelectItem>
                <SelectItem value="add">Added shares on a date</SelectItem>
                <SelectItem value="remove">Removed shares on a date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex flex-col gap-1.5">
            <Label htmlFor="pf-stock">Stock</Label>
            {picked === null ? (
              <Input
                id="pf-stock"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or NSE symbol"
                autoComplete="off"
              />
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  <strong>{picked.symbol}</strong>{' '}
                  <span className="text-muted-foreground">{picked.name}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPicked(null);
                    setQuery('');
                  }}
                >
                  Change
                </Button>
              </div>
            )}
            {hits.length > 0 && picked === null && (
              <ul
                className="rounded-md border border-border bg-surface shadow-subtle"
                aria-label="Matching stocks"
              >
                {hits.map((hit) => (
                  <li key={hit.symbol}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
                      onClick={() => {
                        setPicked(hit);
                        setHits([]);
                      }}
                    >
                      <strong>{hit.symbol}</strong>
                      <span className="truncate text-muted-foreground">{hit.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-shares">Number of shares</Label>
              <Input
                id="pf-shares"
                inputMode="numeric"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-price">
                {kind === 'opening'
                  ? 'Average cost a share (₹)'
                  : kind === 'add'
                    ? 'Price you paid a share (₹)'
                    : 'Price you got a share (₹)'}
              </Label>
              <Input
                id="pf-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1245.50"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-date">{kind === 'opening' ? 'Numbers are true on' : 'Date'}</Label>
              <Input
                id="pf-date"
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            {kind !== 'opening' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pf-charges">Brokerage and taxes (₹, optional)</Label>
                <Input
                  id="pf-charges"
                  inputMode="decimal"
                  value={charges}
                  onChange={(e) => setCharges(e.target.value)}
                  placeholder="38.20"
                />
              </div>
            )}
          </div>
          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline"
            onClick={() => setMore((m) => !m)}
          >
            {more ? 'Hide tips' : 'Tips'}
          </button>
          {more && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              <li>Shares from an IPO: use the allotment price and the allotment date.</li>
              <li>
                Splits and bonuses are applied for you from the exchange record. Do not adjust for
                them.
              </li>
              <li>A holdings file from your broker is quicker than typing each stock.</li>
            </ul>
          )}
          {error !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(true)}>
              Save and add another
            </Button>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Upload a file
// ---------------------------------------------------------------------------

const STATUS_VARIANT = { ready: 'neutral', check: 'warning', skipped: 'outline' } as const;
const STATUS_LABEL = { ready: '✓ Ready', check: '! Check', skipped: 'Skipped' } as const;

function ImportDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [text, setText] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [preview, setPreview] = React.useState<ImportPreviewDto | null>(null);
  const [includeChecked, setIncludeChecked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);

  const reset = () => {
    setText(null);
    setFileName('');
    setPreview(null);
    setIncludeChecked(false);
    setError(null);
    setDone(null);
  };

  const onFile = async (file: File | undefined) => {
    if (file === undefined) return;
    reset();
    if (file.size > 1_000_000) return setError('That file is too large to import.');
    if (/\.xlsx?$/i.test(file.name))
      return setError(
        'Excel files are not supported yet. Open it in Excel or Google Sheets and save it as CSV, then upload that.',
      );
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setBusy(true);
    const result = await request('/api/portfolio/import', 'POST', { text: content });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setPreview(result.data as ImportPreviewDto);
  };

  const commit = async () => {
    if (text === null) return;
    setBusy(true);
    setError(null);
    const result = await request('/api/portfolio/import', 'POST', {
      text,
      commit: true,
      includeChecked,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const r = result.data as { inserted: number; skippedDuplicates: number; replaced: number };
    setDone(
      `Imported ${r.inserted} ${r.inserted === 1 ? 'row' : 'rows'}${r.skippedDuplicates > 0 ? `, ${r.skippedDuplicates} already imported` : ''}.`,
    );
    onSaved();
  };

  const toSave =
    preview === null ? 0 : preview.counts.ready + (includeChecked ? preview.counts.check : 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload a file</DialogTitle>
          <DialogDescription>
            A holdings file (stock, shares, average cost) or a trade list (stock, date, buy or sell,
            shares, price), saved as CSV. We show every row before anything is saved, and we do not
            keep the file.
          </DialogDescription>
        </DialogHeader>

        {done !== null ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm">
              {done}
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pf-file">CSV file</Label>
              <Input
                id="pf-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              {fileName !== '' && <span className="text-xs text-muted-foreground">{fileName}</span>}
            </div>
            {error !== null && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {busy && preview === null && (
              <p className="text-sm text-muted-foreground">Reading the file…</p>
            )}

            {preview !== null && (
              <>
                <p className="text-sm">
                  <strong>{preview.counts.ready}</strong> ready ·{' '}
                  <strong>{preview.counts.check}</strong> to check ·{' '}
                  <strong>{preview.counts.skipped}</strong> skipped
                  <span className="text-muted-foreground">
                    {' '}
                    ·{' '}
                    {preview.fileKind === 'holdings'
                      ? 'a holdings file, dated today'
                      : 'a trade list'}
                  </span>
                </p>
                {preview.replaces.length > 0 && (
                  <p
                    role="status"
                    className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
                  >
                    This holdings file replaces the entries you already have for{' '}
                    {preview.replaces.slice(0, 6).join(', ')}
                    {preview.replaces.length > 6 ? ` and ${preview.replaces.length - 6} more` : ''}.
                  </p>
                )}
                <div className="max-h-72 overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5">Stock</th>
                        <th className="px-2 py-1.5">Date</th>
                        <th className="px-2 py-1.5 text-right">Shares</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {preview.rows.map((row) => (
                        <tr key={row.line} className="align-top">
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{row.symbol ?? row.fileSymbol}</div>
                            <div className="text-xs text-muted-foreground">{row.message}</div>
                          </td>
                          <td className="px-2 py-1.5">{longDate(row.tradeDate)}</td>
                          <td className="px-2 py-1.5 text-right">{row.shares}</td>
                          <td className="px-2 py-1.5 text-right">
                            {row.amountPaise > 0
                              ? formatPaise(row.amountPaise, { decimals: 0 })
                              : '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant={STATUS_VARIANT[row.status]}
                              className="whitespace-nowrap"
                            >
                              {STATUS_LABEL[row.status]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.counts.check > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="pf-include-checked"
                      checked={includeChecked}
                      onCheckedChange={(v) => setIncludeChecked(v === true)}
                    />
                    <Label htmlFor="pf-include-checked" className="font-normal">
                      Also save the {preview.counts.check} rows marked Check
                    </Label>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy || toSave === 0} onClick={() => void commit()}>
                    {toSave === 0
                      ? 'Nothing to import'
                      : `Import ${toSave} ${toSave === 1 ? 'row' : 'rows'}`}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Entries, delete, delete all
// ---------------------------------------------------------------------------

function EntriesDialog({
  open,
  onOpenChange,
  portfolio,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  portfolio: PortfolioDto;
  onChanged: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [confirmAll, setConfirmAll] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const remove = async (id: number) => {
    setBusy(true);
    setError(null);
    const result = await request(`/api/portfolio/entries/${id}`, 'DELETE');
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onChanged();
  };
  const removeAll = async () => {
    setBusy(true);
    setError(null);
    const result = await request('/api/portfolio', 'DELETE');
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setConfirmAll(false);
    onOpenChange(false);
    onChanged();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setConfirmAll(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your entries</DialogTitle>
          <DialogDescription>
            {portfolio.entryCount} of {portfolio.entryLimit} entries. Your holdings are worked out
            from these.
          </DialogDescription>
        </DialogHeader>
        {error !== null && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <ul className="max-h-80 divide-y divide-border overflow-auto rounded-md border border-border text-sm">
          {portfolio.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {entry.symbol}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {KIND_LABEL[entry.kind]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {longDate(entry.tradeDate)} · {entry.shares} shares ·{' '}
                  {formatPaise(entry.amountPaise)} {entry.source === 'file' ? '· from a file' : ''}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={`Delete ${entry.symbol} entry from ${longDate(entry.tradeDate)}`}
                onClick={() => void remove(entry.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
        {portfolio.entryCount > portfolio.entries.length && (
          <p className="text-xs text-muted-foreground">
            Showing the newest {portfolio.entries.length}.
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          {confirmAll ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">
                Delete all {portfolio.entryCount} entries? This cannot be undone.
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void removeAll()}
              >
                Yes, delete everything
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmAll(false)}>
                Keep them
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
              <Trash2Icon /> Delete all my entries
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function exportCsv(holdings: readonly PortfolioHoldingDto[]) {
  const header = ['Symbol', 'Name', 'Shares', 'Average cost', 'Last price', 'Value', 'Total gain'];
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = holdings.map((h) =>
    [
      q(h.symbol),
      q(h.name),
      String(h.shares),
      paiseToPlain(h.avgCostPaise),
      h.ltpPaise === null ? '' : paiseToPlain(h.ltpPaise),
      h.valuePaise === null ? '' : paiseToPlain(h.valuePaise),
      h.gainPaise === null ? '' : paiseToPlain(h.gainPaise),
    ].join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-portfolio.csv';
  a.click();
  URL.revokeObjectURL(url);
}
