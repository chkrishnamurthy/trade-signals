---
name: Navigation redesign
status: implemented
horizon: now
created: 2026-10-07
updated: 2026-10-07
area: [web]
summary: Audit of the signed-in navigation and its replacement — six primary destinations, bottom tab bar below lg, market status and trust links in the chrome, WCAG 2.1 AA.
owner: krishna
---

# Navigation redesign — audit, system and spec

> **Status:** implemented in the working tree (uncommitted). Code: `apps/web/src/lib/navigation.ts`,
> `apps/web/src/components/layout/{app-shell,navbar,nav-item,nav-menu,mobile-nav,market-status-pill,app-footer}.tsx`,
> `components/auth/user-menu.tsx`, `components/market/stock-search.tsx`.

## 0. Summary

The signed-in app had **ten** top-level names in one bar, which only fit at 1680px; below 1280px every
destination disappeared behind a hamburger. Active states failed contrast, the global search sent most
users to a page that ignored their pick, keyboard focus rings were invisible, there was no skip link, and no
signed-in page linked to the disclaimer.

The new system: **six primary destinations** (five links + a "Markets" menu) and an **admin-only "Lab"**
menu in a 56px top bar from `lg` up; a **bottom tab bar + "More" drawer** below `lg`; a **market-status pill**,
**⌘K / `/` search**, and a **trust footer** on every page.

---

## 1. Audit of the current navigation (as of `f98eeea`)

### 1.1 Inventory

| Item (label as shown) | Route | Top bar (≥1280) | Folded menu (1280–1679) | Mobile drawer (<1280) | Footer (public) | User menu |
|---|---|---|---|---|---|---|
| Market Brief | `/today` | ✓ | | ✓ | "Market brief" | |
| My watchlists | `/watchlists` | ✓ | | ✓ | ✓ | |
| My portfolio | `/portfolio` | ✓ | | ✓ | | |
| Alerts | `/alerts` | ✓ | | ✓ | | |
| Screener | `/screener` | ✓ | | ✓ | | |
| Market breadth | `/markets/breadth` | ✓ | | ✓ | | |
| Announcements | `/announcements` | ≥1680 | "Market record" | ✓ | ✓ | |
| Market Calendar | `/calendar` | ≥1680 | "Market record" | ✓ | | |
| Institutional Flow | `/flows` | ≥1680 | "Market record" | ✓ | "Institutional flow" | |
| IPOs | `/ipos` | ≥1680 | "Market record" | ✓ | | |
| Your profile / Profile | `/profile` | | | | | "Profile" |
| Admin | `/admin` | | | | | admin only |
| Intraday | `/intraday` | | | | | admin only |
| Paper Trading | `/paper-trading` | | | | | admin only |
| Search | → `/watchlists?symbol=` (stock & screener pages → `/stocks/[s]`) | ✓ | | ✓ (in bar) | | |
| Theme toggle, notices bell | — | ✓ | | ✓ | | |
| Stock detail | `/stocks/[symbol]` | not in nav; nothing lit | | | | |
| `/signals` | redirects to `/intraday` | | | | | |

Also present but **unused**: `components/layout/sidebar.tsx`, `topbar.tsx`, `lib/nav-rail.ts`, a blocking
`NAV_INIT_SCRIPT` in `<head>` on every page, and ~110 lines of rail CSS in `globals.css`.

### 1.2 Issues

