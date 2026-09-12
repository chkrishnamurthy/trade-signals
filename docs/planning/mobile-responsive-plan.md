# EquityWise Mobile Responsiveness — Remediation Plan

> **Status:** In progress on branch `fix/mobile-responsive`. Execution order is
> linear: **Phase 0 → 1 → 2 → 3 → 4.**
>
> **Relationship to other docs:** this is a focused execution of the master
> [`design-system-plan.md`](design-system-plan.md) — specifically its Phase 5
> (application migration) and Phase 6 (testing), scoped to responsiveness. It exists
> because a live audit of the mobile app (5 screenshots, profile + watchlists) found
> horizontally-scrolling, clipped, and overlapping screens on a product that already
> ships a design system and Storybook.

---

## Why this plan exists

The design system is strong at **visual** consistency (tokens, type, tone, spacing)
but never made **responsiveness a system property or a tested one**. Concretely, the
catalogue was green while mobile was broken because:

1. **No mobile/viewport stories** — Storybook renders desktop-width by default;
   nothing was ever viewed at 375px.
2. **No stories for the components that break** — watchlist table, filter panel,
   user-menu, and the whole profile/auth layer have zero stories.
3. **No responsive pattern in the system** — no "data row → cards on mobile", no
   "overlay: constrain to available height and scroll inside" contract; each
   component improvises (`forms/` has 0 breakpoints, `watchlists/` has 27).
4. **No responsive/interaction test gate** — a regression can't be caught.

Storybook didn't fail; it was never pointed at the problem.

---

## Root-cause findings (evidence)

Confirmed causes are separated from the one that still needs a live 375px repro.

| # | Symptom (screenshot) | Root cause | Evidence | Status |
| :- | :- | :- | :- | :- |
| ① | Filter panel spills over the table | `ScrollArea` applies `className` to the Radix **Root**, not the **Viewport** (`size-full`), so `max-h` doesn't clamp. `filter-panel` passes the height to `className` instead of the `viewportClassName` prop that exists for it. Affects **every** `ScrollArea`. | `ui/scroll-area.tsx`, `filter-panel.tsx:154` | **Confirmed** |
| ② | Only Stock + LTP fit; Change % scrolled off; expanded detail clipped | Table is desktop-only: `overflow-x-auto` + `whitespace-nowrap` everywhere. Protects the body (good) but there is **no mobile card/stacked layout and no priority-column pinning**. Expanded row detail lives *inside* the x-scroll container, so it inherits clipping. | `ui/table.tsx`, `watchlist-row-detail.tsx` | **Confirmed (systemic gap)** |
| ③ | "Log out of all devices" looks disabled; email clipped | Menu item styled `text-muted-foreground` with no icon (reads as a label, not an action); email span has no `truncate` inside the `w-56` menu. | `auth/user-menu.tsx` | **Confirmed** |
| ④ | Profile page scrolls sideways | Not reproducible from current working-tree code — all profile/security components and the shell are responsive-clean (`min-w-0`, `truncate`, grids collapse). Likely a stale production build or a runtime-only overflow (e.g. a `Select` popper / long data string) visible only at 375px with real data. | shell/topbar/profile components all read clean | **Needs live repro** |

**Things already built correctly (do not "fix"):** the app shell clamps width
(`min-w-0 flex-1` on the main column), the topbar is responsive (search shrinks
`w-32 → sm:w-44 → lg:w-60`, brand hidden `<sm`, sidebar `hidden lg:flex` becomes a
Sheet), `TableContainer` deliberately owns the x-scroll to protect the body, and the
filter popover width is already viewport-clamped (`w-[min(24rem,calc(100vw-2rem))]`).
The problems are the four above, not the scaffolding.

---

## Phase 0 — Reproduce & baseline
- **Objective:** a reliable 375px test setup, and settle the unproven profile overflow (④).
- **Tasks:** run dev; drive the in-app Browser pane at **375 / 390 / 768** in both
  themes; capture baseline screenshots of watchlists, expanded row, filters, profile,
  user-menu; pin the exact overflowing node on `/profile` (or prove it prod-only).
- **Deliverables:** before-screenshot set; confirmed cause/ruling for ④; a repro checklist.
- **Definition of done:** every symptom is reproduced locally or proven prod-only.
- **Not yet:** no fixes.

## Phase 1 — Foundation primitive fixes (certain, low-risk)
- **Objective:** fix shared primitives so one change fixes many screens.
- **Tasks:**
  1. **`ScrollArea`** — apply height constraints to the Viewport, not the Root, so
     `max-h` clamps; fix `filter-panel` to use `viewportClassName`.
  2. **Overlay contract** — verify Popover / DropdownMenu / Sheet all constrain to
     available height and scroll internally at 375px (Select/Dropdown already do).
  3. **`user-menu`** — `truncate` the email; give "Log out of all devices" a real
     affordance (icon/weight) so it doesn't read as disabled.
