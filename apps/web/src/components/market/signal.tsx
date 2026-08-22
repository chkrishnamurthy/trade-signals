import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/typography';
import type { SignalDirection } from '@/lib/dashboard-types';
import { TONE_GLYPH, type Tone, toneFill, toneOf, toneOfDirection, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Signal design language.
 *
 * One vocabulary for the five directions, used by every surface that shows a
 * signal — badge, row, card, drawer, table cell. A page cannot invent a sixth
 * state or a different green.
 *
 * The wording is deliberately descriptive rather than instructional: these
 * components say what the indicators read, never what to do. No BUY, no SELL,
 * no ORDER anywhere in this file.
 */

export const DIRECTION_LABEL: Record<SignalDirection, string> = {
  strong_bullish: 'Strong bullish',
  bullish: 'Bullish',
  neutral: 'Neutral',
  bearish: 'Bearish',
  strong_bearish: 'Strong bearish',
};

/** Doubled glyph for the strong variants, so intensity survives without colour. */
const DIRECTION_GLYPH: Record<SignalDirection, string> = {
  strong_bullish: '▲▲',
  bullish: '▲',
  neutral: '→',
  bearish: '▼',
  strong_bearish: '▼▼',
};

const DIRECTION_BADGE: Record<SignalDirection, 'bullish' | 'bearish' | 'neutral'> = {
  strong_bullish: 'bullish',
  bullish: 'bullish',
  neutral: 'neutral',
  bearish: 'bearish',
  strong_bearish: 'bearish',
};

export function SignalBadge({
  direction,
  compact = false,
  className,
  ...props
}: React.ComponentProps<'span'> & { direction: SignalDirection; compact?: boolean }) {
  return (
    <Badge variant={DIRECTION_BADGE[direction]} className={cn('gap-1', className)} {...props}>
      <span aria-hidden>{DIRECTION_GLYPH[direction]}</span>
      {compact ? (
        <span className="sr-only">{DIRECTION_LABEL[direction]}</span>
      ) : (
        DIRECTION_LABEL[direction]
      )}
    </Badge>
  );
}

/**
 * Strength meter, 0–100 with 50 neutral.
 *
 * The number is always rendered next to the bar. A bar alone is a picture of a
 * number, and a picture cannot be read out, copied, or compared precisely.
 */
export function SignalStrength({
  strength,
  direction,
  tone: toneOverride,
  label,
  showValue = true,
  className,
}: {
  strength: number;
  /** The daily engine's five-way bias. Omit when passing `tone` directly. */
  direction?: SignalDirection | undefined;
  /**
   * Overrides the tone derived from `direction`.
   *
   * The intraday engine speaks in long/short rather than the daily engine's
   * five-way bias, and both must render the same meter — one bar component,
   * one set of colours, whichever vocabulary the caller uses.
   */
  tone?: Tone | undefined;
  /** Accessible description. Defaults to the direction's label. */
  label?: string | undefined;
  showValue?: boolean | undefined;
  className?: string | undefined;
}) {
  const tone = toneOverride ?? (direction === undefined ? 'neutral' : toneOfDirection(direction));
  const description =
    label ?? (direction === undefined ? 'setup strength' : DIRECTION_LABEL[direction]);
  const clamped = Math.min(100, Math.max(0, strength));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Score ${clamped} of 100, ${description}`}
      >
        <div
          className={cn('h-full rounded-full transition-[width]', toneFill({ tone }))}
          style={{ width: `${Math.max(2, clamped)}%` }}
        />
      </div>
      {showValue && (
        <span className="figure w-9 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {clamped}
        </span>
      )}
    </div>
  );
}

/**
 * Headline score with its direction.
 *
 * Never renders without a caller-supplied breakdown slot: a confidence number
 * the factors cannot explain does not go on screen.
 */
export function SignalScore({
  score,
  direction,
  title,
  tone: toneOverride,
  className,
  children,
}: {
  score: number;
  direction?: SignalDirection | undefined;
  /** Heading text. Defaults to the direction's label. */
  title?: string | undefined;
  tone?: Tone | undefined;
  className?: string | undefined;
  /** The factor breakdown. Required — this is the "why" that earns the number. */
  children: React.ReactNode;
}) {
  const tone = toneOverride ?? (direction === undefined ? 'neutral' : toneOfDirection(direction));
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Text variant="section-title">
          {title ?? (direction === undefined ? 'Setup score' : DIRECTION_LABEL[direction])}
        </Text>
        <span className={cn('figure text-lg font-semibold', toneText({ tone }))}>
          {score}
          <span className="text-xs font-normal text-subtle-foreground">/100</span>
        </span>
      </div>
      <SignalStrength strength={score} tone={tone} showValue={false} />
      {children}
    </div>
  );
}

/**
 * One line of the "why this signal?" breakdown.
 *
 * Reads persisted factor rows; it never recomputes an indicator to explain one.
 */
export function SignalReason({
  label,
  detail,
  score,
  className,
}: {
  label: string;
  detail?: string | undefined;
  /** Signed contribution. Zero means the factor was evaluated and did nothing. */
  score: number;
  className?: string | undefined;
}) {
  const tone = toneOf(score);
  const mark = score > 0 ? '✓' : score < 0 ? '✕' : '·';
  return (
    <li className={cn('flex items-start gap-2 text-xs', className)}>
      <span className={cn('w-3 shrink-0 text-center', toneText({ tone }))} aria-hidden>
        {mark}
      </span>
      <span className="min-w-0 flex-1 text-foreground">{label}</span>
      {detail !== undefined && (
        <span className="figure shrink-0 text-muted-foreground">{detail}</span>
      )}
    </li>
  );
}

/** Direction as an inline word + arrow, for table cells and dense rows. */
export function TrendIndicator({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const text = label ?? { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        toneText({ tone }),
        className,
      )}
    >
      {text}
      <span aria-hidden>{TONE_GLYPH[tone]}</span>
    </span>
  );
}

/**
 * Relative-volume indicator.
 *
 * Above 1.5× is the threshold the screener treats as unusual, so the label
 * changes there rather than at an arbitrary visual break.
 */
export function VolumeIndicator({
  relativeVolume,
  className,
}: {
  relativeVolume: number | null;
  className?: string | undefined;
}) {
  if (relativeVolume === null || !Number.isFinite(relativeVolume)) {
    return <span className={cn('text-xs text-subtle-foreground', className)}>—</span>;
  }
  const unusual = relativeVolume >= 1.5;
  return (
    <span
      className={cn(
        'figure inline-flex items-center gap-1 text-xs',
        unusual ? 'font-medium text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {relativeVolume.toFixed(2)}×
      {unusual && <span className="text-[0.6875rem] text-warning">unusual</span>}
    </span>
  );
}

/** A named technical setup — "Golden cross", "52W breakout". */
export function SetupTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" size="sm" className={cn('font-normal', className)}>
      {children}
    </Badge>
  );
}
