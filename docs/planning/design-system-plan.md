---
name: Design system
status: draft
horizon: next
created: 2026-09-08
updated: 2026-09-08
board: EW-058
phases_total: 8
phases_done: 0
phase_names: [Audit, Tokens, Storybook install, Primitives, Domain components, App migration, Testing + a11y, Governance]
area: [web]
supersedes: [storybook-plan]
confidence: 1
summary: Formalise, document, test and govern the UI layer that already exists in apps/web, with Storybook around it.
owner: krishna
---

# EquityWise Design System & Storybook — Strategy and Roadmap

> **Status:** Plan. Nothing in here has been implemented. Supersedes the older
> `storybook-plan.md`, which targets Storybook 8 and references dashboard/index
> components that were removed when the app was stripped to the watchlists surface.
>
> **Scope of this document:** how to formalise, document, test and govern the UI
> layer that *already exists* in `apps/web`, and how Storybook fits around it — not
> how to build a design system from zero, because most of one is already here.

---

## 1. Executive recommendation

**The headline finding of the audit: EquityWise already has a real design system.**
It is not a pile of one-off components. There is a single-source OKLCH token layer
in `apps/web/src/app/globals.css`, a centralised typography scale (`Text`), a
single `Button`, a directional-colour authority (`tone.ts`) that pairs colour with
a glyph for colour-blind safety, one focus treatment for the whole app, and a full
set of empty / error / loading states. Raw hex colours in components: **zero**.
Inline styles: **8, all legitimate data-driven geometry** (bar widths, a nav index
variable). This is a disciplined codebase.

So the project you should actually run is **not "build a design system, then add
Storybook."** It is:

1. **Formalise and document** the system that exists (make the implicit layering
   and rules explicit and enforceable).
2. **Close a small number of real gaps** the audit found (a few sub-`xs` font-size
   one-offs, a handful of raw `<button>`s, a thin forms layer against bespoke
   auth/profile form UI).
3. **Add Storybook as the workbench and catalogue** — the place to build, see,
   document and test components in isolation, in both themes, without a live Fyers
   connection.
4. **Add governance** so the system stays coherent as modules multiply.

**Recommended approach to the "DS first or together?" question: neither in the
naive sense — they are developed *together from here on*, because the DS is largely
built.** The correct division of responsibility is:

- **The design system is the source of truth for the UI.** It lives in code, in the
  repo, and it ships to production. Tokens in `globals.css`; primitives in
  `components/ui`; domain components in `components/market` etc. If it is not in the
  code, it is not in the design system.
- **Storybook is the environment around that source of truth** — development,
  documentation, visualisation, and automated testing. Storybook never *owns* a
  component or a token. It renders them. **A story is documentation and a test, not
  a definition.** This distinction is the single most important governance rule in
  this document: when Storybook and the app disagree about how a component looks,
  the app's tokens win and the story is wrong.

**Deliberate non-goals (the audit says these would be over-engineering *now*):**

- **Do not extract a shared UI package yet.** There is exactly one UI-consuming app
  (`apps/web`); `apps/worker` is headless. A `packages/ui` today buys nothing but
  build friction. The extraction trigger is documented in §7.
- **Do not adopt visual-regression / Chromatic yet.** Interaction + a11y testing via
  Storybook's Vitest integration covers the real risk first, at zero external cost.
- **Do not rewrite pages.** Migrate by strangler pattern, newest/smallest surface
  first, validated against a visual baseline.

The exact order to execute is in §14.

---

## 2. Current UI / codebase audit

### 2.1 Stack (as built)

Next.js 15 (App Router) · React 19 · Tailwind **v4** (`@tailwindcss/postcss`, CSS-first
config, no `tailwind.config.js`) · Radix UI primitives · `class-variance-authority`
· `clsx` + `tailwind-merge` (via `cn()`) · `lucide-react` · `tw-animate-css`. This is
a **shadcn/ui-lineage** setup — but a heavily customised, product-specific one, not a
default registry dump.

All UI lives in `apps/web/src`. Path alias `@/*` → `apps/web/src/*`. There is **no
Storybook** and **no component-level test setup** (Vitest exists but only for
`server/*` and `lib/*` logic).

### 2.2 What is strong (preserve these — reasons given)