| # | Issue | Severity | Why it matters |
|---|---|---|---|
| A1 | **Search lands on the wrong page.** From every page except Stock and Screener, picking a result pushes `/watchlists?symbol=X`, and the watchlists page never reads `symbol`. | **High** | The most-used control in the bar silently does nothing useful on almost every route. |
| A2 | **Keyboard focus rings are invisible.** `outline-none focus-visible:outline-2` in Tailwind v4 leaves `outline-style: none` (`outline-none` sets `--tw-outline-style: none`). Measured: `outline: none 0px` on a focused nav link. Affects `Button` and 12 other files. | **High** | WCAG 2.4.7 Focus Visible fails; keyboard users cannot see where they are. |
| A3 | **Active label contrast 3.53:1** in light theme (`primary` on `primary/10`). | **High** | Below the 4.5:1 AA minimum for 14px text (1.4.3), on the one element whose job is "you are here". |
| A4 | **Too many top-level items** — ten names; only fits at 1680px, so the "Market record" group folds into a menu between 1280 and 1679px. | **High** | Most laptops (1366–1536) get an inconsistent bar; the same page sits in a different place depending on window width. |
| A5 | **No navigation from 768–1279px except a hamburger**, and on phones the drawer is a flat list of 10 rows with the group headings dropped. | Medium | Tablets and small laptops lose all visible wayfinding; "where am I" requires opening a menu. |
| A6 | **No skip link**; the bar's 10+ stops come before the content on every page. | Medium | WCAG 2.4.1 Bypass Blocks. |
| A7 | **Search is not a combobox**: no `role`, `aria-expanded`, `aria-activedescendant`; ↑/↓ do nothing; results are not announced. No keyboard shortcut. | Medium | Screen-reader users get an unlabeled popup; power users (the people a stock app is for) cannot jump to search. |
| A8 | **Trust signals missing from the signed-in chrome**: no link to Disclaimer / Methodology / Data sources on any signed-in page; the "not investment advice" line is on 9 pages and missing from Portfolio, Alerts, Calendar and IPOs. | Medium | The product's position ("research tool, not advice") should never be more than one click away, and should not depend on which page you are on. |
| A9 | **Market open/closed is not in the bar** — only a 11px grey phrase at the end of the indices strip. | Medium | The first question a market app answers. Every reference platform shows it in a fixed spot. |
| A10 | **Account menu renders nothing while loading or on error**, so the bar shifts on every load, and a failed session call leaves no way to log out. | Medium | Layout shift on every page; a stranded user. |
| A11 | **Admin pages live in the account menu.** | Low | The account menu is about the account; admins hunt for pages. |
| A12 | **Labels drift**: "Market Brief" vs "Market brief", "Institutional Flow" vs "Institutional flow", "Market Calendar"; group "Discover"/"Tracking" headings never shown; Market Brief's `<h1>` is a greeting. | Low | Breaks the repo's own "label = page title" rule; reads unpolished. |
| A13 | **Notices bell appears/disappears** with the unread count, moving the account avatar. Badge colour is primary green. | Low | Inconsistent placement; red/green carry market meaning in this app. |
| A14 | **Theme toggle (3 buttons, ~90px) permanently in the bar.** | Low | Spends prime bar width on a set-once preference. |
| A15 | **Dead navigation code** + a blocking `<head>` script on every page. | Low | Maintenance cost; a render-blocking script for a feature that no longer exists. |
| A16 | `MarketStatus` badge "pre-open" in dark theme: `warning-foreground` on `warning-soft` = **1.31:1**. Not navigation, found while measuring. | Medium (not fixed here) | Unreadable during pre-open in dark mode. |

---

## 2. Reference patterns

Patterns borrowed from the platforms Indian investors already use, so the app feels familiar:

| Pattern | Seen in | Used here |
|---|---|---|
| A short row of text tabs (~5–6), active = underline | Kite web, Groww web | Top bar, 2px primary underline |
| Grouped dropdown for "market-wide" pages | TradingView's top menus | "Markets" menu with one-line descriptions |
| Search always visible, keyboard-first | All three | Search in the bar, `/` and Ctrl/⌘ K |
| Account avatar far right; profile, theme, logout inside | All three | `UserMenu` |
| Bottom tab bar on phones, "More" for the rest | Groww and Kite mobile apps | `MobileNav` |
| Market-wide indices in a strip | Kite (NIFTY/SENSEX header), Groww | Kept (existing indices strip) |

---

## 3. Information architecture

### 3.1 Sitemap (new)

