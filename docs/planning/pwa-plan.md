---
name: Progressive Web App
status: in-progress
horizon: now
created: 2026-11-16
updated: 2026-11-16
area: [web, worker]
summary: Make the existing Next.js web app an installable PWA with app-grade navigation — manifest, icons, safe areas, a minimal service worker that never caches market or personal data, standalone-mode navigation (sticky back, tab re-tap, keyboard), install, update and offline flows, then Web Push for alerts and an optional Play Store listing through a TWA.
owner: krishna
---

# Progressive Web App — plan (rev 2)

> **Status (2026-11-16):** Phases 1–3 built on branch `feat/pwa` (not merged, not
> yet tested on real devices). Phases 4–5 not started. What was built, and where it
> differs from the plan below: §13.
> Builds on: `navigation-redesign-plan.md` (bottom tab bar + "More" drawer, live),
> `mobile-responsive-plan.md`, `docs/mobile/01-discovery.md` (the native plan this
> one runs ahead of). Rev 2 is the same day's audit of rev 1 — changes listed in §12.

## 0. Summary

Below `lg`, EquityWise already looks like a phone app: bottom tab bar, "More"
bottom sheet, sticky top bar and indices strip, bottom safe-area padding,
`min-h-dvh`, theme set before first paint. What it lacks is what makes a browser
treat it as an **installed app**: no manifest, no service worker, no `viewport` /
`themeColor` export, no top safe-area handling, no offline answer, and no
navigation for the places a standalone window removes browser chrome — above all
**no back button on iOS**.

Five phases. Phases 1–3 (installable, app-grade navigation, install/update/offline
flows) are **4–5 working days**, add **no dependency**, and change no server code
or database. Phase 4 (Web Push for alerts) adds a table, two routes and a worker
channel. Phase 5 (Play Store through a Trusted Web Activity) is optional.

## 1. Decisions to approve

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | PWA first; pause the Expo app (`docs/mobile/`) and reopen it only if Phase 4 push or a Phase 5 TWA proves insufficient | **Approve** |
| D2 | Delete the untracked `apps/mobile/` folder (only a generated `android/` build and `node_modules`; no source) | **Approve** |
| D3 | Hand-written `sw.js` (~80 lines) instead of Serwist / next-pwa | **Approve** — the scope is an offline fallback; a framework would add a build plugin and precache lists to police |
| D4 | The service worker never stores HTML, `/api/*`, prices or anything per-user | **Approve** — non-negotiable for a data product (§2) |
| D5 | Phase 4 Web Push for alerts in scope | Approve after Phases 1–3 ship |
| D6 | Phase 5 Play listing via TWA | Defer; decide after a month of install numbers |

## 2. Principles (binding on every phase)

1. **The network is the source of truth.** The worker stores only the offline page
   and its icon. It never stores pages, `/api/*` responses, prices, or anything
   per-user. A stale price shown as current is worse than "you're offline"
   (CLAUDE.md rule 7 for portfolio data; the honesty rule for everything else).
2. **Same URLs, same pages.** No `/app/*` shell and no client-only router. The
   installed app is the website in a standalone window; every deep link works.
3. **Accessibility is not traded for "app feel".** Zoom stays enabled
   (`maximumScale` is never set), focus order and the skip link stay, motion
   respects `prefers-reduced-motion`, touch targets are ≥ 44 px.
4. **Product rules apply to the new surfaces.** Notifications, badges and
   shortcuts state facts; nothing says buy or sell or implies the app can act.
   No holdings, share counts or cost ever appear in a notification, badge,
   shortcut, URL, cache or log.
5. **Nothing installed can break the site.** A one-file kill switch (§3.5) can
   unregister the worker for every user on the next visit.

## 3. Installability (Phase 1)

### 3.1 Manifest — `apps/web/src/app/manifest.ts`

Next serves it at `/manifest.webmanifest` (already outside the middleware matcher)
and links it automatically.

