import { InfoIcon } from 'lucide-react';
import type * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * MetricCard — one headline figure with its supporting detail.
 *
 * Used for index levels, portfolio value, market capitalisation and any other
 * "one number that matters" tile. Composition rather than props: the value slot
 * takes whichever financial number component is right, so this card never needs
 * to know about paise, percentages or crores.
 */
export function MetricCard({
  label,
  hint,
  value,
  change,
  aside,
  footer,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, 'title'> & {
  label: string;
  /** Explains the metric on hover. Use for anything a newcomer would query. */
  hint?: string | undefined;
  value: React.ReactNode;
  /** The signed movement, normally a `<PriceChange>` or `<PercentChange>`. */
  change?: React.ReactNode | undefined;
  /** Top-right slot — a sparkline, a badge. */
  aside?: React.ReactNode | undefined;
  footer?: React.ReactNode | undefined;
}) {
  return (
    <Card className={className} {...props}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <Text as="h3" variant="overline" className="truncate">
                {label}
              </Text>
              {hint !== undefined && <MetricHint>{hint}</MetricHint>}
            </div>
            <div className="mt-1">{value}</div>
          </div>
          {aside !== undefined && <div className="shrink-0">{aside}</div>}
        </div>
        {change !== undefined && <div className="text-sm">{change}</div>}
        {footer !== undefined && <div className="mt-1 border-t border-border pt-2">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * StatTile — the compact sibling of MetricCard.
 *
 * For a row of six supporting numbers under the headline cards, where a full
 * card each would out-shout the thing they support.
 */
export function StatTile({
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
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-border bg-surface px-3 py-2 shadow-subtle',
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Text variant="caption" className="truncate">
          {label}
        </Text>
        {hint !== undefined && <MetricHint>{hint}</MetricHint>}
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

/**
 * The ⓘ affordance.
 *
 * Every abbreviation and derived metric in this product is explainable on
 * hover. Keyboard users reach it by tab because the trigger is a real button.
 */
export function MetricHint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-sm text-subtle-foreground transition-colors hover:text-foreground"
        >
          <InfoIcon className="size-3" aria-hidden />
          <span className="sr-only">What is this?</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A labelled definition row — the building block of every metrics panel.
 *
 * `<dl>` semantics, so a screen reader reads "Open, ₹1,245.50" as a pair
 * rather than as two unrelated strings.
 */
export function DefinitionRow({
  label,
  value,
  layout = 'row',
  className,
}: {
  label: string;
  value: React.ReactNode;
  /**
   * `row` is the default: label left, value right, hairline beneath — the
   * shape of every metrics panel. `stacked` puts the label above the value
   * with no rule, for the three-up open/high/low strips inside a metric card,
   * where a full-width row each would out-weigh the headline figure.
   */
  layout?: 'row' | 'stacked' | undefined;
  className?: string | undefined;
}) {
  const stacked = layout === 'stacked';
  return (
    <div
      className={cn(
        stacked
          ? 'flex min-w-0 flex-col'
          : 'flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0',
        className,
      )}
    >
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 truncate text-sm', stacked ? '' : 'text-right')}>{value}</dd>
    </div>
  );
}

/** A two-column grid of `DefinitionRow`s. */
export function DefinitionGrid({
  columns = 2,
  className,
  ...props
}: React.ComponentProps<'dl'> & { columns?: 1 | 2 }) {
  return (
    <dl
      className={cn('grid gap-x-6', columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1', className)}
      {...props}
    />
  );
}
