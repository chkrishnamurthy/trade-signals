'use client';

import {
  CalendarClockIcon,
  ChevronRightIcon,
  InfoIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { KeyPointDto } from '@/lib/stock-types';
import { cn } from '@/lib/utils';

/**
 * "What stands out" — computed facts from the stored snapshot
 * (stock-header plan §5.6). Each row states one fact with its number and
 * opens the tab that shows the evidence. Facts, never advice.
 */

const TAB_NAMES: Readonly<Record<KeyPointDto['tab'], string>> = {
  technicals: 'Technicals',
  delivery: 'Delivery',
  fno: 'F&O',
  ownership: 'Ownership',
  events: 'Events',
};

const TONE_STYLE: Readonly<Record<KeyPointDto['tone'], string>> = {
  bullish: 'bg-bullish-soft text-bullish-strong',
  bearish: 'bg-bearish-soft text-bearish-strong',
  neutral: 'bg-neutral-soft text-neutral-strong',
  info: 'bg-info-soft text-info-strong',
  warning: 'bg-warning-soft text-warning-foreground',
};

const VISIBLE = 4;

function PointIcon({ point }: { point: KeyPointDto }) {
  const cls = 'size-4';
  if (point.tone === 'warning') return <TriangleAlertIcon aria-hidden className={cls} />;
  if (point.tab === 'events') return <CalendarClockIcon aria-hidden className={cls} />;
  if (point.tone === 'bullish') return <TrendingUpIcon aria-hidden className={cls} />;
  if (point.tone === 'bearish') return <TrendingDownIcon aria-hidden className={cls} />;
  if (point.tone === 'neutral') return <MinusIcon aria-hidden className={cls} />;
  return <InfoIcon aria-hidden className={cls} />;
}

export function StandsOut({
  points,
  hasSnapshot,
  onOpenTab,
}: {
  points: readonly KeyPointDto[];
  hasSnapshot: boolean;
  onOpenTab: (tab: KeyPointDto['tab']) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? points : points.slice(0, VISIBLE);

  return (
    <Card className="flex flex-col gap-2 p-4" aria-labelledby="stands-out">
      <h2 id="stands-out" className="font-display font-semibold text-base">
        What stands out
      </h2>
      {points.length === 0 ? (
        <p className="py-2 text-muted-foreground text-sm">
          {hasSnapshot
            ? 'Nothing unusual on the latest session: no breakout, volume or delivery spike, or event in the next two weeks.'
            : 'Readings appear once this stock has a snapshot.'}
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((p) => (
            <li key={p.id} className="border-border border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onOpenTab(p.tab)}
                className="group flex w-full cursor-pointer items-start gap-3 py-2.5 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg',
                    TONE_STYLE[p.tone],
                  )}
                >
                  <PointIcon point={p} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug">{p.text}</span>
                  <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground group-hover:text-primary">
                    See {TAB_NAMES[p.tab]}
                    <ChevronRightIcon aria-hidden className="size-3" />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {points.length > VISIBLE && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${points.length}`}
        </Button>
      )}
      <p className="text-2xs text-muted-foreground">
        Computed from NSE end-of-day data and filings. Facts about price and disclosures, not
        advice.
      </p>
    </Card>
  );
}
