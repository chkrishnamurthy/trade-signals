import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { qualityVariant, stateVariant } from '@/lib/intraday-display';
import {
  ACTION_LABEL,
  type IntradaySignalDto,
  type IntradaySignalKind,
  type IntradaySignalState,
  isTerminalState,
  KIND_LABEL,
  QUALITY_LABEL,
  type SignalQuality,
  STATE_LABEL,
  type TradeDirection,
} from '@/lib/intraday-types';
import { cn } from '@/lib/utils';

/**
 * The intraday signal vocabulary.
 *
 * One place decides how a direction, a lifecycle state and a quality band
 * look, so a card, a table row and a drawer cannot drift apart.
 *
 * A note on wording. The direction badge says BUY or SELL because that is the
 * fastest thing to scan and it is what the user asked for. Everything around it
 * stays technical — "Technical entry zone", "Invalidation level", "Breakout
 * candidate" — because the application does not place, hold or represent an
 * order, and its language should not imply otherwise. There is no order button
 * anywhere in this feature, by design.
 */

/** BUY / SELL. Colour is never the only carrier — the word is the signal. */
export function ActionBadge({
  direction,
  state,
  size = 'default',
  className,
}: {
  direction: TradeDirection;
  /** A terminal signal is rendered muted: it is history, not an opportunity. */
  state?: IntradaySignalState | undefined;
  size?: 'sm' | 'default' | 'lg' | undefined;
  className?: string | undefined;
}) {
  const spent = state !== undefined && isTerminalState(state);
  const variant = spent ? 'neutral' : direction === 'long' ? 'bullish' : 'bearish';
  return (
    <Badge variant={variant} size={size} className={cn('font-semibold tracking-wide', className)}>
      {ACTION_LABEL[direction]}
    </Badge>
  );
}

/** Where the signal is in its life. */
export function StateBadge({
  state,
  className,
}: {
  state: IntradaySignalState;
  className?: string | undefined;
}) {
  return (
    <Badge variant={stateVariant(state)} size="sm" className={cn('font-normal', className)}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

/** The score band: Exceptional / Strong / Good / Watch. */
export function QualityBadge({
  quality,
  className,
}: {
  quality: SignalQuality;
  className?: string | undefined;
}) {
  return (
    <Badge variant={qualityVariant(quality)} size="sm" className={className}>
      {QUALITY_LABEL[quality]}
    </Badge>
  );
}

/** The setup family — Breakout, VWAP reclaim, Momentum. */
export function KindBadge({
  kind,
  className,
}: {
  kind: IntradaySignalKind;
  className?: string | undefined;
}) {
  return (
    <Badge variant="outline" size="sm" className={cn('font-normal', className)}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}

/** The timeframe hierarchy a signal was read on. */
export function TimeframeBadge({ signal }: { signal: IntradaySignalDto }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" size="sm" className="font-mono font-normal">
          {signal.trendMinutes}/{signal.setupMinutes}/{signal.triggerMinutes}m
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Trend {signal.trendMinutes}m · setup {signal.setupMinutes}m · trigger{' '}
        {signal.triggerMinutes}m
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The standing disclaimer.
 *
 * Placed once, prominently, rather than repeated on every card. These are
 * technical observations and nothing here is a claim about profitability —
 * the application has no information from which such a claim could be made.
 */
export function SignalsDisclaimer({ className }: { className?: string | undefined }) {
  return (
    <p className={cn('text-xs text-subtle-foreground', className)}>
      Technical-analysis decision support, not investment advice. Scores describe how many
      independent technical conditions align — not a probability of profit. Orders, if any, are
      placed elsewhere.
    </p>
  );
}

/** A labelled technical level. Always says "technical", never "order". */
export function LevelRow({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string | undefined;
  className?: string | undefined;
}) {
  const row = (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="figure text-sm font-medium">{value}</span>
    </div>
  );
  if (hint === undefined) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
