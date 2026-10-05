---
name: My holdings
status: draft
horizon: next
created: 2026-10-05
updated: 2026-10-05
area: [web, db, core, worker, docs]
phases_total: 7
phases_done: 0
phase_names: [Decision + rule change, Pure calculation, Table + repository, API, Page, Quotes + corporate actions, Privacy + verification]
summary: A page where a signed-in user types the stocks they own and sees value and gain or loss. Version 1 is small and certain; everything beyond it (ledger, XIRR, tax statement, allocation, risk, import) is specified here but built only when users show they need it.
owner: krishna
blocked_by: [owner decision A/B/C in §1]
---

# My holdings — the big plan

**Status: draft. Nothing is built.** One decision (§1) gates everything. Sections 2–4 are the
research and reasoning; §5–§9 are the specification; §10–§12 are rollout, measurement and
risk. Research was done on 2026-10-05; sources are listed in §14, and anything I could not
confirm from a source is marked **[verify]**.

---

## 0. In one page

**What it is.** A page where you type what you own — stock, shares, average cost — and the app
shows what it is worth today and your unrealised gain or loss, from prices it already has.
Typed by hand. Never fetched from a broker. Nothing on it looks like an order.

**Why build it.** A watchlist says "what I follow". Holdings says "what I own", which is what
people open a finance app to check. Every serious Indian tracker has it.

**How it grows.** Four tiers, each unlocked by evidence, not by enthusiasm:

| Tier | Name | What it adds | Built when |
| --- | --- | --- | --- |
| **1** | **Core** | Add, edit, remove; value; gain or loss; day change; share of total; split warning; CSV download | After the owner decision |
| **2** | **Insight** | Allocation by sector and size, concentration facts, events for held stocks, "set my own alert" shortcut | When ≥ 50 people hold stocks here, or asked for |
| **3** | **Ledger** | Record each addition and removal with a date → true XIRR, realised gains, dividends received, value over time | When Tier 1 users ask "what is my real return" |
| **4** | **Advanced** | Capital-gains statement for your CA, benchmark comparison, risk numbers, file import, multiple books | Each one separately, on its own trigger (§11) |

**What it will never do.** Connect to a broker. Say buy, sell, rebalance, harvest losses or "you
are over-exposed". Give a score or a verdict. These are not omissions; they are the line
between a tracker and investment advice (§9).

**Size.** Tier 1 about 4 working days. Tiers 2–4 together about 6 to 8 weeks if all were
wanted, which they will not be.

---

## 1. The decision this plan needs

`CLAUDE.md` forbids this today: *"no place/modify/cancel order, order book, positions, funds,
holdings, or broker portfolio. Not even read-only."* That rule keeps the product from becoming
a broker. A list the user types is not a broker feature, but it is inside the wording, so the
owner decides.

| Option | Meaning | Recommendation |
| --- | --- | --- |
| **A — keep the rule** | No holdings page | Choose if the product should stay a research tool |
| **B — allow typed holdings** (this plan) | Narrow the rule: broker-fetched holdings and any order feature stay banned; holdings the user types are allowed | **Recommended** |
| **C — columns on the watchlist** | Optional shares and average cost per watchlist row | Cheaper, but mixes "watching" with "owning" and cannot grow into Tiers 3–4 |

**Rule text to adopt if B** (`CLAUDE.md`, `AGENTS.md`):
> Holdings the user types themselves are allowed (shares, cost, dates). Holdings fetched from a
> broker, demat account or any third party remain banned, as does every order feature. Holdings
> pages use the words *shares you own, average cost, value, gain or loss, added, removed*. They
> never use *position, quantity, order, entry price, buy, sell*.

Assumed defaults, change any: separate page named **My holdings** (never "portfolio": paper
trading already uses that word and the rule bans "broker portfolio") · gain and loss included ·
CSV import later · ships to everyone after the privacy text is updated.

---

## 2. Who needs what — the research

