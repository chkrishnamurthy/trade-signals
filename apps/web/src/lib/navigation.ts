import type { LucideIcon } from 'lucide-react';
import {
  ActivityIcon,
  BellRingIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  GaugeIcon,
  HistoryIcon,
  InfoIcon,
  LandmarkIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  ListIcon,
  MegaphoneIcon,
  ScaleIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SunriseIcon,
} from 'lucide-react';
import type { Route } from 'next';

/**
 * Navigation model — the single source for the top bar, the bottom tab bar,
 * the "More" drawer and the account menu (`docs/planning/navigation-redesign-plan.md`).
 *
 * Shape, in one sentence: at most six primary destinations, one of which is a
 * menu ("Markets"), plus an admin-only "Lab" menu. Trading platforms people
 * already trust (Kite, Groww, TradingView) all hold the primary row to about
 * five or six names; the old bar showed ten and had to fold half of them away
 * on ordinary laptops.
 *
 * Rules that keep it honest:
 * - `label` is the noun the page is about. A nav row lands on a page whose
 *   heading says the same thing ("My watchlists" for "Watchlists" is fine;
 *   "Signal performance" for "Signal accuracy" is not).
 * - `href` exists only on `ready` entries, so `typedRoutes` refuses a link to a
 *   route that does not exist. Designed-but-unbuilt sections are `planned`:
 *   visible and disabled, never a dead link.
 * - `matches` lists the other path prefixes that belong to the section, so a
 *   page reached from it (a stock page, an IPO in full) still lights it.
 */
export interface NavItemBase {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** One line, shown in tooltips and menus. */
  readonly description: string;
}

export interface ReadyNavItem extends NavItemBase {
  readonly status: 'ready';
  readonly href: Route;
  /** Extra path prefixes that count as being inside this destination. */
  readonly matches?: readonly string[] | undefined;
  /** Shorter label for the bottom tab bar, where ~70px is all a tab gets. */
  readonly shortLabel?: string | undefined;
}

export interface PlannedNavItem extends NavItemBase {
  readonly status: 'planned';
}

export type NavItem = ReadyNavItem | PlannedNavItem;

/** A primary-bar entry that opens a menu instead of navigating. */
export interface NavMenuGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly items: readonly NavItem[];
}

export type PrimaryEntry =
  | { readonly kind: 'link'; readonly item: ReadyNavItem }
  | { readonly kind: 'menu'; readonly group: NavMenuGroup };

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

const MARKET_BRIEF: ReadyNavItem = {
  id: 'brief',
  status: 'ready',
  href: '/today',
  label: 'Market brief',
  shortLabel: 'Brief',
  icon: SunriseIcon,
  description: 'A technical summary of the latest completed session',
};

const WATCHLISTS: ReadyNavItem = {
  id: 'watchlists',
  status: 'ready',
  href: '/watchlists',
  label: 'Watchlists',
  icon: ListIcon,
  description: 'The stocks you have chosen to follow',
};

const PORTFOLIO: ReadyNavItem = {
  id: 'portfolio',
  status: 'ready',
  href: '/portfolio',
  label: 'Portfolio',
  icon: BriefcaseIcon,
  description: 'The shares you hold, typed in or uploaded by you, valued at the latest price',
};

const SCREENER: ReadyNavItem = {
  id: 'screener',
  status: 'ready',
  href: '/screener',
  label: 'Screener',
  icon: SlidersHorizontalIcon,
  // A stock page is where a screen leads, and where a search lands.
  matches: ['/stocks'],
  description: 'Filter every NSE stock by technical, delivery, F&O and ownership conditions',
};

const IPOS: ReadyNavItem = {
  id: 'ipos',
  status: 'ready',
  href: '/ipos',
  label: 'IPOs',
  icon: CalendarRangeIcon,
  description: 'Mainboard and SME public issues: dates, demand and listing',
};

const ALERTS: ReadyNavItem = {
  id: 'alerts',
  status: 'ready',
  href: '/alerts',
  label: 'Alerts',
  icon: BellRingIcon,
  description: 'Be told when a stock crosses a price or RSI level at the close',
};

/** The "Markets" menu — market-wide data plus the user's market alerts. */
export const MARKETS_GROUP: NavMenuGroup = {
  id: 'markets',
  label: 'Markets',
  icon: LayoutGridIcon,
  items: [
    {
      id: 'breadth',
      status: 'ready',
      href: '/markets/breadth',
      label: 'Market breadth',
      icon: GaugeIcon,
      description: 'Advances, declines, highs vs lows and industry rotation',
    },
    {
      id: 'flows',
      status: 'ready',
      href: '/flows',
      label: 'Institutional flow',
      icon: LandmarkIcon,
      description: 'FII/DII activity, bulk and block deals, and shareholding',
    },
    {
      id: 'announcements',
      status: 'ready',
      href: '/announcements',
      label: 'Announcements',
      icon: MegaphoneIcon,
      description: 'Official corporate filings from the exchanges',
    },
    {
      id: 'calendar',
      status: 'ready',
      href: '/calendar',
      label: 'Market calendar',
      icon: CalendarDaysIcon,
      description: 'Results, corporate actions, holidays and watchlist events',
    },
    ALERTS,
  ],
};

/**
 * The admin-only "Lab": strategies under evaluation. Their pages redirect a
 * non-admin and their APIs answer 403 (CLAUDE.md) — hiding the menu is a
 * courtesy, not the guard.
 */