```
EquityWise (signed in)
├── Market brief            /today                     ← Dashboard, brand link
├── Watchlists              /watchlists
├── Portfolio               /portfolio
│   ├── Analysis            /portfolio/analysis         (page tabs)
│   ├── Notices             /portfolio/notices          (+ bell in top bar)
│   └── Holding             /portfolio/[symbol]
├── Screener                /screener
│   └── Stock detail        /stocks/[symbol]            ← lights "Screener"; where search lands
├── Markets ▾
│   ├── Market breadth      /markets/breadth
│   ├── Institutional flow  /flows
│   ├── Announcements       /announcements
│   ├── Market calendar     /calendar
│   └── IPOs                /ipos  (+ /all /calendar /listings /gmp /pipeline /[slug], page tabs)
├── Alerts                  /alerts
├── Lab ▾  (admin only)
│   ├── Intraday signals    /intraday   (/signals redirects here)
│   ├── Paper trading       /paper-trading
│   ├── Backtests           — planned, shown disabled ("Soon")
│   └── Admin console       /admin  (+ /admin/paper, /admin/ipos, /admin/logs)
├── Account menu (avatar)
│   ├── Profile & security  /profile
│   ├── Theme               Light · System · Dark
│   ├── Help & legal ▸      Disclaimer · Methodology · Data sources · Contact & support
│   └── Log out · Log out of all devices
└── Footer (every page)     Disclaimer · Methodology · Data sources · Contact & support
```

### 3.2 Mapping to the requested modules

| Module | Where |
|---|---|
| Dashboard | **Market brief** (`/today`) — first tab, brand link |
| Signals | Admin-only by product decision (CLAUDE.md) → **Lab › Intraday signals** |
| Stock detail / Watchlist | **Watchlists** tab; stock detail under **Screener**, reached from search, watchlists, screener |
| Backtesting | **Lab › Backtests**, planned (engine removed; shown disabled, never a dead link) |
| Paper trading | **Lab › Paper trading** (admin-only) |
| Alerts | **Alerts** tab (desktop); **More › Tools** (mobile) |
| Settings / Admin | Settings → **Account menu** (profile, theme); Admin → **Lab › Admin console** |

Promoting Signals or Paper trading to every user is a product decision, not a navigation one: move the item
from `LAB_GROUP` into `PRIMARY_NAV` in `lib/navigation.ts` once that decision is made.

---

## 4. Layout: top bar + bottom tabs (no persistent sidebar)

**Chosen: hybrid by breakpoint — top bar on desktop, bottom tab bar on phones/tablets.**

- **Not a sidebar.** The content is wide tables and charts (screener, watchlists, flows). A 220px sidebar
  costs ~15% of a 1440px screen on every page; the indices strip already spends 36px of height. The repo
  had a collapsing rail and deliberately replaced it with a top bar — this keeps that direction.
- **Top bar works once the list is short.** Six entries fit from 1024px (measured: no horizontal overflow
  at 1024, 1280, 1440), so every laptop sees the same bar. Nothing folds by width any more.
- **Bottom tabs on touch.** The four most-used destinations stay visible and one thumb-tap away; the rest
  are in a bottom sheet. This is the pattern on Groww and Kite mobile.

Chrome, top to bottom: skip link → **Navbar** (sticky, 56px) → **indices strip** (sticky, 36px) →
page → **AppFooter** → **MobileNav** (fixed, < lg).

---

## 5. Responsive behaviour

| Width | Top bar | Primary nav | Market status | Search |
|---|---|---|---|---|
| < 768 (phone) | mark · search (fills) · bell · avatar | Bottom tabs: Brief · Watchlists · Portfolio · Screener · **More** | In the indices strip ("Closed") | Fills the bar |
| 768–1023 (tablet) | + market pill | Bottom tabs | Pill + strip | max 384px |
| 1024–1279 (laptop) | mark · 6 tabs (+ Lab) · search · bell · avatar | In the bar | Strip (pill hidden to make room) | 176px |
| 1280–1535 | + pill | In the bar | Pill | 256px, `/` hint |
| ≥ 1536 | + wordmark | In the bar | Pill | 256px |

"More" holds Markets (5), Tools (Alerts), Lab (admins) and Help & legal, and is the current tab whenever the
page lives inside it. The footer is padded by the tab bar's height plus `env(safe-area-inset-bottom)`, so the
tab bar never covers content on notched phones.

---

## 6. States