### 2.1 The four kinds of user

| User | Typical shape | What they actually want | Tier that serves them |
| --- | --- | --- | --- |
| **Steady investor** | 5–30 stocks, adds a few times a year | "What is it worth? Am I up?" Seen weekly | 1, then 2 |
| **Active investor** | 20–80 stocks, trades often | Day change, contributors, events, real return | 1, 2, 3 |
| **Year-end filer** | Any size | A capital-gains statement their CA can use | 3, 4 |
| **Family manager** | Several accounts | One view across people | 4 (books) |

The steady investor is most people. Version 1 is built for them; the others are what the later
tiers are for, and only if they show up.

### 2.2 What the market already offers

From the vendors' own pages (§14) unless marked.

| Capability | Zerodha Console | Groww | INDmoney | Tickertape |
| --- | --- | --- | --- | --- |
| Value, gain/loss, day change | ✓ | ✓ | ✓ | ✓ |
| **XIRR** | ✓ vs Nifty 50 and Midcap 150; shows "–" when most money is under a year old | ✓ | ✓ | ✓ [search snippet] |
| Benchmark vs Nifty 50 | ✓ | ✓ | ✓ | – |
| Value over time vs invested | – | ✓ | ✓ | – |
| Sector allocation | – | ✓ | ✓ | – |
| Market-cap split | – | ✓ (ETFs excluded) | ✓ | – |
| Dividends received | ✓ quarterly bars | – | ✓ | – |
| Top contributors / gainers | ✓ | – | ✓ | – |
| **Events timeline** (results, actions, filings) | ✓ | – | – | – |
| Red flags / scores | ✓ (third-party data) | – | "expert analysis" | ✓ portfolio score |
| Tax P&L statements | ✓ | – | – | – |
| Family / multiple accounts | ✓ family view | – | ✓ | – |
| Broker import | their own | their own | many brokers | 16+ brokers, **one at a time** [snippet] |

**What users complain about** [search snippets, treat as directional, not measured]: corporate
actions not applied correctly; manual entry and Excel being painful; one broker at a time;
tools that want a login and your data shared with third parties.

### 2.3 Where we can be genuinely different
1. **Honest arithmetic.** Splits and bonuses flagged instead of silently wrong. "As of" labels
   everywhere. Totals that say how many holdings they cover. (The complaint list above is
   mostly about this.)
2. **No broker link.** Nothing to authorise, nothing to leak. A selling point for the privacy-minded,
   and the reason the rule can be narrowed rather than dropped.
3. **Every number explained.** The product's existing stance: no figure without its inputs.
   A gain shows shares × (price − cost), on tap.
4. **Facts from data we already collect:** sector from NSE index files, size bucket from index
   membership, dividends and corporate actions from NSE feeds, events from our calendar.

### 2.4 What we will not copy
Scores, "red flags" and "expert views" (need fundamentals we do not have, and they edge toward
advice), broker connections (rule, plus fragile), and anything that tells the user what to do.

---

## 3. Principles

1. **Describe, never recommend.** Every sentence is a fact about the user's own numbers.
2. **The user's figures, labelled as theirs.** "Figures you entered."
3. **Integer paise, integer shares.** Rupees convert once, in the form (hard rule 3).
4. **No number without its source and time.** "Last price as of 15:30 IST."
5. **A missing number is a dash, never a zero.** Totals say what they cover.
6. **Progressive disclosure.** A tab appears only when the data can fill it honestly.
7. **Private by construction.** Owner-scoped, deleted with the account, never logged, no admin view.
8. **Pure maths in `packages/core`.** Hand-computed fixtures; the same code serves page, export
   and any future job (hard rule 1).
9. **Rules that change live in versioned config**, with a source and a verified-through date,
   exactly as `config/nse-calendar.yaml` already does.

---

## 4. Tier 1 — Core (the thing to build first)

