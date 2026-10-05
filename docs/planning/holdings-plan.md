# My holdings: plan, research and mockups

> Planning only. No application code is changed by this document. Written 5 Oct 2026. Companion artifact page has the live mockups.

**Status:** draft, awaiting owner decisions (see Part 5). Supersedes the earlier four-tier plan.

## 0. Rules check first

A holdings page touches three of our own rules. None of them is a blocker if the page is built as “you type it or upload it”, but one rule in CLAUDE.md has to be changed by you before any code is written.


### Where the feature collides with what we already decided

| Source | What it says | Collision with a holdings page | Severity |
|---|---|---|---|
| `CLAUDE.md` → Do not | “Do not build order execution of any kind — no place/modify/cancel order, order book, positions, funds, holdings, or broker portfolio. Not even read-only.” | Direct. A page called “My holdings” is the word the rule bans. The rule was written to stop a broker-connected portfolio. It does not say anything about shares the user types in, but its wording covers both. | **Blocking** until you edit the rule |
| `CLAUDE.md` → BUY / SELL bullet | BUY/SELL may only label a signal’s direction. “Never ‘position’, never ‘quantity’, never ‘ORDER’.” | A ledger needs a number of shares and a direction of change. Using “Buy”, “Sell”, “Quantity” or “Position” in the ledger breaks the rule. We use “Added shares”, “Removed shares”, “Number of shares”, “Holding”. | **Wording only**, solved by a word list |
| `CLAUDE.md` → Hard rule 3 (integer paise) | All prices are integer paise. | Compatible. Every price, cost, charge and dividend is stored as integer paise. Ratios such as XIRR are not money and may be decimals. Average cost is never stored: it is total cost ÷ shares, computed on read. | None |
| `CLAUDE.md` → Hard rule 5 (never mutate price history) | No UPDATE on `candles`. Corporate actions are rows applied on read. | Compatible. The user’s own entries are user data, not price history, and may be edited. Splits and bonuses are applied on read from `corporate_actions`, never written into the user’s rows. | None |
| `CLAUDE.md` → Deployed publicly, per-user accounts | Each user owns their own data. | Holdings are the most sensitive data the app would hold. They need owner-scoped repositories, no admin view and a delete-all. | Design requirement |
| Product review §3.3 | A holdings view “conflicts with CLAUDE.md”, and the rule is “too strict for user-typed” entries. | We agreed the rule is too strict for typed or uploaded data and right for anything fetched from a broker. | Resolved by the compliant version below |
| Product review §4.7 (SEBI) | Paid signals can look like investment advice and need research-analyst registration. | The Investment Advisers Regulations define advice to include “advice on investment portfolio”. A page that says “reduce ITC” or “you are over-exposed, rebalance” is portfolio advice. A page that says “ITC is 18.7% of your value” is a description. | **Compliance line**: describe, never recommend |
| Product review §4.8 (data licence) | Fyers and Dhan API terms are not a licence to redistribute data. | Showing a signed-in user’s own shares valued at the last price is the same use as the watchlist. Benchmark index levels (Nifty 50, Nifty 500) may need NSE Indices terms checked before they appear on a public product. | Check terms for index data |
| Product review §4.9 (NSE data policy) | Logged-in only, `noindex`. | Same as today. The holdings page is signed-in only and never indexed. | None |
| Product review “Later” list | Portfolio import via broker OAuth (Zerodha Kite Connect). | Stays **out**. That is the one thing the old rule was written to stop. | Stay banned |
| India’s DPDP Act and Rules (2025) | Notice that lists the data and the purpose; security; rights to see and erase. | Core duties apply from 13 May 2027, but holdings is a clear case for writing the notice now. | Plan for it |


### The compliant version we recommend

- **Entry:** typed by hand, or uploaded as a CSV/XLSX file the user chooses. Nothing is fetched from a broker.
- **No broker link of any kind:** no login, no Kite Connect, no Account Aggregator consent flow in this scope.
- **No order surface:** no buy, sell, order, basket, rebalance or “execute” affordance, and no price alert phrased as a trade.
- **No advice:** every sentence describes the user’s own numbers. No “you should”, no rating, no target, no score without its parts.
- **Private by construction:** owner-scoped queries, never logged, not visible to admins, deleted with the account.


### Exact CLAUDE.md changes, for you to approve

> **Your decision.** None of this is applied. I have not edited `CLAUDE.md`. If you approve, these are the edits I would make before the first line of holdings code.

**Edit 1 — narrow the ban, keep the intent**

```
REPLACE, in "Do not":
- **Do not build order execution of any kind** — no place/modify/cancel order, order
  book, positions, funds, holdings, or broker portfolio. Not even read-only

WITH:
- **Do not build order execution of any kind** — no place/modify/cancel order, order
  book, funds, or broker portfolio. Nothing is ever fetched from a broker account.
  Holdings the user types in or uploads themselves ARE allowed (see "My holdings").
```

**Edit 2 — a word list**

```
ADD, after the BUY/SELL bullet:
- **Holdings vocabulary.** On the holdings page use "Added shares" / "Removed shares"
  (tax view: "Acquired" / "Disposed"), "Number of shares", "Holding", "Average cost".
  Never "Buy", "Sell", "Position", "Quantity", "Order", "Execute", "Rebalance",
  "Recommended", "Underweight", "Overweight". A sentence about a holding states a fact
  about the user's own numbers; it never tells them what to do.
```

**Edit 3 — a data-handling rule**

```
ADD, under "Hard rules":
9. **Holdings are private.** Every query is scoped by user_id in the repository layer.
   Holdings, quantities and cost are never written to logs, the event log, analytics,
   error reports or URLs. No admin screen shows them. Account deletion cascades.
   Uploaded files are parsed and discarded; only the reviewed rows are stored.
```

**Edit 4 — scope line (at ship time, not now)**

```
UPDATE, "Current scope" paragraph — when the page ships:
"/holdings — a hand-typed or file-imported record of the user's own shares, valued at
the last close. Never connected to a broker. Not advice."
```

Also needed from you, outside CLAUDE.md: a lawyer’s read of the privacy notice and the wording list, because the SEBI line between “describing” and “advising” is a legal judgement, not a coding one.


## 1. Research: what the best portfolio pages do

Twelve products studied on 5 Oct 2026 from their own help pages, product pages, forum threads, review sites and search snippets. Evidence quality is tagged on every card because it is uneven.

> **What I could and could not reach.** App-store review pages and Reddit would not load through my tools. “What users love” and “what confuses them” therefore come from vendor docs, review sites, forum threads and snippets. Treat it as directional, not a survey. Cards tagged **snippet** rest on search-result summaries only and need a live check before we copy anything.

