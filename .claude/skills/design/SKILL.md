---
name: design
description: Build, restyle, or review a screen, page, or UI component in apps/web against this product's actual design system — tokens, every primitive's real states, layout patterns, and copy conventions. User-invoked with /design; does not fire on its own.
disable-model-invocation: true
---

# design

You are composing a screen from a design system that already exists in full — colors,
type scale, every interactive primitive's states, table conventions, empty/error/loading
states, and a layout language for how they assemble into a page. Nothing here is
proposed. It is extracted from the repo as of the last audit and must be re-verified
against the files it cites before being treated as current fact.

> **The question behind every choice:** does this screen look, read and behave like it
> was built from the *same* system as every other screen in the product?

## Invocation

```
/design                  apply the full system to whatever screen/component is being built or edited
/design tokens            just the color/type/radius/shadow reference
/design components        just the primitive-by-primitive state reference
/design patterns           just the screen-composition patterns
/design labels             just the copy/labeling conventions
/design exclusions         just the brokerage-app patterns this product must not have
```

With no argument, read all five references before writing a line of UI code.

## Rule zero: nothing here is invented per-screen

Before styling anything, read:

- `apps/web/src/app/globals.css` — the only place a color, radius or shadow is named.
- `apps/web/src/components/design-system/design-system.tsx` — the live showcase of
  every primitive below, rendered at `/design-system`.

A screen is **composed** from `apps/web/src/components/{ui,data-display,market,layout,forms}/`.
A missing capability (a variant that doesn't exist, a state nothing handles) is a gap to
report and ask about — see `references/components.md`'s "Known gaps" section for the ones
already found. Inventing a one-off inline style to cover a gap is exactly how two screens
drift apart; it's a design-system decision for the author, not a per-screen workaround.

## References

- `references/tokens.md` — color ramp (light/dark), the financial semantics (bullish/
  bearish/neutral), type scale, radius steps, shadow steps, tabular-figure convention.
- `references/components.md` — every primitive (`Button`, `Input`, `Select`, `Checkbox`,
  `Switch`, `Badge`, `Card`, `Dialog`/`Sheet`/`Popover`/`Tooltip`, `Tabs`, `Table`/
  `DataTable`, `Alert`, `Skeleton`, the market-specific components) with its real variants
  and states — default, hover, focus, disabled, invalid, loading where it exists — and
  the gaps where a state doesn't exist yet.
- `references/patterns.md` — how primitives assemble into a screen: list-row anatomy,
  stat-block anatomy, section rhythm, summary tiles, segmented range controls, density
  and color discipline, empty/loading/error selection.
- `references/labels.md` — copy and labeling conventions: what a component says when
  data is missing vs. stale vs. unreachable, the CLAUDE.md wording rules for signals,
  and the tone rules (`toneOf`, glyph-plus-color, never color alone).
- `references/exclusions.md` — the brokerage-app patterns (order bar, holdings/portfolio
  value, order history) that must never appear, and why borrowing the layout idea without
  the transactional purpose is the actual discipline being asked for here.
- `references/mapping.md` — brokerage concept → this product's real equivalent.

## On finding a conflict or a gap

Two different situations, two different responses:

1. **An existing screen violates a documented convention or a `CLAUDE.md` rule** (a raw
   color outside the token set, an order-shaped control, an unlabeled confidence score).
   Report the file, the line, and what's wrong, then stop. The fix is the author's call.
2. **The screen being built needs a state or variant that genuinely doesn't exist yet**
   (a button loading state, a required-field marker, a positive/success alert — see
   `references/components.md`'s gap list). Say so explicitly and ask how to add it to the
   shared primitive, rather than styling around the gap inline in the new screen. A gap
   filled once, centrally, stays consistent; a gap patched per-screen is the next
   inconsistency this skill exists to prevent.

Call the Skill tool with "signal-invariants" if a conflict touches one of the eight hard
rules rather than a styling convention.