### 4.1 What the user sees
- Sidebar entry **My holdings** under *My watchlists*.
- Four tiles: **Current value · Invested · Unrealised gain or loss (₹, %) · Today's change**.
- A table: Stock · Shares · Average cost · Last price · Value · Gain or loss (₹, %) · Share of
  total · Today's change. Sorted by value; each row opens the stock page.
- **Add holding** (sheet): search a stock, shares, average cost, optional cost date. Edit and
  remove on each row.
- **Download CSV** of the user's own holdings.
- Phone: cards (stock, value, gain or loss), details on tap.
- States: *Last price as of 15:30 IST* · *Prices delayed* · a dash for no price · *Totals cover 7
  of 8 holdings*.
- Standing line: *"Figures are the ones you entered. Gain or loss is before brokerage, taxes and
  charges. Not advice."*

### 4.2 Data
`holdings` (migration `0040_holdings`): `id`, `owner_id` (cascade), `instrument_id` (cascade),
`shares` int > 0 (≤ 1,000,000,000), `avg_cost_paise` int > 0, `cost_as_of` date, timestamps.
Unique `(owner_id, instrument_id)`. At most 200 per user, enforced under an advisory lock.
Owner-scoped repository (same pattern as watchlists and alerts).

### 4.3 The calculation (pure, `packages/core/src/holdings/summary.ts`)
```
invested      = shares × avg_cost
value         = shares × last_price          (last price = live quote, else last close, else none)
gain          = value − invested             gain% = gain ÷ invested
day change    = shares × (last_price − previous_close)
weight        = value ÷ Σ value              (priced holdings only)
```
Totals sum only priced holdings and report `covered / total`.

### 4.4 Prices
Same `latest_quotes` cache the watchlists read. **Change required:** the worker's list of
symbols to refresh is built from watchlist items only (`listAllWatchedInstruments`); it must
become the union of watchlist items and holdings, or a stock someone holds but does not watch
has no price.

### 4.5 The corporate-action trap
A user types 100 shares; the company splits 1:2; the price halves; the share count does not, so
value and gain come out half what they should. **v1:** if a split, bonus or consolidation has an
`ex_date` after `cost_as_of`, the row shows *"This company had a split on 14 Oct. Check your
shares and average cost."* **v1.1:** a one-click "apply this split". Dividends never trigger it.

### 4.6 Done when (Tier 1)
Correct against a hand-worked example · another user's rows unreachable (database test) ·
deleting the account deletes the rows (database test) · split warning appears · a test greps the
page text for banned words · light/dark and phone/desktop checked in a browser · lint, types, full
suite and the route-auth test pass.

---

## 5. Tier 2 — Insight (cheap, uses data we already collect)

| Feature | What the user sees | Data | Notes |
| --- | --- | --- | --- |
| **Allocation by sector** | Bar or donut: IT 31%, Banks 24%, … | `industry` from NSE index files; null shown as "Unclassified", never guessed | Industry comes from index-membership files, so some stocks are unclassified. Say so |
| **Allocation by size** | Large / Mid / Small / Other | Membership in Nifty 100, Midcap 150, Smallcap 250 | A proxy, because we have no market-cap data; labelled "by index membership". ETFs excluded, as Groww does |
| **Concentration facts** | "Largest holding is 31% of the total. Top five are 74%." | Weights | Facts only. No "too concentrated" |
| **Your own limit** | User sets "tell me if any holding passes 25%" | Alerts engine | The user's rule, not ours. Reuses alerts v1 |
| **Events for held stocks** | Results dates, board meetings, ex-dividend, split/bonus, filings for the next 30 days | Existing calendar and announcements, filtered to holdings | Extend the watchlist-membership query to include holdings. Console's timeline is the model |
| **Alert shortcut** | On a row: "Alert me when it closes below ₹…" prefilled | Alerts v1 | The user picks the level; we never suggest one |
| **Technical context** | Chips from existing screener data: "Below 200-day average", "4% from 52-week high" | `screener_snapshots` | Facts, no direction badge on this page |
| **Contributors** | Top gainers and decliners by ₹ contribution | Gain per holding | Console and INDmoney have it |

