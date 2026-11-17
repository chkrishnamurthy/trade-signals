'use client';

import { Slot } from '@radix-ui/react-slot';
import type * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsPhone } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * A panel that opens where the device expects it: a popover anchored to its
 * trigger on tablets and desktops, a bottom sheet on phones.
 *
 * A popover on a phone is the wrong shape — it hangs from a corner the thumb
 * cannot reach, covers the content it came from and cannot grow past the gap
 * beside its trigger. The sheet is full width, sits under the thumb and scrolls
 * inside itself. One component, so no feature decides this for itself.
 *
 * Compose the inside from the `Panel*` parts below, which look the same in both
 * forms: `PanelHeader`, `PanelBody` (the part that scrolls), `PanelFooter`, and
 * `PanelItem` rows. `title` names the panel for assistive technology; the sheet
 * is a dialog and must have one.
 */
export function AdaptivePopover({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  align = 'end',
  sideOffset = 8,
  className,
  sheetClassName,
  children,
}: {
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** The control that opens the panel — one element, a real button. */
  trigger: React.ReactElement;
  title: string;
  description?: string | undefined;
  align?: 'start' | 'center' | 'end' | undefined;
  sideOffset?: number | undefined;
  /** Applied in both forms — usually a width for the popover form. */
  className?: string | undefined;
  /** Applied to the sheet only. */
  sheetClassName?: string | undefined;
  children: React.ReactNode;
}) {
  const phone = useIsPhone();
  const state = {
    ...(open === undefined ? {} : { open }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  };

  if (phone) {
    return (
      <Sheet {...state}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          className={cn('gap-0 p-0', className, 'w-full max-w-none', sheetClassName)}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {description !== undefined && (
            <SheetDescription className="sr-only">{description}</SheetDescription>
          )}
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover {...state}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={sideOffset}
        aria-label={title}
        className={cn('flex w-[min(24rem,calc(100vw-1rem))] flex-col gap-0 p-0', className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The panel's title row, with an optional action at its right end ("Clear all",
 * "Mark all as read"). Pass `action` a link- or ghost-variant `Button`.
 */
export function PanelHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        'flex min-h-12 shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-1.5',
        className,
      )}
    >
      <h2 className="m-0 font-semibold text-sm max-sm:text-base">{title}</h2>
      {action !== undefined && <div className="-mr-2 flex shrink-0 items-center">{action}</div>}
    </div>
  );
}

/**
 * The part of a panel that scrolls. In the popover it is capped so the panel
 * never grows past the screen; in the sheet it takes what the sheet allows.
 */
export function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-body"
      className={cn('min-h-0 flex-1 overflow-y-auto sm:max-h-[min(24rem,60vh)]', className)}
      {...props}
    />
  );
}

/** A full-width closing row or button strip under the body. */
export function PanelFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-footer"
      className={cn('shrink-0 border-border border-t', className)}
      {...props}
    />
  );
}

/**
 * One row of a panel or a phone sheet: a button by default, or a link with
 * `asChild`. Icons go first (muted), a trailing chevron or count last.
 *
 * Rows are 36px with a mouse and 44px on touch (`--touch-target`), full width,
 * with a hover tint and the app's focus ring drawn inside the row.
 */
export function PanelItem({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean | undefined }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="panel-item"
      {...(asChild ? {} : { type: 'button' as const })}
      className={cn(
        'flex min-h-9 w-full cursor-pointer items-center gap-3 px-4 text-left text-foreground text-sm transition-[background-color] pointer-coarse:min-h-(--touch-target)',
        'hover:bg-accent/60 active:bg-accent disabled:pointer-events-none disabled:opacity-50 aria-[current=page]:bg-accent',
        'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring',
        '[&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg:not([class*=size-])]:size-4 max-sm:[&_svg:not([class*=size-])]:size-5',
        className,
      )}
      {...props}
    />
  );
}

/** A small uppercase heading over a group of rows. */
export function PanelGroupLabel({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="panel-group-label"
      className={cn(
        'm-0 px-4 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide',
        className,
      )}
      {...props}
    />
  );
}

/** A hairline between groups of rows. */
export function PanelSeparator({ className }: { className?: string | undefined }) {
  return <div aria-hidden className={cn('my-1.5 h-px bg-border', className)} />;
}

/** One quiet sentence when a panel has nothing to list, or could not load. */
export function PanelMessage({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="panel-message"
      className={cn('m-0 px-4 py-6 text-center text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}
