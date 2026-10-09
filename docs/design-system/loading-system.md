# Loading system

Reviewed 8 October 2026. The implementation lives in the existing Tailwind/shadcn-compatible token system; no new package, renderer, provider, or data model is required.

## Audit scope and findings

The review covers all **43 page routes**, **88 API handlers** as data sources, and **223 production component modules** in `apps/web/src/components` after this change. The file-level inventory, including async evidence and the disposition of every component and page, is [loading-inventory.csv](loading-inventory.csv). Stories, tests and non-visual worker jobs are excluded from the component count. `tracker/` is a separate, explicitly non-workspace developer tool; it is not served by EquityWise and is outside this product redesign.

Before this change there were 12 `loading.tsx` files. Server-rendered profile, stock, screener, breadth, alerts and admin pages had no matching route fallback. Portfolio subroutes inherited an overview placeholder. Several IPO and research fallbacks were large pulsing rectangles. The daily brief fallback described an older layout. Cards, tables and charts had separate placeholder implementations. Some smaller reads displayed only “Loading…” or “Searching…”. The account avatar arrived without reserved space. Seven static information pages blocked their entire body on a session lookup.

There are now **33 explicit route fallbacks**, including a root landing fallback; the public header reserves its account-control footprint while shared session state resolves. Redirect-only routes need no new loading UI. Existing inputs, menus, navigation, errors and genuine empty states remain distinct from pending data.

## Design contract

- **Keep known structure.** Render the real app bar, navigation, section tabs, headings and existing panel titles. Skeleton only the unknown content. A full page fallback uses the same `AppShell` and `PageContainer` as its destination. Public pages stream static copy while account controls resolve.
- **Use hierarchy, not slabs.** Metric labels use 12px bars, readings 28px bars; table headers have a 40px band and initial rows use 56px slots. Cards and forms use existing 16px padding, 16px inter-section gaps, `rounded-lg`, `border-border`, `bg-surface` and `shadow-subtle`. Shapes use `rounded-md` and `bg-border/50` in both themes.
- **Quiet motion.** One opacity pulse, 2.4 seconds with a 200ms animation delay, 1 → .55 → 1. No shimmer gradients or staggered waves. The shape is immediately visible; there is no artificial minimum loading duration. `prefers-reduced-motion: reduce` disables the animation completely.
- **One accessible announcement per boundary.** `LoadingRegion` has a single visually hidden `role=status` outside its busy subtree. Its children are decorative, `aria-hidden`, and cannot receive focus. Do not put real controls in that subtree. Individual `Skeleton` shapes are always decorative. Independent header, index and panel requests can have their own boundaries.
- **Initial load differs from refresh.** Unknown initial data gets a skeleton. Tables with existing rows retain them and expose `aria-busy`. Screener results, watchlist polling, paper polling and history pagination retain their established refresh behavior. New symbol/timeframe requests may show a chart skeleton so the previous symbol’s prices cannot look like the requested series.
- **Empty is a completed result.** No “No matches”, “No sessions” or onboarding content before a read resolves. Search includes debounce time in pending state. Search, watchlist-picker and session failures have distinct feedback; the picker and session list offer retry. Never leave a skeleton running because a rejected request was mistaken for pending.
- **Do not imply financial results.** Charts reserve axes, grid and labels without synthetic price curves, bars or success-colored trends. Skeletons contain no holdings, balances, signal scores, or example financial values.
- **Match responsive behavior.** Grids collapse with the destination. `SkeletonResults` switches between cards and tables at `sm` (screener/portfolio) or `lg` (IPO master list). Generic dense tables reduce visible placeholder columns rather than widening the document. The screener’s desktop filter panel is hidden on phones. Sheet content stays within its existing Radix focus trap and viewport.
- **No skeleton for completed local content.** Already populated dialogs, filter builders, tab switches over available data, and synchronous settings remain visible. Saving, uploading, revoking and verifying use control-level pending feedback. Replacing an editable form with a skeleton would lose context and focus. Small button progress icons are intentionally retained.

Unknown result counts, conditional warning banners, user-selected columns and empty portfolios cannot have exactly the same height as one fixed initial placeholder. The system reserves the stable first-screen hierarchy; it does not manufacture data or pad the final result to a fake row count.

## Components and ownership

