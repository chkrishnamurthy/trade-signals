# Labels and copy

How this product's components talk, verified against the actual copy conventions in
`data-display/states.tsx`, `market/numeric.tsx`, `market/signal.tsx`, and the wording
rules in `CLAUDE.md`.

## Missing data has three distinct meanings — say which one

`data-display/states.tsx`'s own rationale: *"Financial UIs must never silently show a
stale number as if it were current, so the copy always names which situation the user is
in."* Pick the narrowest true one:

| Situation | Component | What it says |
|---|---|---|
| A field/row/panel has no data at all (e.g. an empty watchlist) | `EmptyState` | Plain sentence + the action that resolves it: "No stocks in this watchlist yet — add one," not generic empty-box copy |
| The field exists but the exchange didn't supply it this session | `DataUnavailable` | Named as a data gap, not an error |
| The provider/source is unreachable | `ConnectionError` | "Nothing is being shown rather than something possibly wrong" — never fabricate a stale number to fill the space |
| A single value failed inline (would break a row/table layout as a full block) | `InlineError` | Scoped to the one field, not the whole panel |
| A whole panel/section failed | `ErrorState` | Optional `detail` renders the raw upstream error text verbatim, monospaced — never paraphrase an error message into something that sounds more certain than it is |
| A value is a genuine `null` in a numeric display (`Price`, `Volume`, ...) | built into `numeric.tsx` | An em dash, muted color, never a fabricated `0` — a zero that means "unknown" is indistinguishable from a real zero price |

## Color is never the only carrier

`lib/tone.ts`'s own rule: *"Colour is never the only carrier."* Every directional value
pairs its bullish/bearish/neutral color with a glyph (▲/▼/→). A colorblind user or a
grayscale screenshot must still be able to read direction.

## Signal and direction wording — the CLAUDE.md rules, as enforced in components today

- `market/signal.tsx` carries **no BUY, no SELL, no ORDER** anywhere in the file, by its
  own header comment — that absence is the convention, not an oversight to "helpfully" fix.
- BUY / SELL may label a signal's *direction* and nothing else. Never "ORDER", never
  "ENTRY PRICE" (say "technical entry zone" / "entry level"), never "position", never
  "quantity", never "portfolio". An entry or exit level is a technical price level,
  labelled as one.
- A score never renders without its factor breakdown — `SignalScore`'s own type signature
  requires the `children` slot; this isn't optional copy guidance, the component won't
  compile without it.
- `VolumeIndicator`'s "unusual" label is tied to a specific, named threshold (1.5× relative
  volume) — if a screen surfaces this language, it should mean that threshold, not a vague
  sense of "a lot."

## Error messages: what went wrong and how to fix it

No apologies, no vagueness, no blaming the user. State the fact and the resolution:
"Fyers token expired — refresh it from Settings," not "Something went wrong, please try
again." An error a person can't act on (a transient provider hiccup) says so plainly
rather than implying user error.

## Numbers and units

Currency inline with the value (`₹2,847.65`, not a separate ₹ column), percentages
signed and with the `%` glyph attached, ratios with `×`. `Quantity` is never abbreviated —
it's a countable thing, and "1.2K shares" reads as an estimate when it's actually exact.

## The standing disclaimer

`layout/page.tsx`'s `PageDisclaimer` replaced four separately-worded disclaimers that had
drifted from each other across different headers. One sentence, one place: this is
decision support, not an instruction, and the application never places, modifies, or
represents an order. A new screen that needs a disclaimer reuses `PageDisclaimer` — it
does not write its own wording.