---

## 6. Tier 3 — Ledger (the step that unlocks real returns)

**Why it exists.** One average cost and one date cannot give an honest return, realised gains or
dividends. Those need *dated* events. Tier 3 lets a user record them.

### 6.1 Two modes, per user
- **Simple** (Tier 1): shares and average cost. Always available.
- **Ledger**: a dated list of additions and removals. Holdings become derived from it.

Moving to Ledger mode **keeps the existing row** as an *opening balance* dated `cost_as_of`, so
nothing is lost and nothing is retyped.

### 6.2 Data
`holding_transactions`: `id`, `owner_id`, `instrument_id`, `kind` (`added` | `removed`),
`trade_date`, `shares` int > 0, `price_paise` int > 0, `charges_paise` int ≥ 0 (optional),
`source` (`typed` | `csv`), `created_at`. Index `(owner_id, instrument_id, trade_date)`.

**Vocabulary (hard rule from `CLAUDE.md`):** BUY and SELL may label a signal's direction and
nothing else. The ledger says **Added shares / Removed shares** (or *Acquired / Disposed* in the
tax view). The Add form is a *record*, not an order ticket: no "buy more" button, no price
suggestion, no confirm step that resembles one.

### 6.3 What it unlocks
| Feature | Definition | Caveats |
| --- | --- | --- |
| **XIRR** | The annual rate `r` where Σ cashflow_i ÷ (1 + r)^((d_i − d_0) ÷ 365) = 0, with additions as outflows, removals as inflows, and today's value as the final inflow | Needs ≥ 2 dated flows. Shown as "–" when most of the money is under a year old (Console does the same). Short holds make XIRR extreme: show absolute return alongside. Solve with a bracketed method (not Newton alone) and show "n/a" when no unique rate exists |
| **Realised gain or loss** | Per removal: proceeds − cost of the shares removed, matched **first-in-first-out** | FIFO is the usual basis for demat shares **[verify with a CA]** |
| **Holding period** | Long term if held **more than 12 months**; otherwise short term | Listed equity rule, FY 2025-26 (§7) |
| **Dividends received** | `dividends.amount_paise` × shares held on the ex-date | An estimate: record-date and ex-date can differ; tax withheld is not modelled |
| **Value over time** | Real invested vs value, from the ledger | Needs daily closes per holding (adjusted for corporate actions, already stored) |
| **Charges** | Optional per row | Included in cost basis when entered |

Without a ledger, a "value over time" chart can only be *today's holdings traced back* — shown
only if clearly labelled as hypothetical, and preferably not at all.

---

## 7. Tier 4 — Advanced options (each needs its own trigger, §11)

### 7.1 Capital-gains statement (for the user's CA)
**Not a tax filing and never described as one.** Output: realised gains split into short and long
term for a chosen financial year, grandfathered cost applied, totals against the exemption,
loss carry-forward shown, downloadable. Built on the ledger.

Rules (versioned in `config/tax-rules.yaml`, each with a source URL and a `verifiedThrough` date
that warns when stale, like `nse-calendar.yaml`). Values below are as stated in the sources for
FY 2025-26:
- Listed equity held **more than 12 months** is long term; otherwise short term.
- Short-term rate **20%**; long-term **12.5%** on gains above **₹1.25 lakh** a year; 4% cess;
  surcharge capped at 15% on these gains.
- **Grandfathering** for shares acquired before 1 Feb 2018: cost = the higher of actual cost and
  the lower of (highest price on 31 Jan 2018, sale price). Needs a one-time table of 31 Jan 2018
  prices, which the NSE bhavcopy archive can supply **[verify availability]**.