| Asset | File | Why it's good — keep it |
| :-- | :-- | :-- |
| **Token layer** | `app/globals.css` | Single source of truth. Two ramps: a shadcn-compatible product ramp *and* a bespoke financial ramp (`bullish`/`bearish`/`neutral`/`market-*`) with a consistent 4-slot convention (`<name>` / `-strong` / `-soft` / `-line`). `@theme inline` means a theme swap re-resolves every utility with no rebuild. This is the backbone; everything else hangs off it. |
| **Dark mode** | `globals.css` | Class-based (`.dark` on `<html>`), not `prefers-color-scheme`, so the toggle can override the OS. Dark is a *designed* palette, not an inversion. `theme.ts` decides when the class is present. |
| **Typography** | `components/ui/typography.tsx` | 11 named roles via `Text`. Nothing outside this file picks a font size (mostly — see gaps). `metric`/`value`/`indicator`/`display` carry the `figure` utility for tabular figures. |
| **Directional colour** | `lib/tone.ts` | *The* answer to "is this green or red?", after it had drifted across six places. Ships a `▲/▼/→` glyph with every tone — colour is never the only carrier. This is real accessibility discipline and a domain asset. |
| **Financial figures** | `@utility figure` in `globals.css` | Tabular lining figures + ligatures off, so price columns align without a monospace face. |
| **Button** | `components/ui/button.tsx` | One button, CVA variants (6 variants × 5 sizes), `asChild`, built-in `loading` with `aria-busy`. Imported in 28 files. |
| **States** | `components/data-display/states.tsx` | One implementation each of empty / error / data-unavailable / connection-error / market-closed / inline-error / skeletons. Crucially, it distinguishes "no data" from "possibly-wrong data" — a financial-correctness concern encoded in UI. |
| **Focus** | `globals.css` base layer | One `:focus-visible` treatment for the whole app, documented as "never removed, only replaced." |
| **Composition over props** | `metric-card.tsx` | `MetricCard` takes a `value` slot rather than knowing about paise/percent/crores. This is the right pattern for a data UI and should be the house style. |

### 2.3 Inconsistencies and gaps (candidates to standardise — do **not** fix yet)

1. **Sub-`xs` font sizes are one-offs.** The type scale bottoms out at `text-xs`
   (0.75rem), but ~15 call sites hard-code `text-[0.6875rem]` (11px) and
   `text-[0.625rem]` (10px) — in `badge`, `sidebar`, `watchlist-cells`,
   `filter-panel`, `data-table`, `numeric`, `market/*`, etc. These are real,
   recurring needs (dense tables, overlines) escaping the scale. **Fix: add named
   micro roles/tokens** (e.g. `--text-2xs`, `--text-3xs`, or `Text` variants
   `micro`/`nano`) so the scale absorbs them instead of every dense component
   reinventing them.
2. **A handful of raw `<button>` elements** exist outside the `Button` primitive
   (`forms/filter-bar`, `watchlists/add-stocks`, `watchlists/quick-views`,
   `data-display/metric-card` [the info-hint trigger], `data-display/data-table`,
   `market/stock-search`). Some are legitimate (a Radix trigger, an `asChild`
   target); others are candidates to migrate to `Button variant="ghost"`. **Fix:
   audit each; migrate the ones that are re-implementing button styling.**
3. **Forms layer is thin (2 files) against bespoke form UI.** `components/forms`
   has only `form-field.tsx` and `filter-bar.tsx`, yet `auth/*` (7 files) and
   `profile/*` (11 files) contain substantial hand-rolled form/layout markup. This
   is the highest-value consolidation target: a `FormField` / `Fieldset` /
   `FormError` set that auth and profile both consume.
4. **Layering is real but implicit and unenforced.** The folders
   (`ui`/`forms`/`layout`/`market`/`watchlists`/`data-display`/`charts`) already
   encode a hierarchy, but nothing documents or enforces the dependency direction
   (primitives must not import domain components). **Fix: name the layers (§4) and
   add an import-boundary lint rule (§8).**
5. **No component tests or stories.** Logic is tested; rendered UI is not. Theme,
   contrast, and interaction behaviour are verified by eye today (per the
   `verify-ui-changes-visually` memory). Storybook + Vitest closes this.
6. **The old `storybook-plan.md` is stale.** SB8 version matrix; story hierarchy
   lists removed components (index cards, breadth, dashboard). Should be archived or
   replaced by this document.
7. **`charts` is a single file** (`chart-container.tsx`) plus a token ramp
   (`--chart-1..5`, grid, axis). The charting primitive story is essentially
   unwritten. Fine — flag it as a Phase-4 concern, not a gap to fix now.

### 2.4 Component inventory (72 `.tsx` components)

`ui` 24 · `watchlists` 12 · `profile` 11 · `auth` 7 · `layout` 6 · `market` 6 ·
`data-display` 3 · `forms` 2 · `charts` 1.

---

## 3. Design System architecture

The architecture is **token-driven, CSS-variable-based, consumed through Tailwind
utilities and CVA**. It already exists; this section names its parts and the rules
around each, and marks what to add.

