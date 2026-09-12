'use client';

import { CheckIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Text } from '@/components/ui/typography';
import type {
  AttentionLevel,
  BriefSessionMeta,
  BriefWatchlistRef,
  MarketConditionLabel,
} from '@/lib/market-brief';
import { cn } from '@/lib/utils';

/** IST-formatted trading date, e.g. "Fri, 11 Sep 2026". */
export function formatSessionDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  // Noon UTC keeps the intended calendar date whatever the viewer's timezone.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** IST-formatted timestamp for the "last successful data" line. */
export function formatIstTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

const STATUS_LABEL: Record<BriefSessionMeta['status'], string> = {
  complete: 'Complete',
  partial: 'Partial',
  stale: 'Stale',
  unavailable: 'Unavailable',
};

const STATUS_VARIANT: Record<
  BriefSessionMeta['status'],
  'bullish' | 'warning' | 'neutral' | 'destructive'
> = {
  complete: 'bullish',
  partial: 'warning',
  stale: 'warning',
  unavailable: 'destructive',
};

export function StatusBadge({ status }: { status: BriefSessionMeta['status'] }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} size="sm">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** The stale / partial / unavailable banner. Nothing for a complete session. */
export function StatusBanner({ session }: { session: BriefSessionMeta }) {
  if (session.status === 'complete') return null;

  if (session.status === 'unavailable') {
    return (
      <Alert variant="warning">
        <AlertTitle>No completed session data</AlertTitle>
        <AlertDescription>
          The latest end-of-day pass has not produced data yet. This can happen before the daily
          pipeline runs, or if market-data access is temporarily unavailable. The brief will fill in
          once a session completes.
        </AlertDescription>
      </Alert>
    );
  }

  if (session.status === 'stale') {
    return (
      <Alert variant="warning">
        <AlertTitle>Showing an older session</AlertTitle>
        <AlertDescription>
          The most recent completed session ({formatSessionDate(session.sessionDate)}) is{' '}
          {session.sessionsBehind === 1 ? '1 session' : `${session.sessionsBehind} sessions`} behind
          what would be expected. It may reflect an exchange holiday or a delayed data pass.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <AlertTitle>Partial coverage</AlertTitle>
      <AlertDescription>
        Only {session.availableInstruments} of {session.expectedInstruments} instruments had
        completed data for this session. Counts below are computed against the instruments that do.
      </AlertDescription>
    </Alert>
  );
}

const CONDITION_LABEL: Record<MarketConditionLabel, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  mixed: 'Mixed',
  transitional: 'Transitional',
  insufficient_data: 'Insufficient data',
};

const CONDITION_VARIANT: Record<
  MarketConditionLabel,
  'bullish' | 'bearish' | 'neutral' | 'warning'
> = {
  bullish: 'bullish',
  bearish: 'bearish',
  mixed: 'neutral',
  transitional: 'warning',
  insufficient_data: 'neutral',
};

export function conditionLabel(label: MarketConditionLabel): string {
  return CONDITION_LABEL[label];
}

export function ConditionBadge({ label }: { label: MarketConditionLabel }) {
  return (
    <Badge variant={CONDITION_VARIANT[label]} size="lg">
      {CONDITION_LABEL[label]}
    </Badge>
  );
}

const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  high: 'High attention',
  medium: 'Medium attention',
  monitor: 'Monitor',
};

const ATTENTION_VARIANT: Record<AttentionLevel, 'bearish' | 'warning' | 'neutral'> = {
  high: 'bearish',
  medium: 'warning',
  monitor: 'neutral',
};

export function AttentionBadge({ level }: { level: AttentionLevel }) {
  return (
    <Badge variant={ATTENTION_VARIANT[level]} size="sm">
      {ATTENTION_LABEL[level]}
    </Badge>
  );
}

/**
 * Composition bar for advancers / decliners / unchanged.
 *
 * Direction is carried by an explicit text label and the segment order, never
 * by colour alone (an accessibility requirement). The bar is `role="img"` with
 * a full-sentence label so a screen reader reads the breadth, not the pixels.
 */
export function BreadthBar({
  advances,
  declines,
  unchanged,
}: {
  advances: number;
  declines: number;
  unchanged: number;
}) {
  const total = advances + declines + unchanged;
  const pct = (n: number): number => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${advances} advancing, ${declines} declining, ${unchanged} unchanged`}
      >
        <div className="bg-bullish" style={{ width: `${pct(advances)}%` }} />
        <div className="bg-neutral-strong/40" style={{ width: `${pct(unchanged)}%` }} />
        <div className="bg-bearish" style={{ width: `${pct(declines)}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-bullish-strong">▲ {advances} advancing</span>
        <span className="text-muted-foreground">● {unchanged} unchanged</span>
        <span className="text-bearish-strong">▼ {declines} declining</span>
      </div>
    </div>
  );
}

/** The watchlists an instrument belongs to, as small chips. */
export function WatchlistChips({ refs }: { refs: readonly BriefWatchlistRef[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {refs.map((ref) => (
        <Badge key={ref.watchlistId} variant="outline" size="sm" className="font-normal">
          {ref.name}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Adds a stock to the user's default watchlist.
 *
 * Shown only when the name is not already on a list; posts to the existing
 * items endpoint. When the user has no watchlist at all, it links them to the
 * watchlists page rather than failing silently.
 */
export function AddToWatchlist({
  symbol,
  defaultWatchlistId,
  alreadyWatched,
}: {
  symbol: string;
  defaultWatchlistId: number | null;
  alreadyWatched: boolean;
}) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (alreadyWatched || done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon aria-hidden className="size-3.5" />
        Watching
      </span>
    );
  }

  const onAdd = async (): Promise<void> => {
    if (defaultWatchlistId === null) {
      toast({
        title: 'No watchlist yet',
        description: 'Create a watchlist first, then add names from here.',
        variant: 'default',
      });
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/watchlists/${defaultWatchlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol] }),
      });
      if (!response.ok) throw new Error('request failed');
      setDone(true);
      toast({ title: `${symbol} added to your watchlist`, variant: 'success' });
    } catch {
      toast({
        title: 'Could not add to watchlist',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={() => void onAdd()}
      disabled={pending}
      aria-label={`Add ${symbol} to your watchlist`}
    >
      <PlusIcon aria-hidden />
      Watch
    </Button>
  );
}

/** A muted stock identity line: symbol in mono, name beside it. */
export function StockName({
  symbol,
  name,
  className,
}: {
  symbol: string;
  name: string;
  className?: string | undefined;
}) {
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className="font-mono text-xs font-medium text-foreground">{symbol}</span>
      <Text as="span" variant="caption" className="truncate">
        {name}
      </Text>
    </span>
  );
}
