import type * as React from 'react';
import type { IpoTone } from '@/lib/ipo-format';
import { cn } from '@/lib/utils';

/** Chip colours per state. Amber needs its lifted hue on dark, like every warning surface. */
const TONE_CHIP: Readonly<Record<IpoTone, string>> = {
  open: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
  waiting: 'bg-warning-soft text-warning-foreground ring-warning-line dark:text-warning',
  info: 'bg-info-soft text-info-strong ring-info-line',
  listed: 'bg-neutral-soft text-neutral-strong ring-neutral-line',
  inactive: 'bg-muted text-muted-foreground ring-border',
};

/** The faint row tint behind open and awaiting-listing issues; other rows stay plain. */
export const TONE_ROW: Readonly<Partial<Record<IpoTone, string>>> = {
  open: 'bg-bullish-soft/45',
  waiting: 'bg-warning-soft/50',
};

/** A rounded state chip: `● Open · closes Mon`. A state, never a verdict. */
export function StateChip({
  tone,
  dot = false,
  className,
  children,
}: {
  tone: IpoTone;
  dot?: boolean | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-2xs ring-1 ring-inset',
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** What the row tints mean, beside the table they colour. */
export function ToneLegend({
  items,
  className,
}: {
  items: readonly { readonly tone: IpoTone; readonly label: string }[];
  className?: string | undefined;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Row colours">
      {items.map((item) => (
        <li key={item.label}>
          <StateChip tone={item.tone} dot>
            {item.label}
          </StateChip>
        </li>
      ))}
    </ul>
  );
}

/** The "Unofficial" tag on every grey-market figure and heading. */
export function UnofficialTag({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-warning-soft px-2 py-0.5 font-medium text-2xs text-warning-foreground ring-1 ring-warning-line ring-inset dark:text-warning',
        className,
      )}
    >
      Unofficial
    </span>
  );
}
