# Contributing to the design system

> How to add or change UI without eroding the system. Read this with
> [`tokens.md`](tokens.md) (the token contracts) and the full strategy in
> [`../planning/design-system-plan.md`](../planning/design-system-plan.md).

The design system **is the code in `apps/web/src`** — tokens in `globals.css`,
primitives in `components/ui`, domain components in `components/market` etc.
Storybook renders and tests it; it never *defines* it. When Storybook and the app
disagree, the app's tokens win and the story is wrong.

---

## The layers (dependency direction)

A layer may depend only on layers **above** it — never downward, never sideways
into a sibling domain.

```
Layer 0  FOUNDATIONS   globals.css tokens · ui/typography (Text) · lib/tone · lib/utils · icons
Layer 1  PRIMITIVES    components/ui/*        — generic, domain-agnostic; imports Layer 0 only
Layer 2  DOMAIN        market/* · data-display/* · charts/*  — paise-aware; composes L1+L0
Layer 3  FEATURE       watchlists/* · forms/* · auth/* · profile/*  — composes L2+L1+L0
Layer 4  SHELL/PAGES   layout/* · app/**/page.tsx  — assembles L3; no new styling originates here
```

A `ui/` primitive must know nothing about stocks. One feature area must not import
another's internals.

## The developer loop

1. **Check** the Storybook catalogue + `docs/design-system` — does a primitive /
   domain / feature component already exist?
2. **Reuse** by composition. This should cover ~90% of new UI.
3. **Need a change?**
   - a new **variant** of an existing component → add a CVA variant + a story;
   - a genuinely **new reusable** component → build it in the right layer, tokens only;
   - a truly **page-specific one-off** → build it in the page, compose primitives,
     invent no new tokens (use the `className` escape hatch).
4. **Story** — add `Default` + one story per meaningful state (including the ugly
   ones: empty, error, overflow, missing indicator, extreme gap).
5. **Verify in the real app**, both themes — not just the diff or Storybook (see
   "Verification" below).
6. **PR** — typecheck + `build-storybook` green.

**Rule of thumb:** if you are writing a colour, radius, shadow, or font-size
literal in a component, stop — reach for a token or propose one.

## Responsive design (MANDATORY)

Every screen and component must work on **mobile AND desktop/laptop** — both are
required, not optional. A screen that only works on one is considered broken. Design
**mobile-first**: style for the small screen, then add `sm:` / `md:` / `lg:` / `xl:`
to enhance upward.

**Breakpoints** (Tailwind defaults, the app uses these): `sm` 640 · `md` 768 ·
`lg` 1024 · `xl` 1280. `lg` is the load-bearing one — the app shell's sidebar is a
Sheet drawer below `lg` and a permanent column at `lg`+.

**Hard rules**
- **No horizontal page scroll, ever.** The page body must never scroll sideways at
  any width. Only a designated container may scroll horizontally.
- **Wide tables** scroll inside their own `overflow-x-auto` container (use
  `TableContainer`, or the `DataTable`), and drop low-priority columns on small
  screens via `hideBelow`. Never let a table widen the page. Never shrink a price to
  fit — drop a column instead.
- **Toolbars and page headers wrap** (`flex flex-wrap`), they do not overflow.
- **Multi-column grids collapse to one column** on mobile: default `grid-cols-1`,
  add `sm:grid-cols-2` / `lg:grid-cols-3`. Never a fixed multi-column grid.
- **Inputs and search go full-width on mobile** (`w-full sm:w-auto`/`sm:w-56`).
- **Footers / link rows stack on mobile** (`flex flex-col gap-2 sm:flex-row …`),
  they do not squeeze two items onto one cramped line.
- **Overlays fit the viewport**: a `Sheet` is `w-full sm:max-w-…`; a `Popover`/menu
  is capped with `w-[min(24rem,calc(100vw-2rem))]` so it never exceeds the screen.
- **Height-capped overlays scroll internally.** Put the height cap on the
  `ScrollArea` (its Viewport inherits it and becomes the scroller) — a tall Popover
  (e.g. the Filters panel) must scroll inside itself, never grow past the screen and
  spill over the page.
- **Dense tables may freeze their identity column.** Mark it `pinned` (see the
  watchlist column registry / `DataTableColumn.pinned`) so the ticker stays visible
  while the price columns scroll — the prices must never scroll away from the name
  they belong to. An expanded row panel inside a scrolling table is pinned to the
  visible width so its chart/detail doesn't ride the horizontal scroll.