- **Losses:** short-term loss sets off short- and long-term gains; long-term loss only
  long-term gains; unused losses carry forward up to **8 years only if the return is filed on
  time**.
- **Intraday equity** is generally not a capital gain (it is treated as business income) —
  excluded and flagged **[verify with a CA]**.

**Decision:** classify and total; do **not** compute tax payable in the first version. Applying
rates is arithmetic, but a wrong rate or missed rule becomes our error on someone's tax return.

### 7.2 Benchmark comparison
Compare against **Nifty 50** (index bars are already ingested). Two honest forms:
1. *Same money, same dates:* "had each addition gone into the Nifty 50 on the same day, it would
   be worth ₹X". Needs the ledger.
2. *Same period:* simple return of the Nifty over the holding period.

**Limit:** we only have the **price index**, not the total-return index, so the benchmark
excludes dividends. Label it exactly that way; Console also offers Midcap 150.

### 7.3 Risk numbers (descriptive, historical)
Portfolio volatility and maximum drawdown from the ledger-based value series; per-holding
volatility already exists in the screener; beta against the Nifty 50 from daily bars; a
correlation table for ≤ 30 holdings. **No risk score, no "high/medium/low".** Always show the
window ("last 252 sessions") and "historical, not a forecast".

### 7.4 File import
Generic **CSV/XLSX mapper**: the user maps columns (symbol or ISIN, shares, average cost), sees a
preview with matches and rejects, picks *merge* or *replace*, then confirms. Matching by ISIN
first, then symbol. Broker presets (Zerodha Console holdings .xlsx, Groww, Upstox) are added
**only from real sample files the owner supplies**; column names vary and I could not confirm
Console's from public pages. NSDL/CDSL consolidated statements (password-protected PDFs) are a
later, heavier option. **Never** a broker login or API token.

### 7.5 Multiple books (family)
A *book* is a named set of holdings ("Self", "Spouse"). One user, several books, with a combined
view. Word "book", not "portfolio". Only the user's own typing; no shared access in this tier.

### 7.6 Other options — decide per request
Tax-lot choice (specific-lot selling) · SIP-style recurring additions · ETFs and REIT/InvIT
units (already NSE-traded, mostly work) · mutual funds (needs AMFI NAV data: a separate source) ·
bonds/gold/FDs (out of scope) · goals and targets (advice-like, skip) · shareable snapshot image
(privacy risk, skip).

### 7.7 Explicitly never
Rebalancing suggestions · tax-loss-harvesting prompts · "sell this" / "add that" · portfolio score
or grade · red flags · target allocation · "you are underperforming, consider…". See §9.

---

## 8. The user-facing analytics catalogue

Every metric: inputs, source, freshness, caveat. This is the contract the pure functions are
tested against.

| Metric | Formula | Inputs | Source | Fresh as of | Caveat shown |
| --- | --- | --- | --- | --- | --- |
| Value | Σ shares × last | shares, price | holdings + `latest_quotes` / last close | quote time | "as of" |
| Invested | Σ shares × cost | holdings | holdings | user-typed | "figures you entered" |
| Gain / loss | value − invested | | | | before charges and tax |
| Day change | Σ shares × (last − prev close) | prices | quotes | quote time | market closed → last session |
| Weight | value ÷ total | | | | priced holdings only |
| Sector share | Σ value by industry | industry | NSE index files via `instruments` | daily | unclassified shown |
| Size bucket | Σ value by index membership | membership | `index_members` | daily | proxy for market cap |
| XIRR | solve XNPV = 0 | dated flows | ledger | on read | "–" if mostly < 1 year |
| Realised gain | proceeds − FIFO cost | ledger | ledger | on read | FIFO assumption |
| Dividends | amount × shares on ex-date | ledger, dividends | NSE feed | daily | estimate |
| Benchmark | same flows into Nifty 50 | ledger, index bars | daily bars | daily | price index, no dividends |
| Volatility / drawdown | std dev / peak-to-trough of daily value | ledger, bars | daily bars | daily | historical, window shown |