| State | Bar item | Drawer row | Bottom tab | Menu trigger |
|---|---|---|---|---|
| Default | `muted-foreground`, 500 | `muted-foreground` label, description below | `muted-foreground` icon + label | as bar item + chevron |
| Hover | `accent/60` pill, `foreground` | `accent/60` fill | `foreground` | `accent/60` |
| **Active / current** | `foreground`, **600**, **2px primary underline** on the bar's edge, `aria-current="page"` | `accent` fill, 600, **3px primary bar** at leading edge, primary icon | **primary icon**, `foreground` 600 label, **2px primary bar** on top | underline when any child is current; menu row for the current page has `accent` fill; trigger's name says "current: X" |
| Focus (keyboard) | 2px `ring` outline, 2px offset | same | same | same |
| Open | — | — | "More" `aria-expanded` | `accent` fill, chevron rotated |
| Disabled / planned | — | 70% opacity, "Soon" tag, `aria-disabled`, not a link | — | Radix `disabled` item with "Soon" |
| Badge | — | — | — | Lab: "Admin" tag. Bell: neutral count badge (`foreground` on `background`), count in accessible name |
| Loading | — | — | — | Avatar and status pill render same-size skeletons |

Active is never colour alone (WCAG 1.4.1): weight + a shape (underline / bar) + `aria-current`.

---

## 7. Design tokens

All colours are the existing semantic tokens in `globals.css` — no new colours.

| Token | Value | Use |
|---|---|---|
| `--nav-bar-height` | 3.5rem (56px) | Navbar height; strip `top` offset |
| `--nav-strip-height` | 2.25rem (36px) | Indices strip |
| `--nav-bottom-height` | 3.5rem (56px) + safe area | Bottom tab bar; footer padding |
| Bar surface | `surface/85` + backdrop blur | Navbar, strip |
| Text idle / active | `muted-foreground` / `foreground` | All nav labels |
| Indicator | `primary` | Underline, bars, active tab icon |
| Hover / active fill | `accent/60` / `accent` | Bar pill, drawer row, menu row |
| Focus | `ring`, 2px solid, 2px offset | Every interactive nav element |
| Type | Inter `text-sm` (14px) 500/600 bar & drawer; `text-2xs` (11px) tabs; `text-3xs` (10px) tags | |
| Icons | lucide-react, 16px (bar, drawer, menus), 20px (tabs) | |
| Radius | `rounded-md` items, `rounded-full` pill/avatar/indicators | |
| Spacing | bar `px-4 sm:px-6`, `gap-3 lg:gap-4`; items `px-2.5 py-1.5`; drawer rows `px-3 py-2.5` | |
| Hit targets | bar items 56px tall; tabs ≥56×56; bell/avatar 32×32 | ≥ 24px (WCAG 2.2 2.5.8) |
| Breakpoints | Tailwind defaults: `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 | §5 |

### Measured contrast (WCAG relative luminance, bar = `surface/85` over `background`)

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Active label (`foreground` on bar) | 17.4 | 15.4 | 4.5 |
| Idle label (`muted-foreground` on bar) | 5.8 | 6.3 | 4.5 |
| Drawer active (`foreground` on `accent`) | 15.2 | 12.6 | 4.5 |
| Footer (`muted-foreground` on `background`) | 5.2 | 7.2 | 4.5 |
| Active indicator (`primary` vs bar) | 4.0 | 6.7 | 3 (non-text) |
| Focus ring (`ring` vs bar) | 3.3 | 6.6 | 3 (non-text) |
| Old active label (`primary` on `primary/10`) | **3.5 ✗** | 5.8 | 4.5 |

---

## 8. Accessibility (WCAG 2.1 AA)

- **2.4.1 Bypass blocks** — "Skip to content" is the first tab stop; `main#main-content` takes focus.
- **2.4.7 Focus visible** — `focus-visible:outline-solid` added wherever `outline-none` was paired with
  `focus-visible:outline-2` in the navigation and `Button`. Verified: `outline: solid 2px` on a focused item.
- **1.4.3 / 1.4.11 Contrast** — §7.
- **1.4.1 Use of colour** — active = weight + shape + `aria-current`; market status = words + dot.
- **4.1.2 Name, role, value** —
  - Landmarks: `header`, `nav[aria-label=Primary]` (only one is ever displayed), `main`,
    `footer` with `nav[aria-label="Help and legal"]`.
  - Menus: Radix DropdownMenu (menu-button pattern; arrows, typeahead, Escape returns focus).
  - Drawer: Radix Dialog (focus trap, Escape, titled "More"); trigger has `aria-haspopup="dialog"`,
    `aria-expanded`.
  - Search: ARIA 1.2 combobox — `role=combobox`, `aria-expanded`, `aria-controls`,
    `aria-activedescendant`, `listbox`/`option`, polite result-count live region.
  - Bell: name carries the count ("Portfolio notices, 3 new notices"); badge is `aria-hidden`.
  - Avatar: "Account menu for {name}".
