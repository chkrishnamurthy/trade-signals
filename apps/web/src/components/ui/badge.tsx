import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge.
 *
 * The financial tones (bullish / bearish / neutral) live here rather than in a
 * domain component so that a badge, a pill and a chip cannot drift apart.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground ring-transparent',
        secondary: 'bg-secondary text-secondary-foreground ring-border',
        outline: 'bg-transparent text-foreground ring-border',
        bullish: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
        bearish: 'bg-bearish-soft text-bearish-strong ring-bearish-line',
        neutral: 'bg-neutral-soft text-neutral-strong ring-neutral-line',
        warning: 'bg-warning-soft text-warning-foreground ring-warning-line',
        destructive: 'bg-destructive-soft text-destructive ring-destructive-line',
      },
      size: {
        sm: 'px-1 py-0 text-[0.6875rem]',
        default: '',
        lg: 'rounded-lg px-2 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean | undefined;
}

function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
