# Components

Primitive-by-primitive states, as implemented in `apps/web/src/components/ui/` and
`.../market/`. Re-verify against the file before trusting a specific class name — this
file is a snapshot from an audit, the source is authoritative.

## Buttons (`ui/button.tsx`)

The application's only button — no page-specific button style exists anywhere.

- **Variants**: `default` (primary fill), `secondary`, `outline`, `ghost`, `link`,
  `destructive`. No `success`/`warning` variant.
- **Sizes**: `sm` (h-7), `default` (h-8), `lg` (h-10), `icon` (size-8), `icon-sm` (size-7).
- **States**: hover (variant-specific `hover:bg-*`), focus-visible (`outline-2
  outline-offset-2 outline-ring` — matches the global focus treatment exactly), disabled
  (`pointer-events-none opacity-50`).
- **Loading**: `loading` prop — disables the button, sets `aria-busy`, and prepends a
  spinner ahead of the children. Ignored under `asChild` (`Slot` requires exactly one
  child element, so a wrapped link/anchor doesn't get a spinner injected — disable it via
  its own `disabled`-equivalent instead). Added 2026-08-29 once `add-stocks.tsx` needed
  it for real, replacing that screen's local `Loader2Icon` workaround.
- Icons are children, auto-sized to 16px unless given an explicit size class; button gap
  is `gap-1.5`.