- **2.1.1 Keyboard** — every item reachable by Tab; `/` and Ctrl/⌘ K focus search (`/` ignored while
  typing in a field); ↑/↓/Enter/Escape in search.
- **2.3.3 / reduced motion** — chevron rotation and the live dot pulse are `motion-safe`/`motion-reduce` gated.
- **1.4.10 Reflow** — no horizontal scroll at 375px (Storybook play test on Desktop, Tablet, Mobile).

---

## 9. Trust signals

- **"EquityWise is a research tool, not investment advice."** in the footer of every signed-in page, with
  Disclaimer · Methodology · Data sources · Contact & support. The same links are in the account menu and the
  "More" drawer, followed by the full disclaimer sentence.
- **Market status pill** (from `md`): "Market open / Pre-open / Closing auction / Market closed / Status
  unknown" + a "Delayed" tag when the last good snapshot is being served; tooltip gives the as-of time in IST
  and why. It reads the same snapshot as the indices strip, so they can never disagree.
- **Data freshness** stays in the strip ("NSE · Live", "Delayed · last update 14:02 IST", "At close · date").
- **Consistent placement**: nothing in the bar moves while data loads (skeletons for the avatar and pill;
  bell always present).
- **Labels are plain nouns**; nothing implies execution (no "Trade", "Orders", "Positions"), per CLAUDE.md.
- Lab carries an **"Admin"** tag so an admin's screenshot never suggests users have these pages.

---

## 10. Component spec