- **Tap targets** stay comfortable on touch (don't shrink interactive controls
  below the primitive's default height on mobile).

**How to check (required before "done")**
- In **Storybook**: use the **Viewport toolbar** (Mobile 375 / Tablet 768 / Laptop
  1024 / Desktop 1440 — configured in `.storybook/preview.tsx`) and confirm the
  story holds at Mobile and Desktop, in both themes.
- In the **real app**: check the page at a phone width and a laptop width — the
  in-app Browser pane's device emulation gives a true mobile viewport (an OS-window
  resize often won't shrink below the browser's minimum, so it is not a valid test).
- A quick overflow probe: `document.documentElement.scrollWidth <= window.innerWidth`
  must hold at 375px.

## Definition of done for a component

1. Lives in the correct layer; imports only allowed layers.
2. Tokens only — no raw colour / radius / shadow / size literals.
3. Has a story: `Default` + every state; autodocs from typed props + JSDoc.
4. Keyboard-operable, accessible name, both themes verified.
5. **Responsive: verified at mobile (375) and desktop — no horizontal page
   overflow, wide content scrolls in its own container, grids/toolbars collapse.**
6. Interaction states covered where applicable: hover / focus / active / disabled /
   loading / error / empty.
7. No sibling-domain imports.

## Variants vs. one-offs

- Add a CVA variant only when the difference is **systemic** (recurs, expresses a
  design intent). A one-place tweak uses the `className` escape hatch.
- **Cap variant axes** per component (e.g. Button = `variant` × `size`, nothing
  more). Approaching ~6 variants on one axis is a signal to split, not extend.
- Page-specific needs are allowed and expected — build them in the page, invent no
  new tokens. A one-off that appears a second time gets promoted upward (L3→L2→L1)
  via the proposal below.

## Proposing a new component / variant / token

A short RFC (issue or PR description): the recurring need, why no existing
component fits, which layer, and the tokens it uses. **New tokens especially need
sign-off** — the token set is the constitution. Adding a slot to a financial ramp
means adding all four slots (`<name>` / `-strong` / `-soft` / `-line`).

## Deprecation, not deletion

Rename/removal ships the replacement first, marks the old `@deprecated` (JSDoc),
migrates call sites over one or more PRs, then removes. Never a big-bang rename.
Token value changes are low-risk (they restyle globally — review in Storybook
Foundations in both themes); renaming a token is a deprecation.

## Verification (hold UI to the real app)

The catalogue is necessary but not sufficient. Before calling UI work done:

- Run it in the **actual app** and look in **both themes** (the `.dark` toggle),
  not only Storybook — Storybook shares `globals.css` but not the app's data,
  routing, or SSR.
- Watch for **hydration mismatches** (the Next.js dev overlay "N Issues" badge).
  The recurring cause here is locale-default date/number formatting in SSR'd
  output — always pin locale + `timeZone` (see `istDate` / `istTime` in
  `lib/format.ts`). Never `new Date(x).toLocaleDateString()` with no locale.
- Check **clickables read as clickable** (pointer cursor), **page gutters are
  consistent** (every in-app page composes `AppShell` + `PageContainer`), and the
  screen holds up at **mobile and desktop** widths.

## Enforcement — current state

- **CI:** `.github/workflows/ci.yml` runs `typecheck` + `build-storybook` on every
  PR. `build-storybook` is the gate that keeps the catalogue from rotting.
- **Not yet wired (tracked):**
  - The Storybook interaction + a11y **test runner** (axe-as-error) — blocked by a
    `@storybook/nextjs-vite` + `@storybook/addon-vitest` React-duplication issue.
  - **Lint rules** forbidding raw colour/radius/shadow literals and enforcing the
    §layer import boundaries — deferred until the repo's pre-existing Biome errors
    are cleared, so the new rules don't land in an already-red `pnpm lint`. The
    intended rules: ban `-[#…]` / `-[oklch(…)]` / raw hex outside `globals.css`, and
    `no-restricted-imports` blocking downward/sibling imports per the layer map.

## Ownership

Layer 0–2 (tokens, `ui/`, `market/`) changes should get a design-system review;
feature layers (L3–L4) are owned by feature authors. Keep the catalogue honest:
a component without a passing story should not merge.
