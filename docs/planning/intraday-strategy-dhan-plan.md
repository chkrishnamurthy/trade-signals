# Intraday Strategy (Dhan data) — one strategy, one clean page, paper-trading ready

**Status:** Plan **agreed in review on 2026-09-17** (decisions below). **Phases 1–3 implemented** on branch `feat/intraday-orb-strategy` (see §13). Phases 4–6 remain.
**Date:** 2026-09-17 (revised the same day after review)
**Replaces:** the `/signals` page and its *Confirmed VWAP Trend Pullback* evaluator
(`packages/core/src/vwap-strategy.ts`), documented in
[signals-page-plan.md](signals-page-plan.md) / [signals-implementation.md](signals-implementation.md).
**Data:** Dhan, through the existing `MarketDataProvider` boundary
([dhan-provider-plan.md](dhan-provider-plan.md)).

> Plain-language sections come first (§1–§4: what the strategy is and what the page
> shows). Engineering detail follows (§5–§11). Every rule is numeric; every number
> lives in versioned config, not in a component.

### Decisions recorded in review (2026-09-17)

| Topic | Decision |
| --- | --- |
| Orders | **Signals only.** No real Dhan orders, no order APIs, no structures prepared for them. Paper trading = simulation in our own database. |
| Vocabulary | The recommended page words (§2.2): *Entry level, Stop level, Target 1, Target 2, Direction, Shares (simulated), Auto-follow, Result*. Never "entry price / side / quantity / position / auto-trade". |
| Title | **"Intraday Strategies"** — no broker name in the title. A small header badge shows the data source ("Data: Dhan"). The page runs one strategy; the overview card names it. |
| Components | Reuse the existing components that fit (`AppShell`, `Card`, `Badge`, layout, polling); delete the ones this page does not need (detail sheet, chart, quality score, filters, pagination, old signal cards). §7 lists each. |
| "1R / 2R" | Replaced everywhere by plain words: **risk distance** = the gap between the entry level and the stop level. Target 1 is one risk distance from entry, Target 2 is two. The page never shows the letter "R". See §1 and §3.5. |
| First build | **Phases 1–3 in one pass** (core → persistence/worker → page). Paper controls stay a placeholder (phase 4 later). |
| Shared paper capital | **₹5,00,000** in `config/intraday-orb.yaml` until per-user controls exist; 1 % risk = ₹5,000 per trade. |
| Old `/signals` | **Replaced immediately** when `/intraday` lands: redirect, old VWAP jobs stop, old code deleted in the same change; old tables kept until the phase-6 export. |
| Git | Feature branch off `main`, no commits until the user has reviewed the diff. |
| D3–D6 | Defaults adopted as recommended (50 % booked at Target 1; NIFTY 50 universe; export-then-drop old tables in phase 6; new route `/intraday` with a redirect from `/signals`). Say so if any should change. |

---

## 0. The answer in five sentences

1. **One strategy replaces all existing ones:** *Opening Range Breakout with VWAP and
   volume confirmation* ("ORB-VC") on 5-minute candles, NIFTY 50 universe, one trade per
   stock per day, Target 1 one risk distance away and Target 2 two, structure stop at the opposite side
   of the opening range, 50 % booked at Target 1, stop to breakeven, everything closed by
   15:15 IST.
2. **The page is rewritten from scratch** as five stacked cards: overview → signals →
   today's paper trades → rules → paper-trading controls (placeholder). Old components,
   the detail sheet, the quality rubric and the score breakdown are removed.
3. **The old evaluator goes; the data spine stays.** Minute ingestion, 5-minute
   `time_bucket` reads, the append-only event model, the paper journal's sizing/cost maths
   and the worker's scheduling are infrastructure, not strategy logic, and they are reused
   unchanged where possible (§7).
4. **Dhan supplies every observation this page needs** — 1/5/15-minute history for
   warm-up and replay, 1,000-symbol bulk quotes every 5 s for live status, and (later)
   its 5,000-symbol socket. Market-status stays on Fyers (Dhan has no endpoint) until the
   session calendar replaces it. All via env routes; no code names a broker.
5. **Order placement is not built and no structures are prepared for it.** CLAUDE.md
   forbids order execution of any kind, including read-only. "Paper trading" here means a
   simulation the worker runs against our own database. See §2.1 — this is the one place
   the plan deliberately departs from the prompt.

---

## 1. The strategy in one minute

**What it looks for.** Each morning the first 15 minutes (09:15–09:30) set a price range
for every NIFTY 50 stock. When a 5-minute candle later *closes* outside that range —
above it for a BUY, below it for a SELL — **and** price is on the right side of the
day's VWAP **and** the candle traded at least 1.5× its normal volume, the stock is
"breaking out" with participation behind it. That is the signal.

**What it risks.** The stop sits just beyond the other side of the opening range: if
price goes back through the whole range, the breakout failed. Risk per trade is fixed at
1 % of capital.

