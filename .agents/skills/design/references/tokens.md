# Tokens

Source of truth: `apps/web/src/app/globals.css`. Every value below is copied from there —
re-read the file before trusting a specific number; this reference can go stale, the CSS
file cannot.

## Surfaces (light / dark)

| Token | Light | Dark |
|---|---|---|
| `background` | `oklch(0.953 0.006 253)` | `oklch(0.13 0.012 259)` |
| `surface` | `oklch(1 0 0)` | `oklch(0.223 0.014 259)` |
| `surface-raised` (popover/dialog/sticky) | `oklch(1 0 0)` | `oklch(0.258 0.015 259)` |
| `surface-sunken` (table header, code) | `oklch(0.958 0.005 253)` | `oklch(0.108 0.01 259)` |
| `foreground` | `oklch(0.21 0.021 258)` | `oklch(0.951 0.005 253)` |
| `muted-foreground` | `oklch(0.502 0.018 257)` | `oklch(0.688 0.014 257)` |
| `subtle-foreground` | `oklch(0.617 0.017 257)` | `oklch(0.572 0.014 257)` |
| `border` | `oklch(0.878 0.010 253)` | `oklch(0.34 0.015 259)` |
| `border-strong` | `oklch(0.82 0.013 253)` | `oklch(0.42 0.017 259)` |
| `primary` | `oklch(0.56 0.16 166)` | `oklch(0.68 0.15 166)` |

Dark mode is not an inversion: the canvas is cool graphite rather than black, and surfaces
step *up* in lightness as they float higher (background → surface → surface-raised).

**Revised 2026-08-29 (contrast pass)**: `background`/`surface` and `border`/`border-strong`
were all pushed further apart (previously `0.978`/`1.0` and `0.163`/`0.201` — too close to
read as two distinct planes at normal viewing size, confirmed by screenshotting the running
app in both themes). `shadow-subtle`/`shadow-elevated` strengthened to match.

**Revised again 2026-08-29 (Groww rebrand, light AND dark)**: the user shared real
screenshots of groww.in (light and dark) and chose exact-match, including Groww's own
colors, over the earlier "inspired, own identity" direction — a deliberate, informed
decision made twice with the trade-dress risk stated plainly (see memory
`founder-roadmap-tension`). `primary`, `ring`, and all four `bullish`/`bearish` slots were
replaced with Groww's actual teal-green/orange-red in both themes (light first, at the
user's request, dark done immediately after in the same session) — verified by
screenshotting the watchlist page and `/design-system` in both themes, no regressions.

## Financial semantics — the vocabulary shadcn doesn't have

Four slots per direction: the bare token (bars/strokes/fills), `-strong` (text on a soft
background), `-soft` (badge/row tint), `-line` (border/ring).

| Direction | accent | strong | soft | line |
|---|---|---|---|---|
| `bullish` (light) | `oklch(0.62 0.17 166)` | `oklch(0.5 0.15 166)` | `oklch(0.94 0.05 166)` | `oklch(0.82 0.09 166)` |
| `bearish` (light) | `oklch(0.62 0.19 35)` | `oklch(0.52 0.18 35)` | `oklch(0.94 0.04 35)` | `oklch(0.82 0.08 35)` |
| `neutral` (light) | `oklch(0.577 0.015 257)` | `oklch(0.432 0.017 257)` | `oklch(0.953 0.006 257)` | `oklch(0.886 0.009 257)` |
| `bullish` (dark) | `oklch(0.72 0.16 166)` | `oklch(0.8 0.14 166)` | `oklch(0.28 0.06 166)` | `oklch(0.42 0.09 166)` |
| `bearish` (dark) | `oklch(0.68 0.19 35)` | `oklch(0.78 0.16 35)` | `oklch(0.29 0.07 35)` | `oklch(0.44 0.1 35)` |

`positive`/`negative` are aliases of `bullish`/`bearish` (`globals.css:111-114`) — kept
separate in name only so a non-directional signed value (VIX, drawdown) could diverge
later without touching every signal component. `market-unknown` is deliberately **not**
grey — "we do not know" must never look like "closed" (`globals.css:116-118`).

The light-mode hues above are Groww's actual brand green (~166°) and a warm orange-red
(~35°) — a real, intentional shift from the *previous* "pulled off neon, not a casino
floor" restraint. The `bullish`/`primary` connection is also new: Groww's brand color and
its "up" color are the same green, so `primary` now sits in the same hue family as
`bullish` rather than being a separate identity hue.

## Type scale (`ui/typography.tsx`)

Still Inter (`--font-sans` in `globals.css`) as of 2026-08-29 — Groww's exact typeface is
part of the exact-match direction but hasn't been confirmed yet (waiting on the user to
pull `font-family` from groww.in's DevTools Computed panel; automated browsing there is
blocked, see memory `groww-browsing-blocked`). Don't swap the font speculatively.

One component, `Text`, eleven variants — nothing outside this file picks a font size:

| Variant | Style |
|---|---|
| `page-title` | `text-xl font-semibold`, `sm:text-2xl` |
| `section-title` / `card-title` | `text-sm font-semibold` |
| `body` (default) | `text-sm` |
| `secondary` | `text-sm text-muted-foreground` |
| `caption` | `text-xs text-muted-foreground` |
| `label` | `text-xs font-medium` |
| `overline` | `text-xs font-medium tracking-wide uppercase` |
| `metric` | `text-2xl font-semibold` + tabular-nums |
| `display` | `text-3xl font-semibold` + tabular-nums |
| `value` | `text-sm` + tabular-nums |
| `indicator` | `font-mono text-xs` + tabular-nums |

Tabular-nums (the `figure` utility — `font-variant-numeric: tabular-nums lining-nums`,
ligatures off, `globals.css:458-464`) is baked into `metric`, `display`, `value` and
`indicator` only. Anywhere else a number needs to align in a column, add the `figure`
class explicitly rather than reaching for a numeric-looking variant that doesn't carry it.

There is no `Heading` component — page/section headings are `Text as="h1"` /
`Text as="h2"`, composed via `layout/page.tsx`'s `PageTitle`/`SectionTitle`, not written
ad hoc per screen.

## Radius and shadow — four steps each

| Radius | Value | Shadow | Value |
|---|---|---|---|
| `radius-sm` | 4px | `shadow-subtle` | inline surfaces (Card, Input) |
| `radius-md` | 6px (Button, Input, Badge) | `shadow-elevated` | raised, not floating |
| `radius-lg` | 8px (Card) | `shadow-overlay` | Dialog/Sheet/Popover/Tooltip only |
| `radius-xl` | 12px (Dialog, bottom Sheet) | — | — |

Depth convention: `surface` + `shadow-subtle` for anything inline on the page; `surface-raised`
+ `shadow-overlay` + `border-border` for anything that floats above it (Dialog, Sheet,
Popover, Tooltip). Data UIs get most of their depth from borders and contrast, not shadow —
reach for a heavier shadow only when the element is genuinely floating above the page.
