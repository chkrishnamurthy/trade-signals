---
name: My holdings
status: draft
horizon: next
created: 2026-10-05
updated: 2026-10-05
area: [web, db, core, worker]
phases_total: 7
phases_done: 0
phase_names: [Decision + rule change, Pure calculation, Table + repository, API, Page, Quotes + corporate actions, Privacy + verification]
summary: A page where a signed-in user types the stocks they own, their shares and average cost, and sees current value and unrealised gain or loss. Typed by hand, never fetched from a broker, no order of any kind.
owner: krishna
blocked_by: [owner decision A/B in §1]
---

# My holdings — plan

**Status: draft, waiting on one owner decision (§1).** Nothing here is built.

## 0. In one paragraph

A watchlist answers "what am I following?". This page answers "what do I own, and how is it
doing?". The user **types** each holding — stock, number of shares, average buying cost —
and the app shows today's value and the unrealised gain or loss, from prices it already
fetches. There is no broker connection, no import from a broker, no buy or sell control, and
nothing that looks like an order. It is a notebook with arithmetic.

## 1. The decision this plan needs

`CLAUDE.md` currently forbids this: *"Do not build order execution of any kind — no
place/modify/cancel order, order book, positions, funds, holdings, or broker portfolio. Not
even read-only."* That rule exists to keep the product from becoming a broker. A hand-typed
list is not that, but it is inside the letter of the rule, so the owner decides.

| Option | What it means | Recommendation |
| --- | --- | --- |
| **A — keep the rule** | No holdings page. | Choose if the product should stay a research tool. |
| **B — allow typed holdings** (this plan) | Rule narrowed to: *broker-fetched holdings and any order feature stay banned; holdings the user types themselves are allowed.* | **Recommended** if daily return visits matter. |
| **C — extra columns on the watchlist** | Optional "shares" and "average cost" per watchlist row, with gain/loss columns. No new page. | Cheaper, but mixes "watching" with "owning". |

