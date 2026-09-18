# FinMagine vs EquityWise — Competitive Analysis

> **Status:** Analysis, 2026-09-17 (rewritten into the repo 2026-09-18). No code
> changes proposed here are implemented. Based on a public-site read of
> https://finmagine.com/ plus a read-only, logged-in walk of a Free-tier account.
>
> **Labelling.** Every observation is tagged so that it can be re-checked:
> **[observed]** seen directly on the site · **[inferred]** deduced from what was
> seen · **[EW-known]** EquityWise as it exists in the tree today · **[EW-planned]**
> in an existing planning doc · **[rec]** recommendation.
>
> **Brief confirmed with the product owner:** optimise for all three segments
> equally (intraday trader, beginner, long-term investor); data scope is open
> (fundamentals provider, NSE/BSE announcement ingestion, LLM interpretation are
> all candidates, costed separately from the Fyers/Dhan market-data spine); the
> product is free today — recommend a future paid boundary, but build no billing.

---

## 1. Executive summary

FinMagine is a **fundamentals-first research platform for long-term investors**
(India + US) with a scoring model, curated pick lists, a screener, breadth/RS
momentum views, insider-trade and announcement feeds, and a large education
library. It has **no intraday product and no graded signal history**. Its
acquisition wedge is a set of Chrome extensions that overlay Screener.in /
TradingView / Google Finance, plus a public REST + MCP API. **[observed]**

EquityWise is a **technical, closed-candle, integer-paise signal engine** with
per-user watchlists, a daily indicator pass, an intraday ORB strategy, an
institutional-flows view, an announcements page and a `/today` brief. It has no
fundamentals domain at all. **[EW-known]**

The two products overlap in *stock-attention* (which names deserve a look now)
but come at it from opposite directions. The competitive opening for EquityWise
is not to become FinMagine; it is to be the product FinMagine visibly is not:

1. **Explainable, auditable signals** — every score with its factor breakdown
   (EquityWise already stores `signal_factors`; FinMagine shows weights but no
   evidence). **[rec]**
2. **Public graded history** — a "Past Signals" page that shows how every signal
   resolved. FinMagine claims "10–20% better prediction accuracy" with nothing to
   back it. **[rec]**
3. **Horizon-segmented navigation** — Intraday / Swing / Investor as a first-class
   switch, because the brief asks for all three segments and FinMagine serves
   only one. **[rec]**
4. **Watchlist-scoped filings feed** — announcements + insider trades + bulk/block
   deals for *my* names, which FinMagine locks behind login and only partly
   personalises. **[rec]**

Fundamentals should come **last** (phase 4), sourced from free XBRL filings, not
bought — see §9.

---

## 2. Product overview — FinMagine

| Aspect | Finding | Tag |
| --- | --- | --- |
| Positioning | "Stop Investing Blind. Start Investing Like a Fund Manager." | observed |
| Audience | Long-term / quality / momentum investors; explicitly *not* day-traders | observed |
| Coverage | India + US, ~6,000 companies each (but three different company counts — 1,269 / 4,081 / 6,002 — appear on different pages) | observed |
| Scoring | 5-parameter weighted score: Financial Health 25, Growth 25, Competitive Position 20, Management 15, Valuation 15; sub-scores 2–10; percentile normalisation; Borda / WSUM / Markov rank aggregation | observed |
| Refresh | Rankings recalculated daily post-close, yet the methodology page says quarterly/semi-annual refresh is "optimal" — a contradiction | observed |
| Evidence | Claims "10–20% better prediction accuracy"; no backtest, no out-of-sample record shown anywhere | observed |
| Rendering | Pick / screener pages are client-rendered ("Loading…" without JS); price shown as "live" on one page and "cached" on another | observed |
| Compliance | Explicit "NOT a SEBI-registered investment adviser", educational-only wording, full disclaimer block; sits beside "80% off" promo banners | observed |
| Business model | Free / Premium ₹5,999 yr (landing: "80% off ₹30,645"; FAQ: ₹5,089 — inconsistent) / Professional ₹1,04,616 yr / separate API tier ("Premium ≠ API Pro") | observed |

---

## 3. Feature inventory

Legend for the *EquityWise* column: ✅ built · 🟡 partial / unwired · 📝 planned · ❌ absent.