#### Zerodha Console (evidence: docs + forums)

**Loved**
- Analytics tab: yearly return (XIRR) against Nifty 50 and Midcap 150, dividends, top contributors, a timeline and red flags.
- Free, trusted, comes from the broker’s own books.

**Confusing**
- XIRR shows “–” when most money is under a year, with no explanation on the number itself.
- The page itself warns XIRR “is less suited for short-term investments”. Users build their own XIRR sheets and report Console and Kite P&L not matching.

**Borrow**
- Show “not enough history” in words, not a dash.
- Contributors list, benchmark pair and a dividends line.
- Tradebook CSV as the first import: symbol, isin, trade_date, exchange, segment, trade_type, quantity, price, trade_id, order_id, order_execution_time. The ISIN is sometimes missing.


#### Groww (evidence: docs)

**Loved**
- Value over time against money invested; sector and market-cap split; XIRR; Nifty 50 comparison.
- “Stocks Track” reads other brokers through the RBI Account Aggregator: consent-based, no credentials, daily sync.

**Confusing**
- Allocation excludes ETFs, so totals look wrong. Sync is per broker, with a segregation toggle people miss.

**Borrow**
- Value-vs-invested chart as the main picture.
- Say plainly what is excluded from each chart.


#### INDmoney (evidence: docs)

**Loved**
- Tracks holdings from any broker, family consolidation, top gainers, dividends, sector and cap split.

**Confusing**
- A mix of stocks, funds, US stocks and loans on one screen makes totals hard to trust.

**Borrow**
- Dividend list. Skip family view and cross-asset totals.


#### Tickertape (evidence: review sites)

**Loved**
- Diversification and overlap insights, returns tracking, 12+ brokers.

**Confusing**
- Basic things behind a paywall, delayed data, one-broker sync limits. A combined XIRR across linked demat accounts is reported as missing.

**Borrow**
- A small “how diversified” summary. Keep it free and show the working.


#### Kuvera (evidence: snippet)

**Loved**
- Allocation, XIRR, peer comparison, import from brokers or CDSL/NSDL statements.

**Confusing**
- Not verified.

**Borrow**
- Consolidated statement (CAS) import as a later tier, after checking real files.


#### Value Research (evidence: snippet)

**Loved**
- Free portfolio manager; mutual-fund statement import; historical dividends loaded from the purchase date; alerts for dividends, bonus, merger, demerger.

**Confusing**
- Not verified.

**Borrow**
- Auto-load dividends from the buy date. Corporate-action alerts, worded as notices.


#### Sharesight (evidence: vendor docs)

**Loved**
- Separate Performance, Diversity, Contribution, Tax and Future Income reports. Clear method pages.

**Confusing**
- Money-weighted return uses the Modified Dietz method. Returns under a year are holding-period returns, not annualised. Their docs admit large cash-flow changes can distort the figure.

**Borrow**
- Never annualise under 12 months. Say which method is used on the page. One report per question.


#### Snowball Analytics (evidence: vendor pages)

**Loved**
- Dividend calendar and forward income; beta, Sharpe, Sortino; clean charts.

**Confusing**
- US-first. Free tier caps at 10 holdings.

**Borrow**
- Dividend calendar. **Do not copy one-click rebalancing:** it is an order-shaped affordance and advice.


#### Portfolio Visualizer (evidence: snippet)

**Loved**
- Precise definitions: maximum drawdown, volatility, beta, correlation, Sharpe, Sortino, Calmar, risk contribution.

**Confusing**
- Dense for beginners; many inputs.

**Borrow**
- The definitions, as one-line plain-language tooltips. Show only three risk numbers by default.


#### Morningstar X-Ray (evidence: snippet)

**Loved**
- Diversification by region, sector and style; overlap between holdings.

**Confusing**
- Style boxes and jargon.

**Borrow**
- One chart for “where the money sits”. Skip style boxes.


#### Delta (evidence: review sites)

**Loved**
- Praised for clear, attractive graphs and a calm layout.

**Confusing**
- Crypto-first, so Indian equity concepts (ex-dividend, STCG) are absent.

**Borrow**
- Graph polish and a quiet, uncluttered overview.


#### Yahoo Finance (evidence: help pages)

**Loved**
- Quick to start, free, familiar.

**Confusing**
- Returns are price-only: no automatic dividends or corporate actions, no date-range performance, benchmarking behind a paywall.

**Borrow**
- A warning of what is not included in a number.


### What the field teaches us

- **The cold-start problem decides everything.** Every winner either reads the broker for you or accepts a file. A page that only offers a blank form will be abandoned. We cannot read brokers, so file import is a launch requirement, not a nice-to-have.
- **Trust is lost on the number that looks wrong**: XIRR on a young portfolio, P&L that disagrees with the broker, allocation that silently excludes something. Each number should say what it includes and what it leaves out.
- **Method must be visible**: time-weighted or money-weighted, price-only or with dividends. Sharesight is trusted partly because it says so.
- **Advice-shaped features are the risk**: rebalancing buttons, “sell the worst performer”, target weights. Describe only.


### Metrics in plain words

| Measure | In plain words | How it is worked out | Watch out for |
|---|---|---|---|
| Total P&L (unrealised) | What your current shares are worth now, minus what you paid for them. | `Σ shares × last price − Σ cost` | Leaves out dividends and shares already sold. |
| Day P&L | How much your holdings gained or lost since yesterday’s close. | `Σ shares × (last − previous close)` | On a day you added shares, only count shares held at the previous close. |
| Absolute return | Gain divided by money put in. Ignores time. | `(value + sold + dividends − invested) ÷ invested` | Good for short spans. Misleading to compare a 6-month and a 6-year figure. |
| XIRR | The single steady yearly rate that explains all your dated deposits and withdrawals. | Solve `Σ cash flow ÷ (1+r)^(days÷365) = 0` for r, with a bracketed solver. | One day’s gain annualises to nonsense. Several answers can exist. Show “not enough history” under 12 months. |
| Time-weighted return | How the holdings themselves performed, ignoring when you added money. | Chain daily returns after removing flows. | Used for the benchmark chart and risk. Differs from XIRR on purpose. |
| Nifty 50 / Nifty 500 comparison | What the same money would have done in the index on the same dates. | Replay every flow into the index, then run the same XIRR. | Price-index only unless we license total-return data (dividends missing makes the index look worse). |
| Sector allocation | How much of your value sits in each line of business. | `Σ value by instrument industry ÷ total` | Needs a clean sector mapping per stock. |
| Market-cap split | Large, mid, small companies by size. | SEBI/AMFI list: top 100 large, 101–250 mid, rest small, refreshed each Jan/Jul. Proxy: index membership. | The AMFI page would not load for me, so its format is unverified. Index membership is only an approximation. |
| Concentration | How much depends on your biggest few names. | Top 1, 3, 5 weights; effective number of holdings `1 ÷ Σ weight²`. | A summary of fact. Never a “too concentrated” verdict. |
| Drawdown | The biggest fall from a high point to the next low. | `value ÷ running peak − 1`, flows removed. | Needs a time-weighted series, not raw value. |
| Volatility | How much your value bounces around in a year. | `stdev(daily returns) × √252` | Needs at least ~6 months to mean much. |
| Beta | How strongly you move with Nifty 50. | `cov(you, index) ÷ var(index)` | Only says what happened, not what will. |
| Correlation | Whether two stocks tend to move on the same days. | Pearson on daily returns, −1 to 1. | Print the number in the cell. |
| Dividend income | Cash paid to you by companies you held on the ex-date. | `shares held on ex-date × dividend per share` | Use the date you held them, not today’s count. |
| Realised vs unrealised | Realised: you sold and locked it in. Unrealised: still on paper. | Oldest-first matching of sales to purchases. | Realised is what taxes look at. |