**What it aims for — in plain words.** Every trade has an entry level and a stop level.
The gap between them is the **risk distance**: the most the trade should lose per share.
Target 1 is the same distance *in your favour*; Target 2 is twice that distance.

> Example: entry ₹2,956.40, stop ₹2,934.50 → risk distance **₹21.90** per share.
> If the trade fails you lose ₹21.90 per share.
> Target 1 = 2,956.40 + 21.90 = **₹2,978.30** (you make back exactly what you risked).
> Target 2 = 2,956.40 + 43.80 = **₹3,000.20** (you make twice what you risked).

Half the shares are booked at Target 1 and the stop is moved up to the entry level, so
the remaining half can only win or come out flat. Anything still open at 15:15 is closed.
This is why one winning trade that reaches Target 2 pays for more than one losing trade:
a loss costs one risk distance, a full win earns one-and-a-half (half at 1×, half at 2×).

**Why this one.** It is the most widely documented rule-based intraday setup, needs no
discretionary reading of charts, every input is observable from closed candles, and it
can be replayed day by day from stored 1-minute data to check that the live signals were
right. It is chosen for *clarity and testability*; nothing in this document claims it is
profitable. That is what the daily paper run is for.

---

## 2. Decisions that differ from the prompt

These are the points where following the prompt literally would break a project rule.
Each has a recommendation; the user decides (§12).

### 2.1 No Dhan order APIs, no "structures for future order placement"

CLAUDE.md: *"Do not build order execution of any kind — no place/modify/cancel order,
order book, positions, funds, holdings … Not even read-only."* The Dhan Data API
subscription we hold is for prices; the app never calls `/orders`. Paper trading is a
worker-side simulation writing to our own tables (the existing journal already does this).
If live execution is ever wanted, that is a CLAUDE.md change first, then a separate plan.
Nothing in this plan — no DTO, no table column, no "coming soon" flag — is shaped for it.

### 2.2 Vocabulary on the page

CLAUDE.md allows BUY / SELL for direction and nothing else order-shaped. The prompt's
column names map as follows and the mapping is used everywhere (UI, DTOs, docs):

| Prompt says | Page says | Why |
| --- | --- | --- |
| Entry price | **Entry level** (planned) / **Filled at** (simulated fill) | a technical level, not an order price |
| Stop loss price | **Stop level** | same |
| Target 1 / Target 2 | **Target 1** / **Target 2** | fine as-is |
| Side | **Direction** (BUY / SELL badge) | "side" is order language |
| Quantity / position | **Shares (simulated)** / **Paper trade** | never "quantity", never "position" |
| Auto-trade on/off | **Auto-follow signals** (paper) | "trade" implies execution |
| P&L | **Result (₹ / %)**, with "simulated" in the column group header | keeps it honest |

### 2.3 Page title — decided