| Component | Responsibility |
| --- | --- |
| `ui/skeleton.tsx` | Decorative token-based shape, common motion, reduced-motion support |
| `data-display/loading.tsx`: `LoadingRegion` | Busy boundary and accessible announcement |
| `SkeletonPanel`, `SkeletonText`, `SkeletonToolbar` | Card shell, text rhythm and wrapping controls |
| `SkeletonMetrics`, `SkeletonSummary` | Metric tiles and compact watchlist summary |
| `SkeletonList`, `SkeletonTable`, `SkeletonResults` | Feed/search rows, dense tables and responsive result cards |
| `SkeletonChart` | Neutral plot, axes and grid with a caller-selected height |
| `SkeletonForm` | Label/control/help/action structure without interactive elements |
| `SkeletonRows`, `CardSkeleton`, `ChartSkeleton`, `TableSkeleton` | Announced standalone wrappers; existing `states.tsx` exports remain compatible |
| `layout/page-skeletons.tsx` | Named route compositions built from visual primitives |
| `ipos/ipo-loading-patterns.tsx` | IPO overview, list, section and issue compositions |
| `intraday/intraday-skeleton.tsx`, `paper/paper-skeleton.tsx` | Shared route and client-initial-load compositions |
| `auth/auth-loading.tsx` | Existing auth shell with non-interactive form placeholders |

Compositions use visual-only primitives inside one `LoadingRegion`. Standalone wrappers own their region; do not wrap them in another loading region. No client hook or timer is required to render a skeleton. The existing client shell still owns session/index reads. API handlers, authentication rules, database operations and financial calculations are unchanged.

## Route mapping

| Route | Pending UI / content retained |
| --- | --- |
| `/` | Root landing skeleton: persistent public header plus hero, product-preview and section hierarchy while the session redirect resolves |
| `/today` | `TodayLoading`: four metrics, technical-read and movers columns, overview table; real greeting shell |
| `/watchlists` | Route `WatchlistsLoading`; client `WatchlistPageSkeleton`: compact summary, toolbar, table; real watchlist tabs remain during reads |
| `/screener` | `ScreenerLoading`: universe/preset toolbar, desktop filter builder, results; phone cards; loaded results remain during edits |
| `/stocks/[symbol]` | `StockLoading`: identity/header, ratio board with context sidebar, chart and levels |
| `/markets/breadth` | `BreadthLoading`: six metrics, 3:2 charts, industry table |
| `/flows` | `FlowsLoading`: feed strip, market tape charts, stock and deal tables |
| `/announcements` | `AnnouncementsLoading`: filters and filing cards |
| `/calendar` | `CalendarLoading`: four metrics, filters and date-grouped agenda |
| `/portfolio` | `PortfolioLoading`: real portfolio navigation, five metrics, responsive holding results |
| `/portfolio/[symbol]` | `HoldingLoading`: identity, four metrics, facts and entry rows |
| `/portfolio/analysis` | `AnalysisLoading`: real portfolio navigation, tabs, allocation and report charts |
| `/portfolio/notices` | `NoticesLoading`: real portfolio navigation, controls and activity rows |
| `/alerts` | `AlertsLoading`: creation-form structure, rule rows and recent activity |
| `/profile` | `ProfileLoading`: identity, tabs, avatar card and details/preferences form |
| `/intraday` | `IntradaySkeleton` at both route and client boundaries; overview/rules/signals structure |
| `/paper-trading` | `PaperSkeleton` at both boundaries; controls, balances and study table |
| `/admin` | `AdminLoading`: usage metrics, controls and account rows |
| `/admin/logs` | `LogsLoading`: filters and event table |
| `/admin/ipos` | `IpoHealthLoading`: feed health metrics and diagnostic tables |
| `/admin/paper` | `PaperHealthLoading`: health metrics, cycles and alerts |
| `/ipos` | `IpoOverviewSkeleton`: five stages, issue cards, activity sidebar and table; real section header |
| `/ipos/all` | `IpoListSkeleton`: four metrics, filters, desktop table/mobile cards |
| `/ipos/[slug]` | `IpoDetailSkeleton`: issue identity, metrics, facts, timeline and evidence; real IPO navigation |
| `/ipos/calendar` | `IpoSectionSkeleton(calendar)`: summary, controls and dated agenda |
| `/ipos/gmp` | `IpoSectionSkeleton(gmp)`: metrics, controls and comparison rows |
| `/ipos/listings` | `IpoSectionSkeleton(listings)`: metrics, controls and listing rows |
| `/ipos/pipeline` | `IpoSectionSkeleton(pipeline)`: three metrics, controls and pipeline rows |
| `/login`, `/signup`, `/reset`, `/verify` | `AuthLoading` in the existing centered auth layout; appropriate field counts; verification retains announced operation status |
| `/account/verify-email` | Stable confirmation-card fallback; announced verification state with stable minimum height |
| `/about`, `/contact`, `/methodology`, `/data-sources`, `/disclaimer`, `/privacy`, `/terms` | Static page content streams immediately; `PublicHeader` reserves the account-control footprint while shared session state resolves |
| `/signals`, `/ipos/mainboard`, `/ipos/sme` | Redirects to existing destinations; no independent data surface |