- **Deliverables:** fixed ScrollArea + filter-panel + user-menu; overlay audit notes.
- **Definition of done:** filter panel scrolls internally and never spills (① fixed);
  menu email truncates; log-out-all reads as an action — verified in the Browser pane,
  both themes.
- **Not yet:** don't touch the table pattern.

## Phase 2 — Responsive data pattern (the big one)
- **Objective:** give the design system a real mobile representation of a data row so
  the watchlist is usable on a phone.
- **Tasks:** build the pattern — **recommended: a card/stacked list below `md`**
  (Symbol + LTP + **Change %** + signal chip, no horizontal scroll), desktop table
  unchanged; move the **expanded row detail out of the x-scroll container** into a
  full-width panel/drawer so the chart/snapshot aren't clipped.
- **Deliverables:** responsive watchlist rows; mobile-friendly expanded detail; desktop untouched.
- **Definition of done:** on 375px, Change % is visible without sideways scroll
  (② fixed); expanded detail not clipped; desktop diffed against the Phase-0 baseline = unchanged.
- **Not yet:** don't generalize to every table — watchlist first, extract the pattern after.

## Phase 3 — Profile & remaining-surfaces sweep
- **Objective:** kill the profile overflow and catch every other screen.
- **Tasks:** fix the pinned profile node (④); sweep `auth`, `admin`, `stock-drawer`,
  `add-stocks`, `column-panel`, `summary-bar`, `charts` at 375/768 and fix each.
- **Deliverables:** profile with no sideways scroll; all core routes pass at 375/768.
- **Definition of done:** the page **body never scrolls horizontally** on any route; verified.
- **Not yet:** —

## Phase 4 — Lock it in (prevention / governance)
- **Objective:** make responsiveness a *tested* system property so it can't silently
  regress — the actual fix for "we had a DS + Storybook and still failed."
- **Tasks:** add **mobile-viewport stories (375 + 768)** for the table/list, filter
  panel, user-menu, profile forms, overlays; wire **`addon-vitest`** for
  a11y/interaction; add DS doc rules — "overlays constrain-and-scroll", "data rows →
  cards on mobile", "body never scrolls horizontally", the breakpoint set.
- **Deliverables:** viewport stories; test gate; a Responsiveness section in the DS docs.
- **Definition of done:** each key component has a passing mobile-width story; a11y
  passes; a regression fails CI.
- **Not yet:** visual regression / Chromatic — defer per the DS plan.

---

## Dependencies & order

`0 → 1 → 2 → 3 → 4` (linear, chosen for clean review). Each phase is a self-contained,
reviewable commit.

## Risks to watch

- **Regressing desktop** while adding mobile — mitigated by the Phase-0 baseline diff
  (a DoD in Phases 2 and 3).
- **Over-abstracting the card pattern** before it's proven — build it on the watchlist
  first, extract to a shared DS pattern later.
- **Claiming a fix without proof** — every visual fix is confirmed with a 375px
  Browser-pane screenshot before it's called done (especially ④).

---

## Progress log

- **Phase 0 — done.** Reproduced at 375px in Storybook: table clips Change% (②);
  filter `ScrollArea` measured not clamping (① — viewport 1002px, not scrollable).
  ③ code-confirmed. ④ (profile) deferred — behind auth, needs on-device verify.
- **Phase 1 — done** (`eb22e0d`). ScrollArea viewport now clamps (verified:
  clientHeight 480, isScrollable true); user-menu email truncates + "Log out of all
  devices" has an affordance. Overlay contract audited (Dropdown/Select/Sheet OK).
- **Phase 2 — done** (`8dcd5c2`, `f2b4e8e`). DataTable freezes a `pinned` column
  (+ leading utility columns) with position:sticky — verified at 375px the Stock
  column holds while scrolling brings Change% into view. The expanded row panel is
  now pinned to the visible width (sticky, left 0) so its chart/snapshot no longer
  ride the horizontal scroll — verified panel width tracks the 341px viewport, not
  the 527px scroll width (image 3 fixed).
- **Phase 3 — audit done, no code fixes needed.** Audited every remaining surface:
  profile (form/tabs/sessions/2FA/change-email/change-password), auth, stock-drawer
  (Sheet `w-full` on mobile), add-stocks (Dialog `w-full`), and the forms layer — all
  responsive-clean (`min-w-0`, `truncate`, grids collapse, selects `w-full`).
  - **④ profile sideways-scroll:** the current profile code is fully responsive, so
    the production screenshot is a **stale build** (profile was reworked in `7fafa2b`).
    Needs on-device confirmation after deploy — no code change identified.
  - _Minor optional (not done):_ the Dialog is full-bleed on mobile (no side gutter).
    Cosmetic, not overflow.
- **Phase 4 — not started** (mobile-viewport stories + `addon-vitest` test gate).

_Note: `pnpm lint` is red from pre-existing `main` errors (tracker/scripts/signup),
unrelated to this branch; all files changed here are lint-clean._
