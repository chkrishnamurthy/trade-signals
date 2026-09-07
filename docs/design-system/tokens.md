# Design Tokens — the contract

> The single source of truth is [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css).
> This document explains the *contracts* those tokens obey. When this doc and the
> CSS disagree, the CSS wins and this doc is stale — fix the doc.

**One hard rule:** nothing outside `globals.css` may name a raw colour, radius,
or shadow value. Components consume the semantic Tailwind utilities generated
from these tokens (`bg-surface`, `text-bullish`, `rounded-lg`, `shadow-elevated`).
Changing a value here restyles every page at once — that is the whole point of
the architecture, and why a raw `#hex` or `oklch(...)` literal in a component is
a bug, not a shortcut.

Themes are **class-based**: the toggle writes `.dark` on `<html>` (see
`lib/theme.ts`), and `@custom-variant dark` keys off that class so the choice can
override the OS. Dark is a *designed* palette, never an inversion.

---

## 1. Surface plane model

Depth comes from contrast and borders, not from stacking shadows. Four named
planes, ordered by elevation:

| Token | Role |
| :-- | :-- |
| `background` | The page canvas. A visibly tinted grey so a white `surface` reads as a distinct panel. |
| `surface-sunken` | A well *below* the canvas (inset regions). |
| `surface` | A panel sitting on the canvas (cards). |
| `surface-raised` | Anything floating above the page (popover, drawer, sticky header). |

Each surface has a matching `-foreground`. Use `bg-surface text-surface-foreground`,
never a raw pairing.

## 2. The financial 4-slot convention

Every directional concept ships **all four** slots. Adding a new directional
concept means adding all four, or it is incomplete:

| Slot | Use |
| :-- | :-- |
| `<name>` | Accent — bars, dots, strokes, fills. |
| `<name>-strong` | Text on a soft background, contrast-checked. |
| `<name>-soft` | Tinted badge / row background. |
| `<name>-line` | Ring and border. |

Concepts following this convention today: `bullish`, `bearish`, `neutral`.
`bullish`/`bearish` are matched to Groww's actual up/down colours; `bullish`
shares the `primary` hue family on purpose.

**`positive` / `negative`** are aliases of `bullish` / `bearish` today, but kept
separate deliberately — a value whose sign is *not* directional (VIX, drawdown)
can diverge later without touching every signal component. They carry only
`<name>` and `<name>-strong`.

## 3. Status set

`destructive`, `success`, `warning`, `info` — each with a `-foreground`.
`destructive` and `warning` additionally carry `-soft` / `-line` (they appear as
tinted alert panels; success/info do not yet need the soft treatment — add the
slots when they do).

## 4. Session state

`market-open`, `market-pre`, `market-closed`, `market-unknown`. Note that
`market-unknown` is **deliberately not grey**: "we do not know" must never look
like "closed". `market-open`/`market-pre`/`market-closed` alias
`bullish`/`warning`/`neutral`.

## 5. Charts

`chart-1..5` (categorical series, ordered — `1` is the primary series), plus
`chart-grid` and `chart-axis`. Use these for series colour, never the financial
ramp — a chart series is not a direction.

## 6. Typography scale

Owned entirely by [`components/ui/typography.tsx`](../../apps/web/src/components/ui/typography.tsx)
(`Text`). Thirteen named roles; **nothing outside that file picks a font size.**

Font families: `--font-sans` (Inter) and `--font-mono` (mono figures). The
`metric` / `display` / `value` / `indicator` roles carry the `figure` utility
(tabular lining figures) so price columns align without a monospace face.

Size steps below the `text-xs` (0.75rem) floor are named tokens, not arbitrary
values: `--text-2xs` (0.6875rem) and `--text-3xs` (0.625rem), consumed via the
`Text` roles `micro` / `nano` or the `text-2xs` / `text-3xs` utilities.

## 7. Radius, shadow, spacing, motion

- **Radius** — four steps only (`sm`/`md`/`lg`/`xl`), all derived from
  `--radius`. Do not invent a fifth.
- **Shadow** — three steps (`subtle`/`elevated`/`overlay`), used sparingly.
  Borders first, shadow second.
- **Spacing** — Tailwind's default scale *is* the spacing system. Arbitrary
  spacing (`p-[13px]`) is disallowed.
- **Borders** — `border` (default hairline) vs `border-strong` (major region
  dividers, where a hairline disappears). `input` is the form-control border.
- **Motion** — the nav-rail block defines `--nav-ease` / `--nav-duration` /
  `--nav-stagger-step`. All motion respects `prefers-reduced-motion` (a hard
  standard, not a nicety).

## 8. Focus

**One** `:focus-visible` treatment for the whole app, in the base layer of
`globals.css`. It is never removed, only replaced.

---

## Change process

- **Value change** (e.g. tweak a hue) — low risk; it restyles globally. Review
  in Storybook's Foundations stories in *both* themes.
- **Adding a slot to a ramp** — add all four financial slots, or all the status
  slots the pattern implies. Additive and safe.
- **Renaming / removing a token** — a deprecation, never a big-bang rename. Ship
  the replacement, mark the old `@deprecated`, migrate call sites, then remove.

New tokens need sign-off — the token set is the constitution. See the design
system plan (`docs/planning/design-system-plan.md`) §5 and §12.
