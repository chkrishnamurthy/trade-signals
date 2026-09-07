import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Multi-line text field, styled to match `Input`. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full min-w-0 rounded-md border border-input bg-surface px-2.5 py-1.5 text-sm shadow-subtle transition-colors outline-none',
        'placeholder:text-subtle-foreground selection:bg-primary selection:text-primary-foreground',
        'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive field-sizing-content',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