### Indian tax views (FY 2025-26 rates, to be checked each year)

| Topic | Rule as I read it | Confidence |
|---|---|---|
| Holding period | Listed shares are long term when held **more than 12 months**; otherwise short term. | High |
| Rates | Short-term gain 20%. Long-term gain 12.5% on the part above ₹1.25 lakh in the year. Plus 4% cess. Surcharge applies to these gains but is capped at 15%. | High (mProfit summary of the Budget 2024 change; verify against the Income Tax Act) |
| Set-off | A short-term loss can offset short- and long-term gains. A long-term loss offsets only long-term gains. Carry forward up to 8 years, only if the return is filed on time. | High |
| Grandfathering (s.112A) | For shares bought before 1 Feb 2018, cost is the larger of the actual cost and the lower of the 31 Jan 2018 market value and the sale price. | High; FMV per share must come from a published list |
| Bonus shares | Cost is zero. Holding period runs from the day the bonus shares are allotted. | High |
| Demerger | Original cost is shared between the old and new company in the ratio of net book value (s.49(2C)); companies publish the percentage. | Medium: needs the company’s notice each time |
| IPO shares | Cost is the allotment price; holding period runs from the allotment credit date. | High |
| Dividends | Taxed at the person’s slab rate. 10% TDS only above ₹10,000 from one company in the year. | High |
| Intraday | Generally business income, not capital gains. | To verify with a CA. We exclude it and say so. |
| Which shares are sold first | Oldest first (FIFO) for demat holdings. | To verify with a CA |

> **Not tax advice.** The tax page labels every figure “indicative”, shows its rate assumptions in plain sight and offers an export for the user’s accountant.


### Sources (accessed 5 Oct 2026)

- Zerodha Console help (Analytics, XIRR, Holdings report, tradebook format) and Zerodha Z-Connect forum threads on XIRR and P&L mismatches.
- Groww help pages (Stocks Track, portfolio analysis) and RBI Account Aggregator framework notes.
- INDmoney, Tickertape, Kuvera and Value Research product and help pages; Tickertape reviews on aggregator review sites. Kuvera and Value Research are snippet-level.
- Sharesight support pages on performance calculation (Modified Dietz) and report types.
- Snowball Analytics product pages and pricing; Portfolio Visualizer metric definitions (snippet-level); Morningstar X-Ray description (snippet-level); Delta app pages; Yahoo Finance help on portfolios.
- mProfit, Zerodha Varsity and the Income Tax Department material on STCG/LTCG, set-off, section 112A and section 49(2C).
- SEBI (Investment Advisers) Regulations 2013, reg. 2(1)(l); DPDP Rules 2025 (notified 14 Nov 2025).
- SEBI/AMFI half-yearly market-cap categorisation (page did not load; format unverified). NSE Indices total-return data (terms not yet checked).


## 2. The plan

Who it is for, what to build first, where the data comes from, what we already have, and what could make it fail.


### Who it is for

|  | The beginner | The active investor |
|---|---|---|
| Their question | “Am I doing okay? Is my money safe in a few names?” | “What did I earn after tax? Which stock drove it? Am I beating Nifty?” |
| What they need | One page, big numbers, plain words, no jargon. | Dated entries, lots, XIRR, tax export, import from a broker file. |
| What loses them | Blank screens, “XIRR”, red and green only, 20 columns. | A number that disagrees with the broker, no import, nothing to export. |
| How the page serves both | Overview and plain-words tooltips first. | Everything else one tap deeper, never hidden. |


### Phases, MVP first

| Phase | What ships | Effort | Needs |
|---|---|---|---|
| 0 · Decide | CLAUDE.md edits approved, privacy notice drafted, 3–5 real broker sample files collected, index-data terms checked. | **S** | You |
| 1 · **MVP** | Add and edit shares by hand; **file import (generic CSV/XLSX plus Zerodha tradebook)** with a review step; overview (value, total gain, day change); holdings table; split/bonus prompt; lite drill-down; CSV export; empty state; privacy text; delete-all. | **L** | Phase 0, migration `0040` |
| 2 · Insight | Sector and size split, concentration, treemap, contributors, upcoming dividends and corporate actions on your holdings. | **M** | Sector and cap mapping |
| 3 · Ledger and returns | Dated entries as lots, yearly return (XIRR), “not enough history” states, realised vs unrealised, dividends received, value over time. | **L** | Corporate-action engine |
| 4 · Benchmark and tax | Same-money Nifty 50/500 comparison, FY tax view with grandfathering, accountant export. | **M–L** | Index series, FMV 31 Jan 2018 list |
| 5 · Risk | Volatility, beta, deepest fall, correlation, with plain-words tooltips. | **M** | ≥ 6 months of history |
| 6 · Later | Statement (CAS) and contract-note import, alerts on holdings, tax-lot reports. Account Aggregator **only** if regulation and cost allow; it is the old broker-link question in a new form. | **L each** | Separate decision |

> **Recommended MVP = Phase 1 only.** The research says the page lives or dies on how fast a user gets their real shares in. So the MVP is thin on analytics and heavy on import and trust. Phase 2 follows as soon as people use it.


### Data


### How shares get in

- **Typed:** stock, number of shares, price, date, optional charges. An “I owned these before I started tracking” switch accepts an average cost and an optional date.
- **File upload (MVP):** generic CSV/XLSX with column mapping, plus a Zerodha tradebook template. Rows are checked and shown with Ready / Check / Skipped status. Nothing is saved until the user presses Import. The file is discarded after parsing.
- **Zerodha holdings report:** an `.xlsx` since April 2017, but its column names are not published, so no template until we have real files.
- **Later:** consolidated account statement (CAS) and contract notes. **Not planned:** broker login, Kite Connect, Account Aggregator.