| Field | Value | Why |
| --- | --- | --- |
| `id` | `/` | Stable identity. **Never change it** — a new id is a new app for every installed user |
| `name` / `short_name` | `EquityWise` / `EquityWise` | ≤ 12 chars fits under an icon |
| `description` | `SITE_DESCRIPTION` | One source |
| `start_url` | `/today?source=pwa` | Market Brief is `HOME_HREF`; the param marks installed launches in access logs. No personal data |
| `scope` | `/` | Auth, landing and legal pages stay in the app window |
| `display` / `display_override` | `standalone` / `["standalone", "minimal-ui"]` | `minimal-ui` keeps a browser back button where standalone is unsupported |
| `launch_handler` | `{ "client_mode": ["navigate-existing", "auto"] }` | A shortcut or notification reuses the open window instead of stacking new ones (Chromium) |
| `orientation` | omitted | Charts and tables benefit from landscape; never lock it |
| `theme_color` / `background_color` | light `--surface` / light `--background`, as hex | Title bar and splash; a test asserts parity with `globals.css` OKLCH tokens |
| `categories` | `["finance", "business"]` | |
| `icons` | §3.2 | |
| `shortcuts` | Watchlists, Screener, Portfolio, IPOs — generated from `lib/navigation.ts` | Long-press menu; names never drift from the nav |
| `screenshots` | 2 narrow 1080×1920 + 1 wide 1920×1080, `form_factor` set, **demo data only** | Android shows the richer install sheet only with these |

### 3.2 Icons

