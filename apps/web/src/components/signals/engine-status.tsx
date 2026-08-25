'use client';

import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { agoLabel, istTime } from '@/lib/format';
import type { IntradayFeedDto } from '@/lib/intraday-types';
import {
  derivePipelineStatus,
  type PipelineStatus,
  type PipelineTone,
} from '@/lib/pipeline-status';
import { cn } from '@/lib/utils';

/**
 * "Is the engine actually running?" as one glanceable, click-for-detail
 * indicator — the thing this page could not answer before.
 *
 * Everything shown is read straight off `IntradayFeedDto` via
 * `derivePipelineStatus`; nothing here is a separately animated "running..."
 * — the dot only pulses in states the data itself says are active
 * (`live`/`processing`), and the label changes only when the underlying run
 * row, market state or staleness flag changes.
 */

const TONE_PILL: Record<PipelineTone, string> = {
  positive: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
  caution: 'bg-warning-soft text-warning-foreground ring-warning-line',
  critical: 'bg-destructive-soft text-destructive ring-destructive-line',
  neutral: 'bg-neutral-soft text-neutral-strong ring-neutral-line',
};

const TONE_DOT: Record<PipelineTone, string> = {
  positive: 'bg-market-open',
  caution: 'bg-warning-foreground',
  critical: 'bg-destructive',
  neutral: 'bg-current opacity-60',
};

export function EngineStatus({
  feed,
  className,
}: {
  feed: IntradayFeedDto;
  className?: string | undefined;
}) {
  // Ticks locally so the badge can age from "Live processing · 4s ago" toward
  // a "delayed"/"stopped" read between polls, not only at fetch time — the
  // same pattern `LastUpdated` and `LastUpdated`'s siblings already use.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const clock = now ?? new Date(feed.fetchedAt).getTime();
  const status = derivePipelineStatus({
    market: feed.market,
    run: feed.run,
    stale: feed.stale,
    now: clock,
  });
  const pulsing = status.state === 'live' || status.state === 'processing';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors hover:brightness-95',
            TONE_PILL[status.tone],
            className,
          )}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              TONE_DOT[status.tone],
              pulsing && 'animate-pulse',
            )}
            aria-hidden
          />
          {status.label}
          {status.lastActivityAt !== null && (
            <span className="figure font-mono text-[0.6875rem] opacity-80">
              · {agoLabel(status.lastActivityAt, clock)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <EngineStatusDetail feed={feed} status={status} now={clock} />
      </PopoverContent>
    </Popover>
  );
}

function EngineStatusDetail({
  feed,
  status,
  now,
}: {
  feed: IntradayFeedDto;
  status: PipelineStatus;
  now: number;
}) {
  const run = feed.run;
  const marketDataLabel =
    status.marketData === 'receiving'
      ? run !== null
        ? `Receiving (${run.symbolsEvaluated} of ${run.symbolsRequested} symbols)`
        : 'Receiving'
      : status.marketData === 'no_data'
        ? 'No prices in the last pass'
        : 'Unknown';
  const marketDataTone: PipelineTone =
    status.marketData === 'receiving'
      ? 'positive'
      : status.marketData === 'no_data'
        ? 'critical'
        : 'neutral';
  const marketLabel =
    status.market === 'open' ? 'Open' : status.market === 'closed' ? 'Closed' : 'Unknown';
  const marketTone: PipelineTone =
    status.market === 'open' ? 'positive' : status.market === 'closed' ? 'neutral' : 'critical';

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-foreground text-sm">Intraday signal engine</p>
        <p className="mt-0.5 text-muted-foreground text-xs">{status.detail}</p>
      </div>

      <dl className="space-y-1.5 text-xs">
        <DetailRow label="Scanning" value={status.label} tone={status.tone} />
        <DetailRow label="Market" value={marketLabel} tone={marketTone} />
        <DetailRow label="Market data" value={marketDataLabel} tone={marketDataTone} />
      </dl>

      <div className="space-y-1 border-border border-t pt-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last scanned</span>
          <span className="figure font-mono">
            {status.lastActivityAt === null
              ? 'Never this session'
              : `${agoLabel(status.lastActivityAt, now)} · ${istTime(status.lastActivityAt)} IST`}
          </span>
        </div>
        {run !== null && run.skippedCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Skipped this cycle</span>
            <span className="figure font-mono">{run.skippedCount} symbols</span>
          </div>
        )}
        {run?.error !== null && run?.error !== undefined && (
          <p className="text-destructive">{run.error}</p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone: PipelineTone }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden />
        {value}
      </dd>
    </div>
  );
}
