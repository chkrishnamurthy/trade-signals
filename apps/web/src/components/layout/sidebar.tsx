'use client';

import { ChevronsLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NAV_SHORTCUT_HINT } from '@/lib/nav-rail';
import { NAVIGATION, type NavEntry } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Primary navigation.
 *
 * Collapsing to an icon rail is the point: on a laptop a trader wants the
 * labels, on a trading monitor they want the pixels back for the board.
 *
 * The collapsed LOOK is not rendered here. It comes from CSS keyed on the
 * `data-nav` attribute of <html> (see the navigation-rail section of
 * `globals.css`), so this component emits one tree for both states and the
 * restored preference is already correct at first paint. `collapsed` below is
 * therefore an accessibility input only — it names the toggle — and it lags
 * the attribute by a frame on load, which no assistive technology can observe
 * because the effect that sets it runs before the first announcement.
 *
 * Planned sections render as disabled rows with the same icon and spacing as
 * live ones. That communicates the product's shape without offering a link
 * that goes nowhere.
 */
export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  className,
  ...rest
}: {
  collapsed?: boolean | undefined;
  onToggleCollapsed?: (() => void) | undefined;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: (() => void) | undefined;
  className?: string | undefined;
} & Pick<React.ComponentProps<'nav'>, 'id'>) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'flex h-full min-h-0 flex-col gap-1 overflow-x-clip overflow-y-auto px-2 py-3',
        className,
      )}
      {...rest}
    >
      {ROWS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5 pb-2">
          {/* Heading and divider occupy the same strip and cross-fade, so the
              rows below never shift by a pixel when the panel opens. */}
          <div className="relative h-5 shrink-0">
            <p
              data-nav-heading
              style={{ '--nav-i': group.index } as React.CSSProperties}
              className="absolute inset-x-2 bottom-0 truncate text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase"
            >
              {group.label}
            </p>
            <span
              data-nav-divider
              aria-hidden
              className="absolute inset-x-2 bottom-2 h-px bg-border"
            />
          </div>
          {group.items.map(({ item, index }) => (
            <SidebarRow
              key={item.label}
              item={item}
              index={index}
              active={item.status === 'ready' && pathname === item.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}

      {onToggleCollapsed !== undefined && (
        <div className="mt-auto pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={onToggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                className="h-8 w-full justify-start gap-0 px-0 text-muted-foreground"
              >
                <span className="grid w-10 shrink-0 place-items-center">
                  <ChevronsLeftIcon data-nav-chevron className="size-4" />
                </span>
                <span
                  data-nav-label
                  style={{ '--nav-i': ROW_COUNT } as React.CSSProperties}
                  className="text-xs"
                >
                  Collapse
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span className="font-medium">
                {collapsed ? 'Expand navigation' : 'Collapse navigation'}
              </span>
              <span className="block text-muted-foreground">{NAV_SHORTCUT_HINT}</span>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </nav>
  );
}

function SidebarRow({
  item,
  index,
  active,
  onNavigate,
}: {
  item: NavEntry;
  /** Position in the cascade — see `--nav-i` in the navigation-rail CSS. */
  index: number;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;

  // No horizontal padding on the row, and a fixed 40px icon slot: that is what
  // pins the icon to the centre of the 56px rail in BOTH states. Padding here
  // would make every icon slide when the panel opens.
  const shared = 'flex w-full items-center gap-0 rounded-md py-1.5 text-sm transition-colors';
  const stagger = { '--nav-i': index } as React.CSSProperties;

  const body = (
    <>
      <span className="grid w-10 shrink-0 place-items-center">
        <Icon className="size-4" aria-hidden />
      </span>
      <span data-nav-label style={stagger} className="truncate">
        {item.label}
      </span>
    </>
  );

  const row =
    item.status === 'ready' ? (
      <Link
        href={item.href}
        {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
        aria-current={active ? 'page' : undefined}
        className={cn(
          shared,
          active
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
      >
        {body}
      </Link>
    ) : (
      <span
        aria-disabled="true"
        className={cn(shared, 'cursor-not-allowed text-subtle-foreground')}
      >
        {body}
        <span
          data-nav-label
          style={stagger}
          className="ml-auto pr-2 text-[0.625rem] tracking-wide text-subtle-foreground uppercase"
        >
          Soon
        </span>
      </span>
    );

  // Collapsed, the icon is the only thing a sighted user sees — so it needs a
  // real label on hover and on focus. Expanded, the description is still
  // useful context.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="font-medium">{item.label}</span>
        <span className="block text-muted-foreground">{item.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The navigation, flattened once at module load into the order the cascade
 * follows. Every heading and every row gets a monotonic index so the labels
 * arrive top to bottom regardless of how the groups are nested.
 */
const ROWS = (() => {
  let index = 0;
  return NAVIGATION.map((group) => ({
    label: group.label,
    index: index++,
    items: group.items.map((item) => ({ item, index: index++ })),
  }));
})();

/** One past the last row: the collapse control brings up the rear. */
const ROW_COUNT = ROWS.reduce((total, group) => total + group.items.length + 1, 0);