**Defaults this plan assumes, change any of them:** separate page named **My holdings**
(never "portfolio": paper trading already uses that word, and the rule bans "broker
portfolio"); gain and loss included; CSV import later, not in v1.

## 2. What the user sees

- Sidebar: **My holdings**, directly under *My watchlists*.
- Four summary tiles: **Current value**, **Invested**, **Unrealised gain or loss** (₹ and %),
  **Today's change**.
- A table: Stock · Shares · Average cost · Last price · Value · Gain or loss (₹, %) ·
  Share of total · Today's change. Sorted by value. Each row opens the stock page.
- **Add holding** opens a sheet: search a stock, enter shares, enter average cost, save.
  Edit and remove are on each row.
- Phone: the table becomes a list of cards (stock, value, gain or loss), with the rest on tap.
- Honest states: *Last price as of 15:30 IST* when markets are closed; *Prices delayed* when
  the quote cache is stale; a dash, never zero, for a stock with no price.
- A permanent line: *"Figures are the ones you entered. Gain or loss is before brokerage,
  taxes and charges. Not advice."*

**Words to use:** shares you own · average cost · value · unrealised gain or loss.
**Words never to use** (`CLAUDE.md`): position, quantity, order, entry price. No "buy more", no
"sell", no button shaped like an order.

## 3. Data model

New table `holdings`, migration `0040_holdings`:

| Column | Type | Rule |
| --- | --- | --- |
| `id` | integer identity | primary key |
| `owner_id` | integer | FK to `auth_users`, **on delete cascade** (account deletion removes it) |
| `instrument_id` | integer | FK to `instruments`, on delete cascade |
| `shares` | integer | `> 0`, at most 1,000,000,000 |
| `avg_cost_paise` | integer | `> 0`. **Integer paise** (hard rule 3). The form takes rupees and converts once, in the component |
| `cost_as_of` | date | the date the user says the cost is as of; defaults to today. Used for corporate-action warnings |
| `created_at`, `updated_at` | timestamptz | UTC (hard rule 6) |

Unique on `(owner_id, instrument_id)`: one row per stock per user. No transactions, lots or
order history in v1 — the user maintains the share count and average cost directly.
At most **200** holdings per user, enforced under an advisory lock like alerts.

Every read and write goes through `repositories/holdings.ts` scoped by `owner_id`, the same
pattern as watchlists and alerts.

## 4. Where the code goes

| Layer | File | Notes |
| --- | --- | --- |
| Pure calculation | `packages/core/src/holdings/summary.ts` | Takes rows plus prices, returns per-row and total value, gain, gain %, weight, day change. No database, no clock (hard rule 1). Hand-computed test fixtures |
| Schema + migration | `packages/db/src/schema/holdings.ts`, `drizzle/0040_holdings.sql` | Add to the static migration tests |
| Repository | `packages/db/src/repositories/holdings.ts` | list, create (with limit), update, delete, all owner-scoped |
| Server | `apps/web/src/server/holdings.ts` | Session check, validation, quote lookup, builds the overview |
| API | `app/api/holdings/route.ts`, `[id]/route.ts` | GET, POST, PATCH, DELETE. CSRF and the route-auth test apply automatically |
| Page + UI | `app/holdings/page.tsx`, `components/holdings/*` | Reuses table, sheet, empty-state and stock-search components; stories for light, dark, phone |
| Navigation | `lib/navigation.ts` | One entry |

### Money rules
Shares and prices are integers; value = shares × last price in paise, which stays below 2⁵³
for any realistic input. Percentages are display-only ratios. Currency is formatted only in
React components, through `formatPaise()`.

## 5. Prices

Holdings read the same `latest_quotes` cache the watchlists read. Two changes:

1. **The worker's list of symbols to refresh must include held stocks.** Today it is built
   from watchlist items only (`listAllWatchedInstruments`). A stock someone holds but does not
   watch would have no cached price. Extend that function to the union of watchlist items and
   holdings.
2. **When no live price exists** (market closed, cache empty) fall back to the last daily
   close, labelled as such. A stock with no price at all shows a dash and is left out of the
   totals; the summary says *"Totals cover 7 of 8 holdings."*

## 6. The corporate-action trap

A user types 100 shares at ₹2,000. The company then splits 1:2. The price halves; the typed
share count does not. Value and gain would be silently wrong by half — the kind of
plausible wrong number this product exists to avoid.

- **v1:** compare `cost_as_of` with `corporate_actions` (splits, bonuses, consolidations,
  which have `ex_date` and `ratio`). If one happened after that date, show a warning on the
  row: *"This company had a split on 14 Oct. Check your shares and average cost."* Dividends do
  not trigger it.
- **v1.1:** a one-click "apply this split" that recomputes shares and cost, writing the new
  `cost_as_of`.

## 7. Privacy and wording

- `/privacy` gains a line: the app stores the holdings you type, tied to your account only,
  deleted with it. It is financial information, so it is also never used for anything else.
- **Export:** the privacy page already promises data export and no export exists. Holdings add
  a **Download CSV** button in v1, which is the first real export.
- The page carries the *"not advice, before charges and taxes"* line. It is not a tax
  statement and never says so.
- No holding appears in any log; the event log records only that a holding was added or
  removed, never the figures.

## 8. Phases

| # | Phase | Output | Rough size |
| --- | --- | --- | --- |
| 0 | Decision + rule change | Owner picks A, B or C. For B: update `CLAUDE.md`, `AGENTS.md` and the nav doc | 30 min |
| 1 | Pure calculation | `core/holdings/summary.ts` with tests | 0.5 day |
| 2 | Table + repository | Schema, migration `0040`, repository, static and database tests | 0.5 day |
| 3 | API | Routes, validation, limit, route-auth coverage, tests | 0.5 day |
| 4 | Page | `/holdings`, add/edit sheet, phone cards, stories (light, dark, phone), nav entry | 1–1.5 days |
| 5 | Quotes + corporate actions | Extend the worker symbol list; day-close fallback; split warning | 0.5 day |
| 6 | Privacy + verification | Privacy text, CSV export, full database suite, browser check at phone and desktop widths in both themes | 0.5 day |

About **4 working days** end to end. Each phase ships independently and phases 1–3 change
nothing a user can see.

## 9. Done when

- A signed-in user can add, edit and remove holdings and sees correct value and gain or loss,
  checked against a hand-calculated example.
- A user cannot see, change or delete another user's holdings (database test).
- Deleting an account deletes its holdings (database test).
- A split after `cost_as_of` shows the warning.
- No wording from the banned list appears on the page (a test greps the component text).
- Light and dark theme, phone and desktop, all checked in a browser.
- Lint, types, the full suite and the route-auth test pass.

## 10. Out of scope (deliberately)

Broker or demat import · any order, "buy more" or "sell" control · transactions, lots, FIFO or
tax-lot accounting · realised gains, tax reports, XIRR · dividends received · mutual funds,
bonds, F&O · sharing a portfolio with other people · alerts created from a holding (a later
shortcut) · holdings visible to admins.

## 11. Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| It looks like advice | Gain/loss next to a stock reads as a verdict | Fixed wording, no signal or direction badge on this page, standing disclaimer |
| Sensitive data | Financial figures are more private than a watchlist | Owner-scoped, cascade delete, not logged, privacy text, no admin view |
| Stale or missing prices | A wrong total is worse than none | "as of" label, delayed notice, totals say how many holdings they cover |
| Splits and bonuses | Silent wrong values | §6 warning in v1, one-click fix in v1.1 |
| Provider data terms | Showing provider prices on a new page | Same prices and same terms as the watchlist, no new redistribution; covered by the open data-terms question in the product review |

## 12. Open questions for the owner

1. **A, B or C?** (§1) — blocks everything.
2. Include gain or loss, or just a list? (assumed: include)
3. CSV import now or later? (assumed: later)
4. Ship to everyone, or admin-only first as with intraday? (assumed: everyone, after the
   privacy text is updated)