| Area | FinMagine feature | Tier | EquityWise | Tag |
| --- | --- | --- | --- | --- |
| **Stock analysis** | Company page with scorecard, weighted sub-parameters and a rationale per sub-score | Free (basic) / Pro ("Scorecard Pro") | ❌ no company page | observed / EW-known |
| | VSTOP chart (volatility-stop overlay) | Premium ⭐ | ❌ | observed |
| | Catalyst markers on daily chart (earnings, announcements) | Free | ❌ | observed |
| | DuPont decomposition, financial model, CAGR tracker | Premium ⭐ | ❌ | observed |
| **Discovery** | Picks: Trader LIVE (Stage 2, VCP breakout, high-volume, IPO breakout, BRS), Top Quality, Momentum, Dividend Stars, Hidden Gems, Scans, Quarterly Results | Free shows top 5/10; full lists Premium | 🟡 daily signals exist, no curated lists | observed / EW-known |
| | Screener (fundamental + technical filters) | Free = 20 results; Premium = unlimited + export | ❌ (📝 `stock-research-platform-plan.md`) | observed / EW-planned |
| | Earnings Catalyst | Premium ⭐ | ❌ | observed |
| | AI Screen (natural-language screen) | Premium page, **bring-your-own API key** | ❌ | observed |
| | Ask AI | 25 paste-into-ChatGPT prompt templates — not an integrated model | ❌ | observed |
| **Markets** | Index dashboard, circuit breakers, sector RRG | Free | 🟡 `/today` brief | observed / EW-known |
| | Insider trades with "My Watchlist" filter | Free | 🟡 `/flows` (institutional), `/announcements` | observed / EW-known |
| | T2T surveillance list | Premium ⭐ | ❌ | observed |
| **Momentum setup** | Market breadth | Free | ❌ | observed |
| | RS momentum table with templated "why" sentences (truncated in UI) | Free (basic) | ❌ | observed |
| | RS-before-price, momentum streaks, conviction | Premium ⭐ | ❌ | observed |
| | Morning brief with a **regime line** ("are breakouts likely to work today") | Free | 🟡 `/today` has a brief, no regime line | observed / EW-known |
| **Data & events** | Earnings calendar, news, IPO tracker | Free | ❌ | observed |
| | Personalised announcements feed (corporate actions, insider, SAST) for watchlist stocks | Login | 🟡 `/announcements` (not watchlist-scoped) | observed / EW-known |
| **Investors** | Star-investor / MF / conglomerate holdings | Free | ❌ | observed |
| **Portfolio** | Zerodha / Groww CSV import; ≤20 stocks free, unlimited Premium | Free / Premium | ❌ (watchlists only, by design) | observed / EW-known |
| **Alerts** | My Alerts (real-time) | Premium ⭐ | ❌ | observed |
| **Strategy Lab** | Rule builder | Premium ⭐ | 🟡 replay/backtest scripts, not a UI | observed / EW-known |
| **Custom index** | User-defined baskets | Premium ⭐ | ❌ | observed |
| **AI Research Agent** | Premium ⭐ | — | ❌ | observed |
| **Acquisition** | 4 Chrome extensions (AI Advisor, Chart Builder, Trader, Portfolio Manager) over Screener.in / Google Finance / TradingView | Free | ❌ | observed |
| | 86-endpoint public REST + MCP server (Claude / Cursor / ChatGPT) | API tier | ❌ | observed |
| **Education** | 16 hubs aligned to NISM XV, 146+ articles, 28 calculators | Free | 🟡 `/methodology`, `/data-sources` | observed / EW-known |
| **Intraday** | — | — | ✅ `/intraday` ORB + VWAP + volume; 📝 paper trading | EW-known / EW-planned |
| **Signal outcomes** | None — no page shows how a pick resolved | — | 🟡 `signal_factors` + history API exist; no public page | observed / EW-known |
| **Explainability** | Weights shown; no per-signal evidence | — | ✅ `signal_factors` persisted per signal (hard rule 8) | observed / EW-known |

---

## 4. UX analysis — FinMagine

**Information architecture. [observed]** Six top-level menus (Stock Analysis,
Discovery, Markets, Momentum Setup, Data & Events, Investors) plus a landing nav
(Features / Picks / Learn / Premium / Community). Deep but flat: most menus open
straight into dense tables. Premium items are marked ⭐ inline in the menus,
which is honest but makes the free product feel like a demo.

**First-run. [observed]** The free tier is genuinely usable — screener capped at
20 results, top 5/10 of each pick list, breadth, morning brief, insider trades
with a watchlist filter. A new user can get value in the first session.

**Explainability. [observed]** The scorecard is the best part: each of the five
parameters lists its sub-parameters with weights and a one-line rationale. The RS
momentum table has a templated "why" sentence per row, but the cell truncates it.

**Quality debt. [observed]**
- `premium_required` raw error string leaked into the UI on a locked page.
- Bare Next.js-style 404 on a dead link.
- Footer rendered above empty-state content.
- Light shell around a dark page on at least one route.
- Three different "companies covered" counts.
- "Live" price on one page, "cached" on another, for the same symbol.
- Mobile: tables clip horizontally with no scroll affordance.

