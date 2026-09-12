import type { LucideIcon } from 'lucide-react';
import {
  LayoutGridIcon,
  LineChartIcon,
  ListIcon,
  SlidersHorizontalIcon,
  UserIcon,
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
 * `label` is the page's title, verbatim. They drifted apart once — the nav said
 * "Signal accuracy", the tab said "Signal accuracy" and the heading said
 * "Signal performance", three names for one screen — so the rule now is that
 * clicking a nav row lands you on a page whose `<h1>` reads exactly what you
 * clicked.
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
    label: 'Tracking',
    items: [
      {
        status: 'ready',
        href: '/watchlists',
        label: 'My watchlists',
        icon: ListIcon,
        description: 'The names you have chosen to follow',
      },
    ],
  },
  {
    label: 'Research',
    items: [
      {
        status: 'ready',
        href: '/stocks',
        label: 'Stocks',
        icon: LineChartIcon,
        description: 'Directory of all active NSE listed equities',
      },
      {
        status: 'ready',
        href: '/screener',
        label: 'Screener',
        icon: SlidersHorizontalIcon,
        description: 'Technical scans for RSI, moving averages, and volume',
      },
      {
        status: 'ready',
        href: '/sectors',
        label: 'Sectors',
        icon: LayoutGridIcon,
        description: 'Browse Indian equities by market sectors',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        status: 'ready',
        href: '/profile',
        label: 'Your profile',
        icon: UserIcon,
        description: 'Your details, preferences and account security',
      },
    ],
  },
];
