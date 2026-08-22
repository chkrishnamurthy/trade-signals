import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Documentation-only helpers.
 *
 * These render tokens rather than consuming them, which is the one place in
 * the product allowed to name a token as data.
 */
export function Swatch({
  token,
  label,
  className,
}: {
  /** The Tailwind colour utility, e.g. `bg-bullish-soft`. */
  token: string;
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('h-10 rounded-md border border-border', token)} />
      <p className="mt-1 truncate font-mono text-[0.6875rem] text-muted-foreground">
        {label ?? token}
      </p>
    </div>
  );
}

export function SwatchGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{children}</div>;
}

/** A labelled example block: what it looks like, and what it is called. */
export function Specimen({
  name,
  note,
  children,
  className,
}: {
  name: string;
  note?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-border bg-surface p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Text variant="label" className="font-mono">
          {name}
        </Text>
        {note !== undefined && (
          <Text variant="caption" className="text-right">
            {note}
          </Text>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** A rule the design system enforces, stated in one line. */
export function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-muted-foreground">
      <span aria-hidden className="text-primary">
        —
      </span>
      <span className="min-w-0 flex-1 text-balance">{children}</span>
    </li>
  );
}
