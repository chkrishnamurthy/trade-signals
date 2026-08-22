import type * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Text } from '@/components/ui/typography';
import { type Tone, toneFill } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Chart chrome.
 *
 * Charts in this product are hand-drawn SVG, so there is no library theme to
 * fight. What must be shared is the frame: the same header, the same timeframe
 * control, the same legend and the same hover readout, whether the chart is an
 * index on the dashboard or a stock in the detail drawer.
 *
 * Chart colours come from `--chart-*` and the tone tokens, never from literals,
 * so a chart re-themes with the rest of the application.
 */
export function ChartContainer({
  title,
  subtitle,
  toolbar,
  legend,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Card> & {
  title?: React.ReactNode | undefined;
  subtitle?: React.ReactNode | undefined;
  toolbar?: React.ReactNode | undefined;
  legend?: React.ReactNode | undefined;
}) {
  return (
    <Card className={cn('min-w-0', className)} {...props}>
      {(title !== undefined || toolbar !== undefined) && (
        <CardHeader>
          <CardHeading>
            {title !== undefined && <CardTitle>{title}</CardTitle>}
            {subtitle !== undefined && (
              <Text as="p" variant="caption" className="mt-0.5 truncate">
                {subtitle}
              </Text>
            )}
          </CardHeading>
          {toolbar !== undefined && <CardToolbar>{toolbar}</CardToolbar>}
        </CardHeader>
      )}
      <CardContent className="flex min-w-0 flex-col gap-2 p-3">
        {children}
        {legend !== undefined && <ChartLegend>{legend}</ChartLegend>}
      </CardContent>
    </Card>
  );
}

/**
 * Timeframe selector.
 *
 * A segmented control rather than a dropdown: the options are few, always the
 * same, and switching between them is the most frequent action on a chart.
 */
export function ChartToolbar<T extends string>({
  options,
  value,
  onChange,
  label = 'Timeframe',
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        // Radix emits '' when the active item is re-clicked; a chart always
        // has a timeframe, so that deselection is ignored.
        if (next !== '') onChange(next as T);
      }}
      aria-label={label}
      className={className}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option}>
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ChartLegend({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function ChartLegendItem({
  swatch,
  tone,
  children,
}: {
  /** A `--chart-*` custom property name, e.g. `var(--chart-2)`. */
  swatch?: string | undefined;
  tone?: Tone | undefined;
  children: React.ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-sm', tone !== undefined && toneFill({ tone }))}
        style={swatch === undefined ? undefined : { backgroundColor: swatch }}
      />
      {children}
    </li>
  );
}

/**
 * Hover readout.
 *
 * Positioned by the caller, because only the chart knows where its cursor is.
 * The styling — surface, border, figures — is fixed here so a candle tooltip
 * and a sparkline tooltip cannot look like different products.
 */
export function ChartTooltip({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'pointer-events-none rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs shadow-overlay',
        className,
      )}
      {...props}
    />
  );
}

export function ChartTooltipRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="figure font-medium">{value}</span>
    </div>
  );
}
