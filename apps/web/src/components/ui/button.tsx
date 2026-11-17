import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2Icon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The application's only button.
 *
 * Every clickable affordance resolves to one of these variants — there is no
 * page-specific button style anywhere in the product.
 *
 * Sizes are dense for a mouse and step up on touch screens, so no page has to
 * remember to enlarge a control for phones.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          // primary-strong: white text on plain `primary` is 4.1:1 in light, under AA.
          'bg-primary-strong text-primary-foreground shadow-subtle hover:bg-primary-strong/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-surface hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-strong underline-offset-4 hover:underline',
        destructive:
          'bg-destructive text-destructive-foreground shadow-subtle hover:bg-destructive/90',
      },
      size: {
        // Heights are the `--control-*` tokens (globals.css, "TOUCH"): dense
        // for a mouse, and a step taller on a finger-driven screen.
        sm: 'h-(--control-sm) px-2 text-xs has-[>svg]:px-1.5',
        default: 'h-(--control-md) px-3 has-[>svg]:px-2.5',
        lg: 'h-(--control-lg) px-4 has-[>svg]:px-3.5',
        icon: 'size-(--control-md)',
        'icon-sm': 'size-(--control-sm)',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean | undefined;
  /** Ignored under `asChild` — `Slot` requires exactly one child element. */
  loading?: boolean | undefined;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot>
    );
  }
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2Icon className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
