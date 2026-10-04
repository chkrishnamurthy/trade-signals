import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Inline notice.
 *
 * `warning` is the stale-data tone and `destructive` the failure tone; those
 * two carry real meaning about data trustworthiness, so they are not
 * interchangeable decoration.
 */
const alertVariants = cva(
  'grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3.5 py-3 text-sm has-[>svg]:grid-cols-[--spacing(4)_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-foreground [&>svg]:text-muted-foreground',
        info: 'border-border bg-muted text-foreground [&>svg]:text-info',
        warning: 'border-warning-line bg-warning-soft text-warning-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive-line bg-destructive-soft text-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-sm opacity-90 [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
