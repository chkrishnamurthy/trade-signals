'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricPicker } from '@/components/screener/metric-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { API_ROUTES } from '@/lib/api-routes';
import { type Cue, cuePosition, type RatioTile } from '@/lib/ratio-board';
import type { MetricDto } from '@/lib/screener-types';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * "At a glance" — the stock page's ratio board (stock-header plan §5.2–§5.3).
 *
 * A spec sheet of tiles sharing hairlines: label, value, a small visual cue
 * and one line of context. The viewer chooses the tiles; the layout is saved
 * to their account (one layout for every stock) with an optimistic, debounced
 * write that reverts on failure.
 */

const LIMITS = { min: 3, max: 30 } as const;
const PHONE_VISIBLE = 8;

export function RatioBoard({
  tiles,
  keys,
  saved,
  fnoEligible,
  metrics,
  categories,
  onKeysChange,
}: {
  tiles: readonly RatioTile[];
  keys: readonly string[];
  saved: boolean;
  fnoEligible: boolean;
  metrics: readonly MetricDto[];
  categories: readonly { key: string; label: string }[];
  onKeysChange: (keys: readonly string[], saved: boolean) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const lastSaved = useRef<{ keys: readonly string[]; saved: boolean }>({ keys, saved });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const persist = (next: readonly string[]) => {
    onKeysChange(next, true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(API_ROUTES.stockRatioLayout, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: next }),
        });
        if (!r.ok) throw new Error(String(r.status));
        lastSaved.current = { keys: next, saved: true };
      } catch {
        onKeysChange(lastSaved.current.keys, lastSaved.current.saved);
        toast({
          title: 'Could not save your ratios',
          description: 'Your previous layout is back. Try again in a moment.',
          variant: 'destructive',
        });
      }
    }, 600);
  };

  const reset = async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    try {
      const r = await fetch(`${API_ROUTES.stockRatioLayout}${fnoEligible ? '?fno=1' : ''}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error(String(r.status));
      const body = (await r.json()) as { keys: string[]; saved: boolean };
      lastSaved.current = body;
      onKeysChange(body.keys, false);
    } catch {
      toast({ title: 'Could not reset your ratios', variant: 'destructive' });
    }
  };

  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= keys.length) return;
    const next = [...keys];
    const [item] = next.splice(index, 1);
    if (item !== undefined) next.splice(target, 0, item);
    persist(next);
  };
  const remove = (index: number) => {
    if (keys.length <= LIMITS.min) return;
    persist(keys.filter((_, i) => i !== index));
  };
  const add = (key: string) => {
    if (keys.includes(key) || keys.length >= LIMITS.max) return;
    persist([...keys, key]);
  };

  const pickable = useMemo(() => metrics.filter((m) => !keys.includes(m.key)), [metrics, keys]);
  const canAdd = keys.length < LIMITS.max;
  const hiddenOnPhone = !showAll && !editing && tiles.length > PHONE_VISIBLE;

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4 sm:p-5" aria-labelledby="at-a-glance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 id="at-a-glance" className="font-display font-semibold text-base">
            At a glance
          </h2>
          <span className="text-muted-foreground text-xs">
            {tiles.length} ratios · {saved ? 'your layout' : 'default layout'}
          </span>
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void reset()} disabled={!saved}>
              <RotateCcwIcon aria-hidden />
              Reset to default
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              <CheckIcon aria-hidden />
              Done
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <SlidersHorizontalIcon aria-hidden />
            Customise
          </Button>
        )}
      </div>

      {editing && (
        <p className="rounded-md bg-surface-sunken px-3 py-2 text-muted-foreground text-xs">
          Move tiles with the arrows, remove with ×, add up to {LIMITS.max}. Saved to your account
          and used on every stock.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {tiles.map((tile, index) => (
          <li
            key={tile.key}
            className={cn(
              'relative flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5 sm:px-3.5 sm:py-3',
              hiddenOnPhone && index >= PHONE_VISIBLE && 'max-sm:hidden',
            )}
          >
            <dl className="flex min-w-0 flex-col gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <dt
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: focus reveals the definition tooltip
                    tabIndex={0}
                    className={cn(
                      'w-fit max-w-full cursor-help truncate text-muted-foreground text-xs underline decoration-border-strong decoration-dotted underline-offset-4',
                      editing && 'pr-6',
                    )}
                  >
                    {tile.label}
                  </dt>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{tile.description}</TooltipContent>
              </Tooltip>
              <dd
                className={cn(
                  'figure truncate font-semibold text-lg leading-tight tracking-tight',
                  tile.value.tone !== null && toneText({ tone: tile.value.tone }),
                )}
              >
                {tile.value.text}
              </dd>
              {tile.cue !== null && (
                <dd aria-hidden>
                  <CueGraphic cue={tile.cue} />
                </dd>
              )}
              {tile.context !== null && (
                <dd className="figure truncate text-2xs text-muted-foreground">{tile.context}</dd>
              )}
            </dl>
            {editing && (
              <>
                <button
                  type="button"
                  aria-label={`Remove ${tile.label}`}
                  disabled={keys.length <= LIMITS.min}
                  onClick={() => remove(index)}
                  className="absolute top-1.5 right-1.5 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-bearish-soft hover:text-bearish-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <XIcon aria-hidden className="size-3.5" />
                </button>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${tile.label} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeftIcon aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${tile.label} later`}
                    disabled={index === tiles.length - 1}
                    onClick={() => move(index, 1)}
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowRightIcon aria-hidden className="size-3.5" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {canAdd && (
          <li className={cn('flex bg-surface', hiddenOnPhone && 'max-sm:hidden')}>
            <MetricPicker metrics={pickable} categories={categories} onSelect={add}>
              <button
                type="button"
                className="m-1.5 flex min-h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-border-strong border-dashed text-muted-foreground text-xs hover:border-primary hover:bg-accent hover:text-foreground"
              >
                <PlusIcon aria-hidden className="size-4" />
                Add ratio
              </button>
            </MetricPicker>
          </li>
        )}
      </ul>

      {hiddenOnPhone && (
        <Button variant="outline" className="sm:hidden" onClick={() => setShowAll(true)}>
          Show all {tiles.length} ratios
        </Button>
      )}
    </Card>
  );
}

