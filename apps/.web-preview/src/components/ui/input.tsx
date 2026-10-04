import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-8 w-full min-w-0 rounded-md border border-input bg-surface px-2.5 py-1 text-sm shadow-subtle transition-colors outline-none',
        'placeholder:text-subtle-foreground selection:bg-primary selection:text-primary-foreground',
        'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