**Trust signals. [observed]** Disclaimer and SEBI non-registration are prominent,
but the same pages carry "80% off" countdown-style pricing and an unevidenced
accuracy claim. **[inferred]** The mix reads as marketing-led rather than
evidence-led, which is the gap EquityWise can occupy.

---

## 5. Strengths and weaknesses

### FinMagine strengths [observed unless noted]
- Breadth of fundamentals coverage and a coherent scoring vocabulary.
- Usable free tier → low-friction top of funnel.
- Chrome-extension wedge on Screener.in / TradingView — meets users where they
  already are. **[inferred]** Probably its cheapest acquisition channel.
- Public REST + MCP API — unusual for an Indian retail product; attractive to
  the power-user / builder segment.
- Education library sized like a content business; SEO moat. **[inferred]**
- Morning brief with a regime line — a small feature with high daily-return value.

### FinMagine weaknesses [observed unless noted]
- No evidence for any predictive claim; no signal outcome tracking.
- No intraday, no short-horizon product at all.
- "AI" features are mostly prompt templates or BYO-key; no integrated model.
- Pricing inconsistencies and promo language undercut the compliance posture.
- Visible quality debt (leaked errors, count mismatches, mobile clipping).
- Ranking refresh cadence contradicts its own methodology page.

### EquityWise strengths [EW-known]
- Auditable engine: closed candles, integer paise, hand-written indicators with
  fixtures, persisted factor breakdowns, immutable candle history.
- Intraday strategy with replay/backtest identity between live and historical.
- Multi-provider market-data spine (Fyers + Dhan, routed).
- Clean multi-user model with per-user watchlists.

### EquityWise weaknesses [EW-known]
- No fundamentals domain, no company page, no screener UI.
- Signal history exists in the DB but has no public, graded surface.
- Navigation has grown organically (`/today`, `/signals`, `/intraday`, `/flows`,
  `/announcements`, `/watchlists`, `/profile`) with no horizon framing.
- `/announcements` is global, not scoped to the user's watchlist.
- Thin education / methodology surface for beginners.
- No acquisition channel beyond the app itself.

---

## 6. Gaps by tier

What a FinMagine user at each tier gets that an EquityWise user does not, and
whether EquityWise should care.

| FinMagine tier | Gap for EquityWise | Should EW close it? | Tag |
| --- | --- | --- | --- |
| **Free** | Screener (20 rows), pick lists (top 5/10), breadth, morning brief w/ regime, insider w/ watchlist filter, catalyst markers, education | Yes — these are the cheapest, most-used surfaces and map onto data EW already has (`daily_indicators`, `/today`, `/flows`, `/announcements`) | rec |
| **Premium ₹5,999/yr** | VSTOP, earnings catalyst, T2T, RS-before-price, momentum streaks, Strategy Lab, alerts, unlimited screener/export | Partly — alerts and a technical Strategy Lab fit EW's engine; the fundamentals-flavoured ones do not (yet) | rec |
| **Professional ₹1,04,616/yr** | Scorecard Pro, financial model, custom index, AI Research Agent | No — this is a fundamentals-analyst product; out of scope until phase 4 | rec |
| **API tier** | 86-endpoint REST + MCP | Later — worth it only once there is a graded history worth exposing | rec |

---

## 7. Recommendations for EquityWise

Ordered by value ÷ cost. Each cites the data it can be built from today.

1. **Factor-breakdown card everywhere a score appears. [rec]**
   `signal_factors` is already persisted (hard rule 8). Render the same card on
   `/signals`, `/intraday`, `/today` and inside watchlist rows. This is the single
   most differentiating thing vs FinMagine's weight-only scorecard, and it costs
   only UI.

2. **Public "Past Signals" page — graded history. [rec]**
   Every daily and intraday signal, its entry level, invalidation level, outcome
   at fixed horizons (1d / 5d / 20d; or session close for intraday), and the
   aggregate hit-rate with a margin of error. The `history` API and the paper-
   trading grader (`docs/planning/paper-trading-plan.md`) already produce the
   inputs. FinMagine has nothing comparable; this is the trust wedge.

3. **Regime line on `/today`. [rec]**
   One sentence computed from breadth + index trend + realised volatility:
   "Breakouts have been following through / failing this week." Small feature,
   read daily, directly copied from the one thing FinMagine's brief does well.

4. **Watchlist-scoped Filings feed. [rec]**
   Merge `/announcements` + `/flows` (bulk/block/insider) into one feed filtered
   to the user's watchlists by default, with a global toggle. Data already
   ingested; see `announcement-interpretation-sources.md` for the interpretation
   layer to add later.