/** The tile's visual cue: a meter, a centre-zero bar or the 52-week ribbon. */
function CueGraphic({ cue }: { cue: Cue }) {
  if (cue.kind === 'range') {
    const at = cuePosition(cue.value, cue.low, cue.high);
    return (
      <div className="relative mt-1 h-1.5 rounded-full bg-gradient-to-r from-bearish-soft via-muted to-bullish-soft ring-1 ring-border ring-inset">
        <span
          aria-hidden
          className="-top-1 absolute h-3.5 w-1 -translate-x-1/2 rounded-sm bg-foreground"
          style={{ left: `${at}%` }}
        />
      </div>
    );
  }
  if (cue.kind === 'diverge') {
    const half = Math.min(50, (Math.abs(cue.value) / cue.scale) * 50);
    const up = cue.value >= 0;
    return (
      <div aria-hidden className="relative mt-1 h-1.5 rounded-full bg-muted">
        <span className="absolute top-[-2px] left-1/2 h-2.5 w-px bg-border-strong" />
        <span
          className={cn(
            'absolute top-0 h-1.5',
            up ? 'rounded-r-full bg-positive' : 'rounded-l-full bg-negative',
          )}
          style={up ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
        />
      </div>
    );
  }
  const at = cuePosition(cue.value, cue.min, cue.max);
  return (
    <div aria-hidden className="relative mt-1 h-1.5 rounded-full bg-muted">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
        style={{ width: `${at}%` }}
      />
      {cue.ticks.map((t) => (
        <span
          key={t}
          className="absolute top-[-2px] h-2.5 w-px bg-border-strong"
          style={{ left: `${cuePosition(t, cue.min, cue.max)}%` }}
        />
      ))}
      {cue.compare !== null && (
        <span
          className="-top-1 absolute h-3.5 w-0.5 -translate-x-1/2 rounded-sm bg-foreground/70"
          style={{ left: `${cuePosition(cue.compare, cue.min, cue.max)}%` }}
        />
      )}
    </div>
  );
}
