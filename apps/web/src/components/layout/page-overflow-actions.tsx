'use client';

import { EllipsisIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface PageOverflowAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  /** How it looks as a button from `sm`. Defaults to `outline`. */
  readonly variant?: 'outline' | 'ghost' | undefined;
}

/**
 * A page header's secondary actions: buttons from `sm`, one "…" menu on phones.
 *
 * Goes inside `PageActions`, after the one primary button. A phone header has
 * room for the title, one labelled action and a menu; four buttons wrapped onto
 * two rows under the title and pushed the page's content below the fold. The
 * same list renders both forms, so the menu cannot drift from the buttons.
 */
export function PageOverflowActions({
  actions,
  label,
  size = 'sm',
}: {
  actions: readonly PageOverflowAction[];
  /** Match the header's other buttons: `sm` (default) or `default`. */
  size?: 'sm' | 'default' | undefined;
  /** Accessible name of the phone menu, e.g. "More portfolio actions". */
  label: string;
}) {
  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((action) => (
        <Button
          key={action.id}
          size={size}
          variant={action.variant ?? 'outline'}
          className="max-sm:hidden"
          onClick={action.onSelect}
        >
          <action.icon aria-hidden /> {action.label}
        </Button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size === 'sm' ? 'icon-sm' : 'icon'}
            variant="outline"
            className="sm:hidden"
            aria-label={label}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {actions.map((action) => (
            <DropdownMenuItem key={action.id} onSelect={action.onSelect}>
              <action.icon aria-hidden /> {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
