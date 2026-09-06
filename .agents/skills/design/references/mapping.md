# Concept mapping

What a brokerage-app concept becomes in this product. Use this table when a pattern
worth borrowing (see `patterns.md`) is attached to a concept this product doesn't have
(see `exclusions.md`) — translate the concept, keep the layout idea.

| Brokerage-app concept | This product's equivalent |
|---|---|
| Holdings summary card (total value, day P&L) | Watchlist summary tile — mover count, signal count, no monetary value. Confirmed against Groww's actual Holdings page and its dashboard "Your investments" card (2026-08-29 screenshots) — same card position/visual treatment (big number, returns-style rows), stats swapped for watchlist ones. |
| Buy/Sell order-entry panel (tabs, Qty, Price Limit, Buy button — see Groww's stock-detail right rail) | Same visual slot, reinterpreted as a signal panel: BUY/SELL tabs → direction badge (`SignalBadge`), Qty/Price inputs → entry zone/target/invalidation levels, the Buy/"Add money" button → a "Why this signal?" link into the factor breakdown. Confirmed 2026-08-29 against a real screenshot of that exact panel. |
| Order pad / order entry form | Does not exist |
| Portfolio P&L (₹) | Paper-trade performance panel — results in R, with margin of error, per `CLAUDE.md`'s `/signals/performance` rule |
| Order history / order book | Signal history and paper-trade history — what the engine detected and how it resolved, not what the user did |
| "Your holdings" list | The active watchlist(s) |
| Explore / Discover tab (curated buy ideas) | Screener results / signal feed (setups worth attention, not buy ideas) |
| Watchlist | Watchlist — direct reuse, no translation needed |
| Alerts (price, SIP, order-filled) | Alerts scoped to price, % movement, and signal/setup events only — never an order-lifecycle alert |
