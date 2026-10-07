'use client';

import { ChevronDownIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isGroupActive, isItemActive, type NavMenuGroup } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * A primary-bar entry that opens a menu ("Markets", admin "Lab").
 *
 * Radix's DropdownMenu gives the WAI-ARIA menu-button pattern for free:
 * Enter/Space/↓ open it, arrow keys move, typeahead jumps, Escape closes and
 * returns focus to the trigger. The trigger looks and behaves like a bar item,
 * including the active underline when the current page is inside the menu.
 */
export function NavMenu({
  group,
  badge,
  className,
}: {
  group: NavMenuGroup;
  /** A short marker after the label — "Admin" on the Lab menu. */
  badge?: string | undefined;
  className?: string | undefined;
}) {
  const pathname = usePathname();
  const active = isGroupActive(group, pathname);
  const current = group.items.find((item) => isItemActive(item, pathname));

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        // Says where you are inside the menu without opening it.
        aria-label={
          current === undefined ? group.label : `${group.label}, current: ${current.label}`
        }
        className={cn(
          'group relative flex h-full items-center rounded-md px-0.5 text-sm whitespace-nowrap',
          'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
          active &&
            'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary',
          className,
        )}
      >
        <span
          className={cn(
            'flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors',
            'group-data-[state=open]:bg-accent group-data-[state=open]:text-foreground',
            active
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground group-hover:bg-accent/60 group-hover:text-foreground',
          )}
        >
          {group.label}
          {badge !== undefined && (
            <span className="rounded-sm bg-muted px-1 text-3xs text-muted-foreground uppercase tracking-wide">
              {badge}
            </span>
          )}
          <ChevronDownIcon
            className="size-3.5 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-80 p-1.5">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {group.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map((item) => {
          const Icon = item.icon;
          const body = (
            <>
              <Icon className="mt-0.5 size-4" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {item.label}
                  {item.status === 'planned' && (
                    <span className="rounded-sm border border-border px-1 text-3xs text-muted-foreground uppercase tracking-wide">
                      Soon
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{item.description}</span>
              </span>
            </>
          );
          if (item.status === 'planned') {
            return (
              <DropdownMenuItem key={item.id} disabled className="items-start">
                {body}
              </DropdownMenuItem>
            );
          }
          const here = isItemActive(item, pathname);
          return (
            <DropdownMenuItem
              key={item.id}
              asChild
              className={cn('items-start', here && 'bg-accent [&_svg]:text-primary-strong')}
            >
              <Link href={item.href} aria-current={here ? 'page' : undefined}>
                {body}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
