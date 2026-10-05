---
name: Product review 2026-10
status: review
horizon: none
created: 2026-10-04
updated: 2026-10-05
area: [product, docs]
summary: End-to-end review of EquityWise as of 2026-10-04 — product state, bugs, gaps, trust, growth, roadmap, launch cost, mobile, premium, top-5 next steps.
owner: krishna
---

# EquityWise — product, QA and advisor review

**Date:** 2026-10-04
**Reviewer scope:** code in this repo, `CLAUDE.md`, `docs/`, `docs/planning/`, memory notes.
**Format rule:** each point says what, why it matters, severity, suggested fix.
**Labels used:** **[fact]** — I verified it in the repo. **[opinion]** — my judgement.
**[to verify]** — needs a live check (SEBI rule, provider licence, competitor price).

A short reader note first. The product has grown a lot in the last six weeks:
authentication, IPOs, screener, stock pages, breadth, calendar, flows, and an
admin-only intraday + paper-trading stack. That is a lot of ground to hold up at
once. This review is not a verdict on the code quality — the code is careful and
the discipline (closed candles, integer paise, provider boundary) is unusual for
a solo product. It is a verdict on **what a user and a regulator will see** when
the site is opened to the public.

---

## Pending tracker (updated 2026-10-05)

This is the source of truth for what is left. Items fixed in the working tree are
removed from this tracker so it stays useful as a short action list. A code-verified
ledger of every older plan and issue is in [pending-features.md](pending-features.md)
("Status ledger", 2026-10-05). **Other tab** marks work assigned to a separate session on
2026-10-05; do not duplicate it. The numbered
sections below are the original review text and are not edited as items close.

