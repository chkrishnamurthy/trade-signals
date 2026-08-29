# What this product does not import from a brokerage app

A retail-investing app's screens are built around holding a position and acting on it.
This product never holds a position and never acts — `CLAUDE.md` bans order execution
outright, in any form, read-only included. Borrowing that app's layout for its
information hierarchy is fine; carrying its transactional purpose into this product is
not. Check every screen against this list, especially a stock detail page, before it ships.

## Never build

- **A sticky Buy/Sell action bar**, or any bottom-anchored action bar shaped like one.
  There is no order button, order ticket, or order-shaped affordance anywhere in this
  product — not disabled, not read-only, not "for display". If a stock detail page needs
  a persistent bottom element, it is a secondary navigation aid (jump to signals, jump to
  chart), never a transaction control.
- **An order pad, order ticket, or quantity/price-entry form** of any kind.
- **A position, holdings, or portfolio-value display.** This product does not know what
  the user owns and never will. A "your holdings" style card has no equivalent here —
  see `references/mapping.md` for what replaces it.
- **An order book / order history list.** Replace with signal history or paper-trade
  history — outcomes the engine recorded, not orders the user placed.

## Language that must not appear

Per `CLAUDE.md`: BUY / SELL may label a signal's *direction* and nothing else. Never
"ORDER", never "ENTRY PRICE" (say "technical entry zone" or "entry level"), never
"position", never "quantity", never "portfolio". An entry or exit level is a technical
price level, labelled as one — not an instruction to act on.

## Numbers that must not appear

- No portfolio P&L in rupees. Paper-trade performance is published in **R** (risk
  multiples), with its margin of error shown alongside every rate, per `CLAUDE.md`'s
  `/signals/performance` rule. A rupee P&L figure implies money changed hands; it didn't.
- No confidence/score number without its factor breakdown rendered alongside it. A score
  the factors can't explain doesn't render, full stop — this is a `CLAUDE.md` hard rule,
  not a style preference.

## Why this matters more than it looks like it should

The visual borrowing in `references/patterns.md` is exactly what makes this exclusion
list easy to violate by accident: once a screen looks like a trading app, it is a short,
unconscious step to start labeling it like one. The check is not "does this look like a
broker's screen" (it's fine if it does) — it's "does this screen imply the application
can act, hold, or transact" (it must never, even in wording).