- **Variant-by-role convention (2026-08-29, Groww-matched)**: `default` (filled) is
  reserved for the page's one true primary action — the thing Groww fills solid green
  (e.g. a dialog's confirm/commit button). A toolbar or header action that merely opens
  something or adds to a list (`Add stocks`, `Edit`, a filter trigger) is `outline`, even
  though it used to default to filled before this pass. Don't fill every button just
  because it's the most prominent thing in its row — check whether it's the actual
  primary action or a secondary one first.

## Inputs — `Input`, `Select`, `Checkbox`, `Switch`

All four share one shell convention: `border` (1px) at `border-input`, `bg-surface`,
`shadow-subtle`, `rounded-md`/`rounded-sm`. Divergences worth knowing:

| Control | Focus | Invalid | Disabled |
|---|---|---|---|
| `Input` | `focus-visible:border-ring` (border recolors — no border to recolor is why Button/Checkbox/Switch instead get an outline ring) | `aria-invalid:border-destructive` | `opacity-50`, `cursor-not-allowed` |
| `Select` (trigger) | `focus-visible:border-ring` | `aria-invalid:border-destructive` | same |
| `Checkbox` | `focus-visible:outline-2 outline-offset-2 outline-ring` | `aria-invalid:border-destructive` | same |
| `Switch` | `focus-visible:outline-2 outline-offset-2 outline-ring` | `aria-invalid:border-destructive` | same |

Invalid state is driven by the `aria-invalid` attribute, which `forms/form-field.tsx`'s
`useFieldControlProps` sets — a control never sets its own error styling by hand.

**No "required field" convention exists** — no asterisk, no distinct required styling.
Don't invent one inline; if a screen needs it, that's a `FormLabel` change, flagged once,
not a per-form workaround.

## Labels and form fields (`ui/label.tsx`, `forms/form-field.tsx`)

`FormField` owns wiring `id` / `aria-describedby` / `aria-invalid` so a field's label,
description and error can never drift out of sync with its control — never wire these by
hand on a one-off input.

- `FormLabel` — `text-xs font-medium`, bound via `htmlFor`.
- `FormDescription` — `text-xs text-muted-foreground`, always rendered.
- `FormMessage` — renders **nothing** when the field is valid (so the layout never jumps
  when an error clears), `text-xs text-destructive`, `role="alert"` when it does render.

## Badges (`ui/badge.tsx`)

`default` (primary fill), `secondary`, `outline`, `bullish`/`bearish`/`neutral`
(financial tones — soft background, strong text, line ring), `warning`, `destructive`.
Sizes `sm`/`default`/`lg`. Shape is `ring-1 ring-inset`, not `border` — this is what
separates a Badge from a bordered Card at a glance. The financial tones live here
specifically so a badge, a pill and a chip elsewhere can't drift into different greens.

## Cards (`ui/card.tsx`)

Compositional, not prop-driven: `Card` (`rounded-lg border border-border bg-surface
shadow-subtle`) contains `CardHeader` (`border-b`, `px-4 py-3`) → `CardHeading` /
`CardTitle` (`text-sm font-semibold`) + `CardDescription` (`text-xs text-muted-foreground`)
+ `CardToolbar` (the slot every header action belongs in — never place an action loose in
the header) → `CardContent` (`p-4`, or `flush` to drop padding for a list/table body) →
optional `CardFooter` (`border-t`, `px-4 py-2.5`, `text-xs text-muted-foreground`).

## Overlays — `Dialog`, `Sheet`, `Popover`, `Tooltip`

One elevation convention across all four: `bg-surface-raised` + `shadow-overlay` +
`border-border`, distinct from the `bg-surface` + `shadow-subtle` of anything inline on
the page.

- **Dialog** — scrims with `bg-background/70 backdrop-blur-sm`, centered, `rounded-xl`,
  zoom+fade in. Has an explicit close button top-right plus Escape/overlay-click.
- **Sheet** — built on the same Dialog primitive. Four `side` variants: `right` (default,
  `sm:max-w-lg`), `left` (`sm:max-w-sm`), `bottom` (`rounded-t-xl`, `max-h-[85dvh]`), `top`.
  Structure is `SheetHeader` → `SheetBody` (`overflow-y-auto`) → `SheetFooter` (`mt-auto`).
- **Popover** — `w-72`, no scrim, `sideOffset=4`.
- **Tooltip** — smaller (`px-2.5 py-1.5 text-xs`), `sideOffset=6`, `delayDuration=200`ms
  from one app-wide `TooltipProvider` — never mount a second provider.

## Tabs and single-select groups (`ui/tabs.tsx`, `ui/toggle-group.tsx`)

Both use **pill-in-track**, not underline: a `bg-muted rounded-md p-0.5` track, active
item gets `bg-surface` + `shadow-subtle`. `ToggleGroup` is the shared control for "pick
exactly one of a short list" — chart timeframes, signal direction filters, theme — so a
new one-of-many control reaches for this, not a fresh radio-button treatment.

**A second, separate tab pattern exists for switching between named, user-managed
collections** — `watchlist-tabs.tsx`'s bespoke tab bar (not built on `ui/tabs.tsx`),
restyled 2026-08-29 to match Groww: plain text, `border-b-2 border-transparent` that
becomes `border-primary` when active, no filled pill. Reach for this pattern (not
pill-in-track) when the thing being switched between is a user's own named list with
CRUD/reorder — a watchlist, a saved view — rather than a fixed set of display modes.

## Tables (`ui/table.tsx`, `data-display/data-table.tsx`)

`TableContainer` owns horizontal scroll so a wide table never widens the page. Header
always gets a shaded `bg-surface-sunken` band (changed 2026-08-29 to match Groww's table
headers — previously transparent except when `sticky`, which is now just `sticky top-0
z-10` layered on top of the same background); head cells are `text-xs font-medium
text-muted-foreground`. Rows: `border-b`, `last:border-0`, `hover:bg-accent/60`, selected
rows `bg-accent`. `TableHead`/`TableCell` both take a `numeric` boolean → `text-right`,
and `TableCell` additionally applies the `figure` (tabular-nums) class when numeric —
never right-align a number without also giving it `figure`, the two travel together.
This is a shared primitive — every `DataTable` consumer (watchlist, stocks screener,
dashboard signals, signal performance) picked up the shaded header at once.

`DataTable` is the one hand-rolled financial data table (deliberately not a library):
sort affordance is a header button (`ChevronsUpDownIcon` faded when unsorted, directional
arrow when active, `aria-sort` set); a row with no `sortValue` sinks to the bottom
regardless of direction; shift-click adds a small numeral badge as a tie-breaker; row
expansion and row selection are both leading-column affordances (chevron, checkbox).

## Alerts (`ui/alert.tsx`)

`default`, `info`, `warning`, `destructive`. **No `success` variant** — `warning` is
specifically the stale-data tone and `destructive` the failure tone; they carry real
meaning about data trustworthiness and aren't interchangeable decoration. If a screen
needs a positive confirmation banner, that's a gap to raise, not a reason to repurpose
`info` or invent a green Alert inline.

## Skeletons (`ui/skeleton.tsx`)

One shimmer (`animate-pulse rounded-md bg-muted`), never a spinner — a skeleton holds the
shape of the layout it's about to become; a spinner collapses that layout to nothing.

## Market-specific components (`components/market/`)

- **`numeric.tsx`** — every numeric display (`Price`, `Currency`, `Volume`, `MarketCap`,
  `Ratio`, `Percent`, `PercentChange`, `PriceChange`, `IndicatorValue`, `IndexLevel`,
  `Quantity`, `Turnover`) shares a three-state contract: loading → sized skeleton, `null`
  → em dash with "not available" semantics (muted, never a fabricated zero), otherwise the
  value. Color is never decided locally — `lib/tone.ts`'s `toneOf(value)` maps
  positive/negative/zero → bullish/bearish/neutral, and **a glyph (▲/▼/→) always
  accompanies the color** so direction is never carried by color alone. A `tone` override
  exists for inverted-meaning metrics (VIX: down is the "bullish"-colored direction).
- **`signal.tsx`** — one vocabulary for direction, deliberately free of BUY/SELL/ORDER
  language. `SignalBadge` maps `strong_bullish|bullish|neutral|bearish|strong_bearish` to
  the Badge financial tones, doubled glyph (`▲▲`) for the strong variants. `SignalScore`
  **requires** a factor-breakdown `children` slot — it will not render a bare number; this
  is the CLAUDE.md "no confidence score the factors can't explain" rule enforced in the
  component's own type signature, not just a convention to remember.
- **`stock-identity.tsx`** — `StockAvatar` is a monogram, not a logo: no logo source
  exists for NSE equities and inventing one would mean shipping an asset that may not
  belong to the company. `StockIdentity` always gives the ticker more visual weight than
  the name — the ticker is what a user scans for.

## Known gaps — report, don't invent around

Verified absent as of the last audit. If a screen needs one of these, say so explicitly
and ask whether to add it centrally — a per-screen inline fix is the next inconsistency.

- No required-field marker convention on `FormLabel`.
- No positive/success `Alert` variant.
- `Switch`'s `aria-invalid` handling, all three components' focus-visible outlines, and
  `Button`'s `loading` prop were added across this pass and the next (2026-08-29) to close
  real gaps found auditing/applying this skill against the watchlist feature — re-verify
  they're still present before citing this file as fact in a future session.