A **vector master** (`apps/web/assets/brand-mark.svg`) is a prerequisite — the
current icons are 256 px PNGs and cannot be scaled up cleanly. Generated from it
and committed (one script, `scripts/generate-icons.mjs`, using `sharp` already in
Next's tree — run by hand, not at build):

| File | Size | Purpose |
| --- | --- | --- |
| `public/icons/icon-192.png`, `icon-512.png` | 192, 512 | `any` |
| `public/icons/maskable-512.png` | 512 | `maskable` — mark inside the central 80 % circle, full-bleed background |
| `public/icons/monochrome-512.png` | 512 | `monochrome` — Android 13+ themed icons |
| `app/apple-icon.png` | 180 | iOS home screen (replaces the 256 px one) |
| `public/icons/shortcut-*.png` | 96 | One per shortcut |
| `public/splash/*.png` | per device class | iOS `apple-touch-startup-image`, light + dark — without them iOS shows a white screen at launch, which flashes in dark mode |

### 3.3 Viewport, theme colour, iOS meta — `app/layout.tsx`

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',            // env(safe-area-inset-*) reports real values
  themeColor: LIGHT_SURFACE_HEX,   // one meta; THEME_INIT_SCRIPT rewrites it
  colorScheme: 'light dark',
};
// added to `metadata`:
appleWebApp: { capable: true, title: 'EquityWise', statusBarStyle: 'default', startupImage: [...] },
formatDetection: { telephone: false },   // stops iOS turning prices into phone links
```

- **One** `theme-color` meta, not two media-query metas: the user can pick a theme
  that differs from the OS, so `THEME_INIT_SCRIPT` sets the meta to the resolved
  theme's surface colour before first paint, and `applyTheme()` updates it on
  every switch.
- iOS `statusBarStyle: 'default'`: content starts below the status bar, no notch
  overlap to engineer around.

### 3.4 Safe areas

- Navbar: `padding-top: env(safe-area-inset-top)`, height
  `calc(var(--nav-bar-height) + env(safe-area-inset-top))`. The indices strip's
  `top` offset uses the same sum.
- Left/right: `max(1rem, env(safe-area-inset-left|right))` on the shell's outer
  containers, for landscape on notched phones.
- Bottom: already handled by `--bottom-chrome`.

### 3.5 Service worker — `apps/web/public/sw.js` (from a template)

Chromium no longer requires a fetch handler to install; this worker exists for one
reason — **an honest offline screen instead of the browser's dinosaur**.

| Request | Handling |
| --- | --- |
| `/api/*`, event streams, non-GET, cross-origin | **Not intercepted** — the handler returns before `respondWith` |
| `/_next/static/*`, fonts | Not intercepted — Next already serves them `immutable, max-age=31536000`; the HTTP cache does this job |
| Navigations (`request.mode === 'navigate'`) | **Network-only**; on network failure respond with the precached `/offline.html` |
| Everything else | Not intercepted |

- **Offline page is a static `public/offline.html`** with inline CSS and the
  192 px icon — no Next chunks, no session, no data. It sits outside the
  middleware matcher (`.html`), so no middleware or route-auth change is needed.
- `install`: precache `/offline.html` and `/icons/icon-192.png` into
  `ew-offline-{BUILD_ID}`. `activate`: delete other `ew-*` caches,
  `clients.claim()`. `message`: `SKIP_WAITING` → `skipWaiting()`.
- **Versioning:** `src/pwa/sw.template.js` is stamped with Next's `BUILD_ID` by a
  `postbuild` script in `apps/web/package.json` (runs locally, in CI and in
  `deploy.sh` with no extra step); the output `public/sw.js` is gitignored. Every
  deploy yields a byte-different worker, which is what triggers an update.
- **Serving:** `next.config.ts` `headers()` → `/sw.js`:
  `Cache-Control: no-cache, no-store, must-revalidate`. CSP gains explicit
  `worker-src 'self'` and `manifest-src 'self'`. Nginx must not override
  (`docs/operations/deployment.md`).
- **Registration** — `components/pwa/sw-register.tsx`, mounted once in the root
  layout: production only, after `load`,
  `register('/sw.js', { scope: '/', updateViaCache: 'none' })`. In development it
  unregisters any worker it finds so HMR is never intercepted.
- **Kill switch:** `src/pwa/sw.kill.js` (self-unregister, delete `ew-*` caches,
  reload clients). Swapping it in for the template and deploying removes the
  worker from every device on its next visit.

### 3.6 Phase 1 acceptance

- DevTools → Application → Manifest: no installability errors. Install icon in
  desktop Chrome/Edge; rich install sheet (with screenshots) on Android Chrome.
- Installed on Android and iOS: launches to `/today` (or `/login?next=/today`)
  standalone, correct icon, splash and status-bar colour in both themes.
- Airplane mode → any navigation shows `offline.html`; back online → it reloads.
- No `/api/*` request is ever served "(ServiceWorker)"; both SSE streams connect;
  Cache Storage holds only `ew-offline-*`.
- Playwright (`pnpm test:e2e`): manifest fetch + required fields, worker registers
  in a production build, `context.setOffline(true)` → offline page.

## 4. Navigation for an installed app (Phase 2)

The structure stays as `navigation-redesign-plan.md` defines it — four tabs plus
More below `lg`, six destinations in the top bar from `lg`. What changes is
behaviour where a standalone window removes browser chrome.

### 4.1 Information architecture (unchanged)

```
Tab bar (< lg)             Top bar (all widths)                 More sheet
──────────────             ──────────────────────────           ─────────────────────────
Brief      /today          Brand → /today  (or Back, §4.2)      Markets
Watchlists /watchlists     Search (⌘K, /) → /stocks/[symbol]      Institutional flow /flows
Portfolio  /portfolio      Market status pill (md+)               Announcements /announcements
Screener   /screener       Notices bell → /portfolio/notices      Market calendar /calendar
More ────────────────────▶ Account → /profile, theme, install,    Alerts /alerts
                             help & legal, sign out             Tools → IPOs /ipos
                                                                Admin (admins only)
                                                                Help & legal + disclaimer
```

| Detail route | Back goes to | Lit tab |
| --- | --- | --- |
| `/stocks/[symbol]` | previous page, else `/screener` | Screener |
| `/portfolio/[symbol]`, `/portfolio/analysis`, `/portfolio/notices` | previous, else `/portfolio` | Portfolio |
| `/ipos/[slug]` and `/ipos/*` sections | previous, else `/ipos` | More |
| `/flows`, `/announcements`, `/calendar`, `/alerts` | previous, else `/today` | More |
| `/admin/ipos`, `/admin/logs` | previous, else `/admin` | More |
| `/profile`, `/account/*` | previous, else `/today` | none |

### 4.2 Back navigation — in the sticky top bar

iOS standalone windows have no back button and no reliable back gesture. Android
has system back. The industry pattern (Material top app bar, iOS navigation bar,
Kite/Groww/X PWAs) puts back at the **top-left of the sticky bar**, not in a page
header that scrolls away.

- On any route in the table above, below `lg` — and at every width when installed
  (desktop standalone windows also lack a back button) — the Navbar's brand slot
  becomes `‹ Screener` (chevron + parent's short label). Tab roots keep the brand.
  No extra row of chrome.
- `components/layout/back-button.tsx`; `PARENT_ROUTES` + `parentOf(pathname)` in
  `lib/navigation.ts` (unit-tested for every route).
- Behaviour: a `sessionStorage` counter of in-app navigations (set by a router
  listener in `AppShell`). If > 0 → `router.back()`; otherwise (cold open from a
  shortcut, notification or shared link) → `router.replace(parent)`. Back never
  exits the app or lands on a blank page. (`history.length` is not used — it
  counts pages from before the app.)
- 44 × 44 px target, `aria-label="Back to Screener"`.

### 4.3 Tab bar behaviours

| Behaviour | Spec |
| --- | --- |
| Re-tap current tab | On the tab root and scrolled → smooth-scroll to top (instant under reduced motion). On a detail page inside the tab → go to the tab root. (iOS and Material convention) |
| Soft keyboard open | Hide the tab bar while a text field below `lg` has focus and `visualViewport.height` has shrunk > 150 px; restore on blur. Stops the bar riding on the keyboard over search results and forms |
| Badge | Dot on Portfolio when there are unread portfolio notices — mirrors the bell; dot only, never a count of holdings |
| Active state | Unchanged: exactly one current tab, More lights for sheet pages |

### 4.4 Scroll, refresh, gestures

- **Scroll restoration:** App Router restores on back/forward; verify each tab root.
- **Overscroll:** `overscroll-behavior-y: none` on `html` only when
  `data-display-mode="standalone"` (stops iOS rubber-band revealing the
  background behind the fixed bars); tables and the More sheet get
  `overscroll-behavior: contain`.
- **Refresh:** a standalone window has no reload button. Live data refreshes
  itself (SSE + polling). Every tab root already states when its data is from;
  add **pull-to-refresh on the four tab roots only** (`router.refresh()`,
  touch only, 64 px threshold, starts only when scrolled to top, reduced-motion
  aware). No swipe-between-tabs gesture — it would fight horizontally scrolling tables.

### 4.5 Links that leave the app

- Inside `scope: '/'` everything stays in the window. Out-of-scope links (NSE
  filings, RHP PDFs, InvestorGain) open in the platform's in-app browser sheet.
- Audit `components/disclosures`, `components/ipos`, `components/stocks`: every
  external reference link gets `target="_blank" rel="noopener noreferrer"` and an
  external-link icon.
- **Google sign-in** leaves scope and must return to the app window with
  `__Host-session` set — tested on both platforms in Phase 1 (risk R2).
- iOS keeps a **separate cookie jar** for home-screen apps: a user signs in once
  inside the installed app even if signed in in Safari. Expected; the install
  sheet says so.

### 4.6 Display-mode awareness

`THEME_INIT_SCRIPT` also sets `data-display-mode="standalone|browser"` on
`<html>` before first paint (`matchMedia('(display-mode: standalone)')` or
`navigator.standalone`). CSS keys standalone rules off it; `lib/pwa.ts` exports
`isStandalone()`. Set before paint, so no layout shift.

### 4.7 Phase 2 acceptance

- Every route in §4.1's table shows back in the sticky bar; a cold open from a
  shortcut then back lands on the parent, never outside the app.
- Re-tap on each tab scrolls to top / returns to root.
- Tab bar hidden while typing in search, screener filters, the portfolio form and
  login on a 360 × 640 Android and an iPhone SE.
- No rubber-band reveal in iOS standalone; pull-to-refresh on tab roots only.
- Storybook a11y checks pass; keyboard and screen reader reach back.

## 5. Flows (Phase 3)

### 5.1 Install

```
Signed-in, on a phone, not installed, ≥ 2nd session, not dismissed in 30 days
 ├─ Chromium: beforeinstallprompt captured
 │    → slim banner above the tab bar: "Install EquityWise — opens full screen"
 │      [Install] [Not now] → prompt() → appinstalled → never shown again
 └─ iOS Safari (no prompt API): same banner, [How] → sheet:
      "Tap Share, then Add to Home Screen" (2 steps, illustrated),
      "You'll sign in once inside the app."
Always: Account menu → "Install app" (hidden when installed or unsupported)
```

`components/pwa/install-banner.tsx` + `lib/use-install-prompt.ts`; `visits` and
`dismissedAt` in `localStorage` behind try/catch (as the theme does). Never on
auth pages, the landing page, or inside an installed window.

### 5.2 Update after a deploy

```
deploy → new sw.js (new BUILD_ID)
open app → registration.update() on load and on visibilitychange → visible
 └─ new worker installed and waiting
      → toast: "A new version of EquityWise is ready" [Reload]
      → SKIP_WAITING → controllerchange → location.reload()
ignored → activates when every EquityWise window has closed
```

No silent `skipWaiting()`. A lazy chunk deleted by the deploy is already handled by
App Router (a failed chunk load triggers a full navigation).

### 5.3 Launch and authentication

```
icon → /today?source=pwa
 ├─ session cookie → Market Brief
 └─ none → middleware → /login?next=/today → password / 2FA / Google → /today
session expires → API 401 → /login?next=<current path>   (unchanged)
sign out → unchanged (nothing per-user is cached to clear)
```

### 5.4 Offline

```
navigation fails → offline.html (Try again; auto-reload on 'online')
open page loses network → thin "Offline — prices are not updating" bar under the
  indices strip ('offline'/'online' events); the live label already stops saying Live
```

### 5.5 Phase 3 acceptance

- Banner appears only under §5.1's conditions on Android Chrome, desktop
  Chrome/Edge and iOS Safari 17+, never after install or dismiss.
- Two staging deploys in a row: an open installed app shows the toast, Reload
  brings the new build, no console errors.
- Offline bar appears and clears with the connection.

## 6. Web Push for alerts (Phase 4)

Supported: Android Chrome/Samsung/Firefox; desktop Chrome/Edge/Firefox/Safari;
iOS/iPadOS 16.4+ **only when installed**.

| Piece | Where | Detail |
| --- | --- | --- |
| VAPID keys | `.env`: `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY` (public by design), `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (worker only) | |
| Table | `push_subscriptions` (id, owner_id → users ON DELETE CASCADE, endpoint unique, p256dh, auth, device_label, created_at, last_success_at, failure_count) | Drizzle migration; repository scoped by `owner_id`. Web writes create/delete (user-owned); worker writes delivery status and deletes 404/410 endpoints — the same split the native plan set for `push_devices` |
| API | `POST` / `DELETE /api/push/subscriptions` | Zod, origin check, session required |
| Opt-in | `/profile` → Notifications: per-channel toggles (Email / This device) for alerts | Permission requested **only** from the toggle, never on load |
| Sender | `apps/worker`: `evaluate-alerts` gets a `PushSender` beside `MailSender`, via `web-push` | Retries with backoff like mail |
| Worker | `push` → `showNotification`; `notificationclick` → focus an open window (`launch_handler`) or open the URL | |
| Payload | `{ title, body, url, tag }`, e.g. "RELIANCE closed at ₹2,941.20 — above your ₹2,900 alert" | Facts. Price alerts only — **portfolio notices are never pushed** (a lock screen would reveal a holding). No BUY/SELL words |
| App badge | `navigator.setAppBadge()` with the unread-notices count while the app is open | Count only |

Acceptance: a close-of-day alert reaches an installed Android, iOS and desktop
client; tapping opens `/stocks/[symbol]` with back to `/screener`; revoking
permission or deleting the account removes the row.

## 7. Play Store via TWA (Phase 5, optional)

- Bubblewrap wraps the PWA as a Trusted Web Activity, package `io.equitywise.app`.
- `/.well-known/assetlinks.json` (add to `isPublic()`) with the signing key's
  SHA-256 so the app runs without a URL bar.
- Play requirements as for the native app: closed test (tester count and duration
  — verify on Google's page at the time), Data Safety, privacy policy `/privacy`,
  and the **financial features declaration** Play requires of finance-category apps.
- Also optional here: Web Share on stock/IPO pages (URL only), view transitions
  between tab roots once Next's support is stable.

## 8. Files touched

| File | Phase | Change |
| --- | --- | --- |
| `apps/web/src/app/manifest.ts` | 1 | New |
| `apps/web/src/app/layout.tsx` | 1 | `viewport`, `appleWebApp`, `formatDetection`, mount `SwRegister` |
| `apps/web/public/offline.html` | 1 | New, static |
| `apps/web/src/pwa/sw.template.js`, `sw.kill.js`, `scripts/stamp-sw.mjs` | 1 | New; `postbuild` in `package.json`; `public/sw.js` gitignored |
| `apps/web/assets/brand-mark.svg`, `scripts/generate-icons.mjs`, `public/icons/*`, `public/splash/*`, `app/apple-icon.png` | 1 | New / replaced |
| `apps/web/src/components/pwa/sw-register.tsx` | 1, 3 | Registration, update toast |
| `apps/web/next.config.ts` | 1 | `/sw.js` headers; CSP `worker-src`, `manifest-src` |
| `apps/web/src/lib/theme.ts` | 1, 2 | theme-color sync, `data-display-mode` |
| `apps/web/src/components/layout/navbar.tsx`, `app-shell.tsx`, `globals.css` | 1, 2 | Safe areas; back slot; navigation counter |
| `apps/web/src/lib/navigation.ts` (+ test) | 2 | `PARENT_ROUTES`, `parentOf()` |
| `apps/web/src/components/layout/back-button.tsx` | 2 | New |
| `apps/web/src/components/layout/mobile-nav.tsx`, `nav-item.tsx` | 2 | Re-tap, keyboard hide, badge |
| `apps/web/src/components/pwa/pull-to-refresh.tsx`, `offline-bar.tsx`, `install-banner.tsx`; `lib/pwa.ts`, `lib/use-install-prompt.ts` | 2, 3 | New |
| `apps/web/src/components/auth/user-menu.tsx` | 3 | "Install app" |
| `e2e/pwa.spec.ts` | 1–3 | Playwright |
| `packages/db/src/schema/push-subscriptions.ts` + migration; `apps/web/src/app/api/push/subscriptions/route.ts`; `apps/web/src/server/push/*`; `apps/worker/src/push.ts`, `jobs/evaluate-alerts.ts` | 4 | New / changed |
| `apps/web/src/middleware.ts` | 5 | `/.well-known/assetlinks.json` public |
| `docs/operations/deployment.md` | 1, 4 | `sw.js` caching under Nginx, kill switch, VAPID secrets |
| `docs/mobile/README.md` | 0 | Status: paused — PWA first (this plan) |

Dependencies: none for Phases 1–3; `web-push` (worker) in Phase 4.

## 9. Testing

- **Vitest:** `parentOf()` for every route; install-banner eligibility; theme
  hex ↔ token parity; manifest shape (shortcuts resolve to real `ReadyNavItem`
  hrefs); the worker's request-routing function (exported for test) — `/api/*`,
  SSE, non-GET, cross-origin, static → bypass; navigate → network then offline.
- **Playwright:** §3.6 plus back-from-cold-open, tab re-tap, offline bar.
- **Storybook:** back button, install banner (Chromium / iOS), offline bar, tab bar
  keyboard-hidden and badge states, with the a11y addon.
- **Device matrix** each phase: Android Chrome (mid + low-end), Samsung Internet,
  iOS Safari 17/18 on iPhone SE and a notched iPhone, desktop Chrome/Edge
  installed windows; light and dark.
- Lighthouse dropped its PWA category in v12; installability is checked in
  DevTools → Application and by the Playwright suite.

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | A worker bug breaks pages for every user | Low | High | Navigation-only interception, network-first; kill switch (§3.5) |
| R2 | Google sign-in or 2FA misbehaves in iOS standalone | Medium | Medium | Tested in Phase 1; email/password is same-origin |
| R3 | iOS evicts the worker after weeks unused | High | Low | Nothing important is stored; the app works from the network |
| R4 | Push unavailable (iOS not installed) or denied | High | Low | Email stays the default channel |
| R5 | Users expect offline data | Medium | Low | Offline page explains why nothing is shown; principle 1 |
| R6 | Pull-to-refresh conflicts with inner scrollers | Low | Low | Tab roots only, only at scroll top |

## 11. Phases and estimates

| Phase | Content | Estimate | Depends on |
| --- | --- | --- | --- |
| 0 | Approve D1–D6; vector icon master; demo-data screenshots | 0.5 day + design | — |
| 1 | Installable: manifest, icons, splash, viewport/meta, safe areas, headers/CSP, offline page, worker, kill switch | 1.5 days | 0 |
| 2 | Navigation: back in sticky bar, tab re-tap, keyboard, overscroll, pull-to-refresh, external links, display-mode | 1.5–2 days | 1 |
| 3 | Install banner, update toast, offline bar | 1 day | 1 |
| 4 | Web Push for alerts, app badge | 2–3 days | 1, 3 |
| 5 | Optional: TWA on Play, Web Share, view transitions | 1–2 days + Play review | 1–3 |

Phases 2 and 3 are independent once Phase 1 lands.

## 12. Rev 2 audit — what changed from rev 1

| # | Rev 1 | Rev 2 | Reason |
| --- | --- | --- | --- |
| 1 | Back button in the page header | In the sticky top bar's brand slot | `PageHeader` scrolls away; back must stay reachable on long stock pages. Matches Material/iOS top-bar convention, no extra chrome row |
| 2 | Back used `history.length > 1` | In-app navigation counter in `sessionStorage`; `router.replace(parent)` on cold open | `history.length` counts pages from before the app opened |
| 3 | Worker cached `/_next/static` cache-first | Not intercepted | Next already serves them immutable for a year; a second cache added risk, not value |
| 4 | Offline page as a Next route + generated asset list | Static `public/offline.html` with inline CSS | No chunks to precache; no middleware or route-auth change |
| 5 | `BUILD_ID` stamped in `deploy.sh` | `postbuild` script | Runs identically locally, in CI and on the VPS |
| 6 | Two media-query `theme-color` metas | One meta set by the init script | The in-app theme can differ from the OS |
| 7 | No iOS splash images | `apple-touch-startup-image` set, light + dark | iOS shows a white launch screen without them |
| 8 | — | `launch_handler: navigate-existing` | Shortcuts and notifications reuse the open window |
| 9 | Haptics on tab change | Dropped | Android-only, no user value, can annoy |
| 10 | Install card at the top of `/today` | Slim banner above the tab bar | Does not push the brief's data down |
| 11 | VAPID public key via an API route | `NEXT_PUBLIC_` env | It is public by design; one less route |
| 12 | Push payload rules for alerts only implied | Portfolio notices explicitly never pushed | Lock screens would reveal a holding (rule 7) |
| 13 | Sign-out cleared worker caches | Dropped | Nothing per-user is ever cached |
| 14 | No kill switch | `sw.kill.js` | Standard practice for a bad worker release |
| 15 | Play requirements: Data Safety only | + financial features declaration | Required for finance-category apps |
| 16 | No e2e tests | Playwright `e2e/pwa.spec.ts` | Repo already runs Playwright |
| 17 | Decisions implicit | §1 D1–D6 to approve | |

## 13. Build record (2026-11-16, branch `feat/pwa`)

Approved: D1, D3, D4 as recommended ("go ahead"). D2 (delete `apps/mobile/`) held:
the folder holds a `.env.local`, so it needs an explicit yes. D5/D6 unchanged.

**Built — Phase 1:** `app/manifest.ts` (shortcuts from `lib/navigation.ts`,
`launch_handler`); icons 192/512/maskable and a flattened 180 px Apple icon;
22 iOS launch screens (light/dark), all from `scripts/generate-pwa-assets.mjs`;
`viewport` export (`viewport-fit=cover`, one `theme-color`), `appleWebApp`,
`formatDetection`; `THEME_INIT_SCRIPT` sets `data-display-mode` and the
theme-colour meta, `applyTheme()` keeps it in step; top/side safe areas
(`--nav-bar-offset`); `public/offline.html`; the worker (`src/pwa/service-worker.ts`,
served at `/sw.js`); CSP `worker-src`/`manifest-src`; `PwaBoot` (registration,
dev unregister, install capture).
**Phase 2:** `parentOf()` + Back in the top bar's brand slot (phones, and every
width when installed); in-app history stack (`lib/in-app-history.ts`); tab re-tap
scrolls to top; tab bar hidden while typing on touch devices; overscroll off when
installed; pull-to-refresh on tab roots when installed.
**Phase 3:** install banner + iOS "Add to Home Screen" sheet; "Install app" in the
account menu; update toast with Reload (toasts gained an `action`); offline bar.

**Differences from the plan above:**

| Plan | Built | Why |
| --- | --- | --- |
| `postbuild` stamps `public/sw.js` | `/sw.js` is a route; the stamp is `PWA_BUILD_ID` inlined by `next.config.ts` | Next only serves `public/` files present at build time; a route needs no generated file |
| `sw.kill.js` swapped in by a deploy | `PWA_SW_KILL=1` env + restart | No code change or deploy needed in an incident |
| Back labelled "‹ Screener" | Labelled "Back" | With history it returns to the real previous page, which is not always the parent |
| Pull-to-refresh calls `router.refresh()` | Reloads the page | Most tab pages fetch on the client; a server refresh would not update them. Same as the browser's own gesture |
| Dot on the Portfolio tab for unread notices | Not built | Duplicates the bell on the same screen and adds a second request per page |
| Monochrome and 96 px shortcut icons | Not built | The mark is a full-colour tile; Android falls back to the app icon |
| Install-sheet screenshots | Not built | Need demo data (Phase 0) |
| External-link audit (§4.5) | Not done | Follow-up |

**Open before merge:** a >= 1024 px brand master (512 px icons are upscaled from
256 px); real-device checks (§9 matrix), especially Google sign-in in iOS
standalone; `test/e2e/pwa.spec.ts` written but not yet run (needs a production
build); install-sheet screenshots.
