import { cva, type VariantProps } from 'class-variance-authority';
import type { SignalDirection } from './dashboard-types';

/**
 * Directional tone — the single source of truth for "is this green or red?".
 *
 * Before this module the answer was re-derived in six places (index cards,
 * movers, breadth bars, sector bars, the heatmap and the sparkline) and they
 * had already drifted. Every one of them now asks here.
 *
 * Colour is never the only carrier: each tone ships a glyph, and the domain
 * components render it alongside the value so the meaning survives for anyone
 * who cannot separate red from green.
 */
export type Tone = 'bullish' | 'bearish' | 'neutral';

/** Tone of a signed number. Exactly zero is neutral, never "slightly up". */
export function toneOf(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return 'neutral';
  }
  return value > 0 ? 'bullish' : 'bearish';
}

/**
 * Tone of a signed number whose sign is inverted in meaning.
 *
 * INDIA VIX is the case that forces this to exist: rising volatility is
 * risk-off, so a green "up" treatment reads exactly backwards to anyone
 * scanning the row.
 */
export function invertedToneOf(value: number | null | undefined): Tone {
  const tone = toneOf(value);
  if (tone === 'bullish') return 'bearish';
  if (tone === 'bearish') return 'bullish';
  return 'neutral';
}

export function toneOfDirection(direction: SignalDirection): Tone {
  if (direction === 'strong_bullish' || direction === 'bullish') return 'bullish';
  if (direction === 'strong_bearish' || direction === 'bearish') return 'bearish';
  return 'neutral';
}

/** ▲ / ▼ / → — paired with colour everywhere a tone is rendered. */
export const TONE_GLYPH: Record<Tone, string> = {
  bullish: '▲',
  bearish: '▼',
  neutral: '→',
};

/** Text colour for a value carrying a tone. */
export const toneText = cva('', {
  variants: {
    tone: {
      bullish: 'text-positive-strong',
      bearish: 'text-negative-strong',
      neutral: 'text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Solid fill for bars, dots and chart strokes. */
export const toneFill = cva('', {
  variants: {
    tone: {
      bullish: 'bg-bullish',
      bearish: 'bg-bearish',
      neutral: 'bg-neutral',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Tinted background + ring, for badges and highlighted rows. */
export const toneSurface = cva('ring-1 ring-inset', {
  variants: {
    tone: {
      bullish: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
      bearish: 'bg-bearish-soft text-bearish-strong ring-bearish-line',
      neutral: 'bg-neutral-soft text-neutral-strong ring-neutral-line',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/**
 * Resolved token values, for the few places that need a colour string rather
 * than a class: inline SVG fills and `style` attributes on heatmap tiles.
 * These read the same custom properties the utilities do, so a theme change
 * still moves them.
 */
export const TONE_VAR: Record<Tone, string> = {
  bullish: 'var(--bullish)',
  bearish: 'var(--bearish)',
  neutral: 'var(--neutral)',
};

export type ToneVariant = VariantProps<typeof toneText>;
