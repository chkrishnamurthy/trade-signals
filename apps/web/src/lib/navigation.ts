import type { LucideIcon } from 'lucide-react';
import {
  ActivityIcon,
  BellIcon,
  CandlestickChartIcon,
  FilterIcon,
  LayoutDashboardIcon,
  ListIcon,
  RocketIcon,
  SwatchBookIcon,
  TargetIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Route } from 'next';

/**
 * Navigation model.
 *
 * One list drives the sidebar, the mobile drawer and the breadcrumb. Sections
 * that are designed but not built are declared here as `planned` rather than
 * omitted: the shape of the product should be visible, and a dead link is
 * worse than a disabled one.
 *
 * `href` is only present on `ready` entries — `typedRoutes` will not accept a
 * link to a route that does not exist, which is exactly the guard we want.
 */
export interface NavItem {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly description: string;
}

export interface ReadyNavItem extends NavItem {
  readonly status: 'ready';
  readonly href: Route;
}

export interface PlannedNavItem extends NavItem {
  readonly status: 'planned';
}

export type NavEntry = ReadyNavItem | PlannedNavItem;

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavEntry[];
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    label: 'Market',
    items: [
      {
        status: 'ready',
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboardIcon,
        description: 'Indices, breadth, sectors and movers',
      },
      {
        status: 'planned',
        label: 'NIFTY 50',
        icon: TrendingUpIcon,
        description: 'Constituent-level view of the index',
      },
      {
        status: 'planned',
        label: 'Stocks',
        icon: CandlestickChartIcon,
        description: 'Per-instrument analysis and history',
      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      {
        status: 'ready',
        href: '/signals',
        label: 'Trade signals',
        icon: ActivityIcon,
        description: 'Intraday setups, scored and explained',
      },
      {
        status: 'ready',
        href: '/signals/performance',
        label: 'Signal accuracy',
        icon: TargetIcon,
        description: 'Paper outcomes of triggered signals',
      },
      {
        status: 'planned',
        label: 'Screener',
        icon: FilterIcon,
        description: 'Multi-condition technical filters',
      },
      {
        status: 'planned',
        label: 'IPOs',
        icon: RocketIcon,
        description: 'Upcoming and listed issues',
      },
    ],
  },
  {
    label: 'Tracking',
    items: [
      {
        status: 'planned',
        label: 'Watchlists',
        icon: ListIcon,
        description: 'Instruments you are following',
      },
      {
        status: 'planned',
        label: 'Alerts',
        icon: BellIcon,
        description: 'Conditions worth being told about',
      },
    ],
  },
  {
    label: 'Reference',
    items: [
      {
        status: 'ready',
        href: '/design-system',
        label: 'Design system',
        icon: SwatchBookIcon,
        description: 'Tokens, components and usage rules',
      },
    ],
  },
];