## Nested and interactive audit

| Surface | Treatment |
| --- | --- |
| Global stock search | Compact result skeleton during initial query/debounce; input stays focused, abort old query immediately, distinct error/no-match result |
| Portfolio add-share dialog search | Compact rows; form and selected stock retained; canceled reads cannot update results |
| Watchlist add/import dialogs | Existing result skeletons inherit common rows; staged selections and action-level progress retained |
| Watchlist starter templates | Existing pending list inherits common rows; no skeleton for absent optional templates after resolution |
| Stock “Add to watchlist” popover | Three rows, retry on lookup failure; Radix open/focus behavior preserved |
| Flow stock sheet | Metrics, feed rows and table; real sheet header/close affordance remains |
| Watchlist stock/index drawers and expanded rows | Existing chart owns the async boundary; static identity, timeframe controls and known evidence remain |
| Announcement interpretation/version history | Version rows while reading; current interpretation retained on refresh |
| Profile sessions | Device rows; distinguish failure from an empty session list, with retry |
| Profile photo, password/email, MFA, identities, account deletion | Existing values and dialog remain; action-level pending/disabled state; no whole-form replacement |
| Auth login/signup/reset/social/MFA/verification | Form remains on submission; verification has status semantics |
| Portfolio import / statement check | Preview table slots while parsing/resolving; file inputs/help remain; parsed review appears only after completion |
| Portfolio allocation/returns/risk charts | Shared chart grid during initial width measurement; hash-tab initialization gets a chart boundary |
| Paper status/activity/history/performance | Structured card/list/table/chart within existing headings; retained reports and history on refresh |
| Shared `DataTable` | Empty initial read → table skeleton; populated refresh → existing table with busy state |
| Global indices | Existing fixed cell skeletons inherit common tokens/motion; no whole-strip replacement during polling |
| Account menu | Fixed avatar slot until session resolves; account controls never guessed from pending state |
| Optional notice count | Existing conditional badge; navigation itself remains usable and does not wait for the count |
| IPO `Suspense fallback={null}` wrappers | Intentionally retained: these wrap URL-return/scroll bookkeeping, not visible content |
| Other tables, cards, dialogs, chart controls, filters and menus | Server-supplied props or local synchronous state; parent route/read boundary owns loading. See complete inventory. |

## Review artifacts

- [Visual gallery](loading-mockups/index.html): seven representative page types, each in desktop/mobile and light/dark (28 screenshots).
- Storybook **Patterns / Loading system**: 14 live compositions, including IPO, drawer, intraday, paper and primitives. Theme and viewport toolbar controls work normally. Stories hold shell requests pending and never require account or market data.
- [Browser verification results](loading-mockups/verification.json): overflow, reduced-motion and focusability checks across 14 patterns × 3 widths × 2 themes.

## Adding a future state

1. Keep known titles, navigation and controls outside `LoadingRegion`.
2. Compose visual primitives inside it, matching the destination grid, height and breakpoint. Reuse a named feature composition for route and client initial loads.
3. Distinguish pending, ready-empty, ready-populated and error. Do not clear good data just because a refresh started. Reset for a changed identity where showing old content would be misleading.
4. Add a Storybook scenario; inspect 375px and 1440px, both themes and reduced motion. Include 768px if the feature changes layout there.
5. Run web typecheck, Biome, relevant tests and Storybook build. Check the real route where an authenticated/local data environment is available.
