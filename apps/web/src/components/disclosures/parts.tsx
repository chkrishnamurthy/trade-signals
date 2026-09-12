'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Currency } from '@/components/market/numeric';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { TONE_GLYPH, type Tone, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/** IST date+time, e.g. "11 Sep, 04:30 PM". */
export function formatDateTimeIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

/** IST calendar date from a `YYYY-MM-DD` key, e.g. "Fri, 11 Sep 2026". */
export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** The stale / empty banner. Nothing when data is fresh. */
export function FreshnessBanner({
  status,
  latestLabel,
}: {
  status: 'fresh' | 'stale' | 'empty';
  latestLabel: string | null;
}) {
  if (status === 'fresh') return null;
  if (status === 'empty') {
    return (
      <Alert variant="default">
        <AlertTitle>Nothing here yet</AlertTitle>
        <AlertDescription>
          The disclosure feed has not been ingested yet. It will fill in once the worker's next pass
          completes.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning">
      <AlertTitle>Showing older data</AlertTitle>
      <AlertDescription>
        The most recent disclosure is from {latestLabel ?? 'a few days ago'}. This can happen over a
        weekend, an exchange holiday, or a delayed ingestion pass.
      </AlertDescription>
    </Alert>
  );
}

/**
 * A two-way segmented control that flips the `watchlist` query param.
 *
 * Server components read the param and re-render with the scoped data, so no
 * client fetching is needed. Disabled when the user has no watchlist.
 */
export function ScopeToggle({
  watchlistOnly,
  hasWatchlists,
}: {
  watchlistOnly: boolean;
  hasWatchlists: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setScope = useCallback(
    (onlyWatchlist: boolean) => {
      const next = new URLSearchParams(params.toString());
      if (onlyWatchlist) next.set('watchlist', '1');
      else next.delete('watchlist');
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <fieldset
      className="m-0 inline-flex items-center gap-0.5 rounded-md border-0 bg-muted p-0.5 text-muted-foreground text-xs"
      aria-label="Scope"
    >
      <button
        type="button"
        onClick={() => setScope(false)}
        aria-pressed={!watchlistOnly}
        className={cn(
          'rounded-sm px-2.5 py-1 font-medium transition-colors',
          !watchlistOnly ? 'bg-surface text-foreground shadow-subtle' : 'hover:text-foreground',
        )}
      >
        All names
      </button>
      <button
        type="button"
        onClick={() => setScope(true)}
        aria-pressed={watchlistOnly}
        disabled={!hasWatchlists}
        title={hasWatchlists ? undefined : 'Add names to a watchlist first'}
        className={cn(
          'rounded-sm px-2.5 py-1 font-medium transition-colors disabled:opacity-40',
          watchlistOnly ? 'bg-surface text-foreground shadow-subtle' : 'hover:text-foreground',
        )}
      >
        My watchlist
      </button>
    </fieldset>
  );
}

/** Category filter chips that toggle the `category` query param(s). */
export function CategoryChips({
  categories,
  active,
}: {
  categories: readonly string[];
  active: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeSet = new Set(active);

  const toggle = useCallback(
    (category: string) => {
      const next = new URLSearchParams(params.toString());
      const current = next.getAll('category');
      next.delete('category');
      const updated = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      for (const c of updated) next.append('category', c);
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((category) => {
        const on = activeSet.has(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => toggle(category)}
            aria-pressed={on}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-muted-foreground hover:text-foreground',
            )}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

/** A net rupee flow in paise, toned and signed. Positive = net buying. */
export function NetValue({ paise, className }: { paise: number; className?: string | undefined }) {
  const tone: Tone = paise > 0 ? 'bullish' : paise < 0 ? 'bearish' : 'neutral';
  return (
    <span className={cn('inline-flex items-baseline gap-1', toneText({ tone }), className)}>
      <span aria-hidden className="text-[0.75em]">
        {TONE_GLYPH[tone]}
      </span>
      <Currency paise={Math.abs(paise)} />
    </span>
  );
}

export function SideBadge({ side }: { side: 'buy' | 'sell' }) {
  return (
    <Badge variant={side === 'buy' ? 'bullish' : 'bearish'} size="sm">
      {side === 'buy' ? 'Buy' : 'Sell'}
    </Badge>
  );
}

export function DealTypeBadge({ dealType }: { dealType: 'bulk' | 'block' }) {
  return (
    <Badge variant="outline" size="sm" className="font-normal capitalize">
      {dealType}
    </Badge>
  );
}