Title **"Intraday Strategies"** (user's choice), subtitle *"Paper trading ready, clean
signals, fixed targets"*, and a small header badge **"Data: Dhan · live"** driven by the
provider's `displayName` (so it reads "Dhan + Fyers" when routed). No broker name in the
title, matching CLAUDE.md's *"the provider is a market-data provider, not the product."*
The title is plural for future room; today the page runs exactly one strategy and the
overview card names it.

### 2.4 Reuse of the existing spine

Prompt: *"do not reuse old strategy logic."* Honoured for `vwap-strategy.ts`, the quality
rubric, the pullback state machine and every `/signals` component. **Not** applied to
infrastructure that has no strategy in it: minute ingestion, `getSignalBars` (5-minute
`time_bucket`), the append-only events pattern, `paper-journal.ts` cost/sizing maths, the
worker scheduler and the quote-sampling cycle. Rewriting those would add weeks and
re-introduce solved bugs (§7 lists exactly what is kept, changed and deleted).

---

## 3. Strategy specification (ORB-VC v1) — all rules numeric

Everything in this section becomes `config/intraday-orb.yaml` (operational settings) and
a frozen `ORB_CONFIG` object in core (thresholds). Changing a threshold mints a new
`strategy_versions` row (hard rule 7).

### 3.1 Universe and stock filters (evaluated once per day at 09:30)

| Rule | Value | Source |
| --- | --- | --- |
| Universe | NIFTY 50 constituents from `config/indices.yaml` (`nifty50`) | existing |
| Minimum price | Previous close ≥ **₹100** | daily candles |
| Minimum liquidity | Mean turnover over the previous **20 sessions ≥ ₹25 crore** (close × volume from daily candles) | existing gate |
| Complete history | All 20 daily bars present and ≥ 250 closed 5-minute bars of warm-up | reject otherwise |
| Corporate action in warm-up window | Skip the stock for the day | existing behaviour |

### 3.2 Time filter (all times IST, exchange session 09:15–15:30)

| Event | Time |
| --- | --- |
| Opening range (OR) | candles opening at 09:15, 09:20, 09:25 → complete at **09:30:00** |
| First signal candle | the 09:30–09:35 candle (evaluated at 09:35:00) |
| Last signal candle | the 14:25–14:30 candle (evaluated at **14:30:00**) |
| Latest simulated entry | 14:30 (next candle open) |
| Square-off | first covered quote at or after **15:15:00** |
| No evaluation | outside a normal session; special/muhurat sessions are skipped |

### 3.3 Opening range

- `orHigh` = max high, `orLow` = min low of the three 5-minute candles 09:15–09:30.
  All fifteen 1-minute bars must be present; otherwise no OR, no signals for that stock.
- `orMid` = (orHigh + orLow) / 2 (paise, rounded down).
- `orRangeBps` = (orHigh − orLow) × 10 000 / orMid.
- **Tradeable only if 25 bps ≤ orRangeBps ≤ 100 bps.** Narrower ranges produce false
  breaks on noise; wider ranges make the stop too far for a 1 % risk budget.

### 3.4 Entry conditions (checked on each closed 5-minute candle `c`, first qualifying candle only)

BUY when **all** hold:
1. `c.close > orHigh`
2. `c.close > sessionVWAP(c)` (VWAP from 09:15, computed on the session's closed 5-minute candles as Σ typical price × volume ÷ Σ volume, typical price = (high + low + close) / 3; resets every session)
3. `c.volume ≥ 1.5 × mean(volume of the previous 20 closed 5-minute candles)` — the
   baseline spans into the prior session when fewer than 20 exist today; a zero or missing
   baseline is *unavailable* and blocks (never treated as 1.0)
4. `(c.close − orHigh) × 10 000 / orHigh ≤ 50 bps` — not already extended
5. Candle body ≥ 50 % of its range (`|close − open| / (high − low)`; zero range rejects)
6. No earlier signal for this stock today (one per stock per day, whatever the outcome)
7. The candle closed at or before 14:30:00

SELL mirrors every rule: `close < orLow`, `close < VWAP`, extension measured below `orLow`.

Reference level `ref` = `c.close` (known at signal time; all levels derive from it).

### 3.5 Technical levels (integer paise, rounded to the instrument tick)

```
buffer      = floor(orLow × 5 / 10 000)                        # 5 bps structure buffer
stopRaw     = orLow − buffer            (SELL: orHigh + buffer)
stop        = roundDownToTick(stopRaw)  (SELL: roundUpToTick)
risk        = ref − stop                (SELL: stop − ref)      # the "risk distance"

minRisk     = ref × 30 / 10 000          # 0.30 %
maxRisk     = ref × 120 / 10 000         # 1.20 %
if risk < minRisk: stop = roundDownToTick(ref − minRisk); risk = ref − stop
if risk > maxRisk: NO SIGNAL (reason: STOP_TOO_WIDE)

target1     = roundUpToTick(ref + 1 × risk)   (SELL: roundDown, ref − risk)
target2     = roundUpToTick(ref + 2 × risk)   (SELL: ref − 2 × risk)
```

**In plain words:** the stop goes a hair below the morning range's low (for a BUY). The
gap from the signal price down to that stop is the *risk distance*. If that gap is smaller
than 0.30 % of the price, the stop is pushed down to 0.30 % (too-tight stops get hit by
noise); if it is bigger than 1.20 %, there is no signal (the range is too wide to risk
only 1 % of capital sensibly). Target 1 = signal price + one risk distance; Target 2 =
signal price + two risk distances. SELL is the mirror image.

Targets round in the favourable direction so ticks never shrink the reward. Tick size
comes from instrument metadata (₹0.05 for most NIFTY 50 names; ₹0.01 below ₹250).
Levels are **frozen at publication** and never edited; the breakeven move is recorded as
an event with a new *effective* stop, not an update of the published stop.

### 3.6 Simulated fill (closed-candle rule, hard rule 2)

- The signal is evaluated at the candle close; the simulated entry is the **next candle's
  open**: live, the first covered quote at/after the close timestamp; in replay, the open
  of the next 1-minute bar. Adverse slippage 2 bps per side, rounded to tick (existing
  `estimatedFill`).
- **Slip guard:** if the fill would be more than **30 bps** beyond `ref` in the trade
  direction, the signal is marked **Skipped — entry slipped** and never becomes a trade.
- No fill can be backdated: a signal published at 09:35:02 cannot fill from a 09:35:00
  print the worker did not observe.

### 3.7 Exit rules

| Event | Rule |
| --- | --- |
| Stop hit | Any covered quote ≤ stop (BUY) / ≥ stop (SELL) → exit **all** remaining shares at `stop` minus 2 bps slippage (worse if the observed price gapped through: use the observed price). |
| Target 1 hit | First quote ≥ target1 → exit **floor(shares / 2)** at target1 (minus slippage). If `shares < 2`, no partial. Effective stop moves to the **filled entry price** (breakeven; after costs this is a small loss and the page says so). |
| Target 2 hit | Exit all remaining at target2 (minus slippage). Terminal. |
| End of day | First covered quote at/after 15:15:00 → exit remaining at that price. Terminal, reason `EOD`. |
| Same-bar ambiguity (replay only) | If a 1-minute bar touches both stop and a target, **stop wins**. Live, the observed quote order is authoritative. |
| Coverage gap | If quote coverage breaks (> 15 s between samples), the trade's outcome becomes **Unavailable** rather than invented. Existing behaviour. |

### 3.8 Risk rules (paper book, per user once controls ship; per shared book until then)

| Rule | Value |
| --- | --- |
| Risk per trade | **1 %** of capital: `riskBudget = floor(capitalPaise × 100 / 10 000)` |
| Shares | `min( floor(riskBudget / (fill − stop)), floor(unreservedCapital / fill) )` — no leverage, full cash reservation; 0 shares → **Not taken — too expensive** |
| Max trades per day | **5** |
| Max open at once | **3** |
| Per stock per day | **1** |
| Daily loss halt | Realised + marked result ≤ **−2 %** of capital → no new trades today (open ones run to their exits) |
| Same-candle contention | If more signals fire on one candle than slots remain, take the highest relative volume first; tie-break by symbol A→Z (deterministic) |

Signals beyond the caps are still **shown** on the signals card with status
**Not taken — daily limit**, so the user sees everything the strategy fired.

### 3.9 No-trade conditions

| Condition | Threshold | Scope |
| --- | --- | --- |
| Stock gap | \|09:15 open − previous close\| > **3 %** | that stock, whole day |
| Index shock | \|NIFTY 50 at 09:30 − previous close\| > **2 %** | whole universe, whole day |
| OR too narrow / too wide | outside 25–100 bps (§3.3) | that stock |
| Stop too wide | risk > 1.2 % (§3.5) | that signal |
| Thin candle | volume baseline unavailable, or RVOL < 1.5 | that candle |
| Stale data | 5-minute bucket not available within 30 s of close, or quote older than 5 s at publication | that candle |
| Session | not a normal 09:15–15:30 session | whole day |

Every rejection is persisted with its reason so the page can show "why no trade".

### 3.10 Status vocabulary (exactly what the page shows)

| Status | Meaning |
| --- | --- |
| **New** | Published within the last 5 minutes (badge, in addition to the state below) |
| **Pending** | Published; waiting for the next-candle fill |
| **Active** | Filled; no target or stop touched yet |
| **Target 1 hit** | Half booked, stop at breakeven, remainder running |
| **Target 2 hit** | Closed in full at Target 2 (green) |
| **Stopped out** | Closed at stop — original or breakeven (red / neutral) |
| **Closed EOD** | Squared off at 15:15 |
| **Skipped** | Fired but not traded: *entry slipped*, *daily limit*, *loss halt*, *too expensive* |
| **Unavailable** | Coverage gap; outcome cannot be reconstructed |

---

## 4. Worked example (hand-computed; the code's cost model is authoritative)

Capital ₹5,00,000 · risk 1 % = ₹5,000 · tick ₹0.05 · slippage 2 bps/side.

**BUY — RELIANCE, 2026-09-17**

| Step | Value |
| --- | --- |
| Opening range 09:15–09:30 | high ₹2,950.00 · low ₹2,936.00 · mid ₹2,943.00 · range 14.00 = **48 bps** ✓ |
| Signal candle 09:45–09:50 | close **₹2,956.40** (> orHigh, +22 bps ≤ 50 ✓) · VWAP ₹2,943.10 (close > VWAP ✓) · volume 1.8× 20-bar mean ✓ · body 71 % ✓ |
| Published | 09:50:02 IST, direction **BUY**, ref = ₹2,956.40 |
| Stop level | orLow − 5 bps = 2,936.00 − 1.468 → **₹2,934.50** (rounded down to tick) |
| Risk distance | 2,956.40 − 2,934.50 = **₹21.90** (74 bps, within 0.30–1.20 %) |
| Target 1 | 2,956.40 + 21.90 = **₹2,978.30** |
| Target 2 | 2,956.40 + 43.80 = **₹3,000.20** |
| Fill (next candle open) | first quote 09:50:03 = ₹2,956.50 + 2 bps slippage (₹0.60, rounded up to tick) → filled **₹2,957.10** (+2 bps of ref, slip guard ✓) |
| Shares | floor(5,000 / 22.60) = 221 → cash cap floor(5,00,000 / 2,957.10) = **169** (no leverage) · initial risk ₹3,819.40 |
| 10:35 | Target 1 touched → exit **84** at 2,978.30 − 0.60 slippage = ₹2,977.70 · stop → ₹2,957.10 (breakeven) |
| 12:40 | Target 2 touched → exit **85** at 3,000.20 − 0.61 = ₹2,999.59 → ₹2,999.55 (rounded down to tick) · **Target 2 hit** |
| Gross result | 84 × 20.60 + 85 × 42.45 = ₹1,730.40 + ₹3,608.25 = **₹5,338.65** |
| Estimated charges | ₹135.87 (T1 leg) + ₹137.47 (T2 leg) = **₹273.34** — each exit leg is charged as its own round trip (entry brokerage cap counted per leg), which slightly overstates cost; `nse-cash-2026-09-12-v1` rates |
| Net result | **₹5,065.31 · +1.01 %** of ₹4,99,749.90 deployed · **1.33× the amount risked** (₹3,819.40 was the most this trade could have lost at the stop). These exact figures are asserted in `packages/core/src/intraday/lifecycle.test.ts`. |

**Signals card rows the same day (illustrative):**

| Symbol | Dir | Entry level | Stop | Target 1 | Target 2 | Current | Status | Time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RELIANCE | BUY | 2,956.40 (filled 2,957.10) | 2,934.50 → 2,957.10 | 2,978.30 ✓ | 3,000.20 ✓ | 3,001.55 | Target 2 hit | 09:50 |
| HDFCBANK | SELL | 1,612.00 (filled 1,611.75) | 1,624.90 | 1,599.10 | 1,586.20 | 1,626.30 | Stopped out (full risk lost) | 09:35 |
| TATASTEEL | BUY | 172.60 (filled 172.65) | 171.15 | 174.05 ✓ | 175.50 | 173.20 | Target 1 hit · running | 10:15 |
| INFY | BUY | 1,540.00 | 1,527.50 | 1,552.50 | 1,565.00 | — | Skipped — entry slipped (fill 1,545.40 = +35 bps) | 11:05 |
| ITC | SELL | 412.30 | 415.90 | 408.70 | 405.10 | 411.80 | Not taken — daily limit | 13:20 |

**Today's trades row for RELIANCE:**

| Symbol | Dir | Entry time · filled | Stop / T1 / T2 | Exit time · level | Result ₹ | Result % | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RELIANCE | BUY | 09:50 · 2,957.10 × 169 | 2,934.50 / 2,978.30 / 3,000.20 | 10:35 · 2,977.70 × 84 ; 12:40 · 2,999.55 × 85 | +5,065 (net, simulated) | +1.01 % | T1 → T2 |

---

## 5. Page design

Route: **`/intraday`** (new; `/signals` redirects to it during the switch, then is
removed). Private, `noindex`, authenticated, one navigation entry replacing "Signals".
Built on `AppShell`, `PageContainer`, `Card`, `Badge`, existing tokens — no new design
system, no new UI dependency.

```
IntradayPage                          apps/web/src/app/intraday/page.tsx (server; metadata, auth)
└─ IntradayDashboard                  components/intraday/intraday-dashboard.tsx (client; polling)
   ├─ PageHeader                      "Intraday Strategies" · subtitle · SessionBadge (IST clock, phase) · DataSourceBadge ("Data: Dhan · live / stale / closed") · RefreshControl
   ├─ StrategyOverviewCard            overview.tsx — 3-line description + KeyParameters grid (timeframe, indicators, risk/trade, T1/T2/SL logic, universe, window)
   ├─ SignalsCard                     signals-card.tsx
   │   ├─ SummaryStrip                counts: new · pending · active · T1 · T2 · stopped · EOD · skipped
   │   ├─ SignalsTable (≥ md)         signals-table.tsx — the 9 columns from §4, sortable by time only
   │   └─ SignalRowCard (< md)        signal-row-card.tsx — same fields stacked, one per row
   ├─ TodaysTradesCard                trades-card.tsx — table (≥ md) / stacked cards (< md); footer totals (net ₹, %, R, wins/losses)
   ├─ StrategyRulesCard               rules-card.tsx — four bullet groups rendered FROM the versioned config (never hand-typed numbers)
   ├─ PaperTradingCard                paper-controls.tsx — "Coming soon — paper trading mode"; disabled toggle, capital input, auto-follow switch
   └─ Disclaimer                      the mandated research disclaimer, always visible
```

Rules the design follows:

- **Cards, tables, one accent per state.** Green = BUY / targets hit / positive result;
  red = SELL / stopped / negative; neutral = pending, active, EOD, skipped. Colour is
  never the only carrier — every status has its text label; direction has an arrow icon.
- **New badge** on any signal whose `publishedAt` is within 5 minutes of the page's server
  time (the API returns `serverNow`; the client never uses its own clock for this).
- **Numbers, not percentages, first.** Every level is a formatted rupee value; the %
  reading is secondary text. **The letter "R" never appears on the page.** Where the
  engine reasons in risk multiples, the page says "risk distance ₹21.90" and results read
  "+₹5,089 (1.3× the amount risked)".
- **Mobile:** single column, 16 px gutters, tables become stacked cards below `md`,
  44 px touch targets, no horizontal page scroll.
- **Empty and error states** are distinct and explicit: *Market closed*, *Before 09:35 —
  opening range forming*, *No signals yet today*, *Data unavailable (since hh:mm)*,
  *Scanner paused*. A 200 response is not proof of a live feed; freshness comes from the
  scanner's last successful cycle timestamp.
- **Strategy rules card is generated** from the same config object the engine uses, so
  the page can never drift from what runs.
- **Removed on purpose:** detail sheet, candle chart, quality score, factor breakdown,
  filters, pagination, sorting controls, watchlist filter, per-card "Inspect". If a chart
  is wanted later it is a separate addition.

---

## 6. Dhan data usage

All calls go through `MarketDataProvider`; the strategy, worker and web never import a
Dhan type (provider-boundary rule). Production env for this feature:

```
MARKET_DATA_PROVIDER=routed
MARKET_DATA_ROUTE_BARS=dhan            # daily bars (liquidity, gap filter)
MARKET_DATA_ROUTE_INTRADAY_BARS=dhan   # 1m history: warm-up 14 days, replay any day in the last 5 years
MARKET_DATA_ROUTE_QUOTES=dhan          # 1 call / 5 s covers NIFTY 50 + index (1,000-symbol calls)
MARKET_DATA_ROUTE_INSTRUMENTS=dhan     # tick sizes, security ids
MARKET_DATA_ROUTE_STATUS=fyers         # Dhan has no market-status endpoint
MARKET_DATA_ROUTE_STREAM=fyers         # phase 5 flips this to dhan
```

| Need | Dhan capability | How the plan uses it |
| --- | --- | --- |
| Historical intraday for backtest / replay | 1-minute bars, 5 years deep, 90 days per request | Ingest 1m into `minute_candles` (append-only); derive 5m via `time_bucket` anchored 09:15 IST. Never persist 5m. The replay script reads only stored candles, so a backtest never hits the API twice. |
| Live quotes / signal status | Quote API, 1,000 symbols per call, 1 call/s | Worker samples once every 5 s (51 symbols, one call). Lifecycle (fill, T1, T2, stop, EOD) is driven from these samples, tagged with `continuous`/`receivedAt` for coverage checks. |
| Live socket (later) | 5,000 symbols per connection | Phase 5 (§10): replaces the 5-s sampling with tick observations, which removes most "Unavailable" outcomes. Interface already exists (`subscribe`/`unsubscribe`); only the route env changes. |
| Market status | none | Fyers route + the worker's session calendar. When both disagree, no scan. |
| Order placement | not used | see §2.1 |

Budget: warm-up 51 × 1 request (14 days ≤ 90-day window) at 08:50; scan reads from the
DB; quotes 720 calls/hour in session — well under Dhan's 5/s and 100k/day.

Caveat carried over from the Dhan plan: broker data terms allow personal use only; once
the app has public users, live prices must come from an authorised vendor. The provider
boundary absorbs that too.

---

## 7. What is kept, changed and deleted

| Layer | Keep as-is | Change | Delete |
| --- | --- | --- | --- |
| Core | `indicators/vwap.ts`, `atr.ts`, `validBar`, `aggregateClosedMinutes`, `relativeVolume`, `coherentSignalBars` (move to `intraday/bars.ts`), `paper-journal.ts` cost/sizing/performance, `signal-lifecycle.ts` mechanics (coverage, slippage, stop-wins) | Lifecycle gains **partial exit at T1** and a `remainingShares` field; `updateSignalStatus` becomes strategy-neutral | `vwap-strategy.ts`, `vwap-fixture.ts`, their tests |
| Shared contracts | error envelope, `paiseSchema`, `sessionOpen` | `trade-signals.ts` → `intraday.ts`: strategy-neutral `levels` (drop the old `target1 ≥ 1.5 × risk` invariant, which is VWAP-specific; new invariant `target1 = ref ± riskDistance`, `target2 = ref ± 2 × riskDistance` on tick), new `status` enum (§3.10), `skipReason`, `partial` fields | quality/score/checklist/overlay DTOs |
| DB | `minute_candles`, `signal_scan_runs`, `signal_quotes`, `signal_observations`, `paper_equity_marks` | New `intraday_signals` + `intraday_signal_events` (strategy-neutral columns, `strategy_version_id`), `paper_trades` + `paper_trade_events` with partial-exit rows; one partial unique index per (instrument, session) for non-terminal states | `vwap_signals`, `vwap_signal_events`, `paper_studies`, `paper_study_events` — **after** a retention export (D5) |
| Worker | scheduler, overlap prevention, `context.ts`, warm-up at 08:50, quote cycle every 5 s, reconcile every minute | `jobs/vwap-signals.ts` → `jobs/intraday-orb.ts`: OR build at 09:30:02, scan at `2 */5 9-14 * * 1-5` bounded to 09:35–14:30, square-off job at 15:15:00, daily-halt check inside the scan | old job |
| Web server | `require-user`, `provider.ts`, `market-status.ts`, `history.ts` | `server/trade-signals.ts` → `server/intraday.ts` | — |
| API | conventions (`ok`, `parseBody`, `jsonError`, no-store, Node runtime) | see §8 | `/api/signals/*`, `/api/paper-trades` |
| Web UI | `AppShell`, `Card`, `Badge`, layout, tokens, `feed.ts` polling | new `components/intraday/*`, new page | `app/signals/`, `components/signals/*` incl. stories |
| Config | `indices.yaml`, `strategy_versions` mechanism | `config/vwap-signals.yaml` → `config/intraday-orb.yaml` | — |
| Scripts | `dhan-probe.ts` | new `scripts/replay-intraday.ts` (§9) | — |

---

## 8. API (protected, Node runtime, `no-store`, Zod on input and output)

| Endpoint | Returns |
| --- | --- |
| `GET /api/intraday/today` | One snapshot: `serverNow`, session phase, data source + freshness, scanner status, strategy version + config summary (for the overview/rules cards), all of today's signals with current price, status and **risk distance**, today's paper trades with results and footer totals. One request feeds the whole page; polled every 5 s while the tab is visible (existing `feed.ts` behaviour). |
| `GET /api/intraday/day/[yyyy-mm-dd]` | Same shape for a past session (read-only review; "what would have triggered on day X"). |
| `GET /api/intraday/rules` | The versioned config as JSON, so the rules card and docs render from one source. |
| `POST /api/intraday/paper/settings` *(phase 4 only)* | `{ enabled, capitalPaise, autoFollow }` for the current user; idempotent; server validates and never accepts a `userId`. |

No engine or provider call happens on read. The web process only reads what the worker
wrote (worker write-boundary rule).

---

## 9. Determinism and daily testability

- **Same data → same signals.** The evaluator is a pure function
  `evaluateOrb(bars5m, bars1m, orb, config, asOf)`; no clock, no I/O. Tests assert that
  appending future bars or truncating past the decision index cannot change a decision.
- **Replay script** `scripts/replay-intraday.ts --date 2026-09-17 [--symbol RELIANCE]`
  reads stored 1-minute candles and daily candles only, runs the identical evaluator and
  lifecycle with next-1m-open fills, and prints the signals and trades tables of §4 plus
  totals. It writes nothing. Running it for the current day after the close is the daily
  check: **the live table and the replay table must match on every signal, level and
  reason**; the only allowed difference is the fill price (quote sample vs 1m open) and
  outcomes marked *Unavailable* live.
- **Backfill:** `--from`/`--to` runs a range of sessions day by day (Dhan's 5-year 1m
  depth makes a multi-month history one ingestion job). Output is a CSV plus a per-day
  summary — enough to judge expectancy before turning paper controls on. This is a
  research script, not a product page.
- **Fixtures:** mirrored BUY/SELL day fixtures with hand-computed OR, VWAP, RVOL, levels,
  partial exits, breakeven, EOD, slip-guard, daily limit and loss-halt cases. Expected
  values are computed independently, never by calling the code under test.

**Daily routine for the user (paper phase):**
1. 08:55 — worker log shows warm-up complete for 50/50 stocks (or which were skipped and why).
2. 09:30 — page shows "opening range set" per stock; index-shock / gap exclusions listed.
3. In session — signals appear at 5-minute closes; statuses move on quote samples.
4. 15:20 — every trade is terminal; footer shows net result in ₹, % and "× amount risked".
5. After close — run the replay for the day; diff against the page. Any mismatch is a bug, not a market event.

---

## 10. Phases and gates

| Phase | Scope | Gate |
| --- | --- | --- |
| 0 — Review | This document; decisions D1–D6 | User sign-off |
| 1 — Core strategy | `packages/core/src/intraday/{config,orb,levels,evaluate,lifecycle}.ts`, fixtures, no-lookahead tests, strategy-neutral contracts | All fixtures pass; Zod enforces `target1 = ref ± riskDistance` and `target2 = ref ± 2 × riskDistance` on tick |
| 2 — Persistence + worker | New tables + migration, repositories, `jobs/intraday-orb.ts`, YAML, replay script | Real-Postgres tests for one-live-signal, daily limits, partial exits, idempotent events; replay of three stored sessions matches hand-checked expectations |
| 3 — Page | `/intraday` route, six components, `/api/intraday/*`, navigation, `/signals` redirect, stories with SIMULATED fixtures | Responsive 320/390/1280, light/dark, all empty/error states, a11y pass; no console errors |
| 4 — Paper controls | Per-user settings, auto-follow enrolment, per-user book with the §3.8 caps, results footer per user | Cross-user isolation tests; capital reservation atomic; no retrospective fills |
| 5 — Dhan socket | `MARKET_DATA_ROUTE_STREAM=dhan`; tick observations replace 5-s samples | Fewer *Unavailable* outcomes over five sessions; no regression in replay identity |
| 6 — Retire old | Export then drop `vwap_*` / `paper_study*`, delete old code paths, update `docs/README.md`, `pending-features.md`, CLAUDE.md scope paragraph | Deploy via the normal main-branch pipeline; watch one full session |

Phases 1–3 are the "see what would have triggered today" deliverable. Phase 4 is what
the prompt calls "later switch to paper trading with minimal changes": it adds settings
and a per-user book; the engine, levels and lifecycle do not change.

---

## 11. Strategy pseudocode (TypeScript-shaped, pure)

```ts
// packages/core/src/intraday/evaluate.ts — pure; inputs are data + config + asOf
export function evaluateOrb(input: {
  bars5m: readonly Bar[];        // closed, ascending, session-aligned, ≥ 250 for warm-up
  daily: readonly Bar[];         // previous 21 daily bars (liquidity, gap filter)
  indexOpenMovePct: number | null; // NIFTY move at 09:30 vs previous close, bps
  tickSize: number;              // paise
  config: OrbConfig;             // frozen thresholds (§3)
  asOf: number;                  // evaluation instant (ms UTC), injected — never Date.now()
  alreadySignalled: boolean;     // one per stock per day
}): OrbDecision {
  const c = lastClosedBar(input.bars5m, input.asOf, config.barMs);
  if (!c || !insideWindow(c, config)) return reject('OUTSIDE_WINDOW');
  if (input.alreadySignalled) return reject('ALREADY_SIGNALLED');
  if (!liquidityOk(input.daily, config)) return reject('ILLIQUID');
  if (gapBps(input.daily, todayBars[0].open) > config.maxGapBps) return reject('GAP');
  if (input.indexOpenMovePct === null || abs(input.indexOpenMovePct) > config.maxIndexMoveBps) return reject('INDEX_SHOCK');

  const or = openingRange(todayBars, config);              // the first three 5m candles
  if (!or) return reject('OR_INCOMPLETE');
  const orRangeBps = (or.high - or.low) * 10_000 / or.mid;
  if (orRangeBps < config.minOrBps || orRangeBps > config.maxOrBps) return reject('OR_RANGE');

  const vwap = sessionVwap(todayBars);                     // from 09:15 on 5m candles, paise
  const rvol = relativeVolume(input.bars5m, indexOf(c));   // null → unavailable
  if (rvol === null || rvol < config.minRvol) return reject('VOLUME');
  if (bodyRatio(c) < config.minBody) return reject('BODY');

  const direction = c.close > or.high && c.close > vwap ? 'BUY'
                  : c.close < or.low  && c.close < vwap ? 'SELL' : null;
  if (!direction) return reject('NO_BREAKOUT');
  const extBps = direction === 'BUY' ? (c.close - or.high) * 10_000 / or.high
                                     : (or.low - c.close) * 10_000 / or.low;
  if (extBps > config.maxExtensionBps) return reject('EXTENDED');

  const levels = orbLevels({ ref: c.close, or, direction, tickSize: input.tickSize, config });
  if (!levels) return reject('STOP_TOO_WIDE');

  return signal({ direction, ref: c.close, levels, confirmationAt: c.openTime + config.barMs,
                  evidence: { or, vwap, rvol, bodyRatio: bodyRatio(c), extBps } });
}

// packages/core/src/intraday/lifecycle.ts — one pure step per observation
export function stepTrade(trade: PaperTrade, obs: PriceObservation, config: OrbConfig): PaperTrade {
  if (isTerminal(trade) || obs.at <= trade.cursor) return trade;
  if (!obs.continuous) return markUnavailable(trade, obs);
  const s = trade.direction === 'BUY' ? 1 : -1;
  const hit = (level: number) => s * (obs.price - level) >= 0;

  if (trade.status === 'PENDING') {
    const fill = slip(obs.price, +1, config);
    if (s * (fill - trade.ref) > trade.ref * config.maxSlipBps / 10_000) return skip(trade, 'ENTRY_SLIPPED');
    return filled(trade, fill, obs);
  }
  if (obs.at >= sessionTime(trade, config.squareOffIst)) return exitAll(trade, obs.price, 'EOD', obs);
  if (s * (obs.price - trade.effectiveStop) <= 0) return exitAll(trade, worse(obs.price, trade.effectiveStop, s), 'STOP', obs);
  if (trade.status === 'ACTIVE' && hit(trade.levels.target1)) return partialExit(trade, trade.levels.target1, obs); // half out, stop → fill
  if (trade.status === 'TARGET1_HIT' && hit(trade.levels.target2)) return exitAll(trade, trade.levels.target2, 'TARGET2', obs);
  return { ...trade, cursor: obs.at, last: obs.price };
}
```

---

## 12. Decisions — resolved

| # | Question | Outcome (2026-09-17) |
| --- | --- | --- |
| D1 | Page title | **"Intraday Strategies"**; data source shown as a header badge, not in the title |
| D2 | Target distances | Target 1 = one risk distance, Target 2 = two risk distances (§1 explains in plain words). One config line each if the user wants wider targets after paper results |
| D3 | Booking at Target 1 | 50 % of shares booked at Target 1, stop moved to entry (default adopted) |
| D4 | Universe | NIFTY 50 (default adopted); F&O list is a later config change |
| D5 | Old `vwap_*` / `paper_study*` data | Export to CSV, then drop in phase 6 (default adopted) |
| D6 | Route | `/intraday`, with `/signals` redirecting to it (default adopted) |
| — | Orders | Signals only; no real Dhan orders now or in any prepared structure |
| — | Vocabulary | As recommended in §2.2 |
| — | Components | Reuse what fits, delete the rest (§7) |

Next step: phase 1 (§10) on user go-ahead.
