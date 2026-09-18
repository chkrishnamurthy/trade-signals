'use client';
import { type PaperTradesPage, paperTradesPageSchema } from '@equitywise/shared';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { API_ROUTES } from '@/lib/api-routes';
import { redirectToLoginIfUnauthenticated } from '@/lib/session-guard';
import { TradesTable } from './trades-table';

export interface HistoryFilter {
  from: string;
  to: string;
  symbol: string;
  outcome: string;
  exitReason: string;
  page: number;
}
const EMPTY: HistoryFilter = { from: '', to: '', symbol: '', outcome: '', exitReason: '', page: 1 };
const PAGE_SIZE = 25;

const query = (f: HistoryFilter, format?: 'csv') =>
  API_ROUTES.paperTrades({
    from: f.from,
    to: f.to,
    symbol: f.symbol.trim().toUpperCase(),
    outcome: f.outcome,
    exitReason: f.exitReason,
    page: f.page,
    pageSize: PAGE_SIZE,
    format,
  });

/** Closed paper trades with filters, stable paging and the same set as CSV. */
export function HistoryCard({ initial }: { initial?: PaperTradesPage }) {
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY);
  const [draft, setDraft] = useState<HistoryFilter>(EMPTY);
  const [page, setPage] = useState<PaperTradesPage | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === undefined);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    setLoading(true);
    fetch(query(filter), { cache: 'no-store' })
      .then(async (response) => {
        if (redirectToLoginIfUnauthenticated(response)) return;
        const json: unknown = await response.json();
        if (!response.ok) throw new Error('Trade history is unavailable right now.');
        if (!cancelled) {
          setPage(paperTradesPageSchema.parse(json));
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Trade history is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, initial]);
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  return (
    <Card aria-labelledby="history-title">
      <CardHeader>
        <CardHeading>
          <CardTitle id="history-title">Completed paper trades</CardTitle>
          <CardDescription>
            Results are net of estimated charges. Unavailable trades (price coverage interrupted)
            are listed but excluded from performance rates.
          </CardDescription>
        </CardHeading>
        <Button asChild variant="outline" size="sm">
          <a href={query(filter, 'csv')} download>
            <DownloadIcon className="size-4" aria-hidden />
            CSV
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ ...draft, page: 1 });
          }}
        >
          <Field label="From" id="history-from">
            <Input
              id="history-from"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </Field>
          <Field label="To" id="history-to">
            <Input
              id="history-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </Field>
          <Field label="Stock" id="history-symbol">
            <Input
              id="history-symbol"
              placeholder="RELIANCE"
              value={draft.symbol}
              onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
            />
          </Field>
          <Field label="Outcome" id="history-outcome">
            <select
              id="history-outcome"
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={draft.outcome}
              onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
            >
              <option value="">Any</option>
              <option value="WIN">Won</option>
              <option value="LOSS">Lost</option>
              <option value="BREAKEVEN">Breakeven</option>
              <option value="UNRESOLVED">Unavailable</option>
            </select>
          </Field>
          <Field label="Exit" id="history-exit">
            <select
              id="history-exit"
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={draft.exitReason}
              onChange={(e) => setDraft({ ...draft, exitReason: e.target.value })}
            >
              <option value="">Any</option>
              <option value="TARGET2">Target 2</option>
              <option value="STOP">Stop</option>
              <option value="BREAKEVEN_STOP">Breakeven stop</option>
              <option value="EOD_SQUARE_OFF">Square-off</option>
              <option value="COVERAGE_UNAVAILABLE">Unavailable</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setFilter(EMPTY);
              }}
            >
              Clear
            </Button>
          </div>
        </form>
        {loading && !page ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : page ? (
          <>
            <TradesTable
              trades={page.trades}
              showDate
              emptyText="No completed paper trades match."
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {page.total} trade{page.total === 1 ? '' : 's'} · page {page.page} of {pages}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page.page <= 1 || loading}
                  onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page.page >= pages || loading}
                  onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
                >
                  Next
                </Button>
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