| Foundation | Home today | State | Action |
| :-- | :-- | :-- | :-- |
| **Colour** | `globals.css` `:root` / `:root.dark` | ✅ Product + financial ramps, 4-slot financial convention | Document the ramp contract; keep. |
| **Typography — family** | `@theme inline` `--font-sans`/`--font-mono` | ✅ Inter + mono figures | Keep; verify font wiring in `layout.tsx`. |
| **Typography — scale** | `typography.tsx` (`Text`) | ⚠️ 11 roles, but sub-`xs` escapes it | Add micro roles/tokens (gap #1). |
| **Spacing** | Tailwind default scale | ✅ Used consistently; ~2 arbitrary sizes total | Keep Tailwind's scale as the spacing system; document that arbitrary spacing is disallowed. |
| **Radius** | `--radius` → `sm/md/lg/xl` | ✅ "Four steps, no more" | Keep; document. |
| **Shadows / elevation** | `--shadow-subtle/elevated/overlay` | ✅ Three steps, used sparingly; depth from borders | Keep; document the "borders first, shadow sparingly" principle. |
| **Borders** | `--border` / `--border-strong` / `--input` | ✅ Hairline vs region-divider distinction | Keep; document. |
| **Icons** | `lucide-react`, `[&_svg]:size-4` conventions | ✅ Consistent sizing idiom | Document icon sizing + `aria-hidden` convention; standardise a size token. |
| **Breakpoints** | Tailwind default (`sm/md/lg/...`) | ✅ | Document which breakpoints the app actually uses; keep Tailwind's. |
| **Motion** | `globals.css` nav-rail block + `--nav-*` vars | ✅ Purposeful, `prefers-reduced-motion` respected | Promote the motion vars (duration/ease) to named tokens for reuse; keep the reduced-motion rule as a hard standard. |
| **Elevation model** | surfaces `background`/`surface`/`surface-raised`/`surface-sunken` | ✅ Named planes | Document the plane model — it's better than most systems have. |
| **States** | `states.tsx`, `:focus-visible`, CVA disabled/loading | ✅ empty/error/loading/focus/disabled/loading | Document the interaction-state matrix (hover/focus/active/disabled/loading/error/success) per primitive. |
| **A11y standard** | implicit (focus ring, glyph+colour, `aria-busy`, `sr-only`) | ⚠️ practised, not written | Write the accessibility standard (§8). |

**Design-token rule (make it explicit and enforced):** *Nothing outside
`globals.css` may name a raw colour, radius, or shadow value.* The file already says
this in a comment; §8 turns it into a lint rule.

---

## 4. Component hierarchy

Name the five layers, map the existing folders onto them, and fix the dependency
direction (a layer may depend only on layers above it; **never downward, never
sideways into a sibling domain**).

```
Layer 0 — FOUNDATIONS        tokens + primitives-of-primitives
  globals.css (tokens)         colour, type, radius, shadow, motion, spacing
  ui/typography.tsx (Text)     the type scale as a component
  lib/tone.ts                  directional colour + glyph authority
  lib/utils.ts (cn)            class composition
  icons (lucide-react)         icon set + sizing convention

Layer 1 — PRIMITIVES          components/ui/* (24)  — generic, domain-agnostic
  button, input, textarea, select, checkbox, switch, label,
  badge, alert, card, dialog, sheet, popover, dropdown-menu, tooltip,
  tabs, toggle-group, table, separator, scroll-area, skeleton, toast, theme-toggle
  RULE: may import Layer 0 only. Must know nothing about stocks.

Layer 2 — DOMAIN COMPONENTS   market/* (6), data-display/* (3), charts/* (1)
  NumericDisplay, PriceChange, PercentChange (market/numeric)
  StockIdentity, Sparkline, SignalBadge, MarketStatus, StockSearch
  MetricCard/StatTile, DataTable, states
  ChartContainer
  RULE: compose Layer 1 + Layer 0. Encode financial vocabulary. Paise-aware.

Layer 3 — COMPOSITE / FEATURE  watchlists/* (12), forms/* (2), auth/* (7), profile/* (11)
  WatchlistTable, WatchlistTabs, FilterPanel, ColumnPanel, StockDrawer, SummaryBar…
  FormField, FilterBar; login/signup/reset; profile tabs, sessions, 2FA…
  RULE: compose Layer 2 + 1 + 0. One feature area may not import another's internals.

Layer 4 — PAGE PATTERNS / SHELL  layout/* (6), app/**/page.tsx
  AppShell, Topbar, Sidebar, Brand, Page, Grid; route pages
  RULE: assemble Layer 3 features. No new visual styling originates here.
```

**Financial-specific components are first-class (Layer 2), not exceptions.** The
product *is* a data UI; `NumericDisplay`, `Sparkline`, `SignalBadge`, `MarketStatus`,
and the 52-week range bar are as much "the design system" as `Button` is. Treat them
with the same rigour: tokens only, documented states, stories, a11y.

---

## 5. Design-token strategy

**Keep the current architecture. It is correct.** Recommendations are additive.

1. **Single source stays `globals.css`.** Do not introduce a JS token file, a
   `tokens.json`, or Style Dictionary. There is one consumer (the web app via
   Tailwind); a build pipeline to transform tokens would be pure over-engineering.
   The CSS variable *is* the token.
2. **Document the contracts** (as a short `docs/design-system/tokens.md` and/or a
   Storybook "Foundations" MDX page that reads the live variables):
   - The **surface plane model** (`background` < `surface`/`sunken` < `raised`).
   - The **financial 4-slot convention** (`<name>` accent / `-strong` text-on-soft /
     `-soft` badge bg / `-line` ring). Any new directional concept must ship all four.
   - The **status set** (`destructive`/`success`/`warning`/`info`, each with
     `-foreground`, and destructive/warning with `-soft`/`-line`).
   - **`positive`/`negative` are aliases** of bullish/bearish today but kept separate
     on purpose (so VIX/drawdown can diverge). Document that they may diverge.
3. **Close the type-scale gap:** add `--text-2xs`/`--text-3xs` (or `Text` roles
   `micro`/`nano`) and migrate the `text-[0.6875rem]`/`[0.625rem]` sites. This is the
   one token *addition* the audit requires.
4. **Promote motion tokens:** lift `--nav-duration`/`--nav-ease` (and a couple of
   standard durations) into named, reusable motion tokens so the next animated
   component doesn't hard-code its own timing.
5. **Enforcement, not just convention:** a lint rule forbidding raw colour/radius/
   shadow literals and arbitrary Tailwind colour values (`text-[#…]`, `bg-[oklch…]`)
   outside `globals.css` (§8). The audit shows the team already honours this by
   hand; the rule stops the *next* contributor from breaking it silently.

---

## 6. Storybook architecture

### 6.1 Version and framework (correcting the old plan)

- **Storybook 9** (current as of 2026), not 8. In SB9 the old
  `addon-essentials`/`addon-interactions`/`addon-a11y` split is consolidated:
  controls/actions/viewport/backgrounds are core, and **`@storybook/addon-vitest`**
  runs interaction + a11y + coverage tests through **Vitest browser mode
  (Playwright)**.
- **Framework: `@storybook/nextjs-vite`.** Vite-based, fast, and it's what the
  Vitest addon integrates with. Handles `next/navigation`, `next/image`, `next/font`.
- **Addons:** `@storybook/addon-a11y`, `@storybook/addon-vitest`,
  `@storybook/addon-docs` (autodocs). Add `@storybook/addon-themes` to drive the
  `.dark` class from the toolbar. That's the whole list — resist adding more.
- **Scope: strictly `apps/web`.** All Storybook deps, config and scripts live in
  `apps/web/package.json` and `apps/web/.storybook`. Nothing touches the monorepo
  root. (The worker has no UI.)

### 6.2 Theme + Tailwind wiring

The preview imports `../src/app/globals.css` directly (Tailwind v4 needs nothing
more) and uses `addon-themes` `withThemeByClassName` to toggle the `.dark` class on
`<html>` — matching how the real app switches themes. Every story is therefore
verifiable in both themes from the toolbar, which is exactly the check the
`verify-ui-changes-visually` memory says is done by hand today.

### 6.3 Story organisation and naming

**Colocate stories with components** (`button.tsx` → `button.stories.tsx` beside it).
Colocation keeps the story honest — it moves, renames, and dies with its component.
A separate `src/stories/` tree holds only cross-cutting material: Foundations
(tokens/type/tone MDX) and the shared **fixtures** library.

Story *titles* mirror the component hierarchy (§4), decoupled from file paths:

```
Foundations/Colour · Foundations/Typography · Foundations/Tone · Foundations/Spacing …
Primitives/Button · Primitives/Card · Primitives/Dialog …
Domain/NumericDisplay · Domain/Sparkline · Domain/SignalBadge · Domain/MarketStatus …
Features/Watchlist/Table · Features/Watchlist/FilterPanel · Features/Forms/FormField …
Patterns/AppShell · Patterns/Topbar · Patterns/Sidebar
```

**Conventions:**
- **CSF3** (Component Story Format 3) — object stories, typed `Meta`/`StoryObj`.
- One `Default` story per component; then one story **per meaningful state**, named
  for the state (`Loading`, `Disabled`, `Bearish`, `Empty`, `Overflow`, `LongName`).
- **Autodocs on** — component-level `tags: ['autodocs']` generates the docs page
  from types + JSDoc (which this codebase already writes richly).
- **`argTypes` describe the real API** (variant/size unions become select controls);
  hide slot/`className` noise.
- **Fixtures respect the integer-paise invariant** (`lastPrice: 298550` = ₹2,985.50).
  A shared `src/stories/fixtures/market-data.ts` is the only place mock stocks live —
  never inline fake prices in a story, or they'll drift from the real DTO shape.

### 6.4 Testing inside Storybook

- **Interaction tests** via `play()` functions (SB `test` API): sort a column, toggle
  a filter, open the stock drawer, submit a form. These run in the Vitest addon.
- **Accessibility tests** via `addon-a11y` running axe on every story; wire it to
  **fail** in the Vitest run, not just warn, once the catalogue is clean.
- **No visual-regression tool yet.** Revisit Chromatic/Playwright-snapshot in Phase 6
  *only if* theme/contrast regressions actually recur. Interaction + a11y first.

### 6.5 Do's and don'ts

**Do**
- Build new components in Storybook first, in both themes, before wiring to a page.
- Write a story for every state a component can enter, including the ugly ones
  (empty, error, overflow, missing indicator, extreme % gap, circuit-breaker).
- Read tokens live in Foundations stories, so the catalogue can't drift from CSS.

**Don't**
- Don't define styling or "variants" that exist only in a story — that's a fork.
- Don't mock a component's *own* logic to make a story pass; mock only its inputs
  (data, router, network) via fixtures.
- Don't let stories reach the network or a provider. Fyers never appears in Storybook.
- Don't turn Storybook into the design spec. The spec is the code + this doc.

---

## 7. Recommended folder structure

Keep everything in `apps/web`. Introduce a light, named layering and a stories/docs home.

```
apps/web/
  .storybook/
    main.ts                     # nextjs-vite framework, stories glob, addons
    preview.tsx                 # import globals.css; themes decorator; a11y params
    vitest.setup.ts             # storybook/vitest wiring
  src/
    app/globals.css             # ← TOKENS: the source of truth (unchanged)
    components/
      ui/                       # Layer 1 — primitives      (+ *.stories.tsx colocated)
      market/                   # Layer 2 — domain
      data-display/             # Layer 2 — domain
      charts/                   # Layer 2 — domain
      forms/                    # Layer 3 — composite (to grow)
      watchlists/               # Layer 3 — feature
      auth/                     # Layer 3 — feature
      profile/                  # Layer 3 — feature
      layout/                   # Layer 4 — shell
    lib/
      tone.ts  utils.ts  theme.ts   # Layer 0 helpers (unchanged)
    stories/
      foundations/              # Colour/Type/Tone/Spacing/Radius/Shadow (MDX + live)
      fixtures/market-data.ts   # the ONLY mock-stock source, paise-correct
  docs/design-system/           # (repo docs) tokens.md, contributing.md, a11y.md
```

**When to extract `packages/ui` (the documented trigger — not now):** the day a
*second* UI surface appears that must share these components — e.g. a separate admin
app, a marketing site, an email-template renderer, or a React Native client. Until
then, `apps/web/src/components` *is* the package, and a workspace package would only
add a build/publish boundary with no second consumer. When the trigger fires, the
extraction is mechanical *because* the layering in §4 is already clean: Layer 0–2
move to `packages/ui`, Layer 3–4 stay in the app.

---

## 8. Testing & accessibility strategy

**Testing pyramid (match the tool to the layer):**

| What | Tool | Where |
| :-- | :-- | :-- |
| Pure logic (formatting, tone, filters, columns) | Vitest (node/jsdom) | already exists in `lib/*` — keep |
| Component render + interaction | Storybook `play()` + `addon-vitest` (browser mode) | new, Phase 3 |
| Accessibility (axe) | `addon-a11y` in the Vitest run | new, Phase 3 |
| Theme/contrast | Both-theme stories, reviewed; optional VR later | Phase 6 |
| Visual regression | *Deferred* — Chromatic/Playwright only if regressions recur | Phase 6 gate |

**Accessibility standard (write it down — it's practised but unwritten):**
- **WCAG 2.1 AA** as the bar. Contrast checked against tokens in both themes.
- **Colour is never the only signal** — the `tone.ts` glyph rule generalises: every
  status/direction ships an icon or text label too.
- **One focus treatment**, from `globals.css`, never removed.
- Every interactive element is keyboard-operable and has an accessible name; loading
  uses `aria-busy`; live/error regions use `role="alert"`/`sr-only` as `states.tsx`
  already does. Respect `prefers-reduced-motion` (the nav rail already does).
- axe must pass on every story before it's "done" (§12 DoD).

**Enforcement (the anti-bypass mechanism the request asks for):**
- A **lint rule** (Biome, or an ESLint pass scoped to `components/`) forbidding, outside
  `globals.css`: raw hex/oklch/rgb literals, arbitrary Tailwind colour values
  (`-[#…]`, `-[oklch(…)]`), and (optionally) arbitrary font sizes once the micro roles
  exist. This is what stops a developer bypassing the system with a custom style.
- An **import-boundary rule** enforcing §4 (a `ui/` primitive may not import from
  `market/`/`watchlists/`/etc.). Biome/ESLint `no-restricted-imports` by path.
- **CI gate:** `build-storybook` + the Storybook test run must pass on every PR that
  touches `components/`.

---

## 9. Migration strategy

**Principle: strangler, not rewrite.** The UI already uses the system; migration here
means (a) closing the gaps in §2.3 and (b) bringing the few hand-rolled surfaces onto
the shared primitives — page by page, smallest/newest first, each validated against a
before/after visual baseline.

1. **Inventory & baseline (Phase 0).** Freeze a screenshot baseline of every current
   page in both themes (they render today). This is the "does the new version still
   match?" oracle — the `verify-ui-changes-visually` discipline, captured once.
2. **Migrate order — newest & most self-contained first:**
   - **Forms consolidation (auth + profile).** Highest duplication, lowest blast
     radius, and it's the newest code. Extract `FormField`/`Fieldset`/`FormError`
     into `components/forms`, refactor `auth/*` and `profile/*` onto it. Validate each
     screen against baseline.
   - **Raw `<button>` migration.** Replace the styling-reimplementing ones with
     `Button variant="ghost"`; leave legitimate Radix/`asChild` triggers.
   - **Type-scale micro-roles.** Add tokens, then sweep `text-[0.6875rem]/[0.625rem]`
     call sites.
   - **Watchlists surface last.** It's the densest and most load-bearing; migrate only
     after the primitives are storybooked and tested, so regressions are caught in
     isolation first.
3. **De-duplication method:** a component is a duplicate if two files render the same
   *shape of thing* with diverging markup (the `tone.ts` origin story is the template).
   Find them by story review — when two features need "the same" story, unify upstream.
4. **Never break functionality:** migrate behind the existing tests (`lib`/`server`
   Vitest stay green), one screen per PR, each PR diffed against the visual baseline.

---

## 10. Developer workflow (the loop, in detail)

```
New feature or screen
  │
  1. CHECK the system      → Storybook catalogue + docs/design-system.
  │                          Is there a primitive/domain/feature component already?
  2. REUSE                 → Compose existing components. This is the default and
  │                          should cover ~90% of new UI. Composition, not new props.
  3. NEED A CHANGE?        → Decide (see §11 decision rules):
  │      ├─ new VARIANT of an existing component  → add a CVA variant + a story for it
  │      ├─ genuinely NEW reusable component        → propose it (§12), build in the
  │      │                                            right layer, tokens only
  │      └─ truly PAGE-SPECIFIC one-off             → build it in the page, compose
  │                                                    primitives, invent no new tokens
  4. STORY                 → Add/append the story: Default + every new state. Autodocs.
  5. TEST                  → play() interactions + axe pass, both themes.
  6. USE                   → Wire into the page. Lint (token + import-boundary) passes.
  7. PR                    → build-storybook + tests green; visual baseline reviewed.
```

The rule of thumb: **if you are writing a colour, a radius, a shadow, or a font size
literal in a component, stop — you are bypassing the system.** Reach for a token or
propose one.

---

## 11. Future scalability — variants, one-offs, and not-too-restrictive

- **Reuse vs new component:** reuse if the *shape and role* already exist and only the
  content differs (that's composition). Create new only when no existing component can
  represent the thing without a prop that changes its fundamental role.
- **Variants:** add a CVA variant only when the difference is **systemic** (recurs
  across features and expresses a design intent — e.g. a `destructive` button). If the
  difference is a one-place tweak, use the `className` escape hatch (`cn()` already lets
  a caller's class win) — *do not* mint a variant for it.
- **Avoiding variant explosion:** cap variant *axes* per component (e.g. Button =
  `variant` × `size`, nothing more). New requirements compose existing axes or use the
  slot pattern (§2.2 `MetricCard`), rather than adding a third and fourth axis. When a
  component approaches ~6 variants on one axis, that's a signal to split it, not extend
  it.
- **Page-specific needs:** allowed and expected — build them *in the page*, composing
  primitives, using the `className` escape hatch, inventing **no new tokens**. A
  one-off that appears a second time is promoted upward (Layer 3 → 2 → 1) via the
  proposal process.
- **Not too restrictive:** the `className` escape hatch is the pressure valve — it
  keeps the system from blocking work while the *tokens* keep even the escapes on-brand
  (you can restyle spacing/layout freely, but you still can't name a raw colour). This
  is the balance: **rigid tokens, flexible composition.**
- **Evolving without breaking:** token changes are backwards-compatible by nature (a
  value change restyles everywhere at once — the whole point of the architecture).
  Component API changes follow a deprecation path (§12). Adding a variant or a role is
  additive and safe; removing/renaming one is a deprecation.

---

## 12. Long-term governance

- **Ownership:** the design system (Layer 0–2) has a named owner/reviewer; PRs
  touching `globals.css`, `ui/`, or `market/` require that review. Feature layers
  (Layer 3–4) are owned by feature authors.
- **"Definition of done" for a component** (the governance checklist):
  1. Lives in the correct layer; imports only allowed layers.
  2. Tokens only — no raw colour/radius/shadow/size literals.
  3. Has a story: `Default` + every state; autodocs from typed props + JSDoc.
  4. Keyboard-operable, accessible name, axe passes, both themes verified.
  5. States covered: hover/focus/active/disabled/loading/error/empty where applicable.
  6. No sibling-domain imports.
- **Proposing a new component/variant/token:** a short RFC (an `issues/` entry or PR
  description) stating: the recurring need, why no existing component fits, which
  layer, and the tokens it uses. New tokens especially need sign-off — the token set
  is the constitution.
- **Deprecation, not deletion:** rename/removal ships the replacement first, marks the
  old as `@deprecated` (JSDoc + a lint warning), migrates call sites over one or more
  PRs, then removes. Never a big-bang rename.
- **Token change process:** a value change is low-risk (restyles globally, review in
  Storybook Foundations in both themes). Adding a slot to a ramp means adding all four
  slots (§5). Structural changes (renaming a token) are deprecations.
- **Keep the catalogue honest:** `build-storybook` in CI means a component without a
  passing story can't merge; Foundations stories read live tokens so the docs can't
  drift from the CSS.

---

## 13. Risks and mistakes to avoid

1. **Treating this as greenfield.** The biggest risk is rebuilding what exists. The
   token layer, `Text`, `tone`, `Button`, and `states` are assets — formalise, don't
   replace.
2. **Premature `packages/ui` extraction.** A shared package with one consumer is
   overhead with no payoff. Wait for the §7 trigger.
3. **Storybook version drift.** The old plan already rotted to SB8-with-removed-
   components. Pin SB9 + `nextjs-vite`, and keep the catalogue in CI so it can't rot
   silently again.
4. **Stories that fork the design.** A story defining its own styling becomes a second
   source of truth. Stories render the system; they never define it.
5. **Variant explosion.** Every "just one more variant" erodes the system. Enforce the
   axis cap and prefer composition + `className`.
6. **Token bypass.** Without the lint rules, the next contributor hard-codes a colour
   and the single-source guarantee is quietly gone. Ship the enforcement in Phase 1,
   not "later."
7. **Over-documentation.** Don't MDX-document every prop by hand — autodocs + the rich
   JSDoc already in the code does this. Hand-write only Foundations and contributing.
8. **Adopting visual regression too early.** It's real cost and maintenance; interaction
   + a11y catches more of *this* app's actual risk first. Gate it behind evidence.
9. **Big-bang migration.** One screen per PR against a baseline, or you'll ship subtle
   regressions into a financial UI where a wrong colour reads as a wrong signal.
10. **Fyers/network in Storybook.** Stories must be data-driven from fixtures; a story
    that hits a provider will flake and leak quota.

---

## 14. Exact recommended order of implementation

The phases below are the order. Each states **objective / tasks / deliverables /
dependencies / definition of done / not-yet.**

### Phase 0 — Audit & baseline
- **Objective:** shared, written understanding of the current system; a regression oracle.
- **Tasks:** ratify §2 audit; snapshot every page in both themes as the visual baseline;
  archive `storybook-plan.md` in favour of this doc.
- **Deliverables:** this document (agreed); baseline screenshots; audit sign-off.
- **Dependencies:** none.
- **DoD:** team agrees on layers (§4) and the gap list (§2.3).
- **Not yet:** no code changes, no Storybook install.

### Phase 1 — Foundations & tokens (formalise + enforce)
- **Objective:** make the token system explicit, documented, gap-closed, and enforced.
- **Tasks:** write `docs/design-system/tokens.md` (ramp contracts, plane model, status
  set); add the sub-`xs` type roles/tokens; promote motion tokens; add the lint rules
  (raw-value ban + import boundaries).
- **Deliverables:** tokens doc; new type roles; two lint rules wired into `pnpm lint`.
- **Dependencies:** Phase 0.
- **DoD:** `pnpm lint` fails on a raw colour or a downward import; type roles exist.
- **Not yet:** don't migrate the `text-[…]` call sites yet (Phase 5); don't touch
  component APIs.

### Phase 2 — Storybook install & foundations catalogue
- **Objective:** the workbench exists and renders the system in both themes.
- **Tasks:** install SB9 + `nextjs-vite` + a11y/vitest/docs/themes addons, scoped to
  `apps/web`; `.storybook/main.ts` + `preview.tsx` (import `globals.css`, theme
  decorator); Foundations stories that read live tokens (Colour/Type/Tone/Spacing/
  Radius/Shadow); `storybook`/`build-storybook` scripts.
- **Deliverables:** running Storybook; Foundations catalogue; CI job for `build-storybook`.
- **Dependencies:** Phase 1 (so Foundations shows the real, gap-closed tokens).
- **DoD:** `pnpm --filter @equitywise/web storybook` runs; both themes toggle; CI builds it.
- **Not yet:** no component stories; no visual regression.

### Phase 3 — Primitives: stories + tests (Layer 1)
- **Objective:** every `ui/*` primitive catalogued, documented, tested, a11y-clean.
- **Tasks:** colocated stories for all 24 primitives (Default + every state); autodocs;
  `play()` interactions where meaningful; enable `addon-vitest` + `addon-a11y` in the
  test run; fixtures library seeded (paise-correct).
- **Deliverables:** 24 primitive stories; green Storybook test run; axe passing.
- **Dependencies:** Phase 2.
- **DoD:** each primitive meets the §12 component DoD; test run green in CI.
- **Not yet:** domain/feature stories.

### Phase 4 — Domain & composite components (Layers 2–3)
- **Objective:** the financial components and features are catalogued and tested,
  including the hard-to-capture-live states.
- **Tasks:** stories for `market/*`, `data-display/*`, `charts/*` (Numeric, Sparkline,
  SignalBadge, MarketStatus, MetricCard, DataTable, states, ChartContainer); then the
  watchlist feature organisms (Table, Tabs, FilterPanel, ColumnPanel, StockDrawer,
  SummaryBar) with edge-case stories (extreme gap, circuit breaker, missing indicator,
  overflow); `play()` tests for sort/filter/drawer.
- **Deliverables:** domain + feature story set; interaction tests; edge-case coverage.
- **Dependencies:** Phase 3 (features compose tested primitives).
- **DoD:** every Layer 2–3 component meets DoD; edge states are stories, not surprises.
- **Not yet:** don't refactor the app pages yet.

### Phase 5 — Application migration (gap closure)
- **Objective:** bring hand-rolled surfaces onto the system; close §2.3 gaps.
- **Tasks (in order):** forms consolidation (auth + profile onto shared `FormField`);
  raw-`<button>` migration; sweep `text-[…]` sites onto the new roles; watchlists last.
  One screen per PR, each diffed against the Phase 0 baseline.
- **Deliverables:** consolidated forms; zero styling-reimplementing raw buttons; type
  scale fully honoured; unchanged behaviour.
- **Dependencies:** Phases 3–4 (migrate onto storybooked, tested components).
- **DoD:** `lib`/`server` tests green; every migrated screen matches baseline; lint clean.
- **Not yet:** don't extract `packages/ui`.

### Phase 6 — Testing, a11y & visual QA (harden the gates)
- **Objective:** the gates that keep the system coherent are automatic.
- **Tasks:** make axe failures block; wire the full Storybook test run into the required
  CI checks for `components/` PRs; **evaluate** (don't assume) visual regression —
  adopt Chromatic/Playwright-snapshot only if theme/contrast regressions have actually
  recurred.
- **Deliverables:** required CI checks; a written decision on VR (adopt or defer).
- **Dependencies:** Phase 5.
- **DoD:** a PR that breaks a11y or a story cannot merge.
- **Not yet:** don't adopt VR without the evidence gate.

### Phase 7 — Governance & long-term maintenance
- **Objective:** the system survives many modules and many contributors.
- **Tasks:** publish `docs/design-system/contributing.md` (the §10 workflow + §12 DoD +
  RFC/deprecation process); name owners; add the §12 review requirement for Layer 0–2.
- **Deliverables:** contributing guide; ownership; deprecation policy.
- **Dependencies:** Phases 1–6.
- **DoD:** a new contributor can add a component correctly from the docs alone.
- **Not yet:** revisit `packages/ui` only when a second UI surface appears (§7 trigger).

---

### One-line summary

You do not need to *build* a design system — you have a good one. You need to
**name it, document it, catalogue it in Storybook 9, test it, enforce it, migrate the
last hand-rolled corners onto it, and govern it** — in that order, without extracting a
package or adopting visual regression before the evidence justifies either.