### One data model for every phase

**Proposed migration 0040_holdings (not written)**

```
holding_entries   (id, user_id, instrument_id, kind: 'opening' | 'add' | 'remove',
                   trade_date, shares int, price_paise bigint, charges_paise bigint,
                   source: 'manual' | 'file', import_batch_id, note, created_at)
import_batches    (id, user_id, filename_hash, row_count, created_at)   -- no file kept
holding_prefs     (user_id, columns, default_benchmark)                 -- later
-- shares and cost per holding are DERIVED on read: Σ entries, adjusted by corporate_actions
-- average cost is never stored; every price is integer paise (hard rule 3)
```

Because the MVP already stores dated entries, Phases 3–5 add no migration. The “opening balance” kind covers people who only know a total and an average.


### Corporate actions and edge cases

| Case | What happens to the user’s entries | MVP? |
|---|---|---|
| Stock split | Shares multiply, cost per share divides, total cost unchanged. Applied on read from `corporate_actions`. | Yes (prompt + apply) |
| Bonus | Shares increase, total cost unchanged; for tax the bonus lot has zero cost and its own acquisition date. | Yes |
| Demerger | Cost is split by the company’s published percentage. A notice asks the user to confirm; we do not guess. | Prompt only |
| Merger or amalgamation | Shares convert at the exchange ratio; needs a manual confirmation. | Prompt only |
| Rights issue | Treated as an ordinary addition at the rights price, entered by the user. | Manual |
| Buyback | Entered as removed shares at the buyback price, user-confirmed. | Manual |
| Symbol or ISIN change | Entries follow the instrument through the alias table. | Phase 2 |
| Delisting | Holding stays, last price shown with “delisted on …”, value flagged as stale. | Phase 2 |
| IPO allotment | Entered as an addition at the allotment price on the allotment date; listing price is irrelevant to cost. | Yes (tip in form) |
| Entered before the stock existed | Entry refused with a clear message. | Yes |
| Selling more than held | Refused with the date it first goes negative. | Yes |
| Duplicate import | Skipped by trade id, or by exact match on stock, date, shares, price. | Yes |
| ISIN missing in file | Matched by symbol and flagged Check. | Yes |
| Intraday and F&O rows | Skipped with a reason shown. | Yes |


### Price source and refresh

- Valued at the latest close from the existing `latest_quotes` cache; end-of-day candles as fallback. Every screen shows the time of the price.
- The worker’s symbol union must include every stock held by any user. That is a **small worker change** and it is the one place holdings touch the hot path.
- Refresh stays at market-data cadence. No new polling, no new provider.
- Stale or missing price → the value says “as of 4 Oct” and a banner says why. A number is never silently old.


### What we already have and will reuse

| Existing piece | Use in holdings |
|---|---|
| Integer paise and `formatPaise()` | Every amount. |
| `latest_quotes`, daily candles | Valuation, day change, sparklines. |
| `corporate_actions` (kind, ex_date, ratio) | Split and bonus adjustment on read; prompts for the rest. |
| `dividends` (ex_date, kind, amountPaise) | Dividends received; upcoming ex-dates. |
| `instruments.industry`, index membership files | Sector and size split (index membership as a proxy). |
| Screener snapshot (~95 metrics, including volatility) | Per-holding facts on the drill-down. |
| Stock page, calendar events, announcements | “From the stock page” and “Coming up” on a holding. |
| Watchlist add flow and `/api/search` | Stock picker in the add form. |
| Route-auth test, CSRF layer, rate limiter | New routes slot into the same guards and tests. |
| Event log | Log counts and error codes only, never figures. |
| Alerts v1 | Later: dividend or price-level notices on held names. |


### Privacy and per-user isolation

- Every repository function takes `userId` and filters by it. The route-auth test gains a case that proves user A cannot read user B’s entries.
- No admin page, export or support tool shows holdings. Admin sees counts of entries only.
- Holdings never appear in logs, the event log, analytics, error reports or URLs (CLAUDE.md edit 3).
- Uploaded files are parsed in memory and discarded. A hash of the filename is kept for duplicate detection only.
- Delete-all and account deletion remove entries and batches at once.
- Privacy page updated to name the data, the purpose and the rights, ahead of the DPDP duties in May 2027.
- Usage measurement counts events (“opened page”, “imported file”) with no figures and no stock names.


### Risks, open questions, and what would make it fail

| Risk | Why it matters | Mitigation |
|---|---|---|
| Cold start: nobody types 30 trades | The single most likely failure. | File import in the MVP; real sample files before building. |
| Numbers differ from the broker | One mismatch ends trust. | Say what each number includes; show the entries behind it; allow charges. |
| Advice by accident | SEBI line. | Word list, lawyer review, no verdict language, tests that scan strings for banned words. |
| Wrong corporate-action adjustment | Silently wrong cost. | Prompt, never auto-apply demergers or mergers; show a before/after. |
| Index data licence | Benchmark may not be free to show. | Check NSE Indices terms; fall back to a plain price index with a label. |
| Privacy incident | Holdings are the most sensitive data we would hold. | Owner-scoped queries, tests, no logging of figures, delete-all. |
| Cap-size list unverified | Wrong large/mid/small label. | Use index membership, label it “by index”, switch when the AMFI list is confirmed. |
| Low use after launch | Cost without value. | Count opens, imports and returns after 30 days; decide at a set date. |

**Open questions.** Which brokers do your first users actually use? Is the Zerodha holdings `.xlsx` stable? May we show Nifty 50 and Nifty 500 total-return levels? Do you want P&L shown at all on a public product, or only allocation? Who reviews the wording?


## 3. The experience

Simple first, deep on request. A new user should get “how am I doing, why, and what needs attention” within five seconds.

- **Three questions, three cards, in that order.** How am I doing (value, total gain, yearly return). Why (what moved it). What needs attention (plain facts about your list).
- **Progressive disclosure.** Overview → holdings table → one holding → allocation → returns → tax. Each level is one tap from the one above.
- **Every metric explains itself twice:** one plain sentence under it, plus an info tooltip with the longer version and the method.
- **Charts, each earning its place:** value over time against cost and Nifty; allocation treemap plus two donuts; contribution bars; drawdown; correlation heatmap with the number in every cell; dividends by quarter.
- **Colour is never the only signal.** Gains and losses carry ▲ ▼ and a sign. Chart series differ by line style as well as hue. Categorical colours are a colour-blind-safe set.
- **Mobile first.** Cards instead of wide tables, bottom navigation, no horizontal scrolling of the page, 44 px touch targets.
- **Light and dark** with the same contrast care. Tokens only, no one-theme literals.
- **States are designed:** empty, loading skeleton, late prices, could not load, not enough history.
- **Neutral tone.** No buy or sell language, no rating, no score without its parts. See the word list in Part 0.
- **Accessible:** every chart has a title and text alternative; tooltips open by focus as well as hover; tables are real tables.