5. **Technical screener over `daily_indicators`. [rec]**
   RSI / EMA-cross / ATR-percentile / 52-week-high proximity / volume-vs-average
   filters with saved screens. Everything is already computed nightly; this is a
   query builder + table. Cap results only if it becomes a paid boundary.

6. **Horizon-segmented navigation. [rec]** See §10.

7. **Breadth page. [rec]**
   % of universe above 20/50/200 EMA, new highs/lows, advance/decline — all
   derivable from `daily_candles` / `daily_indicators`. Feeds recommendation 3.

8. **Alerts on watchlist names (later). [rec]**
   Price-level and signal-fired alerts via email (Resend is already in the auth
   plan). Natural first paid boundary.

9. **Fundamentals — phase 4, via free XBRL filings. [rec]** See §9.

**Explicitly not recommended:** Chrome extensions (maintenance burden, wrong
stage), portfolio import (crosses toward "positions", which the product rules
forbid), an "AI Research Agent" label without a graded output behind it.

---

## 8. Differentiation

| Axis | FinMagine | EquityWise position | Tag |
| --- | --- | --- | --- |
| Evidence | Claims, no record | Every signal graded and public; every score with its factors | rec |
| Horizon | Long-term only | Intraday · Swing · Investor, one product, one switch | rec |
| "AI" | Prompt templates / BYO key | Either an integrated interpreter with cited sources (announcements) or no AI label at all | rec |
| Data integrity | Mixed live/cached, count mismatches | Closed candles, integer paise, immutable history — say so on `/methodology` | EW-known |
| Compliance tone | Disclaimer beside "80% off" | Plain technical language, no promo, no order-shaped affordances (CLAUDE.md rules) | EW-known |
| Fundamentals | Core | Deferred; when added, from primary filings, not a licensed feed | rec |

---

## 9. Phased roadmap

| Phase | Scope | Depends on | Tag |
| --- | --- | --- | --- |
| **1 — Trust** | Factor card everywhere · Past Signals graded page · regime line on `/today` · breadth page | Existing tables only | rec |
| **2 — Attention** | Watchlist-scoped Filings feed · technical screener with saved screens · horizon nav | Phase 1; `announcement-interpretation-sources.md` | rec |
| **3 — Retention** | Email alerts on watchlist names · paper-trading page (already planned) · public read-only API for graded history | Auth email (Resend), `paper-trading-plan.md` | rec / EW-planned |
| **4 — Investor** | Company page with quarterly results, shareholding, ratios from NSE/BSE XBRL filings · simple fundamental filters in the screener | New `fundamentals` domain; `stock-research-platform-plan.md` | rec / EW-planned |

Paid boundary, if and when: phases 1–2 free; alerts, unlimited saved screens and
the API in phase 3 behind a subscription. No billing infrastructure is in scope
today (CLAUDE.md); the recommendation is only where the line would sit.

---

## 10. Proposed navigation

A horizon switch at the top, with each horizon owning a small, fixed set of
pages. Current routes map as shown. **[rec]**

```
[ Intraday | Swing | Investor ]        Watchlists · Filings · Past Signals · Profile

Intraday   → /intraday (ORB signals, live)   · /paper-trading (planned)
Swing      → /today (brief + regime line)    · /signals (daily setups)   · /screener
Investor   → /flows (institutional)          · /breadth                  · /company/[symbol] (phase 4)

Always     → /watchlists · /filings (announcements + insider + deals, watchlist-scoped)
           · /past-signals (graded history) · /methodology · /profile
```

Rationale: the brief asks for three segments equally; FinMagine serves one and
still needs six menus. A horizon switch keeps each segment's surface to three
pages and makes the daily "what do I look at first" answer obvious.

---

## 11. Final recommendation

Do not chase FinMagine's fundamentals breadth. Ship **phase 1 (trust)** first:
a factor card on every score and a public graded Past Signals page. Those two
turn EquityWise's existing engine invariants into a visible product promise that
FinMagine cannot match without rebuilding its methodology. Then close the cheap
free-tier gaps (regime line, breadth, watchlist-scoped filings, technical
screener) and reframe navigation by horizon. Fundamentals come last and from
primary filings.

---

## Appendix — method

- Public site read via fetch on 2026-09-17 (landing, methodology, pricing, FAQ,
  feature pages).
- Logged-in walk on a Free-tier account, read-only (navigation and tab clicks
  only), driven via Chrome remote debugging from a `puppeteer-core` script
  because the in-session MCP browser tools did not load. Screenshots and text
  dumps were kept in a session scratchpad and are not in the repo.
- No FinMagine data was copied; all figures above are as displayed on the site
  on that date and may have changed.
