'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NAVIGATION, type NavEntry } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Primary navigation.
 *
 * Collapsing to an icon rail is the point: on a laptop a trader wants the
 * labels, on a trading monitor they want the pixels back for the board. The
 * collapsed state is owned by `AppShell` so the main region can react to it.
 *
 * Planned sections render as disabled rows with the same icon and spacing as
 * live ones. That communicates the product's shape without offering a link
 * that goes nowhere.
 */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  className,
}: {
  collapsed: boolean;
  onToggleCollapsed?: (() => void) | undefined;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn('flex h-full min-h-0 flex-col gap-1 overflow-y-auto px-2 py-3', className)}
    >
      {NAVIGATION.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5 pb-2">
          {collapsed ? (
            <div className="mx-2 my-1.5 h-px bg-border" aria-hidden />
          ) : (
            <p className="px-2 pb-1 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <SidebarRow
              key={item.label}
              item={item}
              collapsed={collapsed}
              active={item.status === 'ready' && pathname === item.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}

      {onToggleCollapsed !== undefined && (
        <div className="mt-auto pt-2">
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'default'}
            onClick={onToggleCollapsed}
            className={cn('w-full', collapsed ? '' : 'justify-start')}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
            {!collapsed && <span className="text-xs text-muted-foreground">Collapse</span>}
          </Button>
        </div>
      )}
    </nav>
  );
}

function SidebarRow({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavEntry;
  collapsed: boolean;
  active: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;

  const shared = cn(
    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
    collapsed && 'justify-center px-0',
  );

  const body = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
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
        {!collapsed && (
          <span className="ml-auto text-[0.625rem] tracking-wide text-subtle-foreground uppercase">
            Soon
          </span>
        )}
      </span>
    );

  // Collapsed, the icon is the only label — so it needs a real one on hover
  // and on focus. Expanded, the description is still useful context.
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