| Say | Never say |
|---|---|
| Added shares, Removed shares | Buy, Sell, Position, Order |
| Number of shares, Holding, Average cost | Quantity, Entry price |
| ITC is 18.7% of your value | You are overexposed to ITC |
| Zen Technologies is 26.6% below your average cost | Consider exiting Zen Technologies |
| Same money in Nifty 50 would be worth ₹11,91,435 | You are underperforming |
| Indicative tax | Tax payable |


## 4. Mockups

Eight screens, each at desktop and phone width, in light and dark. The live versions are in the published artifact page. All figures below are **synthetic sample data** (a made-up ledger of 9 holdings and 5 sold stocks, 1 Oct 2024 to 5 Oct 2026).

1. **Overview.** The answer in five seconds: how you are doing, why, and what needs attention. Everything else is one tap down.
2. **Holdings table.** Every stock you hold, sortable and filterable. Desktop gets the full table; phone gets cards that keep the three numbers that matter.
3. **One holding.** Your own numbers for one stock, each purchase on its own line, with the stock page facts alongside.
4. **Allocation and risk.** Where the money sits and how bumpy the ride has been. Each risk number comes with a sentence in plain words.
5. **Returns vs benchmark.** Two honest yearly figures side by side, a like-for-like Nifty comparison, contribution by stock and dividends.
6. **Realised gains and tax.** What you sold, whether it counted as short or long term, grandfathering shown line by line. Indicative only.
7. **Add or import.** Type one entry or upload a file. Nothing is saved until you have seen every row and its status.
8. **Empty and other states.** First visit, loading, late prices, errors and too little history.

Sample portfolio, as shown in the mocks: value ₹11,24,665; invested ₹9,25,922; total gain +21.46%; yearly return (XIRR) 12.6% against 14.8% for the same money in Nifty 50; volatility 12.7%; beta 0.90; deepest fall −13.1%; effective holdings 7.9 of 9.

## 5. Summary


### Recommended MVP

Phase 1 only: add and edit shares, **file import with a review step**, a three-question overview, a holdings table, split and bonus prompts, a lite drill-down, CSV export, an empty state, a privacy page and delete-all. Effort **L**. No benchmark, tax or risk yet.


### Decisions you need to make

1. Approve (or change) the four CLAUDE.md edits in Part 0. Nothing starts without this.
2. Confirm the line: typed and uploaded data only, no broker link, now or later. Account Aggregator stays a separate future decision.
3. Show profit and loss at all, or allocation only? Showing it is what users expect; it also raises more privacy weight.
4. Benchmark data: confirm we may show Nifty 50 and Nifty 500, and whether to license total-return levels.
5. Market-cap labels: accept index membership as a proxy for now, or wait for the AMFI list.
6. Who reviews the wording and the privacy notice for the SEBI “describe, don’t advise” line.
7. Send 3–5 real broker files (Zerodha tradebook and holdings report, one other broker) with names and amounts blanked.
8. How to measure success: for example, 30-day return rate of users who imported a file.


### Suggested next step

Say yes or no to the four CLAUDE.md edits and send two sample broker files. With those, I can write the migration `0040_holdings`, the import parser and its tests first, and leave screens for after the import works on real data.



## Addendum (2026-10-05): merged analysis hub

Screens 4 to 8 of the mockups are combined into one page, `/holdings/analysis`: a pinned summary strip (value, total gain, yearly return vs Nifty 50, dividends, indicative tax), four tabs (Allocation, Returns, Risk, Tax), and one add-or-import drawer (right side on desktop, bottom sheet on phone) reachable from every tab. With no shares the strip and tabs are replaced by the onboarding view; "Preview with sample data" fills the page.

Tabs unlock with data, not payment: Allocation needs shares and prices; Returns needs dated entries; Risk needs about 6 months; Tax needs at least one removed-shares entry. A tab that cannot show a number says why.

Build mapping: Phase 1 ships the drawer, empty state and a one-tab hub (strip + Allocation); Phase 2 completes Allocation; Phases 3 and 4 turn on Returns and Tax; Phase 5 turns on Risk. Interactive mockup: the "Holdings Analysis Hub" artifact.

## Build status (2026-10-05)

**Phase 0 done:** the owner approved the `CLAUDE.md` edits (applied to `CLAUDE.md` and `AGENTS.md`), kept the work on `main`, chose the route `/portfolio` (not `/holdings`), shows profit and loss, and made the page visible to every signed-in user. A real broker holdings file (a three-stock export) was supplied.

**Phase 1 slice built:**

- `packages/core/src/portfolio`: exact rupee-to-paise parsing, CSV reader, file recognition (holdings snapshot and trade list), share and cost derivation by average cost with splits and bonuses applied on read, and valuation. 22 tests.
- `packages/db`: `holding_entries` (migration `0040_portfolio`), an owner-scoped repository with an all-or-nothing validation hook, replace-on-snapshot and trade-id de-duplication. 11 tests on a real Postgres. The worker's quote refresh now also prices held stocks.
- `apps/web`: `/portfolio`, `/api/portfolio` (+ `entries`, `import`), nav entry, privacy text, a vocabulary test that scans the page's wording for banned words.

**Differences from the plan, and why:**

- The row stores a **total amount in paise**, not a per-share price. Brokers round the average cost they print; the invested total is exact (3,290 shares at a printed ₹16.53 is really ₹54,389.19).
- A holdings snapshot is stored as an **opening** entry dated the day it is uploaded, and uploading a fresh snapshot **replaces** the entries for those stocks. A trade list adds dated entries and skips repeats by trade id.
- Excel files are not read yet; the upload says to save as CSV. Only Zerodha's holdings export has been seen; the trade-list reader follows the published tradebook columns but has not been run on a real file.
- Not yet built: lite single-holding page, the pinned-strip analysis hub, allocation charts, returns, tax and risk tabs (Phases 2 to 5).

### Phase 1 completion (2026-10-05)

Built since the first slice: **edit an entry** (date, shares, total amount; the stock and kind stay), the **single-holding page** `/portfolio/[symbol]` (value, today, gain, paid, 52-week range, share of portfolio, every entry with edit and delete, link to the stock page), **loading and error states**, and a **fallback price**: a holding the live-quote cache has not reached is valued at its last stored daily close, labelled "close of <date>".