**Testing:** hand-computed fixtures for every row; XIRR checked against a spreadsheet's result;
properties (weights sum to 100%; value − invested = gain; removing nothing leaves FIFO cost
unchanged); a split-adjustment fixture; a missing-price fixture.

---

## 9. Compliance map

| Concern | What the rules say | What we do |
| --- | --- | --- |
| **SEBI — investment advice** | Regulation 2(1)(l) defines advice as *"advice relating to investing in, purchasing, selling or otherwise dealing in securities… and advice on investment portfolio… and shall include financial planning"*, with a carve-out for material widely available to the public [§14]. The definition is broad | Describe the user's own numbers; never recommend. Banned: rebalance, harvest, score, target, "consider". A lawyer should review the Tier 2+ wording **[verify]** before launch |
| **SEBI — model portfolios** | SEBI has proposed model-portfolio rules **[verify current status]** | We publish none |
| **`CLAUDE.md` vocabulary** | BUY/SELL only label a signal's direction; never *position, quantity, order, entry price* | Wording list in §1; a test greps the page text |
| **DPDP Act and Rules 2025** | Notified 14 Nov 2025; **core duties (notice, security, rights) apply from 13 May 2027**; notice must itemise the data and purpose; consent specific and unbundled; erase when the purpose ends [§14] | Build to it now: itemised privacy text, deletion with the account, export, no re-use of holdings for any other purpose |
| **Tax** | Rates and rules change each Budget | Versioned config with source and stale-warning; "not tax advice"; classification without computing payable tax |
| **Provider data terms** | Showing provider prices on a new page | Same prices and terms as the watchlist; no new redistribution; covered by the open data-terms question in the product review |

---

## 10. Architecture

| Layer | Tier 1 | Later tiers |
| --- | --- | --- |
| **Core (pure)** | `holdings/summary.ts` | `holdings/xirr.ts`, `fifo.ts`, `capital-gains.ts`, `allocation.ts`, `backcast.ts`, `risk.ts` |
| **DB** | `holdings` | `holding_transactions`; `holding_books`; `usage_counters` (§12) |
| **Repository** | `holdings.ts` (owner-scoped) | `holding-transactions.ts` |
| **Server** | `server/holdings.ts` | split per tab; calculations on read (≤ 200 holdings) |
| **API** | `/api/holdings`, `/api/holdings/[id]`, `/api/holdings/export` | `/api/holdings/transactions`, `/api/holdings/import`, `/api/holdings/statement` |
| **UI** | `/holdings` overview | tabs *Allocation · Performance · Gains · Events · Import/Export*, shown only when data supports them |
| **Worker** | union of watched + held symbols | nightly precompute only if reads get slow |
| **Config** | — | `config/tax-rules.yaml` |

Performance: ≤ 200 holdings, one batch of quotes, bounded daily-bar queries for Tier 3+. No new
service, no queue, no Redis.

### 10.1 Migration path v1 → v2
Existing `holdings` rows become opening-balance transactions dated `cost_as_of`. No data is
re-entered. `holdings` stays as the "current state" view so Tier 1 code keeps working.

### 10.2 Information architecture
`My holdings` → **Overview** (always) · **Allocation** (Tier 2) · **Events** (Tier 2) ·
**Performance** (Tier 3) · **Gains** (Tier 4) · **Import / Export**. Empty-state first run offers
two doors: *Add a holding* or *Import a file* (the latter once Tier 4 import exists).

---

## 11. Build triggers — "only if users really need it"

Every optional feature is gated by a signal we can read, with a threshold, so the decision is
made by usage and not by guesswork. Thresholds are starting points for the owner to change.