| Component | File | Props | States / notes |
|---|---|---|---|
| **AppShell** | `layout/app-shell.tsx` | `children`, `onSearchSelect?(symbol)` (default → `/stocks/[symbol]`), `className?` | Owns one `useIndexStrip()` and one `useSession()`; renders skip link, Navbar, strip, `main`, AppFooter, MobileNav |
| **Navbar** | `layout/navbar.tsx` | `onSearchSelect(symbol)`, `strip: { state, liveState }`, `isAdmin` | Breakpoint table §5 |
| **NavItem** | `layout/nav-item.tsx` | `item: NavItem`, `variant: 'bar' \| 'drawer' \| 'tab'`, `onNavigate?()`, `className?` | default / hover / active / focus / planned (§6) |
| **NavMenu** | `layout/nav-menu.tsx` | `group: NavMenuGroup`, `badge?: string`, `className?` | closed / open / contains-current / planned rows |
| **MobileNav** | `layout/mobile-nav.tsx` | `isAdmin`, `className?` | 4 tabs + More; More is current when the page is in the drawer |
| **NavDrawer** (the spec's "Sidebar") | `layout/mobile-nav.tsx` | `open`, `onOpenChange(open)`, `sections: NavMenuGroup[]`, `onNavigate()` | Bottom sheet; grouped with `h2`s; Help & legal + disclaimer at the foot |
| **UserMenu** | `auth/user-menu.tsx` | `className?` | loading skeleton / signed-in / error (generic avatar, logout still offered) / signed-out (renders nothing) |
| **SearchBar** = `StockSearch` | `market/stock-search.tsx` | `onSelect(symbol)`, `shortcut?: boolean`, `className?` | empty / typing / searching / results / no matches / highlighted option |
| **MarketStatusPill** | `layout/market-status-pill.tsx` | `state: IndexStripState`, `liveState`, `className?` | loading / each `MarketPhase` / delayed / error |
| **AppFooter** | `layout/app-footer.tsx` | `className?` | static |
| **NoticesBell** | `portfolio/notices-bell.tsx` | `className?` | 0 / n / 99+ |

**Model** (`lib/navigation.ts`): `ReadyNavItem { id, label, icon, description, href, matches?, shortLabel? }`,
`PlannedNavItem { …, status: 'planned' }`, `NavMenuGroup { id, label, icon, items }`, and the arrangements
`PRIMARY_NAV`, `MARKETS_GROUP`, `LAB_GROUP`, `MOBILE_TABS`, `DRAWER_SECTIONS`, `HELP_LINKS`, with
`isItemActive` / `isGroupActive` (prefix match on whole segments: `/ipos` matches `/ipos/x`, not `/iposx`).
`lib/navigation.test.ts` checks every link has a page file, ids/hrefs are unique, the bar has ≤ 6 entries,
every user destination is reachable on mobile, admin pages stay out of the user arrangement, and matching.

**Supporting changes:** `lib/use-session.ts` (one deduped session request per page, `signOut`);
`ui/theme-toggle.tsx` exports `useThemePreference` (shared with the account menu); `ui/dropdown-menu.tsx`
gains `DropdownMenuRadioGroup` / `DropdownMenuRadioItem`; `ui/button.tsx` focus fix.

**Removed:** `layout/sidebar.tsx`, `layout/topbar.tsx`, `lib/nav-rail.ts`, the `NAV_INIT_SCRIPT` `<head>`
script, the navigation-rail CSS, and `data-nav-label` in `brand.tsx`.

---

## 11. Before / after

| | Before | After |
|---|---|---|
| Top-level items | 10 (+ folded group 1280–1679) | 6 (5 links + Markets), + Lab for admins |
| Groups | Tracking · Discover · Market record · Account (headings never shown) | Primary · Markets · Lab · Account · Help & legal |
| Desktop bar fits | ≥1680px unfolded | ≥1024px, same at every laptop width |
| 768–1279px | Hamburger only | Full bar from 1024; bottom tabs 768–1023 |
| Phone | Hamburger → flat 10-row list | Bottom tabs (4 + More) → grouped sheet |
| Search result | `/watchlists?symbol=` (ignored) | `/stocks/[symbol]` everywhere |
| Search a11y | Unlabeled popup | Combobox, ↑/↓, live count, `/` and ⌘K |
| Active state | Green text on green tint (3.5:1) | Bold text + underline/bar (17:1) + `aria-current` |
| Focus ring | Invisible | 2px ring, verified |
| Skip link | None | First tab stop |
| Market status | Small phrase at end of strip | Pill in the bar + strip |
| Disclaimer link | None signed-in | Footer, account menu, drawer |
| Admin pages | Inside account menu | "Lab" menu with "Admin" tag |
| Theme | 3-button toggle in bar | Account menu (public header keeps the toggle) |
| Layout shift on load | Avatar & bell pop in | Skeletons; bell always present |

---

## 12. Not done here (follow-ups)

1. **Remaining invisible focus rings** — same Tailwind v4 pattern in `ui/tabs.tsx`, `ui/checkbox.tsx`,
   `ui/switch.tsx`, `disclosures/cash-activity-card.tsx`, `ipos/list/ipo-board-table.tsx`,
   `watchlists/watchlist-table.tsx`, `market/index-cell.tsx`. Fix: add `focus-visible:outline-solid`.
   The text `Input` only changes border colour on focus.
2. **A16** dark pre-open `MarketStatus` badge (1.31:1): use `text-warning` in dark.
3. Rename page `<h1>`s to match the shorter labels if wanted ("My watchlists" → "Watchlists"); Market brief's
   greeting `<h1>` could gain a visually-hidden "Market brief".
4. `PageDisclaimer` on individual pages now repeats the footer line; retire it page by page if preferred.
5. A search hit of kind `index` goes to `/stocks/[symbol]`, as it already did from the stock and screener
   pages; confirm that page handles index symbols.
6. One notification centre (alerts triggered + portfolio notices) behind the bell needs an API; the bell is
   portfolio-only today and says so.

## 13. Verification

- `pnpm typecheck`, `biome check apps` — clean. `vitest` web unit tests — 602 passed (10 new in
  `navigation.test.ts`).
- Storybook `Layout/AppShell` Desktop/Tablet/Mobile/InsideMarketsMenu rendered with mocked APIs at
  375/768/1024/1280/1440 in light and dark: no horizontal overflow at any width; Markets menu, More drawer,
  `/` shortcut and keyboard focus checked.
