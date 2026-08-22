import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The typography scale.
 *
 * Eleven named roles, and nothing outside this file picks a font size. A page
 * that wants "a slightly bigger caption" uses `caption` — the scale does not
 * grow to accommodate one screen.
 *
 * The `metric` / `value` / `indicator` roles all carry `figure`, which turns on
 * tabular lining figures. That is what makes a column of prices line up.
 */
const textVariants = cva('', {
  variants: {
    variant: {
      'page-title': 'text-xl font-semibold tracking-tight text-foreground sm:text-2xl',
      'section-title': 'text-sm font-semibold tracking-tight text-foreground',
      'card-title': 'text-sm font-semibold tracking-tight text-foreground',
      body: 'text-sm text-foreground',
      secondary: 'text-sm text-muted-foreground',
      caption: 'text-xs text-muted-foreground',
      label: 'text-xs font-medium text-foreground',
      overline: 'text-xs font-medium tracking-wide text-muted-foreground uppercase',
      /** A headline statistic: portfolio value, index level, sentiment score. */
      metric: 'figure text-2xl font-semibold tracking-tight text-foreground',
      /** The one big number on a detail view. */
      display: 'figure text-3xl font-semibold tracking-tight text-foreground',
      /** A value inside a dense table or list row. */
      value: 'figure text-sm text-foreground',
      /** RSI, ATR, EMA — technical readings, quieter than a price. */
      indicator: 'figure font-mono text-xs text-foreground',
    },
  },
  defaultVariants: { variant: 'body' },
});

type TextProps<T extends React.ElementType> = {
  as?: T | undefined;
  className?: string | undefined;
} & VariantProps<typeof textVariants> &
  Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className'>;

/**
 * `as` rather than a fixed tag: heading level is a document-structure decision
 * and must not be dictated by how large the text looks.
 */
function Text<T extends React.ElementType = 'span'>({
  as,
  variant,
  className,
  ...props
}: TextProps<T>) {
  const Comp = (as ?? 'span') as React.ElementType;
  return <Comp className={cn(textVariants({ variant }), className)} {...props} />;
}

export { Text, textVariants };