export const LAB_GROUP: NavMenuGroup = {
  id: 'lab',
  label: 'Lab',
  icon: FlaskConicalIcon,
  items: [
    {
      id: 'intraday',
      status: 'ready',
      href: '/intraday',
      label: 'Intraday strategies',
      icon: ActivityIcon,
      description: 'One rule-based intraday strategy, its signals and paper trades',
    },
    {
      id: 'paper',
      status: 'ready',
      href: '/paper-trading',
      label: 'Paper trading',
      icon: FlaskConicalIcon,
      description: 'Strategies simulated automatically on virtual capital',
    },
    {
      id: 'backtests',
      status: 'planned',
      label: 'Backtests',
      icon: HistoryIcon,
      description: 'Replay a strategy version over past sessions',
    },
    {
      id: 'admin',
      status: 'ready',
      href: '/admin',
      label: 'Admin console',
      icon: ShieldIcon,
      description: 'Data health, IPO pipeline and the event log',
    },
  ],
};

/**
 * Trust links: always one click away, in the footer of every signed-in page
 * and in the account menu. "Not investment advice" is the product's position,
 * so it is never further away than this.
 */
export const HELP_LINKS: readonly ReadyNavItem[] = [
  {
    id: 'disclaimer',
    status: 'ready',
    href: '/disclaimer',
    label: 'Disclaimer',
    icon: ScaleIcon,
    description: 'A research tool, not investment advice',
  },
  {
    id: 'methodology',
    status: 'ready',
    href: '/methodology',
    label: 'Methodology',
    icon: BookOpenIcon,
    description: 'How every indicator and reading is computed',
  },
  {
    id: 'data-sources',
    status: 'ready',
    href: '/data-sources',
    label: 'Data sources',
    icon: DatabaseIcon,
    description: 'Where the prices and filings come from, and how fresh they are',
  },
  {
    id: 'contact',
    status: 'ready',
    href: '/contact',
    label: 'Contact & support',
    icon: LifeBuoyIcon,
    description: 'Report a problem or ask a question',
  },
];

// ---------------------------------------------------------------------------
// Public pages (signed out, and signed-in visitors to About, Methodology…)
// ---------------------------------------------------------------------------

const ABOUT: ReadyNavItem = {
  id: 'about',
  status: 'ready',
  href: '/about',
  label: 'About EquityWise',
  icon: InfoIcon,
  description: 'What it is, what it is not, and the rules it keeps',
};

/**
 * The public "Learn" menu: the pages that let a visitor check the product
 * before trusting it. Same entries as the account menu's help links plus
 * About, so the words do not change across the sign-in boundary.
 */
export const LEARN_GROUP: NavMenuGroup = {
  id: 'learn',
  label: 'Learn',
  icon: BookOpenIcon,
  items: [
    ...HELP_LINKS.filter((link) => link.id === 'methodology' || link.id === 'data-sources'),
    ABOUT,
    ...HELP_LINKS.filter((link) => link.id === 'disclaimer' || link.id === 'contact'),
  ],
};

/**
 * The landing page's own sections, linked from the signed-out header and the
 * footer. Absolute (`/#…`) so they work from any public page.
 */
export const LANDING_SECTIONS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: 'features', label: 'Features' },
  { id: 'tour', label: 'See it in action' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'trust', label: 'Trust & safety' },
];

// ---------------------------------------------------------------------------
// Arrangements
// ---------------------------------------------------------------------------

/** The desktop bar, left to right. Lab is appended for admins at render time. */
export const PRIMARY_NAV: readonly PrimaryEntry[] = [
  { kind: 'link', item: MARKET_BRIEF },
  { kind: 'link', item: WATCHLISTS },
  { kind: 'link', item: PORTFOLIO },
  { kind: 'link', item: SCREENER },
  { kind: 'menu', group: MARKETS_GROUP },
  { kind: 'link', item: IPOS },
];

/**
 * The bottom tab bar (below `lg`). Four destinations plus "More", which opens
 * the drawer holding everything else. Five is the most a 360px phone can show
 * with a readable label under each icon.
 */
export const MOBILE_TABS: readonly ReadyNavItem[] = [MARKET_BRIEF, WATCHLISTS, PORTFOLIO, SCREENER];

/** What the "More" drawer lists, in order. Lab is appended for admins. */
export const DRAWER_SECTIONS: readonly NavMenuGroup[] = [
  MARKETS_GROUP,
  { id: 'tools', label: 'Tools', icon: CalendarRangeIcon, items: [IPOS] },
];

/** The URL a home link goes to — the brand mark, and "back to the app". */
export const HOME_HREF: Route = MARKET_BRIEF.href;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** True when `pathname` is `prefix` or sits beneath it (`/ipos` matches `/ipos/x`, not `/iposx`). */
function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Whether this destination is the one the user is in. */
export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.status !== 'ready') return false;
  return [item.href, ...(item.matches ?? [])].some((prefix) => underPrefix(pathname, prefix));
}

/** Whether any destination in the menu is the current one — lights the menu's trigger. */
export function isGroupActive(group: NavMenuGroup, pathname: string): boolean {
  return group.items.some((item) => isItemActive(item, pathname));
}

/** Every ready destination, flattened — for tests and for anything that needs a lookup. */
export function allReadyItems(includeAdmin: boolean): readonly ReadyNavItem[] {
  const groups: readonly NavMenuGroup[] = includeAdmin
    ? [MARKETS_GROUP, LAB_GROUP]
    : [MARKETS_GROUP];
  const items: NavItem[] = [
    ...PRIMARY_NAV.flatMap((entry) => (entry.kind === 'link' ? [entry.item] : [])),
    ...groups.flatMap((group) => group.items),
  ];
  return items.filter((item): item is ReadyNavItem => item.status === 'ready');
}