| Feature | Build when… | Signal |
| --- | --- | --- |
| Tier 2 bundle | ≥ 50 people have ≥ 1 holding, or the owner asks | holders count |
| Allocation | Tier 2 + ≥ 30% of holders have ≥ 5 holdings | holdings per holder |
| Ledger + XIRR | ≥ 10 people use the in-page "I want my real return" link, or ≥ 40% of holders return weekly for 4 weeks | feedback clicks, retention |
| Capital-gains statement | ≥ 10 requests, or any in Feb–Jul (filing season) | feedback, season |
| File import | ≥ 30% of new holders stop before adding a 3rd holding, or ≥ 10 requests | onboarding drop-off |
| Benchmark | Ledger exists + ≥ 10 requests | feedback |
| Risk numbers | ≥ 15 requests; never by default | feedback |
| Books (family) | ≥ 10 requests | feedback |

A single quiet link on the page — **"Tell us what is missing"** — carries the request; the count
of clicks per option is the demand signal. Nothing else in the page changes.

---

## 12. Product analytics (how we know it works)

### 12.1 Goal and success measures
Goal: *people open the page and find it correct.* Measures, weekly:

| Measure | Definition | Target to call v1 a success |
| --- | --- | --- |
| **Activation** | Of people who open My holdings, share who add ≥ 1 holding in the same session | ≥ 40% |
| **Depth** | Share of holders with ≥ 3 holdings | ≥ 50% |
| **Retention** | Holders who open the page in 3 of the next 4 weeks | ≥ 30% |
| **Trust** | Split warnings shown and then resolved (shares edited) within 7 days | ≥ 60% resolved |
| **Correctness** | Reports of a wrong number | 0 unresolved |
| **Speed** | Page load p95 | < 2 s |
| **Reliability** | Share of page views with prices for all holdings | ≥ 95% on trading days |

### 12.2 How it is measured (privacy first)
- **Aggregate counters only**, in one small table `usage_counters (day, event, count)`. Events
  such as `holdings_page_open`, `holding_added`, `export_downloaded`, `split_warning_shown`,
  `feature_request_clicked:<option>`. **No user id, no symbol, no amount, ever.**
- Counters are written by the server, best-effort, and never block a request.
- A read-only admin page shows the week's numbers (no editing, per the no-admin-CRUD rule).
- Cookieless web analytics (for example Plausible) is an acceptable alternative for page views.
- The privacy text names these counters. Under DPDP this is the "itemised data and purpose".

### 12.3 What is explicitly not collected
Which stocks a person holds, how many shares, what they paid, or their gain. These stay in the
user's own rows and nowhere else.

### 12.4 Review rhythm
Four weeks after launch: read §12.1 and §11 together and decide which Tier 2–4 items to start.
Write the decision into this file.

---

## 13. Phases, estimates, risks

### 13.1 Phases
| # | Phase | Output | Size |
| --- | --- | --- | --- |
| 0 | Decision + rule change | Owner picks A/B/C; `CLAUDE.md`/`AGENTS.md` updated | 30 min |
| 1 | Pure calculation | `core/holdings/summary.ts` + tests | 0.5 d |
| 2 | Table + repository | Schema, migration `0040`, owner-scoped queries, static + database tests | 0.5 d |
| 3 | API | Routes, validation, limit, route-auth coverage, tests | 0.5 d |
| 4 | Page | `/holdings`, sheet, phone cards, nav entry, stories (light/dark/phone) | 1–1.5 d |
| 5 | Prices + corporate actions | Worker symbol union; day-close fallback; split warning | 0.5 d |
| 6 | Privacy + verification | Privacy text, CSV download, usage counters, full DB suite, browser check at both widths and themes | 0.5–1 d |
| **Tier 1 total** | | | **≈ 4 d** |
| 7 | Tier 2 — Insight | allocation, concentration, events, alert shortcut, contributors | ≈ 3 d |
| 8 | Tier 3 — Ledger | table, FIFO, XIRR, realised, dividends, value over time | ≈ 8–10 d |
| 9 | Tier 4a — Import | mapper, preview, presets from real files | ≈ 4 d |
| 10 | Tier 4b — Statement | tax config, statement, export | ≈ 5 d |
| 11 | Tier 4c — Benchmark + risk | benchmark, volatility, drawdown, beta | ≈ 5 d |
| 12 | Tier 4d — Books | named books, combined view | ≈ 3 d |