Then, on the owner's go-ahead:

- **Excel upload (.xlsx)**, read in the browser with `read-excel-file` (numbers kept as the text Excel stored, so paise stay exact) and turned into the same CSV the server already parses. The parser now finds the table below a title block, and the first sheet with a recognisable table is used. Old `.xls` files are refused with a plain message.
- **Usage measurement**: `portfolio_usage` (migration `0041`) keeps, per user, first and last visit, active days, page views, imports and entries added. Counts only, never a stock or an amount. The admin page shows totals across users, including "came back after 30 days". The privacy page says so.

**Phase 1 is complete.** What remains outside the code:

- **Trade-list import on a real file**: still waiting for a real tradebook CSV; the reader follows Zerodha's published columns.
- **Demerger/merger notice**: `corporate_actions` holds only split, bonus, dividend and consolidation rows, so there is nothing to prompt from.
- **Legal review** of the privacy sentences and the page wording.

### Phase 2 — Insight (built 2026-10-05)

- **`/portfolio/analysis`**: the merged hub. A summary strip pinned under the app bar (value, today, total gain, what you paid), and tabs Allocation · Returns · Risk · Tax. Returns, Risk and Tax say what they will show and what they need; they are Phases 3 to 5.
- **Allocation tab**: a treemap of holdings (size = share of value, colour = sector, today's move on each box), a sector donut and a company-size donut, both with the numbers printed beside them; concentration (largest, top 3, top 5, effective number of holdings); "What moved your gain" diverging bars; "Worth a look" facts; "Coming up" for the next 60 days.
- **Company size is labelled "by index"** (owner did not pick; the recommended option was used): NIFTY 100 large, Midcap 150 mid, Smallcap 250 small, Microcap 250 micro, from `index_memberships`. Switch to the AMFI list when it is sourced.
- **Sector** is NSE's industry from `instrument_reference`; unclassified stocks are shown as "Not classified", never guessed.
- **Coming up** reads `market_events` (results, board meetings, dividends, bonuses, splits, rights, buybacks) and `dividends` for the per-share amount; the estimate uses today's share count and says "about".
- **Overview** gained the Overview/Analysis switch and a "Coming up for your holdings" card.
- Pure figures in `packages/core/src/portfolio/insight.ts`; sentences in `apps/web/src/lib/portfolio-facts.ts` (tested to contain no advice words).
- Side fix: the extra nav item made the top bar overflow between 1280 and 1600 px. The inline nav now appears from 1600 px (menu button below), and item padding at 2xl is 2.5.

#### Phase 2 review fixes (2026-10-05)

1. "Largest sector" no longer names a classified sector when unclassified stocks hold more; it says how much is unclassified and names the largest classified one.
2. The analysis page has a "No prices yet" state, and a banner when some holdings are left out for lack of a price.
3. "You paid" shows the cost of the priced holdings, so value − paid = gain on screen; the unpriced cost is shown separately.
4. "Worth a look" puts anything left out first and names at most three events, pointing to Coming up for the rest.
5. Sectors past the largest seven fold into "Other sectors" (eight groups at most), so no two groups share a colour.
6. Top bar: the inline nav is back from 1280px; the four Market record pages fold into one "Market record" menu until 1680px, where all fit inline.
7. Coming up drops a board meeting on the same day as its results, and matches dividend records to calendar dividends within three days.
8. The treemap has a "Show as a table" toggle, and the same table is always present for screen readers.
9. A dividend after a bonus or split shows the per-share amount and no total, with the reason.
10. The page assembly is a pure, tested function (`lib/portfolio-analysis.ts`); the analysis page is counted in usage; tabs follow the address (`#returns`).

## Phase 3 — Returns: refined plan (2026-10-05, before build)

### Scope

1. **Purchase lots (FIFO).** Each add/opening entry is a lot; a removal takes shares from the oldest lots first. Per lot: acquired date, shares, cost, days held, short/long term. Splits and bonuses adjust a lot's share count (cost unchanged) for returns; the tax view's zero-cost bonus lot is Phase 4.
2. **Realised vs unrealised.** Realised gain per removal (proceeds after charges − FIFO cost of the shares taken), totals per stock, per financial year (Apr–Mar, IST) and overall. Unrealised = today's value − FIFO cost of the lots still held.
3. **Dividends received.** NSE dividend records × shares held at the close before each ex-date, from dated entries. Shown in total, by quarter, per stock. Rows with no amount are counted and named, never guessed.
4. **XIRR** with a bracketed solver: money in (adds, openings), money out (removals, dividends), today's value. Shown beside the simple return. Under 12 months of money-weighted history, the simple return and a plain sentence replace it; no sign change or no root gives "cannot be worked out", never a number.
5. **Value over time**: daily value (shares held that day on that day's basis × that day's close) against net money put in. Weekly points beyond one year.
6. **Per-holding returns table**: unrealised, realised, dividends, total, and dividend yield on cost over the last 12 months.
7. **Holding page**: lots table, removals with realised gain, dividends received.
8. **Export realised gains (CSV)** for the user's accountant: stock, acquired, removed, shares, cost, proceeds, gain, days held, short/long term. Labelled "not a tax computation".

### Gaps found in the plan, and the fix for each

| # | Gap | Fix |
|---|---|---|
| G1 | **A holdings file wipes history.** Today a holdings snapshot *replaces* every entry for its stocks, so importing a trade list and then a holdings file deletes the dated trades, and re-uploading a holdings file each month resets the tracking start (XIRR restarts). | Snapshot becomes a **reconcile**: same share count as your entries, the row is skipped ("already matches"); different, the row is marked Check and imports the *difference* as an entry dated today (cost from the file's totals; a smaller count is recorded as removed shares at today's price). Dated trades are never deleted by a snapshot. |
| G2 | **Corporate actions only go back about two years** (the worker's backfill window). An entry dated before that with a split or bonus since would get the wrong share count, and value-over-time / dividends cannot go back further. | Entries older than the data window get a notice on the holding ("splits and bonuses before <date> are not on record"). Option: extend the corporate-action backfill (decision D4). |
| G3 | **Value over time needs the share count on each day's basis.** Today's derived shares are on today's basis; multiplying them by an older raw close is wrong across a split. | Build the series from entries un-adjusted until each ex-date, times that day's raw close. |
| G4 | **Opening entries with no real purchase date** (holdings file, "Shares I own now"). | Per D2: counted from the day added at that day's close; an optional real purchase date can be typed (one nullable column, migration 0042). |
| G5 | **Same-day buy and sell in a trade list** is intraday (business income), not a capital gain. | Import flags same-day round trips as Check ("same-day trade"); realised gains mark them intraday and the tax view (Phase 4) leaves them out. |
| G6 | **Average cost will change** for anyone who has removed shares (average → FIFO, per D1). | One-line note on the overview the first time; the method is named in the tooltip. |
| G7 | **XIRR edge cases**: one-day holdings annualise to nonsense; several roots; all money in on one day. | Threshold rule (12 months), bracketed search over −99%…+1,000%, "cannot be worked out" otherwise; tests against spreadsheet XIRR on hand-computed cases. |
| G8 | **Missing candles** (holiday, stock not ingested, suspended). | Carry the last close forward; if a held stock has no close for >5 sessions, the chart says "partial" for that span. |
| G9 | **Request cost**: a few thousand entries × two years of daily closes on every page load. | One query for all closes of held stocks in the window; computed once per request; weekly sampling past one year. No cache table yet. |
| G10 | **Dividend eligibility**: shares bought on the ex-date do not get that dividend. | Use shares held at the close of the session before the ex-date. |

### Improvements added

- "Tracking since <date>" next to XIRR, so the period is never ambiguous.
- Dividend yield on cost (last 12 months) per holding — descriptive, not a forecast.
- Realised-gains CSV export (item 8).
- A "How this is worked out" panel on the Returns tab: FIFO, what XIRR includes, data window.

### Decisions (owner)

- D1 Cost method: FIFO everywhere (recommended) or average on overview + FIFO for realised.
- D2 Undated openings: count from the day added at that day's price, with an optional real purchase date (recommended).
- D3 Dividends in total return and XIRR: yes, as a separate line (recommended).
- D4 Extend corporate-action and dividend history beyond two years: run the existing backfill with `years: 10` for corporate actions only (recommended, worker job, no new code beyond a flag), or leave at two years.
- D5 A real Zerodha tradebook CSV, to test against (until then, synthetic files in the published format).

### Phase 3 progress

- **Tasks 1–3 done (2026-10-05):** a holdings file now reconciles instead of replacing (`packages/core/src/portfolio/reconcile.ts`): new stocks open, matching counts are skipped, a different count becomes one entry for the difference dated today and marked Check (more shares at the file's average cost, fewer at today's price, or skipped with a reason when there is no price). Stocks you hold that the file omits are left alone and named in the preview. The repository can no longer delete entries during a write. A trade list's same-day add and remove of one stock is marked Check as intraday, and on one day additions are applied before removals. Preview and commit share one plan, so they cannot disagree.
- **B done (2026-10-05):** migration `0042` adds an optional `acquired_on` (holding period only; returns count from the entry date), with an "Acquired on (optional)" field when entering or editing an opening balance. Worker job `backfill-corporate-history` (on demand: `--once backfill-corporate-history`) loads ten years of splits, bonuses and dividends without touching candles and records how far back it reached; a holding with a purchase older than that record says so. New reads: `dailyClosesBetween` (raw closes by IST session), `dividendsBetween`, `corporateHistoryFrom`.
- **C done (2026-10-05):** `derivePortfolio` is now FIFO with lots and realisations (term = more than twelve months, intraday flagged); `packages/core/src/portfolio/returns.ts` has realised totals by financial year, shares held on a date's basis, dividends received (close before ex-date), XIRR (matches the spreadsheet textbook example), the return summary (opening balances at that day's close; no yearly figure under a year), value over time across splits with carried prices and "partial" days, weekly sampling past a year, and dividend yield on cost. Average cost on the overview is now FIFO.
- **D and E done (2026-10-05) — Phase 3 complete.** Returns tab on `/portfolio/analysis` (XIRR with "since", simple return, the four numbers behind it, value-over-time chart with 1Y/3Y/All and partial shading, realised vs unrealised with a financial-year table, dividends by quarter and list, return by stock with dividend yield on cost, "How this is worked out"); single-holding page shows purchases still held (days held, long term in N days), shares removed with gain and term, dividends received and the all-in return; overview has a Yearly return tile and a one-time FIFO note; `GET /api/portfolio/realised` exports realised gains as CSV ("not a tax computation"). Assembly is pure and tested in `apps/web/src/lib/portfolio-returns.ts`.
- **After deploy (owner):** run the ten-year corporate-history load once on the VPS: `node apps/worker/dist/index.js --once backfill-corporate-history`.

## Phase 4 — Benchmark and tax (built 2026-10-05)

Decisions (owner chose "the recommended way"): index data from NSE's public daily index file (`ind_close_all_DDMMYYYY.csv`, shown to signed-in users only); total-return index **not available in that file**, so both indices are price indices and labelled so; 31 Jan 2018 prices from NSE's archived bhavcopy (`cm31JAN2018bhav.csv.zip`); surcharge left out and said so; everything labelled indicative, not tax advice (legal/CA review before go-live).

- **Data:** worker jobs `ingest-index-closes` (nightly 19:20 IST, last week re-read), `backfill-index-closes` (on demand, ten years, resumable) and `load-fair-market-values-2018` (on demand, once). Migration `0043` adds `fair_market_values_2018` (ISIN → that day's high, paise). Index closes are stored as daily candles under provider `nse-index-close`. Parsers tested on captured NSE files; zip read with Node's zlib, no new dependency.
- **Calculations (core):** `benchmark.ts` (same money, same dates into the index; time-weighted growth of 100; period returns) and `tax.ts` (tax lots with bonus shares as zero-cost lots dated the ex-date; the 2018 rule; rates by sale date with the 23 Jul 2024 change; the ₹1 lakh / ₹1.25 lakh exemption by year; this year's loss set-off; 4% cess; intraday apart).
- **Pages:** Returns tab gains "Compared with the market" (your XIRR vs same money in Nifty 50 / Nifty 500, growth of 100 chart, period table). Tax tab: financial-year switch, short/long/indicative/intraday tiles, losses carried, sales table with the 2018 rule shown line by line and bonus shares marked, passing 12 months soon, dividends for the year, "How this is worked out", and `GET /api/portfolio/tax?year=` export laid out like the s.112A schedule.
- **After deploy (owner), once each:** `node apps/worker/dist/index.js --once backfill-index-closes` and `node apps/worker/dist/index.js --once load-fair-market-values-2018` (plus the Phase 3 `backfill-corporate-history`).
- **Review fixes (2026-10-05):** a removal is matched to shares added the same day first (intraday), then FIFO, in both the returns and tax lots; bonus shares inside an opening balance with an earlier "Acquired on" become their own zero-cost lots; lots acquired by 31 Jan 2018 (bonus lots too, and after pre-2018 splits) take that day's value at the restated count; a pre-2018 long-term sale with no 31 Jan 2018 price is flagged on the page and in the CSV; a removal of more than was held is left out of tax as it is of returns; **losses carried forward** up to 8 years, set off oldest first and mandatorily (even within the exemption), from the years recorded here, assuming returns filed on time. Comparison: no index figure when the index history starts after the first entry (instead of a false flat index); removals take the same fraction of the index as of the holdings (modified PME), so the index can never go negative; "your holdings" compared without dividends, with the dividend figure beside it; month-end periods fixed. Worker: `backfill-index-closes` resumes on a later day instead of restarting. The analysis page reads closes and dividends once, not three times.
- **Known limits:** price indices only (no dividends) for the comparison; surcharge, transfer expenses and losses from shares not recorded here not included; intraday (speculative) losses not carried forward.

## Phase 5 — Risk (built 2026-10-05)

Decisions (owner approved the task list as proposed): no Sharpe, Sortino or Calmar (they need an assumed risk-free rate; the plan shows three risk numbers); Nifty 50 is the only benchmark for beta; correlation over the last year for at most the 15 largest holdings; wording describes, never advises (no "high risk", "diversify" or verdict labels).

- **Calculations (core, `packages/core/src/portfolio/risk.ts`):** daily returns with money flows removed and stale-price days left out and counted; split- and bonus-adjusted stock returns; yearly volatility (sample stdev × √252) for the last year and all history; deepest fall with the dates of the high, the low and the recovery; beta and correlation against Nifty 50 over the last year on shared days; correlation grid; each stock's share of the portfolio's variance (wᵢ·(Σw)ᵢ ÷ wᵀΣw, adds up to 1). Nothing under 120 sessions (about six months); a pair needs 60 shared sessions. Tested against hand-worked figures.
- **Data:** the analysis page reads at least a year of closes for every held stock and Nifty 50, once, for every tab. No migration and no new source.
- **Page (Risk tab):** three tiles with a plain sentence each (or "needs about N more months"), a "below the last high" drawdown chart with the deepest fall marked, a sortable per-stock table (a list on phones), the correlation grid with the number in every cell and a colour key (most and least related pairs on phones), and "How this is worked out". Portfolio vocabulary test covers the new files.
- **Known limits:** Nifty 50 is a price index (no dividends); per-stock figures use the last year of prices whenever the stock was added; opening the page at `#risk` directly lands on Allocation (Phase 3 deferred fix).

## Phase 6 — Later

Three parts, each its own decision (see the phase table): 6.1 tax-lot reports, 6.2 alerts on holdings, 6.3 CAS and contract-note import. Account Aggregator and any broker connection stay out (CLAUDE.md).

### 6.1 Tax-lot reports (built 2026-10-05)

- **Core:** `taxLots()` returns the realisations and the tax lots still held (bonus shares as their own zero-cost lots, 31 Jan 2018 value kept per lot); `valueOpenLots()` values each lot at its part of today's holding, with the 2018 rule for long-term lots acquired before February 2018 and a flag when that price is missing; `unrealisedByTerm()`; `daysToLongTerm()`.
- **Tax tab — "Shares still held":** unrealised short- and long-term totals, every lot (acquired, shares, cost used, value today, unrealised, term today and days to long term), 2018 rule and bonus notes, a phone list, and `GET /api/portfolio/tax/lots` CSV export with "Long term from" dates. "Passing 12 months soon" now reads the tax lots, so bonus shares count from their own date.
- **Holding page — "Purchase history":** each purchase with what was later removed from it (date, shares, proceeds, gain, term) and what is left; shown once something has been removed.
- **Fix found on the way:** the nightly corporate-actions sync records splits and bonuses up to 30 days before their ex-date, and the portfolio applied them at once (a 1:1 bonus showed doubled shares at the old price). The portfolio now applies only actions on or before today. The same early adjustment in price history (`packages/db/src/repositories/candles.ts`) is out of this scope and was raised as a separate task.
- Left out on purpose: anything that suggests which lots to dispose of (tax harvesting).

### 6.2 Notices about holdings (built 2026-10-05, in the app only)

Owner decision: in-app only for now; email later.

- **Core:** `holdingNotices()` (pure) — five kinds, each a fact about the user's own shares: something coming up within 3 days (dividend ex-date with the amount on the shares held, bonus, split, results, board meeting, rights, buyback); a split, bonus or consolidation that took effect in the last 3 days, with the share count now; a stock's daily move at or past the user's level (default 5%; a split on the day is taken out); the holdings' move at or past the user's level (default 3%; only when at least 80% of the priced holdings have that session's close); a purchase passing 12 months within the user's days (default 7; from the tax lots, so bonus shares count from their own date).
- **Data:** migration `0044` — `holding_notices` (facts as `data` jsonb, once-only per owner, kind and key; deleted after 180 days and with the account) and `holding_notice_settings` (a missing row means the defaults). Money is stored as paise and worded only in the page (rule 3).
- **Worker:** `portfolio-notices` at 19:50 and 21:50 IST on weekdays, after each evening pass (twice is safe: once-only); `--once portfolio-notices`. Logs counts only.
- **Pages:** `/portfolio/notices` (newest first, "New" for unread at opening, which marks them read; a link to the holding; settings with a switch and level per kind), a "Notices" tab with the unread count, and a header bell shown only when something is new. Routes: `GET /api/portfolio/notices`, `GET …/notices/count`, `POST …/notices/read`, `PUT …/notices/settings`. Privacy page says so.

### 6.3 Statement (CAS) check and contract-note import (built 2026-10-05; needs real files)

- **In the browser:** a PDF is opened with `unpdf` (already used by the worker), with its password when it has one; neither the file nor the password leaves the browser. Pages become text lines (`itemsToLines`).
- **Core:** `detectStatementKind`, `parseCasStatement` (equity ISINs only; the share count is the whole number whose price × count matches a value on the line, taking the largest; several demat accounts added up; a line that does not cross-check is marked), `parseContractNote` (trade date, ISIN, side, shares, net rate when the line's total confirms it) and `contractNoteToCsv` (the trade-list format the import already reads).
- **CAS → check, not import:** a CAS has no cost, so it is compared with the record on the statement's date (`POST /api/portfolio/statement-check`): matches, different (by how many), not in the record, not on the statement, not on the NSE list. Nothing is saved.
- **Contract note → import:** through the existing review step; stocks matched by ISIN (new `instrumentsByIsin` fallback, which also helps CSV files that carry an ISIN); trade numbers stop a second import of the same note.
- **Also fixed:** "Done" after an import left the dialog showing the old result when reopened.
- **Not yet proven:** the parsers were built from the published layouts and tested on synthetic files. A real NSDL or CDSL CAS and a real contract note (personal details removed) are needed to confirm them; password-protected opening is pdf.js's own and was not tested here with an encrypted file.
