# Concept mapping

What a brokerage-app concept becomes in this product. Use this table when a pattern
worth borrowing (see `patterns.md`) is attached to a concept this product doesn't have
(see `exclusions.md`) — translate the concept, keep the layout idea.

| Brokerage-app concept | This product's equivalent |
|---|---|
| Holdings summary card (total value, day P&L) | Watchlist summary tile — mover count, breadth, no monetary value. Confirmed against Groww's actual Holdings page and its dashboard "Your investments" card (2026-08-29 screenshots) — same card position/visual treatment (big number, returns-style rows), stats swapped for watchlist ones. |
| Buy/Sell order-entry panel (tabs, Qty, Price Limit, Buy button — see Groww's stock-detail right rail) | Same visual slot, holding facts instead: the ratio board, "What stands out", key levels such as the 52-week range. No direction badge, no entry/target/stop levels (signals removed 2026-10-17). |
| Order pad / order entry form | Does not exist |
| Portfolio P&L (₹) | The user's own `/portfolio`, valued at the last price — their numbers, never a recommendation |
| Order history / order book | Does not exist (no trades, real or simulated) |
| "Your holdings" list | The active watchlist(s) |
| Explore / Discover tab (curated buy ideas) | Screener results on conditions the user chose — never a curated or ranked list of ideas |
| Watchlist | Watchlist — direct reuse, no translation needed |
| Alerts (price, SIP, order-filled) | Alerts scoped to price, % movement and indicator conditions — never an order-lifecycle alert |