Sizes are my estimates, not measured. Each phase ships on its own; phases 1–3 change nothing a
user can see.

### 13.2 Risks
| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Reads as advice | Gain/loss and analytics sit near stocks | §9 wording rules, no direction badges, standing line, lawyer review before Tier 2+ |
| Sensitive data | Financial figures | Owner-scoped, cascade delete, no logs, no admin view, itemised notice |
| Wrong numbers | Splits, missing prices, FIFO assumption, XIRR edge cases | Warnings, "as of", coverage counts, labelled assumptions, tested fixtures |
| Tax errors | Rules change; mistakes land on a return | Versioned config with stale warning; classify not compute; "check with your CA" |
| Scope creep | Tier 3–4 is large | Build triggers (§11); each tier is a separate decision |
| Benchmark honesty | Price index excludes dividends | Label it, or hold back until a total-return series exists |
| Provider terms | New page showing provider prices | Same data and terms as the watchlist; open data-terms question |

---

## 14. Sources (accessed 2026-10-05)

- Zerodha Console, holdings analytics — what it shows (XIRR, dividends, contributors, timeline):
  https://support.zerodha.com/category/console/portfolio/console-holdings/articles/console-analytics
- Zerodha Console, holdings report (.xlsx, by date, from April 2017; column names not published):
  https://support.zerodha.com/category/console/portfolio/console-holdings/articles/holding-report
- Groww, portfolio analysis (AUM over time, sector and cap allocation, XIRR, Nifty 50 benchmark):
  https://groww.in/updates/portfolio-analysis-on-groww
- INDmoney, portfolio analytics (XIRR, benchmark, dividends, sector, cap, family):
  https://www.indmoney.com/stocks/portfolio-analytics
- mProfit, capital gains ready reckoner FY 2025-26 (rates, ₹1.25 lakh, surcharge cap):
  https://www.mprofit.in/blog/2026/07/capital-gains-tax-ready-reckoner-fy-2025-26/
- Section 112A grandfathering: https://www.manipalcigna.com/blog/section-112a-of-income-tax-act
  and https://scripbox.com/mf/section-112a-income-tax-act/
- Capital-loss set-off and 8-year carry-forward: https://cleartax.in/s/set-off-carry-forward-capital-losses
  and https://www.taxmann.com/post/blog/faqs-income-tax-returns-itr-set-off-losses/
- SEBI Investment Advisers Regulations 2013, definition of investment advice:
  https://indiacorplaw.in/2013/01/sebi-investment-advisers-regulations.html and
  https://icmai.in/upload/pd/SEBI-IA-Regulations-2013.pdf
- DPDP Rules 2025 (notified 14 Nov 2025; phased dates): https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/
  and the KPMG guidance PDF.
- XIRR and its limits (short periods, multiple solutions): https://freefincal.com/compute-xirr-annualized-return-of-stocks-and-stock-portfolio-with-this-sheet/
  and https://support.zerodha.com/category/console/portfolio/holdings/articles/xirr-and-cagr-for-equity
- User pain points (corporate actions, manual entry, one-broker limits): vendor and forum
  snippets from search, directional only.

## 15. What the owner decides

1. **A, B or C?** (§1) — blocks everything.
2. Include gain and loss in Tier 1? (assumed yes)
3. Ship Tier 1 to everyone after the privacy update? (assumed yes)
4. Tier 2–4: adopt the build triggers in §11, or pick tiers now?
5. Analytics: first-party counters (§12.2) or a cookieless tool? (assumed first-party)
6. Supply 2–3 real broker holdings files (with the numbers blanked) when import is wanted.
