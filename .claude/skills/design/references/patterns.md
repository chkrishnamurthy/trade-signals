# Composition patterns

Each pattern names the shape, not a pixel value. Pixel values, colors and radii come
from `globals.css` and the existing primitives — never restated here.

## List-row anatomy

Every stock row (watchlist, screener results, signal feed) follows the same skeleton:

`[identity] ... [tabular value, right-aligned] [change, beneath or beside the value]`

- Identity is `StockAvatar` + `StockIdentity` (name, symbol, exchange badge) on the left.
  Never center-align identity; the eye scans this column top to bottom.
- The primary numeric value (LTP, score, whatever the screen is about) is right-aligned
  and wrapped in the `figure` utility (tabular-nums) so a column of rows aligns on the
  decimal point without a monospace font.
- Change/delta sits directly under or beside the primary value, using `PercentChange` /
  `PriceChange` — color from the `bullish`/`bearish` tokens, never a raw green/red.
- Rows separate with a hairline (`border`), not a shadow and not alternating row
  background. Depth in this product comes from contrast and borders (see `globals.css`'s
  own comment on this), and brokerage apps that use heavier card chrome per row are not
  the model here.

## Stat-block anatomy

For "Open / High / Low / Volume"-style definition data (`DefinitionGrid`,
`DefinitionRow`, `MetricCard`, `StatTile`):

- Label first, small and in `muted-foreground` or `subtle-foreground`.
- Value second, larger, `foreground`, tabular-nums when numeric.
- No per-stat card border. A grid of stat blocks reads as one dense group with internal
  hairlines or whitespace, not a wall of small cards — cards are for the largest ideas on
  a screen, not every field on it.

## Section rhythm

- Every major section gets a `SectionHeader` (`SectionTitle` + optional
  `SectionDescription`), and a `View all` / `See all` action lives at the *right* end of
  that same header row when the section previews a longer list elsewhere — never a
  separate row, never at the bottom of the section.
- Vertical spacing between sections is larger and more consistent than spacing *within*
  a section, so the page reads as a stack of distinct groups rather than one long scroll.

## Summary tiles

A screen's headline number (a watchlist's mover count, a signal's score, an account-free
performance figure) gets the largest type on the screen and sits alone at the top of its
card, with supporting context (timeframe, count, freshness) beneath it in a smaller,
muted weight. This is the "number first" pattern: the headline is legible from across the
room; everything that qualifies it is legible only up close.

## Segmented range controls

Timeframe switches for a chart (1D/1W/1M/1Y or 3m/5m/15m for intraday) are an underlined
tab row (`Tabs`/`TabsList`/`TabsTrigger`) directly above or below the chart, not a button
group and not a dropdown. Keep the active state to an underline plus weight change —
this is a frequently-touched control and should not compete visually with the chart.

## Density and color discipline

- Green/red (`bullish`/`bearish` tokens) mark direction and nothing else. In a **repeated**
  element — a list row, a table row, a grid of stat cells — they appear as text color and
  as the `-soft` tint on a small pill/badge, never as that row's full background. A list
  where every row is tinted green or red is unreadable at a glance; a list where only the
  number is colored is scannable in one pass.
- A **singular** hero element — the one setup banner on a stock detail page, a page-level
  verdict card that appears once — may use the `-soft` tint as its own card background.
  It isn't tiling into visual noise because there's only one of it, and a page-level
  verdict is exactly the kind of thing that should read as colored at a glance. The test
  is repetition, not element type: the same treatment on every row of a watchlist is the
  violation this rule exists to prevent.
- The brand `primary` color is reserved for actionable/interactive elements (links,
  active tab, primary button, focus ring) and is not used for financial direction, so a
  bullish trend and a clickable filter never suggest the same category of thing.

## Empty / loading / error states

- Loading: a skeleton shaped like the real content (`CardSkeleton`, `TableSkeleton`,
  `SkeletonRows`) at the real content's dimensions, so the layout doesn't jump on load.
- Empty: one short, plain-English sentence plus the action that resolves it (`EmptyState`),
  not an illustration-led placeholder. "No stocks in this watchlist yet — add one" beats
  generic empty-box art.
- Error: `ErrorState` / `InlineError` / `ConnectionError` / `DataUnavailable` pick the
  narrowest one that's true — a single stale number gets `InlineError`, a whole panel
  failing gets `ErrorState`, a provider outage gets `ConnectionError`. Never fall back to
  a blank section with no explanation.