| # | Item | Review ref | Severity |
| --- | --- | --- | --- |
| 1 | **Prepared, not merged.** Branch `fix/bse-announcements-renumbered` is `main` + the BSE fix with its migration renumbered to `0037_announcement_ingestion_error` and a valid journal entry (its 40 tests pass). Merge it with your other work, then check the journal order against `0035`/`0036`/`0038` | §2.2 | Medium |
| 2 | Legal, owner inputs: (a) set `GRIEVANCE_OFFICER.name` and `postalAddress` in `apps/web/src/lib/legal.ts` — the contact page hides those lines until filled; (b) confirm the public response windows there (2 business days / 30 days); (c) lawyer review of `/terms` + `/privacy`, which are still not reviewed. Ask the lawyer about Terms §4 ("authorized feeds from licensed providers" vs §4.8) and Privacy §5 (promises data export; no export feature found). Contact page and privacy facts (notes, alerts, Google data, IP/browser details) are now accurate to the code | §2.4, §4.11 | High before launch |
| 3 | Alerts v2: intraday/price-level alerts (needs the quote cache), more rules, push | §6 | Medium |
| 4 | Optionally require 2FA for admin accounts | new | Low-Medium |
| 5 | Still unreviewed: VPS/Nginx `X-Forwarded-For`, backups, secret handling in CI, CSP `unsafe-inline`, provider/NSE data licence | new | Unknown |
| 6 | Run DB migration/integration verification on a scratch database before deploy: migrations `0035_latest_quotes`, `0036_alerts`, `0038_event_log`, plus the SQL behind alerts, ingestion runs, instrument-metadata update and the event log, none of which has run against Postgres yet. Blocked locally until Docker is running. CI also migrates a fresh database, so a PR will check the migrations | new | Medium |
| 7 | Clean the tree before committing: `.pnpm-store/v11/index.db` is staged, `pnpm-workspace.yaml` gained placeholder `allowBuilds:` text, and `pnpm exec` fails with `ERR_PNPM_UNEXPECTED_STORE` (pnpm v10/v11 mismatch). `apps/worker/run-history.tmp.mjs` is tracked in git, not scratch: decide whether to delete it | new | Low |
| 8 | Extend freshness/unavailable treatment beyond watchlists to remaining stale-data surfaces that do not already show it clearly | §3.10, §3.11 | Medium |
| 9 | Mobile responsive Phase 4 (EW-066): no Playwright or viewport tests exist in the repo; CI only builds Storybook | §2.8 | Medium |
| 10 | Watchlist reorder and note editor are built, with a disabled-reorder hint. Still unchecked: real mouse drag, touch route on device, and the live page with real data/PATCH/PUT calls. | §2.9 | Low |
| 11 | Label or widen signal coverage: daily signals still cover the configured signal universe, while indicators/screener cover more names | §2.10, §3.7 | Medium |
| 12 | Fundamentals (XBRL) (EW-109, no source yet), compare page, and watchlist-scoped news feed | §3.1, §3.4, §3.5 | Medium-High |
| 13 | **Built, uncommitted, SQL unverified.** `ingest-daily`, the bhavcopy pass and `compute-indicators` now record runs in `ingestion_runs`; `compute-indicators` checks the newest candle date has a successful run (warns by default, blocks with `INDICATORS_REQUIRE_INGEST_RUN=true`); `pnpm data:coverage` lists recent runs. Next: apply on a scratch DB, watch a week of runs line up with the candles, then turn enforcement on | pending-features 1.5 | Medium |
| 14 | **Built, uncommitted, SQL unverified.** Plan phases 1–4: migration `0038_event_log` (renames `auth_audit`, adds `category`/`actor_type`), `logEvent`, worker `job_failed` (throttled, redacted), `provider/credential_*` events, and a read-only `/admin/logs` + `/api/admin/logs`. Check the rename on a scratch DB. Open from the plan: retention (kept forever) and whether to keep logging every failed login | logging-plan | Medium |
| 15 | **Built, uncommitted, SQL unverified.** `isTradingDay`/`tradingDaysBetween`/`previousTradingDay` added to `packages/core` over the existing calendar (EW-108). New worker job `sync-instrument-metadata` (08:20 weekdays) writes the provider's real tick/lot sizes over the placeholders (EW-107). No offline path remains that needs the helper | pending-features 2.2, 2.3 | Low |
| 16 | Product surfaces still absent: indices **selection** per user (EW-133 phase 5; the strip's cache is process-wide by design, so this is a redesign, not a patch), NIFTY 50 view, horizon navigation (EW-131), options chain (EW-082, optional), a volatility mention in the `/today` read (the rest of EW-129 already exists as "Today's technical read") | issues | Low-Medium |
| 17 | Indices drawer (EW-133 phase 4) is built: click a strip cell for level, change, day range, session OHLC and the chart (checked in Storybook). Left out on purpose: 52-week range and constituent breadth, because neither is in the strip's snapshot. Focus does not return to the cell on close | issues | Low |
| 18 | Confirm the **Dhan production cut-over** (EW-075) on the VPS: not verifiable from the repo, and `.env.example` still defaults to `fyers` | dhan-provider-plan | Medium |
| 19 | IPO plan tail: curl the NSE endpoints from the VPS IP, run `--once backfill-ipos`, watch feed health for a week, decide on the BSE source | ipos-plan | Medium |
| 20 | Housekeeping: close or split stale plan items (EW-088 phases 4–6, EW-058 design-system 0/8, dhan plan 8/9); decide on `apps/worker/run-history.tmp.mjs` (tracked in git) | plans | Low |

### Needs a decision before anyone builds it

- **Holdings page** (§3.3) — conflicts with the CLAUDE.md "no holdings, not even read-only" rule.
- **BUY/SELL → Bullish/Bearish rename** (§4.4) — CLAUDE.md explicitly allows BUY/SELL as a direction label.
- **Paid signal library** (§6.11) — contradicts §4.7 (SEBI RA) and the no-subscriptions rule. Remove or get a legal opinion.
- **Public signal-accuracy page** (§10.5) — signals are admin-only; past-performance claims are SEBI-sensitive.
- **Public thin stock pages** (§10.4) — conflicts with §4.9 (NSE data policy, `noindex`).

---

## 1. Where the app is today

A short, honest picture of what exists and who can see it.

**Public (no sign-in needed)** **[fact]**
Verified in `apps/web/middleware.ts` and in each page file:

- `/` — landing page.
- `/about`, `/methodology`, `/contact`, `/data-sources`.
- `/disclaimer`, `/terms`, `/privacy` — legal pages.
- `/login`, `/signup`, `/verify`, `/reset` — auth forms.
- `/api/search` — stock name search (so a signed-out visitor can look up a symbol).

**Signed-in user** **[fact]** (sidebar from `apps/web/src/lib/navigation.ts`):

- `/today` — a daily "Market Brief" of the last closed NSE session.
- `/watchlists` — the user's own named lists (one is the default).
- `/screener` — multi-condition filter over the whole NSE equity universe.
- `/markets/breadth` — advances, declines, stocks above moving averages, highs vs lows.
- `/stocks/[symbol]` — one stock in full (header card, charts, ratios, breakdown).
- `/announcements` — exchange filings (NSE; BSE adapter built but off).
- `/calendar` — holidays, results, corporate actions, watchlist events.
- `/flows` — FII/DII, bulk and block deals, shareholding, futures OI.
- `/ipos` — one section with six tabs (Overview, All, Calendar, Listings, Grey market, Pipeline).
- `/profile`, `/account` — user and security settings.

**Admin only** **[fact]** (pages redirect a non-admin to `/watchlists`, APIs return 403):

- `/intraday` — one rule-based intraday strategy (opening-range breakout + VWAP + volume).
- `/paper-trading` — virtual ₹2,00,000 portfolios that trade those signals.
- `/admin` — the operator view (users, IPO health, paper-trading overview).

**Data sources** **[fact]** (verified in `packages/`, `apps/worker/src/jobs`, `/data-sources`):

- **Fyers** — intraday bars, snapshot quotes, live-tick socket, market status.
- **Dhan** — daily bars, quotes, instrument master, and a second live socket (5,000 symbols vs Fyers' 200).
- **NSE public files** — bhavcopy (end-of-day OHLC + delivery for every EQ/BE/BZ stock), EQ list, corporate actions, FII/DII, bulk and block deals, shareholding, IPO JSON, holiday list, and the official IPO offer-document pages.
- **SEBI** — public DRHP filings (the "filed, not yet scheduled" pipeline).
- **InvestorGain** — unofficial grey-market premium (GMP) for IPOs; every figure labelled.

**Scheduling** **[fact]** All jobs run in `apps/worker` under `croner`. The web app only reads. No `pg_cron`, no Redis, no Celery.

**Hosting** **[fact]** One Hostinger VPS runs web, worker and PostgreSQL 17 + TimescaleDB behind Nginx under PM2. Merge to `main` → GitHub Actions → `deploy.sh` on the VPS.

---

## 2. Bugs and broken things

Short summary: no "the app is on fire" bugs. A handful of correctness, polish
and consistency issues that a real user will hit in the first week.

1. **Stock header is on a local, unpushed commit on `main`.** **[fact]** Memory note *stock-analysis-feature*: the stock-page redesign is built in local commit `8fc6c6a` on `main` but not pushed. If the VPS deploys from the GitHub `main`, production is behind the local tree. **Why it matters:** demos from the laptop show a feature a logged-in user on the live site cannot see — a small but confidence-eroding gap. **Severity: Medium. Fix:** push and let the GitHub Actions pipeline deploy, or document the gap and merge the commit through a PR for the audit trail.

2. **BSE announcements fix sits on an unmerged branch and collides with migration numbering.** **[fact]** Memory note *disclosure-feature-status*: the fix lives on `fix/bse-announcements`; migration `0026` collides with a later `0026` on `main`. **Why it matters:** `/announcements` currently shows only one exchange; a user comparing a BSE-only name against another site will see empty rows. **Severity: Medium. Fix:** rename the migration to the next free number, resolve the schema conflict, open a PR.

3. **Password policy was relaxed to 8 characters, a letter and a number.** **[fact]** `apps/web/src/server/auth/password-policy.ts`, confirmed in the auth plan ("sign-up friction was losing users"). **Why it matters:** a public finance site with 8-character passwords and no mandatory 2FA is a soft target; the `auth_mfa` table exists but the enrolment UI is not built. **Severity: Medium-High for public launch. Fix:** keep the policy but add a mandatory email verification + rate-limit (already there), and ship TOTP 2FA before any paid tier or any feature that stores personal money data.

4. **`/privacy` and `/terms` are placeholders.** **[fact]** The auth plan explicitly lists this as a pre-launch task: "Replace the `/privacy` + `/terms` placeholders with lawyer-reviewed text before public launch." **Why it matters:** Indian consumer-protection and SEBI expectations both touch what these pages say. **Severity: High before any user acquisition push. Fix:** short, India-specific text reviewed by a lawyer; cover data collection, cookies, cancellation, grievance officer contact (SEBI SCORES mentions help).

5. **The scheduler cron rules say "Mon–Sat" but index 1-6.** **[fact]** `apps/worker/src/index.ts` schedules the feed and intraday jobs on `1-6` (Mon-Sat) and leans on the exchange calendar to gate the rest. **Why it matters:** NSE sometimes runs a Saturday special (muhurat is intraday too). The code comment is correct, but the cron treats Saturday as a candidate every week; the gate decides. **Severity: Low. Fix:** keep as is; document that Sunday rejection is cron-driven and Saturday is calendar-driven.

6. **The `middleware.ts` edge gate only checks the cookie is present, not valid.** **[fact]** Comment in `middleware.ts`: "a present-but-invalid cookie gets past the edge and is rejected there." **Why it matters:** this is intentional for Edge performance, but means a stale session makes the IPO pages (and others) throw a 401 inside server-side rendering. The pages handle it (`MarketDataError.status === 401` → redirect to login), but a user who waits with a tab open through session expiry can hit an error flash. **Severity: Low. Fix:** keep the design; make sure every protected server page catches the 401 the way `/ipos` already does.

7. **Worker started locally mints a Fyers token and kicks out the live token.** **[fact]** Memory note *ipo-feature-plan*: "never start the worker locally (mints Fyers)." **Why it matters:** developer footgun — a local `pnpm --filter @equitywise/worker dev` can take down live quotes for everyone until the next 08:30 IST refresh. **Severity: Medium. Fix:** gate credential-mint by an environment flag; a local dev shouldn't be able to perform a side-effect that invalidates production.

8. **Phase 4 of mobile responsiveness is open.** **[fact]** `issues/mobile-responsive.md` (EW-066): Phases 0-3 merged, Phase 4 is "mobile stories in CI, responsive rules documented in the design system." **Why it matters:** today's mobile is usable but regressions will land because nothing in CI catches them. **Severity: Medium. Fix:** add Playwright viewport snapshots for the five most-used pages on every PR.

9. **Watchlist member drag-order and the per-item note editor are missing.** **[fact]** `docs/planning/pending-features.md` 1.3: "members cannot be dragged into a custom order from the table itself (the API and repository support it; only the UI affordance is missing)" and the `note` field has no editor. **Why it matters:** small UX gap on the one page the whole product centres on. **Severity: Low. Fix:** finish the two UI affordances; the backend is ready.

10. **Signals universe vs screener universe are different sizes.** **[fact]** `config/indices.yaml` drives the signals universe (NIFTY 50, ~56 stocks per memory note *prod-data-coverage*), while the screener runs over the whole bhavcopy (~2,000 stocks). **Why it matters:** a user whose watchlist has a mid-cap sees indicator and signal columns full of dashes next to a screener row full of numbers. **Severity: Medium. Fix:** either extend the signal universe to match the screener universe gradually (storage is not the issue; compute cost is), or label the difference in the column tooltip ("signals cover the ~56 NIFTY 50 constituents").

11. **Alerts: schema in the database, nothing wired above it.** **[fact]** `issues/alerts.md` (EW-104). **Why it matters:** this is the single most-requested feature on any watchlist product and the first thing a serious user asks for after they add 20 stocks. **Severity: High for retention. Fix:** see §3 and §6.

12. **`description` text and the `h1` of some pages drifted again.** **[opinion]** `/data-sources` page metadata says "Market Data Sources & Update Frequency" and the IPO sub-pages all live inside one hub but the metadata descriptions do not always say "signed-in only" even though `robots: { index: false, follow: false }` is set. **Why it matters:** low; small SEO + nav consistency. **Severity: Low. Fix:** align the three strings on each page.

---

## 3. Main weaknesses and gaps

Short summary: as a **technical analysis** tool, the product is credible. As a
**research** tool, three structural pieces are missing: fundamentals, portfolio,
and alerts. A serious investor will want all three.

### What a serious investor would expect but cannot find

1. **No fundamentals.** **[fact]** `issues/no-fundamentals-data-source.md` and `pending-features.md` 3B.1: market cap, P/E, P/B, EPS, ROE, dividend yield have no source anywhere in the system. The watchlist column picker's `source: null` columns were removed in migration 0019 so the gap looks honest, but it is still a gap. **Why it matters:** every direct competitor (Screener, Tickertape, Trendlyne, Moneycontrol) leads with fundamentals; a long-term investor cannot do their job on this site. **Severity: High. Fix:** the two low-risk options are (a) XBRL from the exchange filings — slow to ingest but free, no licence; (b) a paid provider such as Tijori or TrendlyneAPI. The company-research plan in `docs/planning/` already lays this out; pick (a) for v1 to stay licence-clean.

2. **No alerts.** **[fact]** Schema in the DB, no evaluator, no UI. **Severity: High for retention. Fix:** the smallest useful version is **one** rule type ("close above/below X" or "RSI crosses N") and one delivery (email). Push notifications can wait.

3. **No portfolio or holdings view.** **[fact]** CLAUDE.md explicitly puts order execution out of scope ("Do not build order execution of any kind — no place/modify/cancel order, order book, positions, funds, holdings, or broker portfolio. Not even read-only"). **Opinion:** the rule is right for *orders*; it is **too strict** for a *user-entered* portfolio where the user types in what they already own. A read-only holdings page (quantity, average cost, current price, P&L) is a core expectation and does not make the app a broker. **Severity: High for a long-term investor. Fix:** scope a user-maintained holdings table — never fetched from a broker, never pre-filled.

4. **No news feed.** **[fact]** `/announcements` carries official filings only. Business news (Moneycontrol, Business Standard, Mint) is nowhere. **Severity: Medium.** **[opinion]** For a technical-first product this is defensible, but a 15-item "news for your watchlist" strip earns a lot of time-on-page. **Fix:** low-cost RSS of a few outlets, matched to watchlist symbols, labelled "External — opens in a new tab", no reproduction of body text.

5. **No "compare these stocks" view.** **[opinion]** Screener.in's compare page is one of its most-used. **Severity: Medium.** **Fix:** a /stocks/compare?symbols=X,Y,Z — reuses the screener row renderer.

6. **No charts worth the name on `/stocks/[symbol]`.** **[opinion, needs verification in the UI]** From the plan I expect candle + volume + a few overlays, not the depth of a TradingView. **Severity: Medium-Low** given the product's identity. **Fix:** keep it simple but add a 1m/5m/1d toggle; a Lightweight Charts embed is enough and free.

### Data limits and freshness

7. **Signals cover ~56 NIFTY 50 names.** **[fact]** Memory note *prod-data-coverage* confirms the production universe is 56 stocks, and the futures OI job has never run (prod is Fyers-only). **Why it matters:** a visitor who adds TATAELXSI expects a factor-explained signal and sees a blank. **Severity: Medium. Fix:** extend to NIFTY 500 in phases — storage is cheap, Fyers rate limits are the ceiling, Dhan can carry the load.

8. **One Fyers account for everyone.** **[fact]** `docs/planning/market-data-scaling-plan.md`: a dozen users refreshing watchlists would exhaust the Fyers budget. The live-quote fan-out (one socket per web process, SSE to users) is done; the polled watchlist detail still calls Fyers per user. **Severity: High before any marketing push. Fix:** finish Phase 2 of the scaling plan (polled reads behind the worker). This is explicitly the gate before "real user traffic".

9. **Fyers token expires daily and is a single-session account.** **[fact]** `docs/operations/deployment.md` §5; memory note *fyers-token-expires-daily*. The self-heal works, but a manual trading login on the owner's Fyers account kills the market data. **Severity: High for a public product with one owner. Fix:** either put Fyers behind a dedicated service account the owner never signs in from, or move primary-provider weight to Dhan (which the `MARKET_DATA_PROVIDER=routed` design already allows).

10. **No "last updated" clock on most data cards.** **[opinion, scanned the components]** The IPO GMP cell has one (`row.gmp.observedAt`, `stale` flag). Most other cards don't. **Why it matters:** a user who sees a stale number without a timestamp loses trust in every number on the page. **Severity: Medium. Fix:** a single `UpdatedAt` component the heavy pages render in the top-right of each data block.

11. **Provider-fail story is quiet.** **[fact]** `MarketDataError` is caught in some routes but there is no user-visible "data is temporarily unavailable" banner. **Severity: Medium. Fix:** a top-of-page strip when the latest worker run has `status != ok` for the data on that page.

---

## 4. Trust: what earns it and what loses it

Short summary: the product has strong honesty signals built in (closed candles,
factor breakdowns, "unofficial" GMP labelling, SEBI disclaimer). The things
that hurt trust are three or four small places where the UI feels unfinished or
the legal position is unclear.

### What earns trust

1. **Factor breakdowns on every signal.** **[fact]** CLAUDE.md hard rule 8 and the `signal_factors` table. A user who taps "why?" gets the actual components, not a magic number. Keep this.

2. **"Decision support, not execution."** **[fact]** `/disclaimer`, CLAUDE.md, OVERVIEW.md all repeat this clearly. The direction label is BUY/SELL — one word — and everything else is technical. Keep this; it is the product's clearest promise.

3. **Unofficial-labelled GMP.** **[fact]** `GmpChip`, `IpoGmpNote` and the plan both carry the "Unofficial · via InvestorGain · updated at HH:mm" line, and GMP never bleeds into an official field. Exemplary labelling.

4. **Data sources page.** **[fact]** `/data-sources` names Fyers, Dhan, NSE and tells the user who answers what. Few competitors do this.

5. **Closed-candle discipline, versioned strategies, timestamptz in UTC, integer paise.** **[fact]** The invariants that stop lookahead bias and silent precision drift. A quant visitor will notice.

### What hurts trust (naming each item specifically)

1. **The disclaimer card uses `destructive` colour.** **[opinion, verified in `apps/web/src/app/disclaimer/page.tsx`]** A red "Not SEBI Registered" box is honest, but visually it looks like an error state and sits on a page a user often lands on from the footer. **Severity: Low. Fix:** keep the content, soften the colour to a neutral alert tone, lead with the one-line "What we are" rather than "What we are not".

2. **Terms and Privacy are placeholders.** See §2.4. A visitor who reads them realises the words have not been reviewed. **Severity: High before launch. Fix:** replace before any paid user signs up.

3. **Admin-only features are not in the sidebar, but their `/data-sources` and `/about` wording still mentions "intraday" and "paper trading" freely.** **[opinion]** This hints at a feature a signed-in user cannot find. **Severity: Low. Fix:** either keep both pages honest ("the intraday strategy is in evaluation") or hide the mention until it is for everyone.

4. **`BUY` and `SELL` on signal cards.** **[fact]** The rule is explicit: BUY/SELL may label a direction and nothing else. **Opinion:** two years from now, a SEBI inspector or a complaint will not care about the rule; they will ask whether a lay user could have read it as advice. For a public product, "Bullish setup / Bearish setup" is one syllable longer and much safer. **Severity: Medium for compliance posture. Fix:** rename the badge; keep the "direction" idea, drop the imperative word.

5. **"Signals" wording in general.** **[opinion]** The product calls them technical observations; the audience may not. The /intraday and /paper-trading pages are admin-only *because* of this risk. Keep them admin-only until the vocabulary passes a legal review.

6. **Pages whose content is thin or looks half-populated.** **[opinion]** `/markets/breadth` and parts of the IPO Pipeline tab can look like empty states on weekends. **Severity: Low. Fix:** when the data is empty, write a one-line explainer rather than a dash.

### Legal and compliance in India

7. **SEBI Research Analyst exposure if signals are ever gated or paid.** **[fact]** Memory note *monetization-data-strategy*. The disclaimer page handles the current public, free posture. The moment a paid tier offers "subscriber signals", SEBI RA registration is triggered. **Severity: Critical before any paid signal product. Fix:** either keep all signal content free, or register as RA (individual: ₹1,000 fee, exam, net-worth), or structure the paid tier around *tools* (screener, alerts, portfolio) not *recommendations*. The third option is the clean path for a solo founder.

8. **Fyers/Dhan terms are not a redistribution licence.** **[fact]** Memory note *monetization-data-strategy*: "FYERS ≠ data-redistribution licence". **Severity: High for a public SaaS. Fix:** read each provider's current API terms before launch; most Indian brokers forbid redistribution to third parties. The safe pattern is "the user has their own broker account; this app is the user's software view of market data". Making the user sign in with the provider (OAuth to Fyers / Dhan) is one hard way to make this clean, and the opposite of the current fan-in design — so it is a real conflict. **Fix:** NSE itself is the licence-giver for the data; a direct NSE "Market Data" licence (not cheap, roughly ₹2L/year **[to verify]**) solves it. Interim: keep the service free, keep it logged-in-only (already the case), do not promote it as a market-data product.

9. **NSE data policy — logged-in-only is the current answer.** **[fact]** `docs/planning/ipos-plan.md` D3 names this explicitly and sets `robots: { index: false, follow: false }` on every data page. Keep that; a public, indexed, redistribution-shaped page is the exposed surface.

10. **InvestorGain scraping has no licence either.** **[fact]** IPO plan: "InvestorGain publishes no licence either, so the residual risk is a takedown request. If one arrives, the feed is switched off in YAML and the UI falls back to the explainer." Keep the kill switch, and send the written-permission email they listed as a follow-up.

11. **Grievance officer and SEBI SCORES link.** **[opinion]** Required-ish for any Indian consumer finance site. **Severity: Low pre-launch, Medium post-launch. Fix:** add to `/contact`.

---

## 5. Making it more useful, and getting more users

Short summary: the single thing to be clearest about is **who this is for**.
The product straddles three audiences (intraday trader, swing/positional trader,
long-term investor). The admin-only intraday work is the clearest segment but
is also the one with the highest compliance drag. The sharpest wedge for a solo
builder is **the swing/positional trader who wants explained reads**.

### Target user and the one promise

- **Opinion.** The sharpest wedge is: *"The only Indian stock app that shows you **why** a stock is bullish or bearish today, with the actual factors behind the call, for free."* Fundamentals-first products (Screener, Tickertape) do not do this. Chart products (TradingView, Chartink) do not explain the setup to a non-chartist. That is the product's single most defensible claim.
- Deprioritise "day trader" copy on the landing page. It attracts a legally hot segment and the admin-only pages cannot serve them yet.

### Comparison with the main competitors

| Competitor | What they do better than us | Where we could win |
| --- | --- | --- |
| **Screener.in** | Fundamentals, consistent coverage, API for power users, community screens | Explain the technical setup in plain English; alert on it |
| **Tickertape** | Polish, scores, portfolio integration, mutual funds | Honest factor breakdown; no vanity "stock score" |
| **Chartink** | Breadth of custom chart scans; huge community | Each scan hit is explained, not just listed |
| **TradingView** | Charts; social; alerts | Scoped to NSE; Indian corporate actions, F&O, delivery; closed-candle discipline |
| **Trendlyne** | Research reports, event feeds, DVM scores | Transparent methodology; our data pipeline is open and auditable |
| **Moneycontrol** | News and SEO | We are not a media company; keep narrow |
| **Broker apps (Zerodha Kite / Groww / Upstox)** | Order placement; account view | We do not place orders; a broker-independent view is the pitch |

**Opinion.** Chartink is the closest competitor by **spirit** (technical setups
with explanations). Beating Chartink on *clarity of a single setup* is more
achievable than beating Screener on *coverage*.

### Practical ways to get the first 100, then the first 1,000 users

**First 100 users (zero paid marketing):**

1. **Twitter/X "Why this stock" threads.** Three stocks a day. The thread *is* the product (the factor breakdown). Each post ends with the stock page link, which is logged-in-only so the reader signs up. **[opinion]**
2. **Three or four invite-only Telegram channels** that already serve the swing-trading crowd. Ask the owners for honest feedback, not promotion. **[opinion]**
3. **One Reddit post on `r/IndianStockMarket` and `r/IndianStreetBets`** describing the "closed-candle, explained signal" doctrine, not promoting. **[opinion]**
4. **The `/today` market brief shared on LinkedIn each evening** — a one-screen, text-rendered version of the brief, with a link.

**First 1,000 users:**

5. **SEO on long-tail: "RELIANCE breakout today", "NIFTY breadth today".** The pages exist but are logged-in-only. **[opinion]** Open a thin **public summary** version of `/stocks/[symbol]` and `/markets/breadth` — current price, one-line read, "sign in for the full breakdown". Keeps NSE data redistribution limited to the small, non-tabular summary.
6. **A free weekly email digest** of the top three bullish and bearish setups for the subscriber's watchlist. One template, generated by the worker.
7. **A public "methodology" page that ranks against reality.** Publish last-30-days win rate on the signals, open and auditable. This is the single most trust-building move for a signal product and is already supported by `/signals/performance` groundwork.

---

## 6. Future features

Short summary: finish the three structural gaps first (alerts, holdings view,
fundamentals), then expand the signal universe, then move into premium shape.

### Next 3 months

1. **Alerts v1** — one rule type (price cross X, RSI cross N), email delivery, 50 per user. **Effort: S. Value: High.**
2. **User-maintained holdings page** — user types stock, qty, avg cost; app shows current P&L. No broker integration. **Effort: M. Value: High.**
3. **Expand signals universe to NIFTY 500** — storage is cheap, scheduling is the bottleneck. **Effort: M. Value: High.**
4. **TOTP 2FA** — the schema exists; add enrol + verify + UI. **Effort: S. Value: Medium (High before any paid tier).**
5. **BSE announcements merged and deployed.** **Effort: S. Value: Medium.**
6. **Lawyer-reviewed `/terms` and `/privacy`.** **Effort: S. Value: Critical before any launch push.**
7. **Fundamentals v0 (XBRL)** — ingest only P/E, EPS, book value, market cap, revenue + profit YoY. **Effort: L. Value: High.**
8. **Public thin pages** for `/stocks/[symbol]` and `/markets/breadth` (headline + sign-in prompt). **Effort: S. Value: High for growth.**

### 6 to 12 months

9. **Compare stocks page.** **Effort: S. Value: Medium.**
10. **Watchlist-scoped news feed (RSS + sentiment).** **Effort: M. Value: Medium.**
11. **Factor-explained swing signals as a paid tier (not RA-regulated)** — stop short of "we recommend you buy". **Effort: M. Value: High.** (See §9.)
12. **Mobile PWA polish + install prompt.** **Effort: S. Value: Medium.**
13. **Alerts v2** — SMS/push, more rule types, backtested rule library. **Effort: M. Value: Medium.**
14. **Intraday strategy opened to all users** — only once the vocabulary passes a legal review. **Effort: S. Value: Low-Medium (compliance-heavy).**
15. **Public "signal accuracy" page.** **Effort: M. Value: High (trust).**

### Later

16. **Android app via Expo** (plan already exists in `docs/mobile/`). **Effort: L. Value: Medium.**
17. **Portfolio import via broker OAuth** — Zerodha Kite Connect first. **Effort: L. Value: High.**
18. **BSE stock coverage** — the schema is multi-exchange-ready (memory *multi-exchange-plan*); backfill is the work. **Effort: L. Value: Medium.**
19. **A single-signal subscription product under SEBI RA** — only if the audience is proven and the paperwork is worth it. **Effort: XL. Value: speculative.**
20. **Teams / organisations.** Deliberately out of scope — don't.

---

## 7. Launching with minimal investment

Short summary: this product can run comfortably on one small VPS and one domain
until it has a few thousand active users. The costs below are an educated
estimate — the first three line items are already true for this project.

| Line item | Approx ₹/month | Why |
| --- | --- | --- |
| **Hostinger VPS** (web + worker + Postgres) **[fact]** | ₹700 – ₹1,500 | Already set up; `docs/operations/deployment.md`. |
| **Domain (`equitywise.io`)** **[fact in the disclaimer]** | ₹1,000 ÷ 12 ≈ ₹100 | Already owned. |
| **Email (Resend)** **[fact]** | Free tier → ₹0 for first 3,000 emails/month | Already integrated for sign-up + reset. |
| **Backup store (B2 / S3-compatible)** | ₹200 | PG17 backups off-VPS. |
| **Uptime monitoring (Better Stack / UptimeRobot free)** | ₹0 | Status + 5-min pings. |
| **Error monitoring (Sentry free tier)** | ₹0 | 5k events/month is fine for a solo launch. |
| **Analytics (Plausible / PostHog free self-host)** | ₹0 – ₹400 | No cookie banner required for Plausible. |
| **Fyers + Dhan accounts** **[fact]** | ₹0 (API keys on free account) | Caveat: terms, not price. |
| **One-off: lawyer review of `/terms` + `/privacy`** | ₹10,000 – ₹25,000 once **[to verify]** | Non-negotiable before launch. |
| **Social scheduling (Buffer / Typefully free tier)** | ₹0 | For the Twitter/X cadence in §5. |

**Rough running cost: ₹1,000 – ₹2,000 per month for a few hundred users.**

### Must-haves before public launch

- **[fact]** `AUTH_SESSION_SECRET` and `RESEND_API_KEY` on the VPS `.env` (auth plan).
- **[fact]** Lawyer-reviewed `/terms` and `/privacy` (auth plan).
- Grievance officer contact on `/contact`.
- **[fact]** Fyers primary account for market data; owner should never log in with that account on a Fyers app.
- The intraday + paper-trading pages stay admin-only (they are).
- `robots: { index: false, follow: false }` on every data page (already true).

### Can wait

- An iOS app, an Android app, push notifications.
- A payment gateway.
- A "news feed" from paid APIs.
- Fundamentals (XBRL ingest can come after launch).

---

## 8. A mobile app: is it worth it?

Short summary: no, not yet. Build a PWA first.

**[opinion]** The Indian market-app graveyard is full of thin wrappers around a
website. A user picks a mobile app when it does something only a mobile app can
do: push notifications, home-screen widgets, offline charts, deep OS integration.
EquityWise today does none of those at the depth needed to justify an install.

**What a PWA (installable website) buys first:**

- A home-screen icon on both iOS and Android, no store listing, no review process.
- Push notifications on Android (iOS 16.4+ now supports web push).
- Offline shell for the two or three pages a user re-opens.
- Zero code duplication — the same Next.js app.

**When to build the Android app:**

- When >30% of signed-in weekly actives are on mobile for more than two months.
- When Alerts v2 has shipped and push notifications are a feature, not a toggle.
- When at least one paid tier exists.

**Skip iOS entirely at launch.** Apple's review cycle, developer-account fee and
in-app-purchase rules are a founder-tax for a product that does not need them yet.

---

## 9. Premium and subscriptions

Short summary: nothing paid for the first six months. When a paid tier does
come, it should be a **tools** tier, not a **signals** tier — tools are not
regulated.

### Free tier

- One default watchlist, up to 25 symbols.
- Daily brief (`/today`).
- Screener (basic filters, 10 saved screens).
- Market breadth, calendar, flows, announcements, IPO section.
- 5 alerts.
- `/stocks/[symbol]` for every NSE equity.

### Paid tier — "Pro" **[opinion, example pricing]**

- **₹299 / month, ₹2,499 / year.** Comparable to Tickertape Pro (~₹200/month) and lower than Trendlyne Premium (~₹400+/month) **[to verify]**.
- Unlimited watchlists and alerts.
- Export to CSV.
- Advanced screener (F&O, delivery %, 50 saved screens).
- Factor-explained swing-signal library over NIFTY 500.
- Weekly email digest.
- Early access to new sections.

### Paid tier — "Pro+" (later, if the market says yes)

- **₹699 / month.** Fundamentals (once XBRL or a vendor is in), portfolio analytics, longer history.

### What must be in place first

- **Users.** 500 weekly actives is the usual floor to see conversion signal **[opinion]**.
- **Payment gateway.** Razorpay standard — a few days of integration, 2% + GST on transactions.
- **Legal basis.** Services under GST ≥ ₹20L turnover need GST registration; a single founder working from India starts without it and registers when revenue crosses the threshold. Any paid signal content triggers SEBI RA.
- **Data licence certainty.** NSE and provider terms must be re-read in writing before anyone pays. **[to verify]**
- **A refund policy** on `/terms`.

### Warning signs it is too early to charge

- The free tier retention at week 4 is under 20%.
- The alert and portfolio features are not shipped.
- Fundamentals are not shipped (long-term investors won't pay without them).
- The signal accuracy page is not public yet — nobody buys a signal product on faith.
- Daily or weekly active user count is three-digit for more than a quarter.

---

## 10. Final recommendation — the top 5 next steps

1. **Finish the market-data scaling plan Phase 2.** Without it, the first public launch cannot survive its own first good day. **[fact]** The design is already in `docs/planning/market-data-scaling-plan.md`; this is implementation. **(2–3 weeks.)**

2. **Ship Alerts v1 and a user-maintained Portfolio page.** These are the two features that turn a visited site into a daily habit, and both are structurally easy from the current base. Alerts first (schema exists), portfolio next (new table). **(3–4 weeks together.)**

3. **Lawyer-reviewed `/terms` and `/privacy`, grievance officer on `/contact`, TOTP 2FA.** Non-negotiable before any user acquisition push. **(1–2 weeks.)**

4. **Open thin public pages for `/stocks/[symbol]` and `/markets/breadth`, with sign-in walls on the full data.** This is how the first 1,000 users find the product on Google. Keep the full tabular NSE data behind sign-in. **(2 weeks.)**

5. **Publish a public "signal accuracy" page** that re-grades every signal from the last 90 days using the paper-grader already built. This is the single most trust-building move a solo-run signal product can make. **(1–2 weeks.)**

Everything else — mobile app, fundamentals, premium billing, SEBI RA — belongs
after these five.

---

## Appendix A — Pages inventory as of 2026-10-04 **[fact]**

Public: `/`, `/about`, `/methodology`, `/contact`, `/data-sources`, `/disclaimer`, `/terms`, `/privacy`, `/login`, `/signup`, `/verify`, `/reset`, `/robots.txt`, `/sitemap.xml`.

Signed-in: `/today`, `/watchlists`, `/screener`, `/markets/breadth`, `/stocks/[symbol]`, `/announcements`, `/calendar`, `/flows`, `/ipos` (+ `/ipos/all`, `/ipos/calendar`, `/ipos/listings`, `/ipos/gmp`, `/ipos/pipeline`, `/ipos/mainboard`, `/ipos/sme`, `/ipos/[slug]`), `/profile`, `/account`.

Admin-only: `/intraday`, `/paper-trading`, `/admin` (+ `/admin/ipos`, `/admin/paper`).

APIs under `/api/`: `auth/*`, `account/*`, `profile/*`, `avatars/*`, `watchlists/*`, `search`, `history`, `stocks/*`, `screener/*`, `market/*`, `market-brief/*`, `market-calendar/*`, `announcements/*`, `flows/*`, `ipos/*` (incl. `gmp-track-record`), `intraday/*` (admin), `paper/*` (admin), `admin/*` (admin), `fyers/*`.

## Appendix B — Open known issues **[fact]**

Listed in `issues/` with explicit stages: alerts, breadth-page refinement,
corporate-action ingestion polish, horizon-segmented navigation, ingestion-run
tracking, instrument-metadata placeholder data, logging, market-data scaling,
mobile responsive Phase 4, no fundamentals data source, orb-vc Phases 4-6, past
signals page, profile page polish, regime line on `/today`, screener polish,
stock futures open interest, announcement interpretation v1.
