'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented control.
 *
 * Used for every "pick exactly one of a short list" control in the product —
 * chart timeframes, signal direction filters, theme. Radix gives it roving
 * focus and correct `aria-pressed`/`radiogroup` semantics for free.
 */
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      // The hairline keeps the track visible on the light canvas, where `muted`
      // and `background` are a shade apart.
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-md border border-border bg-muted p-0.5',
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-(--control-xs) min-w-(--control-xs) items-center justify-center gap-1 rounded-sm px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors',
        'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        'data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-subtle',
        '[&_svg:not([class*=size-])]:size-3.5 [&_svg]:pointer-events-none',
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: React.ReactNode;
  readonly disabled?: boolean | undefined;
  /** Shown on hover — say why a disabled option is disabled. */
  readonly title?: string | undefined;
}

/**
 * The one-of-a-few switch, as data: `options` in, `value` and `onValueChange`
 * out. Use this instead of hand-building a row of `aria-pressed` buttons in a
 * muted track — it gets the touch height, roving focus and the selected style
 * from `ToggleGroup`, and a click on the selected option never clears it.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  ...props
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  className?: string | undefined;
  'aria-label'?: string | undefined;
  'aria-labelledby'?: string | undefined;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onValueChange(option.value);
      }}
      className={className}
      {...props}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          title={option.title}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl, ToggleGroup, ToggleGroupItem };
